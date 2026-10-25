use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::{
    io::{Read, Write},
    process::{Command, Stdio},
    sync::atomic::{AtomicBool, Ordering},
    thread,
    time::{Duration, Instant},
};

pub fn validate_target(host: &str, directory: &str) -> Result<(), String> {
    if host.is_empty()
        || host.len() > 255
        || host.starts_with('-')
        || !host
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || "._@:-".contains(c))
    {
        return Err("请输入有效的 SSH 主机别名，例如 GPU-Server-Codex".into());
    }
    if directory.len() > 4096
        || !(directory.starts_with('/') || directory.starts_with("~/"))
        || directory
            .chars()
            .any(|c| c.is_control() || "*?[]".contains(c))
    {
        return Err("目录须为服务器绝对路径或 ~/ 开头的路径，不能包含控制字符或通配符".into());
    }
    Ok(())
}

fn quote_sftp(path: &str) -> Result<String, String> {
    if path.chars().any(|c| c.is_control() || "*?[]".contains(c)) {
        return Err("上传路径含有不支持的字符".into());
    }
    Ok(format!(
        "\"{}\"",
        path.replace('\\', "\\\\").replace('"', "\\\"")
    ))
}

fn collect_output(mut stream: impl Read) -> Vec<u8> {
    let mut result = Vec::new();
    let mut buffer = [0; 4096];
    while let Ok(count) = stream.read(&mut buffer) {
        if count == 0 {
            break;
        }
        let remaining = 65536_usize.saturating_sub(result.len());
        result.extend_from_slice(&buffer[..count.min(remaining)]);
    }
    result
}

fn run(
    mut command: Command,
    input: Option<&str>,
    cancel: &AtomicBool,
    deadline: Instant,
) -> Result<Vec<u8>, String> {
    if cancel.load(Ordering::SeqCst) {
        return Err("已取消上传".into());
    }
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
    let mut child = command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("无法启动 SSH/SFTP：{e}"))?;
    let stdout = child.stdout.take().ok_or("无法读取进程输出")?;
    let stderr = child.stderr.take().ok_or("无法读取进程错误")?;
    let out = thread::spawn(move || collect_output(stdout));
    let err = thread::spawn(move || collect_output(stderr));
    let write_result = match child.stdin.take() {
        Some(mut stdin) => stdin.write_all(input.unwrap_or("").as_bytes()),
        None => Ok(()),
    };
    let result = loop {
        if let Err(e) = &write_result {
            break Err(format!("无法写入传输命令：{e}"));
        }
        if cancel.load(Ordering::SeqCst) {
            break Err("已取消上传".into());
        }
        if Instant::now() >= deadline {
            break Err("连接或传输超时，请检查网络后重试".into());
        }
        match child.try_wait() {
            Ok(Some(status)) => break Ok(status),
            Ok(None) => thread::sleep(Duration::from_millis(50)),
            Err(e) => break Err(format!("读取传输状态失败：{e}")),
        }
    };
    if result.is_err() {
        // Kill only this operation's private process group, including ProxyJump
        // children that would otherwise keep the output pipes open after timeout.
        #[cfg(unix)]
        unsafe {
            libc::kill(-(child.id() as i32), libc::SIGKILL);
        }
        let _ = child.kill();
    }
    let _ = child.wait();
    let stdout = out.join().unwrap_or_default();
    let stderr = err.join().unwrap_or_default();
    let status = result?;
    if !status.success() {
        let error = String::from_utf8_lossy(&stderr)
            .trim()
            .chars()
            .take(2000)
            .collect::<String>();
        return Err(if error.is_empty() {
            format!("SSH/SFTP 返回错误：{status}")
        } else {
            error
        });
    }
    Ok(stdout)
}

