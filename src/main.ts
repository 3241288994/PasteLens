import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager";
import { openUrl } from "@tauri-apps/plugin-opener";
import "katex/dist/katex.min.css";
import "./styles.css";
import {
  ASK_PROMPT_TEMPLATES,
  buildAskPrompt,
  CHATGPT_URL,
  DEFAULT_CUSTOM_ASK_INSTRUCTION,
  parseAskContextScope,
  parseAskPromptTemplateId,
  promptInstructionForTemplate,
  type AskContextScope,
  type AskPromptTemplateId,
} from "./ask-ai";
import { decorateCodeBlocks } from "./code-blocks";
import {
  buildDocumentOutline,
  clearSearchHighlights,
  highlightSearchMatches,
  type DocumentOutlineItem,
} from "./document-navigation";
import {
  exportBaseName,
  exportFormulaImage,
  exportPreviewHtml,
  exportPreviewPng,
  printPreview,
  saveSvgMarkup,
} from "./export";
import { filePathFromHref } from "./file-link";
import {
  createHistoryEntry,
  filterHistoryEntries,
  parseHistoryEntries,
  parseHistoryWorkspace,
  sortHistoryEntries,
  upsertHistoryEntry,
  type HistoryFilter,
  type HistoryProject,
  type HistoryTag,
  type HistoryWorkspace,
  type RenderHistoryEntry,
} from "./history";
import {
  hasNativeHistoryStore,
  loadNativeHistoryWorkspace,
  saveNativeHistoryWorkspace,
} from "./history-store";
import { renderMermaidBlocks } from "./mermaid-renderer";
import {
  ASK_CONTEXT_SCOPE_STORAGE_KEY,
  ASK_CUSTOM_PROMPT_STORAGE_KEY,
  ASK_PROMPT_TEMPLATE_STORAGE_KEY,
  ASK_SELECTION_ENABLED_STORAGE_KEY,
  AUTO_RENDER_CLIPBOARD_STORAGE_KEY,
  parseAskSelectionEnabledPreference,
  parseAutoRenderClipboardPreference,
} from "./preferences";
import { recoverTerminalMarkdown } from "./recovery/normalize";
import type { RecoveryResult } from "./recovery/types";
import { renderMarkdown } from "./render";
import { DEMO_TEXT } from "./sample";
import { webUrlFromHref } from "./web-link";

type ViewMode = "preview" | "split";

interface ActiveAskSelection {
  text: string;
  rect: DOMRect;
}

