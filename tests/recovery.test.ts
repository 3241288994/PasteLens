import { describe, expect, it } from "vitest";
import { recoverTerminalMarkdown } from "../src/recovery/normalize";

describe("recoverTerminalMarkdown", () => {
  it("recovers bare display math only when strong TeX evidence exists", () => {
    const source = String.raw`说明：
[
M_G=\sum_q w_0(q)D_G(q)
]

[
ordinary note
]`;
    const result = recoverTerminalMarkdown(source);

    expect(result.normalized).toContain(String.raw`$$
M_G=\sum_q w_0(q)D_G(q)
$$`);
    expect(result.normalized).toContain("[\nordinary note\n]");
    expect(result.stats.displayMath).toBe(1);
  });

  it("recovers inline formulas while leaving ordinary prose and code unchanged", () => {
    const source = "- (M_G)：目标分量；普通括号（不是公式），(this is prose)，代码 `value_(raw)`，要求 (R^2>0)。";
    const result = recoverTerminalMarkdown(source);

    expect(result.normalized).toContain("- $M_G$：");
    expect(result.normalized).toContain("(this is prose)");
    expect(result.normalized).toContain("`value_(raw)`");
    expect(result.normalized).toContain("$R^2>0$");
  });

  it("does not modify fenced code", () => {
    const source = [
      "```text",
      "[",
      String.raw`M_G=\sum_q q`,
      "]",
      "(R^2>0)",
      "```",
    ].join("\n");
    const result = recoverTerminalMarkdown(source);

    expect(result.normalized).toBe(source);
    expect(result.repairs).toHaveLength(0);
  });

  it("strips terminal control sequences", () => {
    const result = recoverTerminalMarkdown("\u001b[31m红色\u001b[0m");

    expect(result.normalized).toBe("红色");
    expect(result.stats.strippedControls).toBe(true);
  });

  it("reconstructs unicode terminal tables", () => {
    const source = `阶段          实验              条件
━━━━━━━━━━━━  ━━━━━━━━━━━━━━━━  ━━━━━━━━━━━━
0. Ceiling    direct answer     识别事实
────────────  ────────────────  ────────────
1. Geometry   capture states    效应共存
              all 32 layers     held-out`;
    const result = recoverTerminalMarkdown(source);

    expect(result.stats.terminalTables).toBe(1);
    expect(result.normalized).toContain("| 阶段 | 实验 | 条件 |");
    expect(result.normalized).toContain("capture states all 32 layers");
  });
});