fn connection_command(program: &str) -> Command {
    let mut command = Command::new(program);
    command.args([
        "-o",
        "BatchMode=yes",
        "-o",
        "ConnectTimeout=8",
        "-o",
        "ConnectionAttempts=1",
        "-o",
        "ClearAllForwardings=yes",
        "-o",
        "ControlMaster=no",
        "-o",
        "ControlPath=none",
        "-o",
        "StrictHostKeyChecking=yes",
        "-o",
        "ServerAliveInterval=5",
        "-o",
        "ServerAliveCountMax=2",
    ]);
    command
}

fn ssh(
    host: &str,
    script: &str,
    args: &[&str],
    cancel: &AtomicBool,
    deadline: Instant,
) -> Result<Vec<u8>, String> {
    let mut remote = format!(
        "python3 -c 'import base64;exec(base64.b64decode(\"{}\"))'",
        BASE64.encode(script)
    );
    for arg in args {
        remote.push_str(&format!(" '{}'", BASE64.encode(arg)));
    }
    let mut command = connection_command("ssh");
    command.args(["-T", host, &remote]);
    run(command, None, cancel, deadline)
}

const CHECK: &str = r#"
import os,sys,base64,json
p=os.path.abspath(os.path.expanduser(base64.b64decode(sys.argv[1]).decode()))
q=p
while not os.path.exists(q): q=os.path.dirname(q)
if not os.path.isdir(q) or not os.access(q,os.W_OK): raise RuntimeError('接收目录不可写')
print(json.dumps({'directory':p},ensure_ascii=False))
"#;

pub fn check(host: &str, directory: &str) -> Result<String, String> {
    validate_target(host, directory)?;
    let bytes = ssh(
        host,
        CHECK,
        &[directory],
        &AtomicBool::new(false),
        Instant::now() + Duration::from_secs(15),
    )?;
    let value: serde_json::Value =
        serde_json::from_slice(&bytes).map_err(|e| format!("服务器响应无效：{e}"))?;
    value["directory"]
        .as_str()
        .map(str::to_owned)
        .ok_or_else(|| "服务器没有返回接收目录".into())
}

const PREPARE: &str = r#"
import os,sys,base64,tempfile,json,time,secrets
d=os.path.abspath(os.path.expanduser(base64.b64decode(sys.argv[1]).decode()))
os.makedirs(d,mode=0o700,exist_ok=True)
fd,p=tempfile.mkstemp(prefix='.pastelens-',suffix='.part',dir=d)
os.close(fd)
f=os.path.join(d,'shot-'+time.strftime('%Y%m%d-%H%M%S')+'-'+secrets.token_hex(8)+'.png')
print(json.dumps({'temporary':p,'path':f},ensure_ascii=False))
"#;
const FINALIZE: &str = r#"
import os,sys,base64,hashlib
p,f,h,n=[base64.b64decode(a).decode() for a in sys.argv[1:]]
with open(p,'rb') as image: digest=hashlib.file_digest(image,'sha256').hexdigest() if hasattr(hashlib,'file_digest') else hashlib.sha256(image.read()).hexdigest()
if os.path.getsize(p)!=int(n) or digest!=h: raise RuntimeError('图片完整性校验失败')
os.chmod(p,0o600)
os.link(p,f) # exclusive final name: never overwrite an existing screenshot
os.unlink(p)
"#;
const CLEANUP: &str = r#"
import os,sys,base64
p=base64.b64decode(sys.argv[1]).decode()
if os.path.basename(p).startswith('.pastelens-') and p.endswith('.part'):
    try: os.unlink(p)
    except FileNotFoundError: pass
"#;

#[derive(Deserialize)]
struct Destination {
    temporary: String,
    path: String,
}