function requiredElement<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing required element: ${selector}`);
  }
  return element;
}

const sourceInput = requiredElement<HTMLTextAreaElement>("#source-input");
const preview = requiredElement<HTMLElement>("#preview");
const workspace = requiredElement<HTMLElement>("#workspace");
const renderStatus = requiredElement<HTMLElement>("#render-status");
const characterCount = requiredElement<HTMLElement>("#character-count");
const repairDetails = requiredElement<HTMLDetailsElement>("#repair-details");
const repairSummary = requiredElement<HTMLElement>("#repair-summary");
const repairList = requiredElement<HTMLOListElement>("#repair-list");
const pinButton = requiredElement<HTMLButtonElement>("#pin-window");
const historyButton = requiredElement<HTMLButtonElement>("#toggle-history");
const settingsButton = requiredElement<HTMLButtonElement>("#toggle-settings");
const settingsPopover = requiredElement<HTMLElement>("#settings-popover");
const autoRenderClipboardToggle = requiredElement<HTMLInputElement>("#auto-render-clipboard");
const askSelectionEnabledToggle = requiredElement<HTMLInputElement>("#ask-selection-enabled");
const askContextScopeSelect = requiredElement<HTMLSelectElement>("#ask-context-scope");
const askPromptTemplateSelect = requiredElement<HTMLSelectElement>("#ask-prompt-template");
const askCustomTemplateSetting = requiredElement<HTMLElement>("#ask-custom-template-setting");
const askCustomPromptInput = requiredElement<HTMLTextAreaElement>("#ask-custom-prompt");
const resetCustomPromptButton = requiredElement<HTMLButtonElement>("#reset-custom-prompt");
const historyCount = requiredElement<HTMLElement>("#history-count");
const historySidebar = requiredElement<HTMLElement>("#history-sidebar");
const historyBackdrop = requiredElement<HTMLElement>("#history-backdrop");
const historyList = requiredElement<HTMLElement>("#history-list");
const historyEmpty = requiredElement<HTMLElement>("#history-empty");
const historyCloseButton = requiredElement<HTMLButtonElement>("#close-history");
const historyClearButton = requiredElement<HTMLButtonElement>("#clear-history");
const historySearchInput = requiredElement<HTMLInputElement>("#history-search-input");
const historyNoResults = requiredElement<HTMLElement>("#history-no-results");
const historyProjectList = requiredElement<HTMLElement>("#history-project-list");
const historyTagList = requiredElement<HTMLElement>("#history-tag-list");
const newHistoryProjectButton = requiredElement<HTMLButtonElement>("#new-history-project");
const historyProjectCreateForm = requiredElement<HTMLFormElement>("#history-project-create-form");
const historyProjectNameInput = requiredElement<HTMLInputElement>("#history-project-name");
const saveHistoryProjectButton = requiredElement<HTMLButtonElement>("#save-history-project");
const cancelHistoryProjectButton = requiredElement<HTMLButtonElement>("#cancel-history-project");
const clearHistoryTagFilterButton = requiredElement<HTMLButtonElement>("#clear-history-tag-filter");
const historyBulkActions = requiredElement<HTMLElement>("#history-bulk-actions");
const historySelectionCount = requiredElement<HTMLElement>("#history-selection-count");
const historySelectionProject = requiredElement<HTMLSelectElement>("#history-selection-project");
const applyHistoryProjectButton = requiredElement<HTMLButtonElement>("#apply-history-project");
const historyTagInput = requiredElement<HTMLInputElement>("#history-tag-input");
const applyHistoryTagsButton = requiredElement<HTMLButtonElement>("#apply-history-tags");
const clearHistorySelectionButton = requiredElement<HTMLButtonElement>("#clear-history-selection");
const exportMenu = requiredElement<HTMLDetailsElement>("#export-menu");
const documentProjectSelect = requiredElement<HTMLSelectElement>("#document-project-select");
const documentNewProjectButton = requiredElement<HTMLButtonElement>("#document-new-project");
const documentProjectCreateForm = requiredElement<HTMLFormElement>("#document-project-create-form");
const documentProjectNameInput = requiredElement<HTMLInputElement>("#document-project-name");
const documentTagList = requiredElement<HTMLElement>("#document-tag-list");
const documentTagForm = requiredElement<HTMLFormElement>("#document-tag-form");
const documentTagInput = requiredElement<HTMLInputElement>("#document-tag-input");
const documentArchiveHint = requiredElement<HTMLElement>("#document-archive-hint");
const documentSearchButton = requiredElement<HTMLButtonElement>("#toggle-document-search");
const documentSearch = requiredElement<HTMLElement>("#document-search");
const documentSearchInput = requiredElement<HTMLInputElement>("#document-search-input");
const documentSearchCount = requiredElement<HTMLElement>("#document-search-count");
const previousSearchMatchButton = requiredElement<HTMLButtonElement>("#previous-search-match");
const nextSearchMatchButton = requiredElement<HTMLButtonElement>("#next-search-match");
const closeDocumentSearchButton = requiredElement<HTMLButtonElement>("#close-document-search");
const outlineButton = requiredElement<HTMLButtonElement>("#toggle-outline");
const documentOutline = requiredElement<HTMLElement>("#document-outline");
const documentOutlineList = requiredElement<HTMLElement>("#document-outline-list");
const documentOutlineEmpty = requiredElement<HTMLElement>("#document-outline-empty");
const closeOutlineButton = requiredElement<HTMLButtonElement>("#close-outline");
const backToTopButton = requiredElement<HTMLButtonElement>("#back-to-top");
const copyTooltip = requiredElement<HTMLElement>("#copy-tooltip");
const copyTooltipText = requiredElement<HTMLElement>("#copy-tooltip-text");
const formulaToolbar = requiredElement<HTMLElement>("#formula-toolbar");
const selectionToolbar = requiredElement<HTMLElement>("#selection-toolbar");
const askSelectionButton = requiredElement<HTMLButtonElement>("#ask-selection");
const HISTORY_STORAGE_KEY = "pastelens.render-history.v1";
const historyDateFormatter = new Intl.DateTimeFormat("zh-CN", {
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
let currentResult: RecoveryResult = recoverTerminalMarkdown("");
let historyEntries = loadHistoryEntries();
let historyProjects: HistoryProject[] = [];
let historyTags: HistoryTag[] = [];
let currentHistoryId: string | null = null;
let renderSequence = 0;
let renderTimer: number | undefined;
let copyFeedbackTimer: number | undefined;
let formulaToolbarTimer: number | undefined;
let selectionToolbarTimer: number | undefined;
let historyScrollTimer: number | undefined;
let historyPersistTimer: number | undefined;
let activeCopyTarget: HTMLElement | null = null;
let activeFormula: HTMLElement | null = null;
let activeAskSelection: ActiveAskSelection | null = null;
let searchMatches: HTMLElement[] = [];
let activeSearchMatch = -1;
let outlineItems: DocumentOutlineItem[] = [];
let pendingHistoryScrollTop: number | null = null;
let historyOpen = false;
let historyScope: "all" | "inbox" | "pinned" | string = "all";
let activeHistoryTagIds = new Set<string>();
let selectedHistoryIds = new Set<string>();
let editingHistoryProjectId: string | null = null;
let pendingHistoryProjectDeleteId: string | null = null;
const HISTORY_PROJECT_COLORS = ["#6c63e8", "#2f9d8f", "#d87c4a", "#b35db8", "#4d83d6", "#b28a27"];
let settingsOpen = false;
let documentSearchOpen = false;
let outlineOpen = false;
let viewingHistoryEntry = false;
let autoClipboardBusy = false;
let autoRenderClipboard = loadAutoRenderClipboardPreference();
let askSelectionEnabled = loadAskSelectionEnabledPreference();
let askContextScope = loadAskContextScopePreference();
let askPromptTemplateId = loadAskPromptTemplatePreference();
let askCustomPrompt = loadAskCustomPromptPreference();
let selectingPreview = false;
let pinned = true;

autoRenderClipboardToggle.checked = autoRenderClipboard;
askSelectionEnabledToggle.checked = askSelectionEnabled;
askContextScopeSelect.value = askContextScope;
askPromptTemplateSelect.value = askPromptTemplateId;
askCustomPromptInput.value = askCustomPrompt;
syncAskSettingsControls();

function emptyPreview(): string {
  return `
    <div class="empty-state">
      <span class="empty-icon">∑</span>
      <h1>复制，粘贴，读懂</h1>
      <p>PasteLens 会在本地恢复终端中丢失的公式分隔符，并渲染 Markdown、LaTeX 与终端表格。</p>
    </div>`;
}

function repairKindLabel(kind: RecoveryResult["repairs"][number]["kind"]): string {
  const labels = {
    ansi: "控制字符",
    "display-math": "块公式",
    "inline-math": "行内公式",
    "terminal-table": "终端表格",
  } as const;
  return labels[kind];
}

function loadHistoryEntries(): RenderHistoryEntry[] {
  try {
    return parseHistoryEntries(localStorage.getItem(HISTORY_STORAGE_KEY));
  } catch {
    return [];
  }
}

function loadAutoRenderClipboardPreference(): boolean {
  try {
    return parseAutoRenderClipboardPreference(localStorage.getItem(AUTO_RENDER_CLIPBOARD_STORAGE_KEY));
  } catch {
    return true;
  }
}

function loadAskSelectionEnabledPreference(): boolean {
  try {
    return parseAskSelectionEnabledPreference(localStorage.getItem(ASK_SELECTION_ENABLED_STORAGE_KEY));
  } catch {
    return true;
  }
}

function loadAskContextScopePreference(): AskContextScope {
  try {
    return parseAskContextScope(localStorage.getItem(ASK_CONTEXT_SCOPE_STORAGE_KEY));
  } catch {
    return "document";
  }
}

function loadAskPromptTemplatePreference(): AskPromptTemplateId {
  try {
    return parseAskPromptTemplateId(localStorage.getItem(ASK_PROMPT_TEMPLATE_STORAGE_KEY));
  } catch {
    return "explain";
  }
}

function loadAskCustomPromptPreference(): string {
  try {
    return localStorage.getItem(ASK_CUSTOM_PROMPT_STORAGE_KEY) ?? DEFAULT_CUSTOM_ASK_INSTRUCTION;
  } catch {
    return DEFAULT_CUSTOM_ASK_INSTRUCTION;
  }
}

function syncAskSettingsControls(): void {
  const disabled = !askSelectionEnabled;
  askContextScopeSelect.disabled = disabled;
  askPromptTemplateSelect.disabled = disabled;
  askCustomPromptInput.disabled = disabled;
  resetCustomPromptButton.disabled = disabled;
  askCustomTemplateSetting.hidden = askPromptTemplateId !== "custom";
}

function persistHistoryEntries(): void {
  let candidates = [...historyEntries];
  while (candidates.length > 0) {
    try {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(candidates));
      historyEntries = candidates;
      scheduleNativeHistoryPersistence();
      return;
    } catch {
      candidates = candidates.slice(0, -1);
    }
  }

  try {
    localStorage.removeItem(HISTORY_STORAGE_KEY);
  } catch {
    // The native database remains available even when browser storage is unavailable.
  }
  historyEntries = candidates;
  scheduleNativeHistoryPersistence();
}

function currentHistoryWorkspace(): HistoryWorkspace {
  return {
    entries: historyEntries,
    projects: historyProjects,
    tags: historyTags,
  };
}

function scheduleNativeHistoryPersistence(): void {
  if (!hasNativeHistoryStore()) {
    return;
  }
  window.clearTimeout(historyPersistTimer);
  historyPersistTimer = window.setTimeout(() => {
    const workspace = currentHistoryWorkspace();
    void saveNativeHistoryWorkspace(workspace).catch((error) => {
      console.error("Unable to persist history workspace", error);
    });
  }, 120);
}

async function initializeHistoryWorkspace(): Promise<void> {
  try {
    const persisted = parseHistoryWorkspace(await loadNativeHistoryWorkspace());
    if (persisted) {
      historyEntries = persisted.entries;
      historyProjects = persisted.projects;
      historyTags = persisted.tags;
    } else if (hasNativeHistoryStore()) {
      await saveNativeHistoryWorkspace(currentHistoryWorkspace());
    }
  } catch (error) {
    console.error("Unable to initialize history workspace", error);
  }
  renderHistoryList();
}

function createHistoryId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function setSettingsOpen(open: boolean): void {
  if (open) {
    hideSelectionToolbar();
  }
  settingsOpen = open;
  settingsPopover.hidden = !open;
  settingsButton.classList.toggle("active", open);
  settingsButton.setAttribute("aria-expanded", String(open));
  settingsButton.setAttribute("aria-label", open ? "关闭设置" : "打开设置");
  if (open) {
    if (historyOpen) {
      setHistoryOpen(false);
    }
    window.setTimeout(() => autoRenderClipboardToggle.focus());
  }
}

function setHistoryOpen(open: boolean): void {
  if (open) {
    hideSelectionToolbar();
  }
  if (open && settingsOpen) {
    setSettingsOpen(false);
  }
  historyOpen = open;
  historySidebar.classList.toggle("open", open);
  historySidebar.setAttribute("aria-hidden", String(!open));
  historyBackdrop.hidden = !open;
  historyButton.classList.toggle("active", open);
  historyButton.setAttribute("aria-expanded", String(open));
  historyButton.setAttribute("aria-label", open ? "关闭渲染历史" : "打开渲染历史");
  if (open) {
    window.setTimeout(() => historySearchInput.focus());
  }
}

function historyFilter(): HistoryFilter {
  const filter: HistoryFilter = { tagIds: activeHistoryTagIds };
  if (historyScope === "inbox") {
    filter.projectId = null;
  } else if (historyScope === "pinned") {
    filter.pinnedOnly = true;
  } else if (historyScope !== "all") {
    filter.projectId = historyScope;
  }
  return filter;
}

function projectForEntry(entry: RenderHistoryEntry): HistoryProject | undefined {
  return historyProjects.find((project) => project.id === entry.projectId);
}

function tagsForEntry(entry: RenderHistoryEntry): HistoryTag[] {
  return entry.tagIds.flatMap((tagId) => {
    const tag = historyTags.find((candidate) => candidate.id === tagId);
    return tag ? [tag] : [];
  });
}

function renderHistoryLibrary(): void {
  document.querySelectorAll<HTMLButtonElement>("[data-history-filter]").forEach((button) => {
    button.classList.toggle("active", button.dataset.historyFilter === historyScope);
  });

  historyProjectList.replaceChildren();
  for (const project of [...historyProjects].sort((left, right) => left.name.localeCompare(right.name, "zh-CN"))) {
    const row = document.createElement("div");
    const button = document.createElement("button");
    const dot = document.createElement("span");
    const label = document.createElement("span");
    const count = document.createElement("small");
    const renameButton = document.createElement("button");
    const deleteButton = document.createElement("button");
    row.className = "history-project-row";
    button.type = "button";
    button.className = "history-project-button";
    button.dataset.historyProjectId = project.id;
    button.classList.toggle("active", historyScope === project.id);
    dot.className = "history-project-dot";
    dot.style.background = project.color;
    label.textContent = project.name;
    count.textContent = String(historyEntries.filter((entry) => entry.projectId === project.id).length);
    renameButton.type = "button";
    renameButton.className = "history-project-action";
    renameButton.dataset.renameHistoryProjectId = project.id;
    renameButton.title = `重命名“${project.name}”`;
    renameButton.setAttribute("aria-label", renameButton.title);
    renameButton.textContent = "✎";
    deleteButton.type = "button";
    deleteButton.className = "history-project-action";
    deleteButton.dataset.deleteHistoryProjectId = project.id;
    deleteButton.title = pendingHistoryProjectDeleteId === project.id
      ? `再次点击确认删除“${project.name}”`
      : `删除“${project.name}”`;
    deleteButton.setAttribute("aria-label", deleteButton.title);
    deleteButton.classList.toggle("delete-confirm", pendingHistoryProjectDeleteId === project.id);
    deleteButton.textContent = pendingHistoryProjectDeleteId === project.id ? "确认" : "×";
    button.append(dot, label, count);
    row.append(button, renameButton, deleteButton);
    historyProjectList.append(row);
  }

  historyTagList.replaceChildren();
  for (const tag of historyTags.filter((candidate) =>
    historyEntries.some((entry) => entry.tagIds.includes(candidate.id)),
  )) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "history-tag-filter";
    button.dataset.historyTagId = tag.id;
    button.classList.toggle("active", activeHistoryTagIds.has(tag.id));
    button.textContent = `# ${tag.name}`;
    historyTagList.append(button);
  }
  clearHistoryTagFilterButton.hidden = activeHistoryTagIds.size === 0;
}

