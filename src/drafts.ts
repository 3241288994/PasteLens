export interface DraftEntry {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}

export function parseDrafts(value: unknown): DraftEntry[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  return value
    .filter((item): item is DraftEntry => {
      if (!item || typeof item !== "object") return false;
      const draft = item as Partial<DraftEntry>;
      return typeof draft.id === "string"
        && typeof draft.title === "string"
        && typeof draft.content === "string"
        && typeof draft.createdAt === "number"
        && typeof draft.updatedAt === "number";
    })
    .sort((left, right) => right.updatedAt - left.updatedAt);
}

export function draftTitle(content: string): string {
  const plainText = content.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ");
  const firstLine = plainText.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
  if (!firstLine) return "未命名草稿";
  return firstLine.length > 42 ? `${firstLine.slice(0, 42)}…` : firstLine;
}
