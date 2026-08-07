import type {
  DisplayRecoveryResult,
  InlineRecoveryResult,
  RepairRecord,
} from "./types";

const STRONG_TEX_COMMAND = /\\(?:begin|end|frac|sqrt|sum|prod|int|lim|left|right|mathbf|mathrm|mathbb|text|operatorname|quad|qquad|cdot|times|perp|partial|nabla|Delta|alpha|beta|gamma|rho|theta|lambda|mu|sigma|omega)\b/;
const SHORT_SUBSCRIPT = /(?:^|[^A-Za-z])(?:[A-Za-z]|\\[A-Za-z]+)_(?:\{[^{}\n]{1,24}\}|[A-Za-z0-9]{1,4})(?=[^A-Za-z]|$)/;
const SHORT_SUPERSCRIPT = /(?:^|[^A-Za-z])(?:[A-Za-z0-9}\}]|\\[A-Za-z]+)\^(?:\{[^{}\n]{1,24}\}|[-+A-Za-z0-9]{1,4})(?=[^A-Za-z]|$)/;
const MATH_OPERATOR = /(?:=|<=|>=|<|>|\+|-|\*|\/|\\(?:perp|approx|neq|leq|geq|to|mapsto|times|cdot))+/;

interface Replacement {
  start: number;
  end: number;
  original: string;
  replacement: string;
  reason: string;
  confidence: number;
}
function withoutCommands(value: string): string {
  return value.replace(/\\[A-Za-z]+/g, "");
}

function containsLongProseWord(value: string): boolean {
  return /[A-Za-z]{4,}/.test(withoutCommands(value));
}

function isPlausibleMath(value: string): boolean {
  if (!value.trim() || value.length > 320) {
    return false;
  }

  if (/[\u3400-\u9FFF]/u.test(value) || /(?:https?:\/\/|[\\/][A-Za-z0-9_.-]+\/)/.test(value)) {
    return false;
  }

  if (STRONG_TEX_COMMAND.test(value)) {
    return true;
  }

  if (containsLongProseWord(value)) {
    return false;
  }

  return SHORT_SUBSCRIPT.test(value) || SHORT_SUPERSCRIPT.test(value) || MATH_OPERATOR.test(value);
}

function isStrongDisplayMath(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }

  if (STRONG_TEX_COMMAND.test(trimmed) || /\\begin\{(?:align|aligned|equation|gather|cases|matrix|bmatrix|pmatrix)\*?\}/.test(trimmed)) {
    return true;
  }

  if (SHORT_SUBSCRIPT.test(trimmed) || SHORT_SUPERSCRIPT.test(trimmed)) {
    return true;
  }

  const equationLines = trimmed.split("\n").filter((line) => /[=<>]/.test(line)).length;
  return equationLines >= 1 && !containsLongProseWord(trimmed);
}

function buildProtectedMask(line: string): boolean[] {
  const mask = Array.from({ length: line.length }, () => false);

  for (let index = 0; index < line.length; index += 1) {
    if (line[index] !== "`") {
      continue;
    }

    let runLength = 1;
    while (line[index + runLength] === "`") {
      runLength += 1;
    }
    const delimiter = "`".repeat(runLength);
    const closing = line.indexOf(delimiter, index + runLength);
    if (closing === -1) {
      break;
    }
    for (let cursor = index; cursor < closing + runLength; cursor += 1) {
      mask[cursor] = true;
    }
    index = closing + runLength - 1;
  }

  let dollarStart: number | null = null;
  for (let index = 0; index < line.length; index += 1) {
    if (mask[index] || line[index] !== "$" || line[index - 1] === "\\") {
      continue;
    }
    if (dollarStart === null) {
      dollarStart = index;
      continue;
    }
    for (let cursor = dollarStart; cursor <= index; cursor += 1) {
      mask[cursor] = true;
    }
    dollarStart = null;
  }

  return mask;
}

function explicitInlineReplacements(line: string, mask: boolean[]): Replacement[] {
  const replacements: Replacement[] = [];
  const pattern = /\\\((.+?)\\\)/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(line)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (mask.slice(start, end).some(Boolean)) {
      continue;
    }
    replacements.push({
      start,
      end,
      original: match[0],
      replacement: `$${match[1]}$`,
      reason: "将标准行内 TeX 分隔符统一为 Markdown 数学分隔符",
      confidence: 1,
    });
    for (let cursor = start; cursor < end; cursor += 1) {
      mask[cursor] = true;
    }
  }

  return replacements;
}

