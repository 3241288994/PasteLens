import { describe, expect, it } from "vitest";
import { exportBaseName } from "../src/export";

describe("exportBaseName", () => {
  it("uses the first heading and removes invalid filename characters", () => {
    expect(exportBaseName("## 实验：A/B?\n\n正文")).toBe("实验-A-B-");
  });

  it("falls back to a stable default", () => {
    expect(exportBaseName("\n\n")).toBe("PasteLens 导出");
  });
});
