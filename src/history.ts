export const HISTORY_LIMIT = 30;

export interface RenderHistoryEntry {
  id: string;
  source: string;
  title: string;
  summary: string;
  updatedAt: number;
  pinned: boolean;
  scrollTop: number;
}

export interface HistoryEntryState {
  pinned?: boolean;
  scrollTop?: number;
}

function compactText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function trimTo(value: string, length: number): string {
  return value.length > length ? `${value.slice(0, length - 1)}…` : value;
}

function normalizedSearchText(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim();
}

function containsSubsequence(value: string, query: string): boolean {
  let queryIndex = 0;
  for (const character of value) {
    if (character === query[queryIndex]) {
      queryIndex += 1;
      if (queryIndex === query.length) {
        return true;
      }
    }
  }
  return query.length === 0;
}

export function sortHistoryEntries(entries: RenderHistoryEntry[]): RenderHistoryEntry[] {
  return [...entries].sort((left, right) => {
    if (left.pinned !== right.pinned) {
      return left.pinned ? -1 : 1;
    }
    return right.updatedAt - left.updatedAt;
  });
}

export function filterHistoryEntries(
  entries: RenderHistoryEntry[],
  query: string,
): RenderHistoryEntry[] {
  const terms = normalizedSearchText(query).split(" ").filter(Boolean);
  if (terms.length === 0) {
    return sortHistoryEntries(entries);
  }

  return sortHistoryEntries(entries).filter((entry) => {
    const haystack = normalizedSearchText(`${entry.title}\n${entry.summary}\n${entry.source}`);
    const compactHaystack = haystack.replace(/\s+/g, "");
    return terms.every((term) => {
      const compactTerm = term.replace(/\s+/g, "");
      return haystack.includes(term) || containsSubsequence(compactHaystack, compactTerm);
    });
  });
}

export function createHistoryEntry(
  id: string,
  source: string,
  normalized: string,
  updatedAt: number,
  state: HistoryEntryState = {},
): RenderHistoryEntry {
  const heading = normalized
    .split("\n")
    .map((line) => line.trim())
    .find((line) => /^#{1,6}\s+\S/.test(line));
  const firstLine = normalized
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line && !/^(?:```|\$\$|\[|\])$/.test(line));
  const titleSource = (heading ?? firstLine ?? "未命名渲染").replace(/^#{1,6}\s+/, "");

  return {
    id,
    source,
    title: trimTo(compactText(titleSource), 48),
    summary: trimTo(compactText(normalized), 110),
    updatedAt,
    pinned: state.pinned ?? false,
    scrollTop: Math.max(0, state.scrollTop ?? 0),
  };
}

export function parseHistoryEntries(raw: string | null): RenderHistoryEntry[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    const entries = parsed
      .filter((entry): entry is Omit<RenderHistoryEntry, "pinned" | "scrollTop"> & Partial<RenderHistoryEntry> => {
        if (!entry || typeof entry !== "object") {
          return false;
        }
        const candidate = entry as Partial<RenderHistoryEntry>;
        return (
          typeof candidate.id === "string" &&
          typeof candidate.source === "string" &&
          candidate.source.trim().length > 0 &&
          typeof candidate.title === "string" &&
          typeof candidate.summary === "string" &&
          typeof candidate.updatedAt === "number" &&
          Number.isFinite(candidate.updatedAt)
        );
      })
      .map((entry) => ({
        ...entry,
        pinned: entry.pinned === true,
        scrollTop:
          typeof entry.scrollTop === "number" && Number.isFinite(entry.scrollTop)
            ? Math.max(0, entry.scrollTop)
            : 0,
      }));
    return sortHistoryEntries(entries).slice(0, HISTORY_LIMIT);
  } catch {
    return [];
  }
}

export function upsertHistoryEntry(
  entries: RenderHistoryEntry[],
  entry: RenderHistoryEntry,
): RenderHistoryEntry[] {
  const remaining = entries.filter(
    (candidate) => candidate.id !== entry.id && candidate.source !== entry.source,
  );
  return sortHistoryEntries([entry, ...remaining]).slice(0, HISTORY_LIMIT);
}
