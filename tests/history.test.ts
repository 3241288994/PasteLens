import { describe, expect, it } from "vitest";
import {
  createHistoryEntry,
  filterHistoryEntries,
  parseHistoryEntries,
  parseHistoryWorkspace,
  upsertHistoryEntry,
} from "../src/history";

describe("render history", () => {
  it("uses the first Markdown heading as the entry title", () => {
    const entry = createHistoryEntry("one", "source", "## 四个分量\n\n正文内容", 100);

    expect(entry.title).toBe("四个分量");
    expect(entry.summary).toContain("正文内容");
  });

  it("keeps valid entries sorted by update time", () => {
    const entries = parseHistoryEntries(
      JSON.stringify([
        createHistoryEntry("old", "old source", "旧内容", 10),
        { invalid: true },
        createHistoryEntry("new", "new source", "新内容", 20),
      ]),
    );

    expect(entries.map((entry) => entry.id)).toEqual(["new", "old"]);
  });

  it("moves an updated render to the front without duplicating its source", () => {
    const original = createHistoryEntry("one", "same source", "旧标题", 10);
    const updated = createHistoryEntry("two", "same source", "新标题", 20);
    const entries = upsertHistoryEntry([original], updated);

    expect(entries).toHaveLength(1);
    expect(entries[0]?.title).toBe("新标题");
  });

  it("migrates legacy entries and keeps pinned entries first", () => {
    const entries = parseHistoryEntries(
      JSON.stringify([
        { id: "legacy", source: "old", title: "旧记录", summary: "旧", updatedAt: 30 },
        createHistoryEntry("pinned", "new", "新记录", 10, { pinned: true, scrollTop: 120 }),
      ]),
    );

    expect(entries.map((entry) => entry.id)).toEqual(["pinned", "legacy"]);
    expect(entries[0]?.scrollTop).toBe(120);
    expect(entries[1]?.pinned).toBe(false);
    expect(entries[1]?.scrollTop).toBe(0);
  });

  it("supports substring and subsequence history search", () => {
    const entries = [
      createHistoryEntry("one", "SugarCrepe paper", "## SugarCrepe\nNeurIPS", 20),
      createHistoryEntry("two", "local controller", "## 因果检验\n局部效应", 10),
    ];

    expect(filterHistoryEntries(entries, "sgrcp").map((entry) => entry.id)).toEqual(["one"]);
    expect(filterHistoryEntries(entries, "局部").map((entry) => entry.id)).toEqual(["two"]);
  });

  it("does not impose a fixed history-count limit", () => {
    const entries = Array.from({ length: 31 }, (_, index) =>
      createHistoryEntry(
        `entry-${index}`,
        `source-${index}`,
        `## 内容 ${index}`,
        index,
      ),
    );

    expect(parseHistoryEntries(JSON.stringify(entries))).toHaveLength(31);
    expect(upsertHistoryEntry(entries.slice(0, 30), entries[30]!)).toHaveLength(31);
  });

  it("filters entries by inbox, project, pinned state, and tags", () => {
    const entries = [
      createHistoryEntry("inbox", "inbox source", "收件箱", 10, { tagIds: ["methods"] }),
      createHistoryEntry("project", "project source", "项目内容", 20, {
        projectId: "vision",
        pinned: true,
        tagIds: ["methods", "atlas"],
      }),
    ];

    expect(filterHistoryEntries(entries, "", { projectId: null }).map((entry) => entry.id)).toEqual(["inbox"]);
    expect(filterHistoryEntries(entries, "", { projectId: "vision", pinnedOnly: true }).map((entry) => entry.id)).toEqual(["project"]);
    expect(filterHistoryEntries(entries, "", { tagIds: ["methods", "atlas"] }).map((entry) => entry.id)).toEqual(["project"]);
  });

  it("migrates legacy history into the inbox and validates workspace relations", () => {
    const workspace = parseHistoryWorkspace({
      entries: [{ id: "legacy", source: "source", title: "标题", summary: "摘要", updatedAt: 1 }],
      projects: [{ id: "vision", name: "视觉科研", color: "violet", createdAt: 1 }],
      tags: [{ id: "atlas", name: "Atlas", createdAt: 1 }],
    });

    expect(workspace?.entries[0]?.projectId).toBeNull();
    expect(workspace?.entries[0]?.tagIds).toEqual([]);
  });
});
