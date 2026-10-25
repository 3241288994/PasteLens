import { invoke } from "@tauri-apps/api/core";
import type { DraftEntry } from "./drafts";

export function hasNativeDraftStore(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

export async function loadNativeDrafts(): Promise<DraftEntry[] | null> {
  if (!hasNativeDraftStore()) return null;
  return invoke<DraftEntry[] | null>("load_drafts");
}

export async function saveNativeDrafts(drafts: DraftEntry[]): Promise<void> {
  if (!hasNativeDraftStore()) return;
  await invoke("save_drafts", { drafts });
}
