import { invoke, isTauri } from "@tauri-apps/api/core";
import type { HistoryWorkspace } from "./history";

export function hasNativeHistoryStore(): boolean {
  return isTauri();
}

export async function loadNativeHistoryWorkspace(): Promise<HistoryWorkspace | null> {
  if (!hasNativeHistoryStore()) {
    return null;
  }
  return invoke<HistoryWorkspace | null>("load_history_workspace");
}

export async function saveNativeHistoryWorkspace(workspace: HistoryWorkspace): Promise<void> {
  if (!hasNativeHistoryStore()) {
    return;
  }
  await invoke("save_history_workspace", { workspace });
}

export async function updateNativeHistoryScroll(id: string, scrollTop: number): Promise<void> {
  if (!hasNativeHistoryStore()) {
    return;
  }
  await invoke("update_history_scroll", { id, scrollTop });
}
