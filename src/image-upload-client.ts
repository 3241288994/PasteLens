import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { emptyUploadSnapshot, type UploadSnapshot } from "./image-upload-model";

export async function watchUpload(callback: (snapshot: UploadSnapshot) => void): Promise<void> {
  if (!isTauri()) { callback(emptyUploadSnapshot()); return; }
  let revision = -1;
  const accept = (snapshot: UploadSnapshot) => {
    if (snapshot.status.revision < revision) return;
    revision = snapshot.status.revision;
    callback(snapshot);
  };
  await listen<UploadSnapshot>("image-upload-state", (event) => accept(event.payload));
  accept(await invoke<UploadSnapshot>("get_image_upload_snapshot"));
}
export async function uploadAction(action: string, state: UploadSnapshot): Promise<void> {
  if (!isTauri()) throw new Error("图片快传需要在 PasteLens 桌面应用中使用。");
  switch (action) {
    case "upload": return invoke("start_image_upload", { retry: false });
    case "retry": return invoke("start_image_upload", { retry: true });
    case "cancel": return invoke("cancel_image_upload");
    case "copy": return invoke("copy_image_upload_path", { id: state.status.id });
    case "dismiss": return invoke("dismiss_image_upload", { revision: state.status.revision });
    case "settings": return invoke("open_image_upload_settings");
  }
}
