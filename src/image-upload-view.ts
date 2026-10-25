import { describeUploadError, isUploadBusy, shortcutKeys, uploadMessage, uploadSize, type UploadSnapshot } from "./image-upload-model";

export const uploadIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17H6a4 4 0 0 1-.7-7.94 7 7 0 0 1 13.4 0A4 4 0 0 1 18 17h-1"/><path d="m8 13 4-4 4 4M12 9v12"/></svg>';
const icons: Record<string, string> = {
  success: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>',
  error: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg>',
  warning: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v9m0 4v1"/><circle cx="12" cy="12" r="10"/></svg>',
};
export const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
export const isMac = (): boolean => /Mac/i.test(navigator.platform);
export function keycaps(shortcut: string): string { return shortcutKeys(shortcut, isMac()).map((key) => `<kbd>${escapeHtml(key)}</kbd>`).join(""); }

export function statusMarkup(snapshot: UploadSnapshot, compact = false): string {
  const state = snapshot.status;
  const message = uploadMessage(state);
  const busy = isUploadBusy(state.phase);
  const image = state.thumbnail.startsWith("data:image/png;base64,") ? `<img class="upload-thumbnail" src="${escapeHtml(state.thumbnail)}" alt="此次上传的图片缩略图">` : "";
  const error = state.phase === "error" ? describeUploadError(state.detail) : state.detail;
  const target = state.host ? `${state.host} · ${state.path || state.directory}` : snapshot.settings.host;
  const success = state.phase === "success";
  const steps = ["读取", "连接", "上传", "校验"].map((label, index) => `<li class="${index < message.step ? "done" : index === message.step ? "current" : ""}"><i></i><span>${label}</span></li>`).join("");
  return `<article class="upload-status-card ${compact ? "compact" : ""}" data-tone="${message.tone}" data-phase="${state.phase}" role="status" aria-live="polite" aria-atomic="true">
    <div class="upload-status-top"><span class="upload-eyebrow">PASTELENS <b>图片快传</b></span>${compact ? '<button class="upload-dismiss" data-upload-action="dismiss" aria-label="收起上传提示">×</button>' : ""}</div>
    <div class="upload-status-main"><div class="upload-state-icon ${busy ? "is-spinning" : ""}">${icons[message.tone] ?? uploadIcon}</div><div class="upload-status-copy"><h3>${message.title}</h3><p>${message.description}</p></div>${image}</div>
    ${error ? `<p class="upload-error-detail" title="${escapeHtml(state.detail)}">${escapeHtml(error)}</p>` : ""}
    ${busy || success || state.phase === "uploaded" ? `<ol class="upload-steps" aria-label="上传阶段">${steps}</ol>` : ""}
    <div class="upload-target" title="${escapeHtml(target)}"><span>${escapeHtml(target)}</span>${state.size ? `<small>${state.width} × ${state.height} · ${uploadSize(state.size)}</small>` : ""}</div>
    <div class="upload-status-bottom">${success ? `<span class="upload-paste-hint">现在按 ${keycaps(isMac() ? "Super+V" : "Control+V")} 粘贴</span>` : `<span class="upload-shortcut-hint">上传 ${keycaps(snapshot.settings.shortcut)}</span>`}
      <div class="upload-status-actions">${busy ? `<button data-upload-action="cancel" ${state.phase === "cancelling" ? "disabled" : ""}>取消上传</button>` : state.path ? '<button data-upload-action="copy">复制路径</button>' : state.phase === "setup" ? '<button data-upload-action="settings">去设置</button>' : state.phase === "error" || state.phase === "cancelled" ? `<button data-upload-action="${state.retryable ? "retry" : "upload"}">${state.retryable ? "重试此图片" : "重新读取"}</button><button data-upload-action="settings">设置</button>` : ""}</div>
    </div>
    ${success && compact ? '<div class="upload-autohide">提示稍后自动收起 · 上传成功不代表 AI 已读取</div>' : ""}
  </article>`;
}
