mod clipboard;
mod transport;

use clipboard::PreparedImage;
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::Write,
    path::PathBuf,
    str::FromStr,
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct UploadSettings {
    pub host: String,
    pub directory: String,
    pub shortcut: String,
    pub configured: bool,
}
impl Default for UploadSettings {
    fn default() -> Self {
        Self {
            host: "GPU-Server-Codex".into(),
            directory: "~/attachments".into(),
            shortcut: "Control+Alt+V".into(),
            configured: false,
        }
    }
}

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadStatus {
    pub id: u64,
    pub revision: u64,
    pub phase: String,
    pub host: String,
    pub directory: String,
    pub path: String,
    pub thumbnail: String,
    pub width: u32,
    pub height: u32,
    pub size: usize,
    pub detail: String,
    pub retryable: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadSnapshot {
    pub settings: UploadSettings,
    pub shortcut_error: String,
    pub status: UploadStatus,
}

struct Inner {
    snapshot: UploadSnapshot,
    prepared: Option<PreparedImage>,
}
pub struct UploadService {
    inner: Mutex<Inner>,
    configuration: Mutex<()>,
    busy: AtomicBool,
    cancel: AtomicBool,
    recording: AtomicBool,
    path: PathBuf,
}

struct BusyGuard<'a>(&'a AtomicBool);
impl Drop for BusyGuard<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::SeqCst);
    }
}

fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
fn snapshot(app: &AppHandle) -> UploadSnapshot {
    app.state::<UploadService>()
        .inner
        .lock()
        .unwrap()
        .snapshot
        .clone()
}
fn publish(app: &AppHandle, value: &UploadSnapshot) {
    let _ = app.emit("image-upload-state", value);
}
fn update(app: &AppHandle, action: impl FnOnce(&mut Inner)) {
    let service = app.state::<UploadService>();
    let value = {
        let mut inner = service.inner.lock().unwrap();
        action(&mut inner);
        inner.snapshot.status.revision += 1;
        inner.snapshot.clone()
    };
    publish(app, &value);
}

fn validate_shortcut(value: &str) -> Result<Shortcut, String> {
    let parts = value.split('+').collect::<Vec<_>>();
    let modifiers = parts
        .iter()
        .filter(|p| matches!(**p, "Control" | "Alt" | "Shift" | "Super"))
        .count();
    if modifiers < 2 || parts.len() != modifiers + 1 {
        return Err("快捷键请使用至少两个修饰键，加一个字母、数字或功能键".into());
    }
    let shortcut = Shortcut::from_str(value).map_err(|e| format!("快捷键无效：{e}"))?;
    if shortcut.id() == Shortcut::from_str("Alt+Shift+Space").unwrap().id() {
        return Err("此快捷键已用于打开阅读窗口，请换一个组合".into());
    }
    Ok(shortcut)
}

fn register(app: &AppHandle, value: &str) -> Result<(), String> {
    let key = validate_shortcut(value)?;
    app.global_shortcut()
        .on_shortcut(key, |app, pressed, event| {
            if event.state() != ShortcutState::Pressed
                || app
                    .state::<UploadService>()
                    .recording
                    .load(Ordering::SeqCst)
            {
                return;
            }
            let selected = snapshot(app).settings.shortcut;
            if Shortcut::from_str(&selected).is_ok_and(|key| key.id() == pressed.id()) {
                start(app.clone(), false);
            }
        })
        .map_err(|e| format!("快捷键注册失败，可能已被其他应用占用：{e}"))
}

pub fn initialize(app: &AppHandle) -> Result<(), String> {
    let directory = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    let path = directory.join("image-upload.json");
    let settings = fs::read(&path)
        .ok()
        .and_then(|s| serde_json::from_slice::<UploadSettings>(&s).ok())
        .filter(|s| {
            transport::validate_target(&s.host, &s.directory).is_ok()
                && validate_shortcut(&s.shortcut).is_ok()
        })
        .unwrap_or_default();
    let shortcut = settings.shortcut.clone();
    app.manage(UploadService {
        inner: Mutex::new(Inner {
            snapshot: UploadSnapshot {
                settings,
                shortcut_error: String::new(),
                status: UploadStatus {
                    phase: "idle".into(),
                    ..Default::default()
                },
            },
            prepared: None,
        }),
        configuration: Mutex::new(()),
        busy: AtomicBool::new(false),
        cancel: AtomicBool::new(false),
        recording: AtomicBool::new(false),
        path,
    });
    if let Err(error) = register(app, &shortcut) {
        update(app, |inner| inner.snapshot.shortcut_error = error);
    }
    Ok(())
}

