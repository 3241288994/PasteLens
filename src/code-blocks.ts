export type CodeBlockAction = "copy" | "wrap" | "lines";

export function codeLanguageFromClassName(className: string): string {
  return className.match(/(?:^|\s)language-([^\s]+)/)?.[1] ?? "text";
}

export function codeLineCount(source: string): number {
  const withoutTrailingNewline = source.endsWith("\n") ? source.slice(0, -1) : source;
  return Math.max(1, withoutTrailingNewline.split("\n").length);
}

function actionButton(action: CodeBlockAction, label: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.codeAction = action;
  button.textContent = label;
  if (action !== "copy") {
    button.setAttribute("aria-pressed", "false");
  }
  return button;
}

export function decorateCodeBlocks(root: ParentNode): void {
  for (const code of root.querySelectorAll<HTMLElement>("pre > code")) {
    if (code.classList.contains("language-mermaid") || code.closest(".code-block")) {
      continue;
    }

    const pre = code.parentElement;
    if (!(pre instanceof HTMLPreElement)) {
      continue;
    }

    const source = code.textContent ?? "";
    const shell = document.createElement("section");
    const toolbar = document.createElement("div");
    const language = document.createElement("span");
    const actions = document.createElement("div");
    const scroll = document.createElement("div");
    const lineNumbers = document.createElement("div");

    shell.className = "code-block";
    toolbar.className = "code-block-toolbar";
    toolbar.dataset.exportIgnore = "true";
    language.className = "code-language";
    language.textContent = codeLanguageFromClassName(code.className);
    actions.className = "code-block-actions";
    actions.append(
      actionButton("copy", "复制"),
      actionButton("wrap", "换行"),
      actionButton("lines", "行号"),
    );
    toolbar.append(language, actions);

    scroll.className = "code-block-scroll";
    lineNumbers.className = "code-line-numbers";
    lineNumbers.setAttribute("aria-hidden", "true");
    lineNumbers.textContent = Array.from(
      { length: codeLineCount(source) },
      (_, index) => String(index + 1),
    ).join("\n");

    pre.replaceWith(shell);
    scroll.append(lineNumbers, pre);
    shell.append(toolbar, scroll);
  }
}