function parentheticalReplacements(line: string, mask: boolean[]): Replacement[] {
  const stack: number[] = [];
  const pairs: Array<{ start: number; end: number }> = [];

  for (let index = 0; index < line.length; index += 1) {
    if (mask[index]) {
      continue;
    }
    if (line[index] === "(") {
      stack.push(index);
    } else if (line[index] === ")" && stack.length > 0) {
      const start = stack.pop();
      if (start !== undefined) {
        pairs.push({ start, end: index + 1 });
      }
    }
  }

  pairs.sort((left, right) => left.start - right.start || right.end - left.end);
  const selected: Replacement[] = [];

  for (const pair of pairs) {
    if (selected.some((replacement) => pair.start >= replacement.start && pair.end <= replacement.end)) {
      continue;
    }

    const candidate = line.slice(pair.start + 1, pair.end - 1).trim();
    const prefix = line.slice(0, pair.start);
    const suffix = line.slice(pair.end);
    const symbolDefinition = /^\s*[-*+]\s*$/.test(prefix) && /^\s*[：:]/.test(suffix) && /^[A-Za-z](?:_(?:\{[^}]+\}|[A-Za-z0-9]+))?$/.test(candidate);

    if (!symbolDefinition && !isPlausibleMath(candidate)) {
      continue;
    }

    selected.push({
      start: pair.start,
      end: pair.end,
      original: line.slice(pair.start, pair.end),
      replacement: `$${candidate}$`,
      reason: symbolDefinition
        ? "根据符号定义列表恢复被终端吞掉的行内公式分隔符"
        : "根据下标、上标、运算符或 TeX 命令恢复行内公式",
      confidence: symbolDefinition || STRONG_TEX_COMMAND.test(candidate) ? 0.98 : 0.92,
    });
  }

  return selected;
}

export function recoverInlineMath(line: string, lineNumber: number): InlineRecoveryResult {
  if (!line.includes("(")) {
    return { line, repairs: [] };
  }

  const mask = buildProtectedMask(line);
  const replacements = [
    ...explicitInlineReplacements(line, mask),
    ...parentheticalReplacements(line, mask),
  ].sort((left, right) => right.start - left.start);

  let normalized = line;
  const repairs: RepairRecord[] = [];

  for (const replacement of replacements) {
    normalized = `${normalized.slice(0, replacement.start)}${replacement.replacement}${normalized.slice(replacement.end)}`;
    repairs.push({
      kind: "inline-math",
      startLine: lineNumber,
      endLine: lineNumber,
      confidence: replacement.confidence,
      original: replacement.original,
      normalized: replacement.replacement,
      reason: replacement.reason,
    });
  }

  repairs.reverse();
  return { line: normalized, repairs };
}

export function tryRecoverDisplayMath(lines: string[], startIndex: number): DisplayRecoveryResult | null {
  const opening = lines[startIndex]?.trim();
  if (opening !== "[" && opening !== "\\[") {
    return null;
  }

  const closingDelimiter = opening === "[" ? "]" : "\\]";
  let endIndex = startIndex + 1;
  while (endIndex < lines.length && lines[endIndex]?.trim() !== closingDelimiter) {
    endIndex += 1;
  }

  if (endIndex >= lines.length) {
    return null;
  }

  const body = lines.slice(startIndex + 1, endIndex).join("\n");
  if (opening === "[" && !isStrongDisplayMath(body)) {
    return null;
  }

  return {
    endIndex,
    markdown: ["$$", ...lines.slice(startIndex + 1, endIndex), "$$"],
    repair: {
      kind: "display-math",
      startLine: startIndex + 1,
      endLine: endIndex + 1,
      confidence: opening === "\\[" ? 1 : 0.97,
      original: lines.slice(startIndex, endIndex + 1).join("\n"),
      normalized: ["$$", ...lines.slice(startIndex + 1, endIndex), "$$"].join("\n"),
      reason: opening === "\\["
        ? "将标准展示公式分隔符统一为 Markdown 数学分隔符"
        : "检测到独占行方括号及强 TeX 特征，恢复展示公式分隔符",
    },
  };
}