fn show_hud(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("upload-hud") {
        let cursor = app.cursor_position().ok();
        let monitor = app
            .available_monitors()
            .ok()
            .and_then(|all| {
                all.into_iter().find(|m| {
                    cursor.is_some_and(|p| {
                        let pos = m.position();
                        let size = m.size();
                        p.x >= pos.x as f64
                            && p.y >= pos.y as f64
                            && p.x < pos.x as f64 + size.width as f64
                            && p.y < pos.y as f64 + size.height as f64
                    })
                })
            })
            .or_else(|| app.primary_monitor().ok().flatten());
        if let Some(monitor) = monitor {
            let area = monitor.work_area();
            if let Ok(size) = window.outer_size() {
                let margin = (20.0 * monitor.scale_factor()) as i32;
                let _ = window.set_position(PhysicalPosition::new(
                    (area.position.x + area.size.width as i32 - size.width as i32 - margin)
                        .max(area.position.x),
                    area.position.y + margin,
                ));
            }
        }
        let _ = window.show(); // focusable=false: never focus the reader/terminal
    }
}

pub fn start(app: AppHandle, retry: bool) {
    let service = app.state::<UploadService>();
    if service
        .busy
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        show_hud(&app);
        return;
    }
    service.cancel.store(false, Ordering::SeqCst);
    let settings = snapshot(&app).settings;
    if !settings.configured {
        update(&app, |inner| {
            let rev = inner.snapshot.status.revision;
            inner.snapshot.status = UploadStatus {
                id: now(),
                revision: rev,
                phase: "setup".into(),
                ..Default::default()
            };
            service.busy.store(false, Ordering::SeqCst);
        });
        show_hud(&app);
        return;
    }
    let cached = if retry {
        service.inner.lock().unwrap().prepared.clone()
    } else {
        None
    };
    update(&app, |inner| {
        if !retry {
            inner.prepared = None;
        }
        let rev = inner.snapshot.status.revision;
        inner.snapshot.status = UploadStatus {
            id: now(),
            revision: rev,
            phase: "reading".into(),
            host: settings.host.clone(),
            directory: settings.directory.clone(),
            ..Default::default()
        };
    });
    show_hud(&app);
    let app2 = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let app = app2;
        let result = (|| {
            let image = if retry {
                cached.ok_or("没有可重试的图片，请重新复制图片后上传")?
            } else {
                clipboard::read(&app)?
            };
            update(&app, |inner| {
                inner.prepared = Some(image.clone());
                let status = &mut inner.snapshot.status;
                status.width = image.width;
                status.height = image.height;
                status.size = image.png.len();
                status.thumbnail = image.thumbnail.clone();
            });
            let service = app.state::<UploadService>();
            let path = transport::upload(
                &settings.host,
                &settings.directory,
                &image.png,
                &service.cancel,
                |phase| {
                    update(&app, |inner| {
                        if !service.cancel.load(Ordering::SeqCst) {
                            inner.snapshot.status.phase = phase.into();
                        }
                    })
                },
            )?;
            let copied = if service.cancel.load(Ordering::SeqCst) {
                Ok(false)
            } else {
                clipboard::copy_if_unchanged(&app, &image, &path)
            };
            update(&app, |inner| {
                let status = &mut inner.snapshot.status;
                status.path = path;
                status.phase = if matches!(copied, Ok(true)) {
                    "success"
                } else {
                    "uploaded"
                }
                .into();
                status.detail = match copied {
                    Ok(true) => String::new(),
                    Ok(false) => "未覆盖剪贴板的新内容，请点击“复制路径”后再粘贴。".into(),
                    Err(error) => error,
                };
                inner.prepared = None;
                service.busy.store(false, Ordering::SeqCst);
            });
            Ok::<(), String>(())
        })();
        if let Err(error) = result {
            let service = app.state::<UploadService>();
            let cancelled = service.cancel.load(Ordering::SeqCst);
            update(&app, |inner| {
                inner.snapshot.status.phase = if cancelled { "cancelled" } else { "error" }.into();
                inner.snapshot.status.detail = error;
                inner.snapshot.status.retryable = inner.prepared.is_some();
                service.busy.store(false, Ordering::SeqCst);
            });
        }
    });
}

#[tauri::command]
pub fn get_image_upload_snapshot(app: AppHandle) -> UploadSnapshot {
    snapshot(&app)
}

#[tauri::command]
pub fn set_image_upload_recording(app: AppHandle, recording: bool) {
    app.state::<UploadService>()
        .recording
        .store(recording, Ordering::SeqCst);
}