pub fn upload(
    host: &str,
    directory: &str,
    png: &[u8],
    cancel: &AtomicBool,
    stage: impl Fn(&str),
) -> Result<String, String> {
    validate_target(host, directory)?;
    let deadline = Instant::now() + Duration::from_secs(120);
    stage("connecting");
    let bytes = ssh(host, PREPARE, &[directory], cancel, deadline)?;
    let target: Destination =
        serde_json::from_slice(&bytes).map_err(|e| format!("服务器响应无效：{e}"))?;
    let result = (|| {
        let mut local = tempfile::Builder::new()
            .prefix("pastelens-image-")
            .suffix(".png")
            .tempfile()
            .map_err(|e| e.to_string())?;
        local.write_all(png).map_err(|e| e.to_string())?;
        stage("uploading");
        let batch = format!(
            "put {} {}\n",
            quote_sftp(&local.path().to_string_lossy())?,
            quote_sftp(&target.temporary)?
        );
        let mut command = connection_command("sftp");
        command.args(["-q", "-b", "-", host]);
        run(command, Some(&batch), cancel, deadline)?;
        stage("verifying");
        let hash = format!("{:x}", Sha256::digest(png));
        ssh(
            host,
            FINALIZE,
            &[
                &target.temporary,
                &target.path,
                &hash,
                &png.len().to_string(),
            ],
            cancel,
            deadline,
        )?;
        Ok(target.path.clone())
    })();
    if result.is_err() {
        let _ = ssh(
            host,
            CLEANUP,
            &[&target.temporary],
            &AtomicBool::new(false),
            Instant::now() + Duration::from_secs(10),
        );
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn target_validation() {
        assert!(validate_target("GPU-Server-Codex", "~/项目/图片").is_ok());
        for host in ["", "-oProxyCommand=bad", "a;touch bad", "a\n"] {
            assert!(validate_target(host, "/tmp/pics").is_err());
        }
        for path in ["relative/path", "/tmp/a\nb", "/tmp/*", "/tmp/[x]"] {
            assert!(validate_target("gpu", path).is_err());
        }
    }
    #[test]
    fn safe_batch_paths() {
        assert_eq!(
            quote_sftp("/tmp/中文 ' a\"b.png").unwrap(),
            "\"/tmp/中文 ' a\\\"b.png\""
        );
        assert!(quote_sftp("a\nput b c").is_err());
    }
    #[test]
    fn command_preserves_bridges_and_host_trust() {
        let command = connection_command("ssh");
        let args = command
            .get_args()
            .map(|s| s.to_string_lossy())
            .collect::<Vec<_>>();
        assert!(args.contains(&"ClearAllForwardings=yes".into()));
        assert!(args.contains(&"StrictHostKeyChecking=yes".into()));
        assert!(args.contains(&"ControlPath=none".into()));
    }
    #[test]
    fn command_deadline_and_cancel() {
        let mut command = Command::new("sh");
        command.args(["-c", "exec sleep 10"]);
        let start = Instant::now();
        assert!(run(
            command,
            None,
            &AtomicBool::new(false),
            start + Duration::from_millis(100)
        )
        .unwrap_err()
        .contains("超时"));
        assert!(start.elapsed() < Duration::from_secs(3));
        assert!(run(
            Command::new("does-not-exist"),
            None,
            &AtomicBool::new(true),
            Instant::now()
        )
        .unwrap_err()
        .contains("取消"));
    }
    #[test]
    #[ignore = "requires an explicitly selected SSH test host; uploads a generated 1px PNG"]
    fn ssh_roundtrip() {
        let host = std::env::var("PASTELENS_TEST_HOST").expect("set PASTELENS_TEST_HOST");
        let directory =
            std::env::var("PASTELENS_TEST_DIRECTORY").expect("set PASTELENS_TEST_DIRECTORY");
        let png = super::super::clipboard::encode_png(&[80, 100, 240, 255], 1, 1).unwrap();
        let path = upload(&host, &directory, &png, &AtomicBool::new(false), |s| {
            println!("{s}")
        })
        .unwrap();
        println!("Verified test image: {path}");
        // Remove only this generated test file, never a user's image or directory.
        let script = "import os,sys,base64;os.unlink(base64.b64decode(sys.argv[1]).decode())";
        ssh(
            &host,
            script,
            &[&path],
            &AtomicBool::new(false),
            Instant::now() + Duration::from_secs(15),
        )
        .unwrap();
    }
}
