import { emptyUploadSnapshot } from "./image-upload-model";
import { statusMarkup } from "./image-upload-view";
import { uploadAction, watchUpload } from "./image-upload-client";
import "./image-upload.css";

const root = document.querySelector<HTMLElement>("#upload-hud")!;
let state = emptyUploadSnapshot();
let timer: number | undefined;
let hovering = false;
function scheduleHide(): void {
  window.clearTimeout(timer);
  if (state.status.phase === "success" && !hovering) {
    const snapshot = state;
    timer = window.setTimeout(() => void uploadAction("dismiss", snapshot), 12000);
  }
}
root.addEventListener("pointerenter", () => { hovering = true; scheduleHide(); });
root.addEventListener("pointerleave", () => { hovering = false; scheduleHide(); });
root.addEventListener("click", (event) => {
  const button = (event.target as Element).closest<HTMLButtonElement>("[data-upload-action]");
  if (!button?.dataset.uploadAction) return;
  const action = button.dataset.uploadAction;
  button.disabled = true;
  void uploadAction(action, state).catch((error) => {
    const detail = root.querySelector<HTMLElement>(".upload-status-copy p");
    if (detail) detail.textContent = String(error);
  }).finally(() => { if (button.isConnected) button.disabled = false; });
});
void watchUpload((snapshot) => { state = snapshot; root.innerHTML = statusMarkup(state, true); scheduleHide(); }).catch((error) => {
  state.status.phase = "error";
  state.status.detail = `无法读取上传状态，请重新打开 PasteLens：${String(error)}`;
  root.innerHTML = statusMarkup(state, true);
});