function currentDocumentHistoryEntry(): RenderHistoryEntry | undefined {
  return currentHistoryId ? historyEntries.find((entry) => entry.id === currentHistoryId) : undefined;
}

function renderDocumentArchive(): void {
  const entry = currentDocumentHistoryEntry();
  documentProjectSelect.replaceChildren();
  const inbox = document.createElement("option");
  inbox.value = "";
  inbox.textContent = "收件箱（未归类）";
  documentProjectSelect.append(inbox);
  for (const project of [...historyProjects].sort((left, right) => left.name.localeCompare(right.name, "zh-CN"))) {
    const option = document.createElement("option");
    option.value = project.id;
    option.textContent = project.name;
    documentProjectSelect.append(option);
  }
  documentProjectSelect.value = entry?.projectId ?? "";
  documentProjectSelect.disabled = !sourceInput.value.trim();
  documentNewProjectButton.disabled = !sourceInput.value.trim();
  documentTagInput.disabled = !sourceInput.value.trim();
  documentTagForm.querySelector("button")!.disabled = !sourceInput.value.trim();
  documentTagList.replaceChildren();
  for (const tag of entry ? tagsForEntry(entry) : []) {
    const chip = document.createElement("span");
    const remove = document.createElement("button");
    chip.className = "document-tag-chip";
    chip.textContent = `# ${tag.name}`;
    remove.type = "button";
    remove.dataset.removeDocumentTagId = tag.id;
    remove.title = `移除标签“${tag.name}”`;
    remove.setAttribute("aria-label", remove.title);
    remove.textContent = "×";
    chip.append(remove);
    documentTagList.append(chip);
  }
  documentArchiveHint.textContent = sourceInput.value.trim()
    ? (entry ? "归档已保存在本机历史中" : "选择项目或添加标签会自动保存该文档")
    : "粘贴并渲染文档后即可归档";
}

function renderHistoryBulkActions(): void {
  const knownIds = new Set(historyEntries.map((entry) => entry.id));
  selectedHistoryIds = new Set([...selectedHistoryIds].filter((id) => knownIds.has(id)));
  const count = selectedHistoryIds.size;
  historyBulkActions.hidden = count === 0;
  historySelectionCount.textContent = `已选 ${count} 条`;
  historySelectionProject.replaceChildren();
  const inbox = document.createElement("option");
  inbox.value = "";
  inbox.textContent = "移动到收件箱";
  historySelectionProject.append(inbox);
  for (const project of [...historyProjects].sort((left, right) => left.name.localeCompare(right.name, "zh-CN"))) {
    const option = document.createElement("option");
    option.value = project.id;
    option.textContent = project.name;
    historySelectionProject.append(option);
  }
}

