import type { Nodes, Root } from "mdast";

const cjkText = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const inlineBlocks = new Set(["paragraph", "heading", "tableCell"]);
const emphasisNodes = new Set(["strong", "emphasis", "delete"]);
const maskedCharacter = "\ufffc";

interface PaddingRepair {
  start: number;
  end: number;
  padding: string;
}

/**
 * Tolerate copied CJK prose such as `**重点。 **后文` in the render buffer only.
 * The parser supplies prose boundaries: never scan code/math, HTML, link URLs,
 * image metadata or definitions as Markdown. Existing valid Markdown is left
 * alone; only paired double-star runs with trailing horizontal padding qualify.
 */
export function recoverPaddedCjkStrong(source: string, tree: Root): string {
  const repairs: PaddingRepair[] = [];

  function inspectBlock(block: Nodes): void {
    const start = block.position?.start.offset;
    const end = block.position?.end.offset;
    if (start === undefined || end === undefined) return;

    // Keep offsets and line boundaries, but hide all non-prose syntax by default.
    const mask = source.slice(start, end).split("").map((char) => /[\r\n]/.test(char) ? char : maskedCharacter);
    function expose(from: number | undefined, to: number | undefined): void {
      if (from === undefined || to === undefined) return;
      for (let index = from; index < to; index += 1) {
        mask[index - start!] = source[index]!;
      }
    }

    function exposeProse(node: Nodes): void {
      // An autolink's visible label IS its URL. Only explicit Markdown link
      // labels may be scanned; exposing bare URLs could alter their destination.
      if (node.type === "link" && source[node.position?.start.offset ?? -1] !== "[") return;
      if (node.type === "text") {
        expose(node.position?.start.offset, node.position?.end.offset);
        return;
      }
      if (!("children" in node)) return;
      if (emphasisNodes.has(node.type)) {
        expose(node.position?.start.offset, node.children[0]?.position?.start.offset);
        expose(node.children.at(-1)?.position?.end.offset, node.position?.end.offset);
      }
      // Link labels may contain prose; their destinations/titles remain hidden.
      for (const child of node.children) exposeProse(child);
    }
    exposeProse(block);

    // Escaped stars are literal even when the AST decoded them to plain `**`.
    // Also consume escaped backslashes so `\\**` is not mistaken for `\**`.
    for (let index = 0; index < mask.length - 1; index += 1) {
      if (mask[index] === "\\" && (mask[index + 1] === "*" || mask[index + 1] === "\\")) {
        mask[index] = maskedCharacter;
        mask[index + 1] = maskedCharacter;
        index += 1;
      }
    }

    const prose = mask.join("");
    for (const match of prose.matchAll(/\*\*([^\r\n]+?)\*\*/g)) {
      const offset = match.index;
      const content = match[1]!;
      // Do not reinterpret triple-star/nested delimiter runs or leading padding.
      if (prose[offset - 1] === "*" || prose[offset + match[0].length] === "*"
        || content.startsWith("*") || content.endsWith("*") || /^\s/.test(content)) continue;
      const padding = content.match(/[ \t\u00a0\u3000]+$/)?.[0];
      if (!padding || !cjkText.test(content)) continue;

      const closing = start + offset + match[0].length - 2;
      repairs.push({ start: closing - padding.length, end: closing + 2, padding });
    }
  }

  function walk(node: Nodes): void {
    if (inlineBlocks.has(node.type)) {
      inspectBlock(node);
    } else if ("children" in node) {
      for (const child of node.children) walk(child);
    }
  }
  walk(tree);
  if (repairs.length === 0) return source;

  // Move padding outside the closing delimiter, retaining every whitespace
  // character. Build once, in source order, without changing the user's source.
  const parts: string[] = [];
  let cursor = 0;
  for (const repair of repairs) {
    parts.push(source.slice(cursor, repair.start), "**", repair.padding);
    cursor = repair.end;
  }
  parts.push(source.slice(cursor));
  return parts.join("");
}
