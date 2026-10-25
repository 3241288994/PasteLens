import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { DEFAULT_UPLOAD_SETTINGS, emptyUploadSnapshot, isUploadBusy, legacyUploadSettings, shortcutFromEvent, type UploadSettings, type UploadSnapshot } from "./image-upload-model";
import { keycaps, statusMarkup, uploadIcon } from "./image-upload-view";
import { uploadAction, watchUpload } from "./image-upload-client";
import "./image-upload.css";

export function initializeImageUpload(): void {
  const panel = document.querySelector<HTMLDialogElement>("#image-upload-panel")!;
  const trigger = document.querySelector<HTMLButtonElement>("#open-image-upload")!;
  const host = panel.querySelector<HTMLInputElement>("#upload-host")!;
  const directory = panel.querySelector<HTMLInputElement>("#upload-directory")!;
  const shortcutButton = panel.querySelector<HTMLButtonElement>("#upload-shortcut-record")!;
  const hint = panel.querySelector<HTMLElement>("#upload-form-hint")!;
  const save = panel.querySelector<HTMLButtonElement>("#upload-save")!;
  const check = panel.querySelector<HTMLButtonElement>("#upload-check")!;
  const upload = panel.querySelector<HTMLButtonElement>("#upload-now")!;
  const status = panel.querySelector<HTMLElement>("#upload-panel-status")!;
  let state = emptyUploadSnapshot();
  let shortcut = state.settings.shortcut;
  let dirty = false;
  let recording = false;
  let saving = false;
  let checking = false;
  let initialized = false;
  let recordingTimer: number | undefined;

  function stopRecording(): void {
    recording = false;
    window.clearTimeout(recordingTimer);
    if (isTauri()) void invoke("set_image_upload_recording", { recording: false });
  }

  function message(text: string, error = false): void { hint.textContent = text; hint.dataset.tone = error ? "error" : "info"; }
  function fill(): void {
    host.value = state.settings.host;
    directory.value = state.settings.directory;
    shortcut = state.settings.shortcut;
    if (!state.settings.configured) {
      try {
        const legacy = legacyUploadSettings(localStorage.getItem("pastelens.file-workspace.v1"));
        if (legacy) {
          host.value = legacy.host ?? host.value; directory.value = legacy.directory ?? directory.value;
          message("已带入原文件面板的接收设置。确认目录后，点击“保存并启用”。");
        } else message("首次使用请确认服务器与接收目录，再保存并启用。");
      } catch { message("首次使用请确认服务器与接收目录。"); }
    }
  }
  function render(): void {
    const busy = isUploadBusy(state.status.phase);
    trigger.innerHTML = `<span class="upload-launch-icon">${uploadIcon}</span><span>图片快传</span><span class="upload-launch-keys">${keycaps(state.settings.shortcut)}</span><i class="upload-launch-dot" data-phase="${state.status.phase}"></i>`;
    trigger.title = `${state.settings.host} · ${state.settings.configured ? "打开图片快传与设置" : "点击完成首次设置"}${state.shortcutError ? ` · ${state.shortcutError}` : ""}`;
    trigger.dataset.active = String(busy);
    shortcutButton.innerHTML = recording ? '<span class="upload-recording-dot"></span>请按快捷键…' : keycaps(shortcut);
    shortcutButton.classList.toggle("recording", recording);
    panel.querySelectorAll<HTMLInputElement | HTMLButtonElement>(".upload-settings-grid input, #upload-shortcut-record, #upload-shortcut-reset").forEach((item) => { item.disabled = busy || saving; });
    save.disabled = busy || saving || recording;
    save.textContent = saving ? "正在保存…" : state.settings.configured ? "保存设置" : "保存并启用";
    check.disabled = checking || busy || saving;
    check.textContent = checking ? "正在检查…" : "检查连接";
    upload.disabled = busy || saving || dirty || !state.settings.configured;
    upload.textContent = busy ? "正在上传，请稍候…" : "上传剪贴板图片";
    const showStatus = state.status.phase !== "idle" && state.status.phase !== "setup";
    status.hidden = !showStatus;
    if (showStatus) status.innerHTML = statusMarkup(state);
    const error = panel.querySelector<HTMLElement>("#upload-shortcut-error")!;
    error.hidden = !state.shortcutError;
    error.textContent = state.shortcutError;
  }
  function open(): void {
    if (!dirty) fill();
    render();
    if (!panel.open) panel.showModal();
  }
  function edit(): void { dirty = true; message("设置有修改，保存后快捷键才会使用新目标。"); render(); }
  function current(): UploadSettings { return { host: host.value.trim(), directory: directory.value.trim(), shortcut, configured: true }; }
  trigger.addEventListener("click", open);
  panel.querySelector("#upload-panel-close")!.addEventListener("click", () => panel.close());
  panel.addEventListener("close", () => { stopRecording(); render(); });
  window.addEventListener("blur", () => { if (recording) { stopRecording(); render(); } });
  panel.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (!recording) return;
    event.preventDefault();
    if (event.key === "Escape") { stopRecording(); render(); return; }
    const result = shortcutFromEvent(event);
    if (result) { shortcut = result; stopRecording(); edit(); }
    else message("请同时按至少两个修饰键和一个字母／数字键；⌥⇧空格已用于阅读窗口。", true);
  });
  host.addEventListener("input", edit);
  directory.addEventListener("input", edit);
  shortcutButton.addEventListener("click", async () => {
    if (recording) { stopRecording(); render(); return; }
    try {
      if (isTauri()) await invoke("set_image_upload_recording", { recording: true });
      recording = true; render(); shortcutButton.focus();
      recordingTimer = window.setTimeout(() => { stopRecording(); message("快捷键录制已结束，原设置未改变。"); render(); }, 30000);
    } catch (error) { message(String(error), true); }
  });
  panel.querySelector("#upload-shortcut-reset")!.addEventListener("click", () => { stopRecording(); shortcut = DEFAULT_UPLOAD_SETTINGS.shortcut; edit(); });
  save.addEventListener("click", async () => {
    saving = true; render();
    try {
      if (!isTauri()) throw new Error("请在桌面应用中保存快捷键设置。");
      state = await invoke<UploadSnapshot>("configure_image_upload", { settings: current() });
      dirty = false; fill(); message("设置已保存。现在可在任何应用中按快捷键上传图片。连接状态以实际上传或检查结果为准。");
    } catch (error) { message(String(error), true); }
    finally { saving = false; render(); }
  });
  check.addEventListener("click", async () => {
    checking = true; const target = current(); render(); message("正在验证 SSH 认证与接收目录权限…");
    try {
      if (!isTauri()) throw new Error("连接检查需要桌面应用。");
      const resolved = await invoke<string>("check_image_upload_target", { host: target.host, directory: target.directory });
      if (JSON.stringify(target) === JSON.stringify(current())) message(`连接可用 · ${resolved}（未上传图片）`);
    } catch (error) { if (JSON.stringify(target) === JSON.stringify(current())) message(String(error), true); }
    finally { checking = false; render(); }
  });
  upload.addEventListener("click", () => void uploadAction("upload", state).catch((error) => message(String(error), true)));
  status.addEventListener("click", (event) => {
    const action = (event.target as Element).closest<HTMLButtonElement>("[data-upload-action]")?.dataset.uploadAction;
    if (!action) return;
    if (action === "settings") { host.focus(); return; }
    void uploadAction(action, state).catch((error) => message(String(error), true));
  });
  void watchUpload((next) => {
    state = next;
    if (!initialized) { fill(); initialized = true; }
    render();
  }).catch((error) => message(`状态读取失败：${String(error)}`, true));
  if (isTauri()) void listen("image-upload-open-settings", open);
  fill(); render();
}