function renderHistoryList(): void {
  historyList.replaceChildren();
  const count = historyEntries.length;
  const filteredEntries = filterHistoryEntries(historyEntries, historySearchInput.value, historyFilter());
  historyCount.textContent = String(count);
  historyCount.hidden = count === 0;
  historyEmpty.hidden = count !== 0;
  historyNoResults.hidden = count === 0 || filteredEntries.length !== 0;
  historyClearButton.disabled = count === 0;
  renderHistoryLibrary();
  renderHistoryBulkActions();
  renderDocumentArchive();

  for (const entry of filteredEntries) {
    const item = document.createElement("article");
    const selection = document.createElement("input");
    const openButton = document.createElement("button");
    const title = document.createElement("strong");
    const summary = document.createElement("span");
    const meta = document.createElement("div");
    const time = document.createElement("time");
    const pinEntryButton = document.createElement("button");
    const deleteButton = document.createElement("button");

    item.className = "history-entry";
    item.classList.toggle("active", entry.id === currentHistoryId);
    item.classList.toggle("pinned", entry.pinned);
    item.classList.toggle("selected", selectedHistoryIds.has(entry.id));
    selection.className = "history-entry-select";
    selection.type = "checkbox";
    selection.dataset.historySelectionId = entry.id;
    selection.checked = selectedHistoryIds.has(entry.id);
    selection.setAttribute("aria-label", `选择历史：${entry.title}`);
    openButton.className = "history-entry-open";
    openButton.type = "button";
    openButton.dataset.historyId = entry.id;
    openButton.title = entry.title;
    title.textContent = entry.title;
    summary.textContent = entry.summary;
    meta.className = "history-entry-meta";
    const project = projectForEntry(entry);
    if (project) {
      const projectChip = document.createElement("span");
      projectChip.className = "history-entry-project";
      projectChip.textContent = project.name;
      projectChip.title = project.name;
      meta.append(projectChip);
    }
    for (const tag of tagsForEntry(entry)) {
      const tagChip = document.createElement("span");
      tagChip.className = "history-entry-tag";
      tagChip.textContent = `# ${tag.name}`;
      tagChip.title = tag.name;
      meta.append(tagChip);
    }
    time.dateTime = new Date(entry.updatedAt).toISOString();
    time.textContent = historyDateFormatter.format(entry.updatedAt);
    openButton.append(title, summary, meta, time);

    pinEntryButton.className = "history-entry-pin";
    pinEntryButton.type = "button";
    pinEntryButton.dataset.pinHistoryId = entry.id;
    pinEntryButton.title = entry.pinned ? "取消置顶" : "置顶历史";
    pinEntryButton.setAttribute("aria-label", `${entry.pinned ? "取消置顶" : "置顶"}：${entry.title}`);
    pinEntryButton.setAttribute("aria-pressed", String(entry.pinned));
    pinEntryButton.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 3h6" />
        <path d="M10 3v6l-3 4v2h10v-2l-3-4V3" />
        <path d="M12 15v6" />
      </svg>`;

    deleteButton.className = "history-entry-delete";
    deleteButton.type = "button";
    deleteButton.dataset.deleteHistoryId = entry.id;
    deleteButton.title = "删除这条历史";
    deleteButton.setAttribute("aria-label", `删除历史：${entry.title}`);
    deleteButton.textContent = "×";

    item.append(selection, openButton, pinEntryButton, deleteButton);
    historyList.append(item);
  }
}

function saveHistorySnapshot(source: string): void {
  const duplicate = historyEntries.find((entry) => entry.source === source);
  const id = currentHistoryId ?? duplicate?.id ?? createHistoryId();
  const previous = historyEntries.find((entry) => entry.id === id) ?? duplicate;
  const entry = createHistoryEntry(id, source, currentResult.normalized, Date.now(), {
    pinned: previous?.pinned,
    scrollTop: previous?.scrollTop,
    projectId: previous?.projectId,
    tagIds: previous?.tagIds,
  });
  historyEntries = upsertHistoryEntry(historyEntries, entry);
  currentHistoryId = id;
  viewingHistoryEntry = false;
  persistHistoryEntries();
  renderHistoryList();
}

function startNewHistorySession(): void {
  currentHistoryId = null;
  viewingHistoryEntry = false;
}

async function openHistoryEntry(id: string): Promise<void> {
  const entry = historyEntries.find((candidate) => candidate.id === id);
  if (!entry) {
    return;
  }

  persistCurrentHistoryScroll();
  currentHistoryId = entry.id;
  viewingHistoryEntry = true;
  pendingHistoryScrollTop = entry.scrollTop;
  sourceInput.value = entry.source;
  setMode("preview");
  setHistoryOpen(false);
  renderHistoryList();
  await updateRendering();
}

function toggleHistoryPinned(id: string): void {
  historyEntries = sortHistoryEntries(
    historyEntries.map((entry) => entry.id === id ? { ...entry, pinned: !entry.pinned } : entry),
  );
  persistHistoryEntries();
  renderHistoryList();
}

function persistCurrentHistoryScroll(): void {
  if (!currentHistoryId) {
    return;
  }
  const entry = historyEntries.find((candidate) => candidate.id === currentHistoryId);
  if (!entry || Math.abs(entry.scrollTop - preview.scrollTop) < 1) {
    return;
  }
  historyEntries = historyEntries.map((candidate) =>
    candidate.id === currentHistoryId ? { ...candidate, scrollTop: preview.scrollTop } : candidate,
  );
  persistHistoryEntries();
}

function deleteHistoryEntry(id: string): void {
  historyEntries = historyEntries.filter((entry) => entry.id !== id);
  selectedHistoryIds.delete(id);
  if (currentHistoryId === id) {
    currentHistoryId = null;
    viewingHistoryEntry = sourceInput.value.trim().length > 0;
  }
  persistHistoryEntries();
  renderHistoryList();
}

function normalizedLibraryName(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ");
}

function libraryNameKey(value: string): string {
  return normalizedLibraryName(value).toLocaleLowerCase();
}

function setHistoryProjectCreateOpen(open: boolean, project?: HistoryProject): void {
  editingHistoryProjectId = project?.id ?? null;
  historyProjectCreateForm.hidden = !open;
  newHistoryProjectButton.hidden = open;
  saveHistoryProjectButton.textContent = project ? "保存" : "创建";
  if (open) {
    historyProjectNameInput.value = project?.name ?? "";
    historyProjectNameInput.focus();
  } else {
    historyProjectNameInput.value = "";
  }
}

function createHistoryProject(nameInput: string, selectProject = true): HistoryProject | undefined {
  const name = normalizedLibraryName(nameInput);
  if (!name) {
    renderStatus.textContent = "请输入项目名称";
    historyProjectNameInput.focus();
    return undefined;
  }
  if (historyProjects.some((project) => libraryNameKey(project.name) === libraryNameKey(name))) {
    renderStatus.textContent = "已存在同名科研项目";
    return undefined;
  }
  const project: HistoryProject = {
    id: `project-${createHistoryId()}`,
    name,
    color: HISTORY_PROJECT_COLORS[historyProjects.length % HISTORY_PROJECT_COLORS.length] ?? "#6c63e8",
    createdAt: Date.now(),
  };
  historyProjects = [...historyProjects, project];
  if (selectProject) {
    historyScope = project.id;
  }
  persistHistoryEntries();
  setHistoryProjectCreateOpen(false);
  renderHistoryList();
  renderStatus.textContent = `已创建项目“${name}”`;
  return project;
}

function ensureCurrentDocumentHistory(): RenderHistoryEntry | undefined {
  const source = sourceInput.value;
  if (!source.trim()) {
    renderStatus.textContent = "请先粘贴并渲染文档";
    return undefined;
  }
  if (!currentDocumentHistoryEntry()) {
    saveHistorySnapshot(source);
  }
  return currentDocumentHistoryEntry();
}

function updateCurrentDocumentHistory(update: (entry: RenderHistoryEntry) => RenderHistoryEntry): void {
  const entry = ensureCurrentDocumentHistory();
  if (!entry) {
    return;
  }
  historyEntries = historyEntries.map((candidate) => candidate.id === entry.id ? update(candidate) : candidate);
  persistHistoryEntries();
  renderHistoryList();
}

function renameHistoryProject(id: string, nameInput: string): void {
  const name = normalizedLibraryName(nameInput);
  if (!name) {
    renderStatus.textContent = "请输入项目名称";
    historyProjectNameInput.focus();
    return;
  }
  if (historyProjects.some((project) => project.id !== id && libraryNameKey(project.name) === libraryNameKey(name))) {
    renderStatus.textContent = "已存在同名科研项目";
    return;
  }
  historyProjects = historyProjects.map((project) => project.id === id ? { ...project, name } : project);
  persistHistoryEntries();
  setHistoryProjectCreateOpen(false);
  renderHistoryList();
  renderStatus.textContent = `已重命名为“${name}”`;
}

function requestDeleteHistoryProject(id: string): void {
  if (pendingHistoryProjectDeleteId !== id) {
    pendingHistoryProjectDeleteId = id;
    renderHistoryList();
    renderStatus.textContent = "再次点击“确认”删除项目；其中的历史会移回收件箱";
    return;
  }
  const project = historyProjects.find((candidate) => candidate.id === id);
  historyProjects = historyProjects.filter((candidate) => candidate.id !== id);
  historyEntries = historyEntries.map((entry) => entry.projectId === id ? { ...entry, projectId: null } : entry);
  if (historyScope === id) {
    historyScope = "inbox";
  }
  pendingHistoryProjectDeleteId = null;
  persistHistoryEntries();
  renderHistoryList();
  renderStatus.textContent = project ? `已删除项目“${project.name}”，历史已移回收件箱` : "项目已删除";
}

function applySelectedProject(): void {
  if (selectedHistoryIds.size === 0) {
    return;
  }
  const projectId = historySelectionProject.value || null;
  historyEntries = historyEntries.map((entry) =>
    selectedHistoryIds.has(entry.id) ? { ...entry, projectId } : entry,
  );
  persistHistoryEntries();
  renderHistoryList();
  const project = projectId ? historyProjects.find((candidate) => candidate.id === projectId) : undefined;
  renderStatus.textContent = project ? `已移动到“${project.name}”` : "已移回收件箱";
}

function tagIdsFromInput(value: string): string[] {
  const names = Array.from(new Set(
    value.split(/[，,]/).map(normalizedLibraryName).filter(Boolean),
  ));
  const ids: string[] = [];
  for (const name of names) {
    let tag = historyTags.find((candidate) => libraryNameKey(candidate.name) === libraryNameKey(name));
    if (!tag) {
      tag = { id: `tag-${createHistoryId()}`, name, createdAt: Date.now() };
      historyTags = [...historyTags, tag];
    }
    ids.push(tag.id);
  }
  return ids;
}

function applySelectedTags(): void {
  if (selectedHistoryIds.size === 0) {
    return;
  }
  const tagIds = tagIdsFromInput(historyTagInput.value);
  if (tagIds.length === 0) {
    renderStatus.textContent = "请输入至少一个标签";
    historyTagInput.focus();
    return;
  }
  historyEntries = historyEntries.map((entry) =>
    selectedHistoryIds.has(entry.id)
      ? { ...entry, tagIds: Array.from(new Set([...entry.tagIds, ...tagIds])) }
      : entry,
  );
  historyTagInput.value = "";
  persistHistoryEntries();
  renderHistoryList();
  renderStatus.textContent = "已添加标签";
}

function updateRepairPanel(result: RecoveryResult): void {
  repairList.replaceChildren();
  if (result.repairs.length === 0) {
    repairSummary.textContent = "未执行自动恢复";
    repairDetails.open = false;
    return;
  }

  repairSummary.textContent = `已完成 ${result.repairs.length} 处保真恢复`;
  result.repairs.forEach((repair) => {
    const item = document.createElement("li");
    const title = document.createElement("strong");
    const details = document.createElement("span");
    title.textContent = `${repairKindLabel(repair.kind)} · 第 ${repair.startLine}${repair.endLine === repair.startLine ? "" : `–${repair.endLine}`} 行`;
    details.textContent = `${repair.reason}（置信度 ${Math.round(repair.confidence * 100)}%）`;
    item.append(title, details);
    repairList.append(item);
  });
}

function copyTargetFromTarget(target: EventTarget | null): HTMLElement | null {
  return target instanceof Element
    ? target.closest<HTMLElement>(".copyable-formula, .copyable-file-link")
    : null;
}

function selectionTouchesElement(element: HTMLElement): boolean {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0 || !selection.toString()) {
    return false;
  }
  try {
    return selection.getRangeAt(0).intersectsNode(element);
  } catch {
    return false;
  }
}

function nodeWithinElement(element: HTMLElement, node: Node | null): boolean {
  return Boolean(node && (node === element || element.contains(node)));
}

function formulaAwareSelectionText(selection: Selection, range: Range): string {
  const formulas: HTMLElement[] = [];
  for (const formula of preview.querySelectorAll<HTMLElement>(".copyable-formula")) {
    try {
      if (range.intersectsNode(formula)) {
        formulas.push(formula);
      }
    } catch {
      continue;
    }
  }

  const exactFormula = formulas.find(
    (formula) => nodeWithinElement(formula, selection.anchorNode)
      && nodeWithinElement(formula, selection.focusNode),
  );
  if (exactFormula?.dataset.copyValue) {
    return exactFormula.dataset.copyValue.trim();
  }

  const visualText = selection.toString().trim();
  const latex = Array.from(new Set(
    formulas.map((formula) => formula.dataset.copyValue?.trim()).filter(Boolean) as string[],
  ));
  if (latex.length === 0) {
    return visualText;
  }
  return `${visualText}\n\n原始 LaTeX：\n${latex.join("\n")}`.trim();
}

function selectionAnchorRect(range: Range): DOMRect {
  const rects = Array.from(range.getClientRects()).filter((rect) => rect.width > 0 || rect.height > 0);
  return rects.at(-1) ?? range.getBoundingClientRect();
}

function positionSelectionToolbar(rect: DOMRect): void {
  const edge = 10;
  const gap = 10;
  const toolbarRect = selectionToolbar.getBoundingClientRect();
  const centeredLeft = rect.left + rect.width / 2 - toolbarRect.width / 2;
  const left = Math.min(Math.max(centeredLeft, edge), window.innerWidth - toolbarRect.width - edge);
  let top = rect.top - toolbarRect.height - gap;
  let placement = "top";
  if (top < edge) {
    top = Math.min(rect.bottom + gap, window.innerHeight - toolbarRect.height - edge);
    placement = "bottom";
  }
  selectionToolbar.style.left = `${Math.round(left)}px`;
  selectionToolbar.style.top = `${Math.round(top)}px`;
  selectionToolbar.dataset.placement = placement;
}

function hideSelectionToolbar(): void {
  window.clearTimeout(selectionToolbarTimer);
  selectionToolbar.hidden = true;
  activeAskSelection = null;
}

function updateSelectionToolbar(): void {
  window.clearTimeout(selectionToolbarTimer);
  if (!askSelectionEnabled || selectingPreview) {
    hideSelectionToolbar();
    return;
  }
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
    hideSelectionToolbar();
    return;
  }
  const range = selection.getRangeAt(0);
  if (
    !nodeWithinElement(preview, selection.anchorNode)
    || !nodeWithinElement(preview, selection.focusNode)
  ) {
    hideSelectionToolbar();
    return;
  }
  const text = formulaAwareSelectionText(selection, range);
  const rect = selectionAnchorRect(range);
  if (!text || (rect.width === 0 && rect.height === 0)) {
    hideSelectionToolbar();
    return;
  }

  hideCopyTooltip();
  hideFormulaToolbar();
  activeAskSelection = { text, rect };
  selectionToolbar.hidden = false;
  positionSelectionToolbar(rect);
}

function scheduleSelectionToolbarUpdate(): void {
  window.clearTimeout(selectionToolbarTimer);
  selectionToolbarTimer = window.setTimeout(updateSelectionToolbar, 50);
}

function decorateCopyableFormulas(): void {
  const displayFormulas = Array.from(preview.querySelectorAll<HTMLElement>(".katex-display"));
  const inlineFormulas = Array.from(preview.querySelectorAll<HTMLElement>(".katex")).filter(
    (formula) => !formula.closest(".katex-display"),
  );

  for (const formula of [...displayFormulas, ...inlineFormulas]) {
    const annotation = formula.querySelector('annotation[encoding="application/x-tex"]');
    const latex = annotation?.textContent?.trim();
    if (!latex) {
      continue;
    }
    formula.classList.add("copyable-formula");
    formula.dataset.copyValue = latex;
    formula.dataset.copyPrompt = "复制 LaTeX 公式";
    formula.dataset.copySuccess = "已复制 LaTeX";
  }
}

function decorateCopyableFileLinks(): void {
  for (const link of preview.querySelectorAll<HTMLAnchorElement>("a[href]")) {
    const href = link.getAttribute("href");
    const path = href ? filePathFromHref(href) : null;
    if (!path) {
      continue;
    }

    const label = link.textContent?.trim() || "文件链接";
    link.classList.add("copyable-file-link");
    link.dataset.copyValue = path;
    link.dataset.copyPrompt = "复制文件路径";
    link.dataset.copySuccess = "已复制文件路径";
    link.title = `点击复制：${path}`;
    link.setAttribute("role", "button");
    link.setAttribute("aria-label", `${label}，点击复制文件路径`);
  }
}

function decorateWebLinks(): void {
  for (const link of preview.querySelectorAll<HTMLAnchorElement>("a[href]")) {
    const href = link.getAttribute("href");
    const url = href ? webUrlFromHref(href) : null;
    if (!url) {
      continue;
    }

    link.dataset.externalUrl = url;
    link.title = `在默认浏览器中打开：${url}`;
    link.rel = "noopener noreferrer";
  }
}

function positionCopyTooltip(target: HTMLElement): void {
  const edge = 10;
  const gap = 12;
  const targetRect = target.getBoundingClientRect();
  const tooltipRect = copyTooltip.getBoundingClientRect();
  const centeredLeft = targetRect.left + targetRect.width / 2 - tooltipRect.width / 2;
  const left = Math.min(Math.max(centeredLeft, edge), window.innerWidth - tooltipRect.width - edge);
  let top = targetRect.top - tooltipRect.height - gap;
  let placement = "top";

  if (top < edge) {
    top = Math.min(targetRect.bottom + gap, window.innerHeight - tooltipRect.height - edge);
    placement = "bottom";
  }

  copyTooltip.style.left = `${Math.round(left)}px`;
  copyTooltip.style.top = `${Math.round(top)}px`;
  copyTooltip.dataset.placement = placement;
}

function showCopyTooltip(target: HTMLElement, message?: string): void {
  activeCopyTarget = target;
  copyTooltipText.textContent = message ?? target.dataset.copyPrompt ?? "复制";
  copyTooltip.hidden = false;
  positionCopyTooltip(target);
}

function hideCopyTooltip(target?: HTMLElement): void {
  if (target && activeCopyTarget !== target) {
    return;
  }
  copyTooltip.hidden = true;
  activeCopyTarget = null;
}

function formulaFromTarget(target: EventTarget | null): HTMLElement | null {
  return target instanceof Element ? target.closest<HTMLElement>(".copyable-formula") : null;
}

function positionFormulaToolbar(formula: HTMLElement): void {
  const edge = 10;
  const gap = 10;
  const formulaRect = formula.getBoundingClientRect();
  const toolbarRect = formulaToolbar.getBoundingClientRect();
  const centeredLeft = formulaRect.left + formulaRect.width / 2 - toolbarRect.width / 2;
  const left = Math.min(Math.max(centeredLeft, edge), window.innerWidth - toolbarRect.width - edge);
  let top = formulaRect.top - toolbarRect.height - gap;
  if (top < edge) {
    top = Math.min(formulaRect.bottom + gap, window.innerHeight - toolbarRect.height - edge);
  }
  formulaToolbar.style.left = `${Math.round(left)}px`;
  formulaToolbar.style.top = `${Math.round(top)}px`;
}

function showFormulaToolbar(formula: HTMLElement): void {
  window.clearTimeout(formulaToolbarTimer);
  hideCopyTooltip();
  activeFormula = formula;
  formulaToolbar.hidden = false;
  positionFormulaToolbar(formula);
}

function hideFormulaToolbar(): void {
  window.clearTimeout(formulaToolbarTimer);
  formulaToolbar.hidden = true;
}

function scheduleHideFormulaToolbar(): void {
  window.clearTimeout(formulaToolbarTimer);
  formulaToolbarTimer = window.setTimeout(() => hideFormulaToolbar(), 180);
}

function updateSearchCount(): void {
  documentSearchCount.textContent = searchMatches.length === 0
    ? "0/0"
    : `${activeSearchMatch + 1}/${searchMatches.length}`;
  previousSearchMatchButton.disabled = searchMatches.length === 0;
  nextSearchMatchButton.disabled = searchMatches.length === 0;
}

function activateSearchMatch(index: number, shouldScroll = true): void {
  searchMatches.forEach((match) => match.classList.remove("active"));
  if (searchMatches.length === 0) {
    activeSearchMatch = -1;
    updateSearchCount();
    return;
  }
  activeSearchMatch = (index + searchMatches.length) % searchMatches.length;
  const match = searchMatches[activeSearchMatch];
  if (!match) {
    return;
  }
  match.classList.add("active");
  if (shouldScroll) {
    match.scrollIntoView({ block: "center", behavior: "smooth" });
  }
  updateSearchCount();
}

function refreshDocumentSearch(shouldScroll = false): void {
  if (!documentSearchOpen) {
    clearSearchHighlights(preview);
    searchMatches = [];
    activeSearchMatch = -1;
    updateSearchCount();
    return;
  }
  searchMatches = highlightSearchMatches(preview, documentSearchInput.value);
  activeSearchMatch = searchMatches.length > 0 ? 0 : -1;
  activateSearchMatch(activeSearchMatch, shouldScroll && searchMatches.length > 0);
}

function setDocumentSearchOpen(open: boolean): void {
  if (open) {
    hideSelectionToolbar();
  }
  documentSearchOpen = open;
  documentSearch.hidden = !open;
  documentSearchButton.classList.toggle("active", open);
  documentSearchButton.setAttribute("aria-pressed", String(open));
  if (open) {
    window.setTimeout(() => {
      documentSearchInput.focus();
      documentSearchInput.select();
    });
    refreshDocumentSearch();
  } else {
    clearSearchHighlights(preview);
    searchMatches = [];
    activeSearchMatch = -1;
    updateSearchCount();
  }
}

function rebuildOutline(): void {
  outlineItems = buildDocumentOutline(preview);
  documentOutlineList.replaceChildren();
  for (const item of outlineItems) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.outlineId = item.id;
    button.dataset.level = String(item.level);
    button.title = item.label;
    button.textContent = item.label;
    documentOutlineList.append(button);
  }
  const empty = outlineItems.length === 0;
  documentOutlineEmpty.hidden = !empty;
  documentOutlineList.hidden = empty;
  outlineButton.disabled = empty;
  if (empty && outlineOpen) {
    setOutlineOpen(false);
  }
}

function setOutlineOpen(open: boolean): void {
  if (open) {
    hideSelectionToolbar();
  }
  outlineOpen = open && outlineItems.length > 0;
  documentOutline.hidden = !outlineOpen;
  outlineButton.classList.toggle("active", outlineOpen);
  outlineButton.setAttribute("aria-expanded", String(outlineOpen));
  outlineButton.setAttribute("aria-label", outlineOpen ? "关闭文档目录" : "打开文档目录");
}

function restorePendingScroll(): void {
  if (pendingHistoryScrollTop === null) {
    return;
  }
  const scrollTop = pendingHistoryScrollTop;
  pendingHistoryScrollTop = null;
  window.requestAnimationFrame(() => {
    preview.scrollTop = scrollTop;
    window.requestAnimationFrame(() => {
      preview.scrollTop = scrollTop;
      backToTopButton.hidden = preview.scrollTop < 320;
    });
  });
}

async function renderCurrentClipboardOnOpen(): Promise<void> {
  if (!autoRenderClipboard || autoClipboardBusy) {
    return;
  }
  autoClipboardBusy = true;
  try {
    const text = await clipboardText();
    if (!text.trim() || text === sourceInput.value) {
      return;
    }
    persistCurrentHistoryScroll();
    startNewHistorySession();
    pendingHistoryScrollTop = 0;
    sourceInput.value = text;
    setMode("preview");
    await updateRendering();
  } catch {
    renderStatus.textContent = "无法读取剪贴板，可手动粘贴";
  } finally {
    autoClipboardBusy = false;
  }
}

async function updateRendering(): Promise<void> {
  const sequence = ++renderSequence;
  const source = sourceInput.value;
  characterCount.textContent = `${source.length.toLocaleString("zh-CN")} 字符`;
  currentResult = recoverTerminalMarkdown(source);
  updateRepairPanel(currentResult);

  if (!source.trim()) {
    hideCopyTooltip();
    hideFormulaToolbar();
    hideSelectionToolbar();
    activeFormula = null;
    preview.innerHTML = emptyPreview();
    rebuildOutline();
    refreshDocumentSearch();
    renderDocumentArchive();
    backToTopButton.hidden = true;
    renderStatus.textContent = "等待输入";
    return;
  }

  renderStatus.textContent = "正在渲染…";
  try {
    const html = await renderMarkdown(currentResult.normalized);
    if (sequence !== renderSequence) {
      return;
    }
    hideCopyTooltip();
    hideFormulaToolbar();
    hideSelectionToolbar();
    activeFormula = null;
    preview.innerHTML = html;
    let mermaidFailed = 0;
    try {
      const mermaidSummary = await renderMermaidBlocks(preview);
      mermaidFailed = mermaidSummary.failed;
    } catch (error) {
      console.error("Unable to load Mermaid", error);
    }
    if (sequence !== renderSequence) {
      return;
    }
    decorateCodeBlocks(preview);
    decorateCopyableFormulas();
    decorateCopyableFileLinks();
    decorateWebLinks();
    rebuildOutline();
    refreshDocumentSearch();
    const stats = currentResult.stats;
    const recovered = stats.displayMath + stats.inlineMath + stats.terminalTables;
    if (mermaidFailed > 0) {
      renderStatus.textContent = `${mermaidFailed} 个 Mermaid 图表解析失败`;
    } else {
      renderStatus.textContent = recovered > 0 ? `已恢复 ${recovered} 处结构` : "无需恢复";
    }
    if (!viewingHistoryEntry) {
      saveHistorySnapshot(source);
    }
    restorePendingScroll();
  } catch (error) {
    if (sequence !== renderSequence) {
      return;
    }
    preview.textContent = currentResult.normalized;
    renderStatus.textContent = "渲染失败，已显示原文";
    console.error(error);
  }
}

function scheduleRendering(): void {
  window.clearTimeout(renderTimer);
  renderTimer = window.setTimeout(() => {
    void updateRendering();
  }, 100);
}

function setMode(mode: ViewMode): void {
  workspace.dataset.mode = mode;
  document.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === mode);
  });
}

async function clipboardText(): Promise<string> {
  try {
    return await readText();
  } catch {
    return await navigator.clipboard.readText();
  }
}

async function writeClipboard(value: string): Promise<void> {
  try {
    await writeText(value);
  } catch {
    await navigator.clipboard.writeText(value);
  }
}

async function copyInteractiveTarget(target: HTMLElement): Promise<void> {
  const value = target.dataset.copyValue;
  if (!value) {
    return;
  }

  window.clearTimeout(copyFeedbackTimer);
  try {
    await writeClipboard(value);
    target.classList.add("copied");
    showCopyTooltip(target, target.dataset.copySuccess ?? "已复制");
  } catch {
    showCopyTooltip(target, "复制失败");
  }

  copyFeedbackTimer = window.setTimeout(() => {
    target.classList.remove("copied");
    if (activeCopyTarget === target) {
      showCopyTooltip(target);
    }
  }, 1200);
}

async function openWebLink(url: string): Promise<void> {
  if (!("__TAURI_INTERNALS__" in window)) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }

  await openUrl(url);
}

async function askCurrentSelectionInChatGPT(): Promise<void> {
  const selection = activeAskSelection;
  if (!selection) {
    return;
  }
  const prompt = buildAskPrompt({
    document: currentResult.normalized,
    selection: selection.text,
    scope: askContextScope,
    instruction: promptInstructionForTemplate(askPromptTemplateId, askCustomPrompt),
  });

  try {
    await writeClipboard(prompt);
  } catch {
    renderStatus.textContent = "提示词复制失败";
    return;
  }

  renderStatus.textContent = "提示词已复制，请在 ChatGPT 中粘贴";
  try {
    await openWebLink(CHATGPT_URL);
  } catch {
    renderStatus.textContent = "提示词已复制，请手动打开 ChatGPT";
  }
  hideSelectionToolbar();
  window.getSelection()?.removeAllRanges();
}

function setButtonFeedback(button: HTMLButtonElement, message: string): void {
  const previous = button.textContent ?? "";
  button.textContent = message;
  window.setTimeout(() => {
    button.textContent = previous;
  }, 1200);
}

async function handleCodeBlockAction(button: HTMLButtonElement): Promise<void> {
  const shell = button.closest<HTMLElement>(".code-block");
  const code = shell?.querySelector<HTMLElement>("pre > code");
  if (!shell || !code) {
    return;
  }
  if (button.dataset.codeAction === "copy") {
    await writeClipboard(code.textContent ?? "");
    setButtonFeedback(button, "已复制");
    return;
  }
  if (button.dataset.codeAction === "wrap") {
    const active = shell.classList.toggle("wrapped");
    button.setAttribute("aria-pressed", String(active));
    return;
  }
  if (button.dataset.codeAction === "lines") {
    const active = shell.classList.toggle("show-line-numbers");
    button.setAttribute("aria-pressed", String(active));
  }
}

async function handleMermaidAction(button: HTMLButtonElement): Promise<void> {
  const shell = button.closest<HTMLElement>(".mermaid-block");
  if (!shell) {
    return;
  }
  const source = shell.dataset.mermaidSource ?? "";
  const baseName = `${exportBaseName(currentResult.normalized)}-diagram`;
  if (button.dataset.mermaidAction === "copy") {
    await writeClipboard(source);
    setButtonFeedback(button, "已复制");
    return;
  }
  const canvas = shell.querySelector<HTMLElement>(".mermaid-canvas");
  const svg = canvas?.querySelector<SVGElement>("svg");
  if (!canvas || !svg) {
    return;
  }
  renderStatus.textContent = "正在导出图表…";
  const saved = button.dataset.mermaidAction === "svg"
    ? await saveSvgMarkup(svg.outerHTML, baseName)
    : await exportFormulaImage(canvas, baseName, "png");
  renderStatus.textContent = saved ? "图表已导出" : "已取消导出";
}

async function handleFormulaAction(button: HTMLButtonElement): Promise<void> {
  const formula = activeFormula;
  if (!formula) {
    renderStatus.textContent = "请重新悬浮到公式后操作";
    return;
  }
  const action = button.dataset.formulaAction;
  if (action === "copy") {
    const latex = formula.dataset.copyValue;
    if (!latex) {
      renderStatus.textContent = "未找到公式源码";
      return;
    }
    await writeClipboard(latex);
    formula.classList.add("copied");
    setButtonFeedback(button, "已复制");
    renderStatus.textContent = "已复制 LaTeX";
    window.clearTimeout(copyFeedbackTimer);
    copyFeedbackTimer = window.setTimeout(() => formula.classList.remove("copied"), 1200);
    return;
  }
  if (action !== "svg" && action !== "png") {
    return;
  }
  renderStatus.textContent = "正在导出公式…";
  const saved = await exportFormulaImage(
    formula,
    `${exportBaseName(currentResult.normalized)}-formula`,
    action,
  );
  renderStatus.textContent = saved ? "公式已导出" : "已取消导出";
  if (formula.isConnected) {
    showFormulaToolbar(formula);
  }
}

async function handleDocumentExport(format: string): Promise<void> {
  exportMenu.open = false;
  if (!sourceInput.value.trim()) {
    renderStatus.textContent = "没有可导出的内容";
    return;
  }
  if (format === "pdf") {
    try {
      await printPreview();
      renderStatus.textContent = "已打开打印窗口";
    } catch (error) {
      console.error(error);
      renderStatus.textContent = "打开打印窗口失败";
    }
    return;
  }
  const baseName = exportBaseName(currentResult.normalized);
  renderStatus.textContent = "正在导出…";
  try {
    const saved = format === "png"
      ? await exportPreviewPng(preview, baseName)
      : await exportPreviewHtml(preview, baseName);
    renderStatus.textContent = saved ? "文档已导出" : "已取消导出";
  } catch (error) {
    console.error(error);
    renderStatus.textContent = "导出失败";
  }
}

sourceInput.addEventListener("input", () => {
  if (viewingHistoryEntry) {
    persistCurrentHistoryScroll();
    startNewHistorySession();
  }
  scheduleRendering();
});
sourceInput.addEventListener("paste", () => {
  persistCurrentHistoryScroll();
  startNewHistorySession();
  pendingHistoryScrollTop = 0;
  setMode("preview");
  window.setTimeout(scheduleRendering);
});

requiredElement<HTMLButtonElement>("#paste-clipboard").addEventListener("click", async () => {
  try {
    persistCurrentHistoryScroll();
    startNewHistorySession();
    sourceInput.value = await clipboardText();
    pendingHistoryScrollTop = 0;
    setMode("preview");
    await updateRendering();
  } catch {
    sourceInput.focus();
    renderStatus.textContent = "请按 ⌘V / Ctrl+V 粘贴";
  }
});

requiredElement<HTMLButtonElement>("#load-demo").addEventListener("click", async () => {
  persistCurrentHistoryScroll();
  startNewHistorySession();
  sourceInput.value = DEMO_TEXT;
  pendingHistoryScrollTop = 0;
  setMode("preview");
  await updateRendering();
});

requiredElement<HTMLButtonElement>("#clear-source").addEventListener("click", async () => {
  persistCurrentHistoryScroll();
  startNewHistorySession();
  sourceInput.value = "";
  await updateRendering();
  sourceInput.focus();
});

requiredElement<HTMLButtonElement>("#copy-markdown").addEventListener("click", async (event) => {
  const button = event.currentTarget as HTMLButtonElement;
  await writeClipboard(currentResult.normalized);
  const previous = button.textContent;
  button.textContent = "已复制";
  window.setTimeout(() => {
    button.textContent = previous;
  }, 1200);
});

document.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((button) => {
  button.addEventListener("click", () => setMode(button.dataset.mode as ViewMode));
});

exportMenu.addEventListener("click", (event) => {
  const button = (event.target as Element).closest<HTMLButtonElement>("[data-document-export]");
  if (button?.dataset.documentExport) {
    event.preventDefault();
    void handleDocumentExport(button.dataset.documentExport);
  }
});
documentProjectSelect.addEventListener("change", () => {
  const projectId = documentProjectSelect.value || null;
  updateCurrentDocumentHistory((entry) => ({ ...entry, projectId }));
  const project = projectId ? historyProjects.find((candidate) => candidate.id === projectId) : undefined;
  renderStatus.textContent = project ? `已归入“${project.name}”` : "已移回收件箱";
});
documentNewProjectButton.addEventListener("click", () => {
  documentProjectCreateForm.hidden = !documentProjectCreateForm.hidden;
  if (!documentProjectCreateForm.hidden) {
    documentProjectNameInput.focus();
  }
});
documentProjectCreateForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const project = createHistoryProject(documentProjectNameInput.value, false);
  if (!project) {
    return;
  }
  documentProjectNameInput.value = "";
  documentProjectCreateForm.hidden = true;
  updateCurrentDocumentHistory((entry) => ({ ...entry, projectId: project.id }));
  renderStatus.textContent = `已创建并归入“${project.name}”`;
});
documentTagForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const tagIds = tagIdsFromInput(documentTagInput.value);
  if (tagIds.length === 0) {
    renderStatus.textContent = "请输入至少一个标签";
    documentTagInput.focus();
    return;
  }
  updateCurrentDocumentHistory((entry) => ({ ...entry, tagIds: Array.from(new Set([...entry.tagIds, ...tagIds])) }));
  documentTagInput.value = "";
  renderStatus.textContent = "已添加标签";
});
documentTagList.addEventListener("click", (event) => {
  const remove = (event.target as Element).closest<HTMLButtonElement>("[data-remove-document-tag-id]");
  const tagId = remove?.dataset.removeDocumentTagId;
  if (!tagId) {
    return;
  }
  updateCurrentDocumentHistory((entry) => ({ ...entry, tagIds: entry.tagIds.filter((id) => id !== tagId) }));
  renderStatus.textContent = "已移除标签";
});

documentSearchButton.addEventListener("click", () => setDocumentSearchOpen(!documentSearchOpen));
closeDocumentSearchButton.addEventListener("click", () => setDocumentSearchOpen(false));
documentSearchInput.addEventListener("input", () => refreshDocumentSearch());
documentSearchInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    activateSearchMatch(activeSearchMatch + (event.shiftKey ? -1 : 1));
  }
});
previousSearchMatchButton.addEventListener("click", () => activateSearchMatch(activeSearchMatch - 1));
nextSearchMatchButton.addEventListener("click", () => activateSearchMatch(activeSearchMatch + 1));

outlineButton.addEventListener("click", () => setOutlineOpen(!outlineOpen));
closeOutlineButton.addEventListener("click", () => setOutlineOpen(false));
documentOutlineList.addEventListener("click", (event) => {
  const button = (event.target as Element).closest<HTMLButtonElement>("[data-outline-id]");
  const id = button?.dataset.outlineId;
  if (!id) {
    return;
  }
  preview.querySelector<HTMLElement>(`#${CSS.escape(id)}`)?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
  setOutlineOpen(false);
});

