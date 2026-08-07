import stringWidth from "string-width";
import type { TerminalTableResult } from "./types";

interface Segment {
  start: number;
  end: number;
}
function separatorSegments(line: string): Segment[] {
  const segments: Segment[] = [];
  const pattern = /[━─═]{3,}/gu;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(line)) !== null) {
    const prefix = line.slice(0, match.index);
    const start = stringWidth(prefix);
    segments.push({
      start,
      end: start + stringWidth(match[0]),
    });
  }

  return segments;
}

function isSeparatorLine(line: string): boolean {
  const stripped = line.replace(/[━─═\s]/gu, "");
  return stripped.length === 0 && separatorSegments(line).length >= 2;
}

function sliceDisplayColumns(line: string, start: number, end: number): string {
  let width = 0;
  let result = "";

  for (const character of line) {
    const characterWidth = stringWidth(character);
    const characterStart = width;
    const characterEnd = width + characterWidth;
    width = characterEnd;

    if (characterEnd <= start) {
      continue;
    }
    if (characterStart >= end) {
      break;
    }
    result += character;
  }

  return result.trim();
}

function splitColumns(line: string, starts: number[]): string[] {
  return starts.map((start, index) => {
    const end = starts[index + 1] ?? Number.POSITIVE_INFINITY;
    return sliceDisplayColumns(line, start, end);
  });
}

function normalizeCell(cell: string): string {
  return cell.replace(/\s+/gu, " ").trim();
}

function escapeCell(cell: string): string {
  return normalizeCell(cell).replace(/\|/g, "\\|");
}

export function tryParseTerminalTable(lines: string[], startIndex: number): TerminalTableResult | null {
  const separatorLine = lines[startIndex + 1];
  if (!separatorLine || !isSeparatorLine(separatorLine)) {
    return null;
  }

  const segments = separatorSegments(separatorLine);
  if (segments.length < 2) {
    return null;
  }

  const starts = segments.map((segment) => segment.start);
  starts[0] = 0;
  const header = splitColumns(lines[startIndex] ?? "", starts);
  if (header.filter(Boolean).length < 2) {
    return null;
  }

  let endIndex = startIndex + 2;
  while (endIndex < lines.length && lines[endIndex]?.trim() !== "") {
    endIndex += 1;
  }
  const lastTableIndex = endIndex - 1;

  const rows: string[][] = [];
  let currentRow: string[] | null = null;
  let contentLines = 0;

  for (let index = startIndex + 2; index <= lastTableIndex; index += 1) {
    const line = lines[index] ?? "";
    if (isSeparatorLine(line)) {
      continue;
    }

    const cells = splitColumns(line, starts);
    if (cells.every((cell) => !cell)) {
      continue;
    }
    contentLines += 1;

    if (cells[0]) {
      currentRow = cells;
      rows.push(currentRow);
      continue;
    }

    if (!currentRow) {
      return null;
    }

    cells.forEach((cell, columnIndex) => {
      if (!cell) {
        return;
      }
      currentRow![columnIndex] = normalizeCell(`${currentRow![columnIndex] ?? ""} ${cell}`);
    });
  }

  if (rows.length === 0 || contentLines === 0) {
    return null;
  }

  const completeRows = rows.filter((row) => row.filter(Boolean).length >= 2).length;
  if (completeRows / rows.length < 0.6) {
    return null;
  }

  const markdown = [
    `| ${header.map(escapeCell).join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${starts.map((_, index) => escapeCell(row[index] ?? "")).join(" | ")} |`),
  ];

  return {
    endIndex: lastTableIndex,
    markdown,
    repair: {
      kind: "terminal-table",
      startLine: startIndex + 1,
      endLine: lastTableIndex + 1,
      confidence: Math.min(0.98, 0.88 + completeRows / rows.length / 10),
      original: lines.slice(startIndex, lastTableIndex + 1).join("\n"),
      normalized: markdown.join("\n"),
      reason: "根据 Unicode 分隔线与显示宽度恢复终端表格",
    },
  };
}
