export interface RenderHistoryEntry {
  id: string;
  source: string;
  title: string;
  summary: string;
  updatedAt: number;
  pinned: boolean;
  scrollTop: number;
  projectId: string | null;
  tagIds: string[];
}

export interface HistoryEntryState {
  pinned?: boolean;
  scrollTop?: number;
  projectId?: string | null;
  tagIds?: string[];
}

export interface HistoryProject {
  id: string;
  name: string;
  color: string;
  createdAt: number;
}

export interface HistoryTag {
  id: string;
  name: string;
  createdAt: number;
}

export interface HistoryWorkspace {
  entries: RenderHistoryEntry[];
  projects: HistoryProject[];
  tags: HistoryTag[];
}

export interface HistoryFilter {
  projectId?: string | null;
  pinnedOnly?: boolean;
  tagIds?: Iterable<string>;
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

function uniqueIds(values: unknown): string[] {
  if (!Array.isArray(values)) {
    return [];
  }
  return Array.from(new Set(values.filter((value): value is string =>
    typeof value === "string" && value.trim().length > 0,
  )));
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
  filter: HistoryFilter = {},
): RenderHistoryEntry[] {
  const terms = normalizedSearchText(query).split(" ").filter(Boolean);
  const tagIds = Array.from(filter.tagIds ?? []);

  return sortHistoryEntries(entries).filter((entry) => {
    if (filter.projectId !== undefined && entry.projectId !== filter.projectId) {
      return false;
    }
    if (filter.pinnedOnly && !entry.pinned) {
      return false;
    }
    if (tagIds.some((tagId) => !entry.tagIds.includes(tagId))) {
      return false;
    }
    if (terms.length === 0) {
      return true;
    }
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
    projectId: state.projectId?.trim() || null,
    tagIds: uniqueIds(state.tagIds),
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
      .filter((entry): entry is Omit<RenderHistoryEntry, "pinned" | "scrollTop" | "projectId" | "tagIds"> & Partial<RenderHistoryEntry> => {
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
        projectId: typeof entry.projectId === "string" && entry.projectId.trim()
          ? entry.projectId
          : null,
        tagIds: uniqueIds(entry.tagIds),
      }));
    return sortHistoryEntries(entries);
  } catch {
    return [];
  }
}

export function parseHistoryWorkspace(value: unknown): HistoryWorkspace | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as Partial<HistoryWorkspace>;
  if (!Array.isArray(candidate.entries) || !Array.isArray(candidate.projects) || !Array.isArray(candidate.tags)) {
    return null;
  }

  const projects = candidate.projects.filter((project): project is HistoryProject => Boolean(
    project
      && typeof project.id === "string"
      && project.id.trim()
      && typeof project.name === "string"
      && project.name.trim()
      && typeof project.color === "string"
      && typeof project.createdAt === "number"
      && Number.isFinite(project.createdAt),
  ));
  const tags = candidate.tags.filter((tag): tag is HistoryTag => Boolean(
    tag
      && typeof tag.id === "string"
      && tag.id.trim()
      && typeof tag.name === "string"
      && tag.name.trim()
      && typeof tag.createdAt === "number"
      && Number.isFinite(tag.createdAt),
  ));
  const entries = parseHistoryEntries(JSON.stringify(candidate.entries));
  const projectIds = new Set(projects.map((project) => project.id));
  const tagIds = new Set(tags.map((tag) => tag.id));

  return {
    projects,
    tags,
    entries: entries.map((entry) => ({
      ...entry,
      projectId: entry.projectId && projectIds.has(entry.projectId) ? entry.projectId : null,
      tagIds: entry.tagIds.filter((tagId) => tagIds.has(tagId)),
    })),
  };
}

export function upsertHistoryEntry(
  entries: RenderHistoryEntry[],
  entry: RenderHistoryEntry,
): RenderHistoryEntry[] {
  const remaining = entries.filter(
    (candidate) => candidate.id !== entry.id && candidate.source !== entry.source,
  );
  return sortHistoryEntries([entry, ...remaining]);
}