backToTopButton.addEventListener("click", () => {
  preview.scrollTo({ top: 0, behavior: "smooth" });
});

settingsButton.addEventListener("click", () => setSettingsOpen(!settingsOpen));
autoRenderClipboardToggle.addEventListener("change", () => {
  autoRenderClipboard = autoRenderClipboardToggle.checked;
  try {
    localStorage.setItem(AUTO_RENDER_CLIPBOARD_STORAGE_KEY, String(autoRenderClipboard));
    renderStatus.textContent = autoRenderClipboard
      ? "已启用呼出时自动渲染"
      : "已关闭呼出时自动渲染";
  } catch {
    renderStatus.textContent = "设置未能保存";
  }
});
askSelectionEnabledToggle.addEventListener("change", () => {
  askSelectionEnabled = askSelectionEnabledToggle.checked;
  syncAskSettingsControls();
  if (!askSelectionEnabled) {
    hideSelectionToolbar();
  } else {
    scheduleSelectionToolbarUpdate();
  }
  try {
    localStorage.setItem(ASK_SELECTION_ENABLED_STORAGE_KEY, String(askSelectionEnabled));
    renderStatus.textContent = askSelectionEnabled
      ? "已启用划词问 ChatGPT"
      : "已关闭划词问 ChatGPT";
  } catch {
    renderStatus.textContent = "设置未能保存";
  }
});
askContextScopeSelect.addEventListener("change", () => {
  askContextScope = parseAskContextScope(askContextScopeSelect.value);
  try {
    localStorage.setItem(ASK_CONTEXT_SCOPE_STORAGE_KEY, askContextScope);
    renderStatus.textContent = "已更新提问上下文范围";
  } catch {
    renderStatus.textContent = "设置未能保存";
  }
});
askPromptTemplateSelect.addEventListener("change", () => {
  askPromptTemplateId = parseAskPromptTemplateId(askPromptTemplateSelect.value);
  syncAskSettingsControls();
  try {
    localStorage.setItem(ASK_PROMPT_TEMPLATE_STORAGE_KEY, askPromptTemplateId);
    const templateLabel = askPromptTemplateId === "custom"
      ? "自定义"
      : ASK_PROMPT_TEMPLATES.find((template) => template.id === askPromptTemplateId)?.label;
    renderStatus.textContent = `已选择“${templateLabel ?? "深入解释"}”模板`;
  } catch {
    renderStatus.textContent = "设置未能保存";
  }
  if (askPromptTemplateId === "custom") {
    window.setTimeout(() => askCustomPromptInput.focus());
  }
});
askCustomPromptInput.addEventListener("input", () => {
  askCustomPrompt = askCustomPromptInput.value;
  try {
    localStorage.setItem(ASK_CUSTOM_PROMPT_STORAGE_KEY, askCustomPrompt);
  } catch {
    renderStatus.textContent = "设置未能保存";
  }
});
askCustomPromptInput.addEventListener("change", () => {
  renderStatus.textContent = "自定义提示词模板已保存";
});
resetCustomPromptButton.addEventListener("click", () => {
  askCustomPrompt = DEFAULT_CUSTOM_ASK_INSTRUCTION;
  askCustomPromptInput.value = askCustomPrompt;
  try {
    localStorage.setItem(ASK_CUSTOM_PROMPT_STORAGE_KEY, askCustomPrompt);
    renderStatus.textContent = "已重置自定义提示词模板";
  } catch {
    renderStatus.textContent = "设置未能保存";
  }
  askCustomPromptInput.focus();
});
document.addEventListener("pointerdown", (event) => {
  const target = event.target;
  if (
    settingsOpen
    && target instanceof Node
    && !settingsPopover.contains(target)
    && !settingsButton.contains(target)
  ) {
    setSettingsOpen(false);
  }
});

