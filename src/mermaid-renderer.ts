export type MermaidAction = "copy" | "svg" | "png";

export interface MermaidRenderSummary {
  rendered: number;
  failed: number;
}

let diagramSequence = 0;

function actionButton(action: MermaidAction, label: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.mermaidAction = action;
  button.textContent = label;
  return button;
}

function createShell(source: string): {
  shell: HTMLElement;
  canvas: HTMLElement;
  exportButtons: HTMLButtonElement[];
} {
  const shell = document.createElement("section");
  const toolbar = document.createElement("div");
  const label = document.createElement("span");
  const actions = document.createElement("div");
  const canvas = document.createElement("div");
  const copyButton = actionButton("copy", "复制源码");
  const svgButton = actionButton("svg", "SVG");
  const pngButton = actionButton("png", "PNG");

  shell.className = "mermaid-block";
  shell.dataset.mermaidSource = source;
  toolbar.className = "mermaid-toolbar";
  toolbar.dataset.exportIgnore = "true";
  label.textContent = "Mermaid";
  actions.className = "mermaid-actions";
  actions.append(copyButton, svgButton, pngButton);
  toolbar.append(label, actions);
  canvas.className = "mermaid-canvas";
  shell.append(toolbar, canvas);

  return { shell, canvas, exportButtons: [svgButton, pngButton] };
}

export async function renderMermaidBlocks(root: ParentNode): Promise<MermaidRenderSummary> {
  const blocks = Array.from(root.querySelectorAll<HTMLElement>("pre > code.language-mermaid"));
  if (blocks.length === 0) {
    return { rendered: 0, failed: 0 };
  }

  const { default: mermaid } = await import("mermaid");
  const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    suppressErrorRendering: true,
    theme: dark ? "dark" : "default",
  });

  let rendered = 0;
  let failed = 0;
  for (const code of blocks) {
    const pre = code.parentElement;
    if (!(pre instanceof HTMLPreElement)) {
      continue;
    }

    const source = code.textContent?.trim() ?? "";
    const { shell, canvas, exportButtons } = createShell(source);
    pre.replaceWith(shell);

    try {
      const id = `pastelens-mermaid-${Date.now().toString(36)}-${diagramSequence++}`;
      const { svg } = await mermaid.render(id, source);
      canvas.innerHTML = svg;
      rendered += 1;
    } catch {
      const title = document.createElement("strong");
      const message = document.createElement("span");
      const sourceBlock = document.createElement("pre");
      const sourceCode = document.createElement("code");
      shell.classList.add("mermaid-error");
      title.textContent = "Mermaid 图表解析失败";
      message.textContent = "已保留原始源码，可复制后检查语法。";
      sourceCode.textContent = source;
      sourceBlock.append(sourceCode);
      canvas.append(title, message, sourceBlock);
      exportButtons.forEach((button) => {
        button.disabled = true;
      });
      failed += 1;
    }
  }

  return { rendered, failed };
}
