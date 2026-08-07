import { stripTerminalControls } from "./ansi";
import { recoverInlineMath, tryRecoverDisplayMath } from "./math";
import { tryParseTerminalTable } from "./table";
import type { RecoveryResult, RepairRecord } from "./types";

function fenceMarker(line: string): string | null {
  const match = line.match(/^\s*(`{3,}|~{3,})/);
  return match?.[1]?.[0] ?? null;
}
export function recoverTerminalMarkdown(source: string): RecoveryResult {
  const stripped = stripTerminalControls(source);
  const lines = stripped.text.split("\n");
  const output: string[] = [];
  const repairs: RepairRecord[] = [];
  const warnings: string[] = [];
  let activeFence: string | null = null;

  if (stripped.changed) {
    repairs.push({
      kind: "ansi",
      startLine: 1,
      endLine: Math.max(1, lines.length),
      confidence: 1,
      original: "终端 ANSI/控制序列",
      normalized: "已移除",
      reason: "移除只影响终端显示的控制字符",
    });
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const marker = fenceMarker(line);

    if (activeFence) {
      output.push(line);
      if (marker === activeFence) {
        activeFence = null;
      }
      continue;
    }

    if (marker) {
      activeFence = marker;
      output.push(line);
      continue;
    }

    const terminalTable = tryParseTerminalTable(lines, index);
    if (terminalTable) {
      output.push(...terminalTable.markdown);
      repairs.push(terminalTable.repair);
      index = terminalTable.endIndex;
      continue;
    }

    const displayMath = tryRecoverDisplayMath(lines, index);
    if (displayMath) {
      output.push(...displayMath.markdown);
      repairs.push(displayMath.repair);
      index = displayMath.endIndex;
      continue;
    }

    const inlineMath = recoverInlineMath(line, index + 1);
    output.push(inlineMath.line);
    repairs.push(...inlineMath.repairs);
  }

  if (activeFence) {
    warnings.push("检测到未闭合的代码围栏，已按原文保留。");
  }

  const stats = {
    displayMath: repairs.filter((repair) => repair.kind === "display-math").length,
    inlineMath: repairs.filter((repair) => repair.kind === "inline-math").length,
    terminalTables: repairs.filter((repair) => repair.kind === "terminal-table").length,
    strippedControls: stripped.changed,
  };

  return {
    source,
    normalized: output.join("\n"),
    repairs,
    warnings,
    stats,
  };
}