document.querySelectorAll<HTMLButtonElement>("[data-history-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    const filter = button.dataset.historyFilter;
    if (filter !== "all" && filter !== "inbox" && filter !== "pinned") {
      return;
    }
    historyScope = filter;
    renderHistoryList();
  });
});
newHistoryProjectButton.addEventListener("click", () => setHistoryProjectCreateOpen(true));
cancelHistoryProjectButton.addEventListener("click", () => setHistoryProjectCreateOpen(false));
historyProjectCreateForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (editingHistoryProjectId) {
    renameHistoryProject(editingHistoryProjectId, historyProjectNameInput.value);
  } else {
    createHistoryProject(historyProjectNameInput.value);
  }
});
historyProjectList.addEventListener("click", (event) => {
  const renameButton = (event.target as Element).closest<HTMLButtonElement>("[data-rename-history-project-id]");
  const deleteButton = (event.target as Element).closest<HTMLButtonElement>("[data-delete-history-project-id]");
  if (renameButton?.dataset.renameHistoryProjectId) {
    const project = historyProjects.find((candidate) => candidate.id === renameButton.dataset.renameHistoryProjectId);
    if (project) {
      pendingHistoryProjectDeleteId = null;
      setHistoryProjectCreateOpen(true, project);
    }
    return;
  }
  if (deleteButton?.dataset.deleteHistoryProjectId) {
    requestDeleteHistoryProject(deleteButton.dataset.deleteHistoryProjectId);
    return;
  }
  const projectButton = (event.target as Element).closest<HTMLButtonElement>("[data-history-project-id]");
  const projectId = projectButton?.dataset.historyProjectId;
  if (!projectId) {
    return;
  }
  historyScope = projectId;
  renderHistoryList();
});
historyTagList.addEventListener("click", (event) => {
  const tagButton = (event.target as Element).closest<HTMLButtonElement>("[data-history-tag-id]");
  const tagId = tagButton?.dataset.historyTagId;
  if (!tagId) {
    return;
  }
  if (activeHistoryTagIds.has(tagId)) {
    activeHistoryTagIds.delete(tagId);
  } else {
    activeHistoryTagIds.add(tagId);
  }
  renderHistoryList();
});
clearHistoryTagFilterButton.addEventListener("click", () => {
  activeHistoryTagIds.clear();
  renderHistoryList();
});
clearHistorySelectionButton.addEventListener("click", () => {
  selectedHistoryIds.clear();
  renderHistoryList();
});
applyHistoryProjectButton.addEventListener("click", applySelectedProject);
applyHistoryTagsButton.addEventListener("click", applySelectedTags);

