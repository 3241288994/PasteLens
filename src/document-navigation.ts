export interface DocumentOutlineItem {
  id: string;
  label: string;
  level: number;
}

const SEARCH_SKIP_SELECTOR = ".katex, .mermaid-block, .code-line-numbers, [data-export-ignore], script, style";

export function headingSlug(label: string, index: number): string {
  const slug = label
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, "")
    .trim()
    .replace(/[\s-]+/g, "-")
    .slice(0, 64);
  return slug || `section-${index + 1}`;
}

export function buildDocumentOutline(root: ParentNode): DocumentOutlineItem[] {
  const usedIds = new Set<string>();
  return Array.from(root.querySelectorAll<HTMLElement>("h1, h2, h3")).map((heading, index) => {
    const label = heading.textContent?.trim() || `第 ${index + 1} 节`;
    const baseId = headingSlug(label, index);
    let id = baseId;
    let suffix = 2;
    while (usedIds.has(id)) {
      id = `${baseId}-${suffix++}`;
    }
    usedIds.add(id);
    heading.id = id;
    return { id, label, level: Number(heading.tagName.slice(1)) };
  });
}

export function clearSearchHighlights(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>("mark.search-match").forEach((mark) => {
    mark.replaceWith(document.createTextNode(mark.textContent ?? ""));
  });
  root.normalize();
}

export function highlightSearchMatches(root: HTMLElement, query: string): HTMLElement[] {
  clearSearchHighlights(root);
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) {
    return [];
  }

  const textNodes: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || parent.closest(SEARCH_SKIP_SELECTOR) || !node.textContent?.trim()) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  while (walker.nextNode()) {
    textNodes.push(walker.currentNode as Text);
  }

  for (const textNode of textNodes) {
    const text = textNode.data;
    const lowerText = text.toLocaleLowerCase();
    const offsets: number[] = [];
    let offset = 0;
    while (offset <= lowerText.length - needle.length) {
      const match = lowerText.indexOf(needle, offset);
      if (match < 0) {
        break;
      }
      offsets.push(match);
      offset = match + Math.max(1, needle.length);
    }

    for (const match of offsets.reverse()) {
      const range = document.createRange();
      const mark = document.createElement("mark");
      mark.className = "search-match";
      range.setStart(textNode, match);
      range.setEnd(textNode, match + needle.length);
      range.surroundContents(mark);
    }
  }

  return Array.from(root.querySelectorAll<HTMLElement>("mark.search-match"));
}
