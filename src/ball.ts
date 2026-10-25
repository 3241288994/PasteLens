import { invoke, isTauri } from "@tauri-apps/api/core";
import { Menu } from "@tauri-apps/api/menu";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./ball.css";
import { createDeferredQuitController } from "./context-menu-quit";
import { watchUpload } from "./image-upload-client";
import { isUploadBusy, shortcutKeys, uploadMessage } from "./image-upload-model";

const ball = document.querySelector<HTMLButtonElement>("#floating-ball");
if (!ball) {
  throw new Error("Missing floating ball");
}

const currentWindow = getCurrentWindow();
void watchUpload((snapshot) => {
  ball.dataset.uploadPhase = snapshot.status.phase;
  ball.classList.toggle("upload-busy", isUploadBusy(snapshot.status.phase));
  ball.title = `PasteLens · ${uploadMessage(snapshot.status).title}\n上传快捷键 ${shortcutKeys(snapshot.settings.shortcut, /Mac/i.test(navigator.platform)).join(" ")}`;
});
let pointerStart: { x: number; y: number } | null = null;
let dragging = false;
let contextMenuPromise: Promise<Menu> | null = null;
const quitController = createDeferredQuitController(() => invoke("quit_app"));

async function toggleViewer(): Promise<void> {
  try {
    await invoke("toggle_viewer");
  } catch {
    window.open("/index.html", "pastelens-viewer", "width=940,height=720");
  }
}

function contextMenu(): Promise<Menu> {
  if (!contextMenuPromise) {
    contextMenuPromise = Menu.new({
      items: [
        {
          id: "toggle-viewer",
          text: "打开 / 隐藏阅读窗口",
          action: () => void toggleViewer(),
        },
        { item: "Separator" },
        { id: "upload-image", text: "上传剪贴板图片", action: () => { void invoke("start_image_upload", { retry: false }); } },
        { id: "upload-settings", text: "图片快传与快捷键设置…", action: () => { void invoke("open_image_upload_settings"); } },
        { item: "Separator" },
        {
          id: "quit-app",
          text: "退出 PasteLens",
          action: () => void quitController.requestQuit(),
        },
      ],
    });
  }
  return contextMenuPromise;
}

ball.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) {
    return;
  }
  pointerStart = { x: event.screenX, y: event.screenY };
  dragging = false;
  ball.setPointerCapture(event.pointerId);
});

ball.addEventListener("pointermove", async (event) => {
  if (!pointerStart || dragging) {
    return;
  }
  const distance = Math.hypot(event.screenX - pointerStart.x, event.screenY - pointerStart.y);
  if (distance < 5) {
    return;
  }
  dragging = true;
  try {
    await currentWindow.startDragging();
  } catch {
    // Dragging is only available in the desktop shell.
  }
});

ball.addEventListener("pointerup", async (event) => {
  if (event.button !== 0 || !pointerStart) {
    return;
  }
  pointerStart = null;
  if (dragging) {
    dragging = false;
    return;
  }
  await toggleViewer();
});

ball.addEventListener("pointercancel", () => {
  pointerStart = null;
  dragging = false;
});

ball.addEventListener("contextmenu", async (event) => {
  if (!isTauri()) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  pointerStart = null;
  dragging = false;
  quitController.beginMenu();
  try {
    await (await contextMenu()).popup(undefined, currentWindow);
  } catch {
    contextMenuPromise = null;
  } finally {
    await quitController.endMenu();
  }
});