#[tauri::command]
pub async fn configure_image_upload(
    app: AppHandle,
    mut settings: UploadSettings,
) -> Result<UploadSnapshot, String> {
    settings.host = settings.host.trim().into();
    settings.directory = settings.directory.trim().into();
    if settings.directory != "/" && settings.directory != "~/" {
        settings.directory = settings.directory.trim_end_matches('/').into();
    }
    transport::validate_target(&settings.host, &settings.directory)?;
    validate_shortcut(&settings.shortcut)?;
    settings.configured = true;
    tauri::async_runtime::spawn_blocking(move || {
        let service = app.state::<UploadService>();
        let _config = service.configuration.lock().unwrap();
        if service
            .busy
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_err()
        {
            return Err("请等待当前上传结束后再修改目标".into());
        }
        let _busy = BusyGuard(&service.busy);
        let previous = snapshot(&app);
        let changed =
            previous.settings.shortcut != settings.shortcut || !previous.shortcut_error.is_empty();
        if changed {
            register(&app, &settings.shortcut)?;
        }
        let saved = (|| {
            let mut file = tempfile::NamedTempFile::new_in(service.path.parent().unwrap())
                .map_err(|e| e.to_string())?;
            file.write_all(&serde_json::to_vec_pretty(&settings).map_err(|e| e.to_string())?)
                .map_err(|e| e.to_string())?;
            file.persist(&service.path).map_err(|e| e.to_string())?;
            Ok::<(), String>(())
        })();
        if let Err(error) = saved {
            if changed {
                let _ = app.global_shortcut().unregister(settings.shortcut.as_str());
            }
            return Err(format!("设置未保存：{error}"));
        }
        if changed && previous.settings.shortcut != settings.shortcut {
            let _ = app
                .global_shortcut()
                .unregister(previous.settings.shortcut.as_str());
        }
        update(&app, |inner| {
            inner.snapshot.settings = settings;
            inner.snapshot.shortcut_error.clear();
            inner.prepared = None;
            let revision = inner.snapshot.status.revision;
            inner.snapshot.status = UploadStatus {
                phase: "idle".into(),
                revision,
                ..Default::default()
            };
        });
        Ok(snapshot(&app))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn check_image_upload_target(host: String, directory: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || transport::check(host.trim(), directory.trim()))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn start_image_upload(app: AppHandle, retry: Option<bool>) {
    start(app, retry.unwrap_or(false));
}

#[tauri::command]
pub fn cancel_image_upload(app: AppHandle) {
    let service = app.state::<UploadService>();
    if service.busy.load(Ordering::SeqCst)
        && matches!(
            snapshot(&app).status.phase.as_str(),
            "reading" | "connecting" | "uploading" | "verifying"
        )
    {
        service.cancel.store(true, Ordering::SeqCst);
        update(&app, |inner| {
            inner.snapshot.status.phase = "cancelling".into()
        });
    }
}

#[tauri::command]
pub fn dismiss_image_upload(app: AppHandle, revision: u64) {
    if snapshot(&app).status.revision == revision {
        if let Some(w) = app.get_webview_window("upload-hud") {
            let _ = w.hide();
        }
    }
}

#[tauri::command]
pub async fn copy_image_upload_path(app: AppHandle, id: u64) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let service = app.state::<UploadService>();
        if service
            .busy
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_err()
        {
            return Err("正在处理另一项操作，请稍后复制".into());
        }
        let _busy = BusyGuard(&service.busy);
        let status = snapshot(&app).status;
        if status.id != id || status.path.is_empty() {
            return Err("没有可复制的已上传图片".into());
        }
        app.clipboard()
            .write_text(status.path)
            .map_err(|e| e.to_string())?;
        update(&app, |inner| {
            inner.snapshot.status.phase = "success".into();
            inner.snapshot.status.detail.clear();
        });
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn open_image_upload_settings(app: AppHandle) -> Result<(), String> {
    let viewer = app.get_webview_window("viewer").ok_or("阅读窗口不可用")?;
    crate::position_viewer(&app)?;
    viewer.show().map_err(|e| e.to_string())?;
    viewer.set_focus().map_err(|e| e.to_string())?;
    viewer
        .emit("image-upload-open-settings", ())
        .map_err(|e| e.to_string())?;
    if let Some(hud) = app.get_webview_window("upload-hud") {
        let _ = hud.hide();
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn shortcut_constraints() {
        assert!(validate_shortcut("Control+Alt+V").is_ok());
        assert!(validate_shortcut("Control+Alt+Shift+P").is_ok());
        assert!(validate_shortcut("Super+V").is_err());
        assert!(validate_shortcut("Alt+Shift+Space").is_err());
        assert!(validate_shortcut("Control+Alt+NoSuchKey").is_err());
    }
    #[test]
    fn safe_defaults_require_confirmation() {
        let value = UploadSettings::default();
        assert!(!value.configured);
        assert_eq!(value.shortcut, "Control+Alt+V");
    }
}