historyButton.addEventListener("click", () => setHistoryOpen(!historyOpen));
historyCloseButton.addEventListener("click", () => setHistoryOpen(false));
historyBackdrop.addEventListener("click", () => setHistoryOpen(false));

historyList.addEventListener("click", (event) => {
  const target = event.target as HTMLElement;
  const pinEntryButton = target.closest<HTMLButtonElement>("[data-pin-history-id]");
  if (pinEntryButton?.dataset.pinHistoryId) {
    toggleHistoryPinned(pinEntryButton.dataset.pinHistoryId);
    return;
  }
  const deleteButton = target.closest<HTMLButtonElement>("[data-delete-history-id]");
  if (deleteButton?.dataset.deleteHistoryId) {
    deleteHistoryEntry(deleteButton.dataset.deleteHistoryId);
    return;
  }

  const openButton = target.closest<HTMLButtonElement>("[data-history-id]");
  if (openButton?.dataset.historyId) {
    void openHistoryEntry(openButton.dataset.historyId);
  }
});

historyList.addEventListener("change", (event) => {
  const selection = (event.target as Element).closest<HTMLInputElement>("[data-history-selection-id]");
  const id = selection?.dataset.historySelectionId;
  if (!selection || !id) {
    return;
  }
  if (selection.checked) {
    selectedHistoryIds.add(id);
  } else {
    selectedHistoryIds.delete(id);
  }
  renderHistoryList();
});

