export interface UploadSettings { host: string; directory: string; shortcut: string; configured: boolean }
export type UploadPhase = "idle" | "setup" | "reading" | "connecting" | "uploading" | "verifying" | "cancelling" | "success" | "uploaded" | "error" | "cancelled";
export interface UploadStatus {
  id: number; revision: number; phase: UploadPhase; host: string; directory: string;
  path: string; thumbnail: string; width: number; height: number;
  size: number; detail: string; retryable: boolean;
}
export interface UploadSnapshot { settings: UploadSettings; shortcutError: string; status: UploadStatus }
export const DEFAULT_UPLOAD_SETTINGS: UploadSettings = { host: "GPU-Server-Codex", directory: "~/attachments", shortcut: "Control+Alt+V", configured: false };
export function emptyUploadSnapshot(): UploadSnapshot {
  return { settings: { ...DEFAULT_UPLOAD_SETTINGS }, shortcutError: "", status: { id: 0, revision: 0, phase: "idle", host: "", directory: "", path: "", thumbnail: "", width: 0, height: 0, size: 0, detail: "", retryable: false } };
}
export function isUploadBusy(phase: UploadPhase): boolean {
  return ["reading", "connecting", "uploading", "verifying", "cancelling"].includes(phase);
}
export function shortcutKeys(shortcut: string, mac: boolean): string[] {
  const symbols: Record<string, string> = mac ? { Control: "⌃", Alt: "⌥", Shift: "⇧", Super: "⌘", Space: "空格" } : { Control: "Ctrl", Alt: "Alt", Shift: "Shift", Super: "Win", Space: "Space" };
  return shortcut.split("+").map((part) => symbols[part] ?? part);
}
export function shortcutFromEvent(event: Pick<KeyboardEvent, "ctrlKey" | "altKey" | "shiftKey" | "metaKey" | "code">): string | null {
  const modifiers = [event.ctrlKey && "Control", event.altKey && "Alt", event.shiftKey && "Shift", event.metaKey && "Super"].filter(Boolean);
  if (modifiers.length < 2) return null;
  const key = /^(Key[A-Z]|Digit[0-9])$/.test(event.code) ? event.code.replace(/^(Key|Digit)/, "")
    : /^(F([1-9]|1[0-2])|Space)$/.test(event.code) ? event.code : null;
  if (!key) return null;
  const value = [...modifiers, key].join("+");
  return value === "Alt+Shift+Space" ? null : value;
}
export function legacyUploadSettings(value: string | null): Partial<UploadSettings> | null {
  try {
    const data: unknown = JSON.parse(value ?? "null");
    if (!data || typeof data !== "object") return null;
    const item = data as Record<string, unknown>;
    if (typeof item.remoteHost !== "string" || typeof item.uploadDirectory !== "string") return null;
    return { host: item.remoteHost.trim(), directory: item.uploadDirectory.trim() };
  } catch { return null; }
}
export function uploadMessage(status: UploadStatus): { title: string; description: string; tone: string; step: number } {
  const steps: Record<string, number> = { reading: 0, connecting: 1, uploading: 2, verifying: 3 };
  const messages: Record<UploadPhase, [string, string, string]> = {
    idle: ["图片准备好，随时出发", "截图或复制图片，然后按上传快捷键。", "idle"],
    setup: ["先确认图片要送到哪里", "设置服务器和接收目录后，即可用全局快捷键上传。", "warning"],
    reading: ["正在读取剪贴板图片", "保留原始分辨率，正在准备 PNG 图片。", "working"],
    connecting: ["正在连接服务器", "使用已有 SSH 密钥，不影响正在运行的端口转发。", "working"],
    uploading: ["图片正在上传", "通过 SFTP 加密传输，请稍候。", "working"],
    verifying: ["正在校验图片完整性", "核对大小与 SHA-256，确认传输完整后再复制绝对路径。", "working"],
    cancelling: ["正在取消上传", "正在停止传输并尝试清理未完成的临时文件。", "working"],
    success: ["上传成功，路径已复制", "已复制服务器上的图片绝对路径，直接粘贴即可。", "success"],
    uploaded: ["图片已上传，等待复制路径", "剪贴板有新内容或暂时无法写入，未自动替换。", "warning"],
    error: ["这次没有完成上传", "剪贴板未被替换。检查原因后可重试。", "error"],
    cancelled: ["上传已取消", "没有替换剪贴板，准备好的图片可重新上传。", "idle"],
  };
  const [title, description, tone] = messages[status.phase];
  return { title, description, tone, step: steps[status.phase] ?? (status.phase === "success" || status.phase === "uploaded" ? 4 : -1) };
}
export function describeUploadError(detail: string): string {
  if (/permission denied|publickey/i.test(detail)) return "SSH 身份验证失败，请确认密钥已解锁，并能在终端正常连接此服务器。";
  if (/host key verification failed|remote host identification/i.test(detail)) return "主机密钥尚未确认或已变化，请先在终端连接并核对服务器身份。";
  if (/could not resolve|name or service not known/i.test(detail)) return "找不到这台服务器，请检查 SSH 别名或网络连接。";
  if (/connection refused|no route to host|network is unreachable/i.test(detail)) return "服务器暂时不可达，请检查 VPN、网络和 SSH 服务。";
  if (/python3.*not found/i.test(detail)) return "服务器需要 python3 来准备接收目录并校验图片。";
  return detail;
}
export function uploadSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