historySearchInput.addEventListener("input", renderHistoryList);
historySearchInput.addEventListener("keydown", (event) => {
  if (event.key !== "ArrowDown") {
    return;
  }
  const firstEntry = historyList.querySelector<HTMLButtonElement>(".history-entry-open");
  if (firstEntry) {
    event.preventDefault();
    firstEntry.focus();
  }
});

historyList.addEventListener("keydown", (event) => {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
    return;
  }
  const buttons = Array.from(historyList.querySelectorAll<HTMLButtonElement>(".history-entry-open"));
  const current = (event.target as Element).closest<HTMLButtonElement>(".history-entry-open");
  const index = current ? buttons.indexOf(current) : -1;
  if (index < 0 || buttons.length === 0) {
    return;
  }
  event.preventDefault();
  const nextIndex = event.key === "ArrowDown"
    ? Math.min(index + 1, buttons.length - 1)
    : Math.max(index - 1, 0);
  buttons[nextIndex]?.focus();
});

historyClearButton.addEventListener("click", () => {
  if (!window.confirm("确定清空全部渲染历史吗？此操作无法撤销。")) {
    return;
  }
  historyEntries = [];
  selectedHistoryIds.clear();
  historySearchInput.value = "";
  currentHistoryId = null;
  viewingHistoryEntry = sourceInput.value.trim().length > 0;
  persistHistoryEntries();
  renderHistoryList();
});

requiredElement<HTMLButtonElement>("#hide-window").addEventListener("click", async () => {
  try {
    await invoke("hide_viewer");
  } catch {
    window.close();
  }
});

pinButton.addEventListener("click", async () => {
  pinned = !pinned;
  pinButton.classList.toggle("active", pinned);
  pinButton.setAttribute("aria-pressed", String(pinned));
  pinButton.title = pinned ? "始终置顶" : "点击置顶";
  pinButton.setAttribute("aria-label", pinButton.title);
  try {
    await invoke("set_viewer_pinned", { pinned });
  } catch {
    // Browser preview has no native window to pin.
  }
});

preview.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) {
    return;
  }
  selectingPreview = true;
  hideSelectionToolbar();
});

window.addEventListener("pointerup", () => {
  if (!selectingPreview) {
    return;
  }
  selectingPreview = false;
  scheduleSelectionToolbarUpdate();
});

document.addEventListener("selectionchange", () => {
  if (!selectingPreview) {
    scheduleSelectionToolbarUpdate();
  }
});

preview.addEventListener("pointerover", (event) => {
  if (activeAskSelection) {
    return;
  }
  const formula = formulaFromTarget(event.target);
  if (formula) {
    showFormulaToolbar(formula);
    return;
  }
  const copyTarget = copyTargetFromTarget(event.target);
  if (copyTarget && copyTarget !== activeCopyTarget) {
    showCopyTooltip(copyTarget);
  }
});

preview.addEventListener("pointerout", (event) => {
  const formula = formulaFromTarget(event.target);
  if (formula) {
    const relatedTarget = event.relatedTarget;
    if (
      relatedTarget instanceof Node &&
      (formula.contains(relatedTarget) || formulaToolbar.contains(relatedTarget))
    ) {
      return;
    }
    scheduleHideFormulaToolbar();
    return;
  }
  const copyTarget = copyTargetFromTarget(event.target);
  const relatedTarget = event.relatedTarget;
  if (!copyTarget || (relatedTarget instanceof Node && copyTarget.contains(relatedTarget))) {
    return;
  }
  if (document.activeElement !== copyTarget) {
    hideCopyTooltip(copyTarget);
  }
});

preview.addEventListener("focusin", (event) => {
  if (activeAskSelection) {
    return;
  }
  const formula = formulaFromTarget(event.target);
  if (formula) {
    showFormulaToolbar(formula);
    return;
  }
  const copyTarget = copyTargetFromTarget(event.target);
  if (copyTarget) {
    showCopyTooltip(copyTarget);
  }
});

preview.addEventListener("focusout", (event) => {
  const formula = formulaFromTarget(event.target);
  if (formula) {
    scheduleHideFormulaToolbar();
    return;
  }
  const copyTarget = copyTargetFromTarget(event.target);
  if (copyTarget) {
    hideCopyTooltip(copyTarget);
  }
});

preview.addEventListener("click", async (event) => {
  const target = event.target as HTMLElement;
  const codeActionButton = target.closest<HTMLButtonElement>("[data-code-action]");
  if (codeActionButton) {
    event.preventDefault();
    await handleCodeBlockAction(codeActionButton);
    return;
  }
  const mermaidActionButton = target.closest<HTMLButtonElement>("[data-mermaid-action]");
  if (mermaidActionButton) {
    event.preventDefault();
    try {
      await handleMermaidAction(mermaidActionButton);
    } catch (error) {
      console.error(error);
      renderStatus.textContent = "图表操作失败";
    }
    return;
  }
  const copyTarget = copyTargetFromTarget(target);
  if (copyTarget) {
    if (copyTarget.classList.contains("copyable-formula") && selectionTouchesElement(copyTarget)) {
      return;
    }
    event.preventDefault();
    await copyInteractiveTarget(copyTarget);
    return;
  }
  const link = target.closest<HTMLAnchorElement>("a[href]");
  if (!link) {
    return;
  }

  event.preventDefault();
  const url = link.dataset.externalUrl ?? webUrlFromHref(link.getAttribute("href") ?? "");
  if (url) {
    try {
      await openWebLink(url);
    } catch {
      renderStatus.textContent = "无法打开网页链接";
    }
  }
});

preview.addEventListener("keydown", (event) => {
  const copyTarget = copyTargetFromTarget(event.target);
  if (!copyTarget || (event.key !== "Enter" && event.key !== " ")) {
    return;
  }
  event.preventDefault();
  void copyInteractiveTarget(copyTarget);
});

formulaToolbar.addEventListener("pointerenter", () => window.clearTimeout(formulaToolbarTimer));
formulaToolbar.addEventListener("pointerleave", scheduleHideFormulaToolbar);
formulaToolbar.addEventListener("click", (event) => {
  const button = (event.target as Element).closest<HTMLButtonElement>("[data-formula-action]");
  if (button) {
    void handleFormulaAction(button).catch((error) => {
      console.error(error);
      renderStatus.textContent = button.dataset.formulaAction === "copy"
        ? "LaTeX 复制失败"
        : "公式图像导出失败";
    });
  }
});

selectionToolbar.addEventListener("pointerdown", (event) => {
  event.preventDefault();
});
askSelectionButton.addEventListener("click", () => {
  void askCurrentSelectionInChatGPT();
});

preview.addEventListener("scroll", () => {
  hideCopyTooltip();
  hideFormulaToolbar();
  hideSelectionToolbar();
  backToTopButton.hidden = preview.scrollTop < 320;
  window.clearTimeout(historyScrollTimer);
  historyScrollTimer = window.setTimeout(persistCurrentHistoryScroll, 240);
}, true);
window.addEventListener("resize", () => {
  hideCopyTooltip();
  hideFormulaToolbar();
  hideSelectionToolbar();
});

window.addEventListener("focus", () => {
  if (!sourceInput.value) {
    sourceInput.focus();
  }
});

window.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === "f") {
    event.preventDefault();
    setDocumentSearchOpen(true);
    return;
  }
  if (event.key === "Escape") {
    if (activeAskSelection) {
      hideSelectionToolbar();
      window.getSelection()?.removeAllRanges();
      return;
    }
    if (settingsOpen) {
      setSettingsOpen(false);
      return;
    }
    if (documentSearchOpen) {
      setDocumentSearchOpen(false);
      return;
    }
    if (outlineOpen) {
      setOutlineOpen(false);
      return;
    }
    if (historyOpen) {
      setHistoryOpen(false);
      return;
    }
    void invoke("hide_viewer").catch(() => undefined);
  }
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
    void updateRendering();
  }
});

window.addEventListener("beforeunload", persistCurrentHistoryScroll);

if ("__TAURI_INTERNALS__" in window) {
  void listen("viewer-opened", () => {
    void renderCurrentClipboardOnOpen();
  });
}

renderHistoryList();
void initializeHistoryWorkspace().finally(() => {
  void updateRendering();
});
