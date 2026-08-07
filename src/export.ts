import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";

export type ImageExportFormat = "png" | "svg";

function compactText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function exportBaseName(markdown: string): string {
  const lines = markdown.split("\n").map((line) => line.trim());
  const heading = lines.find((line) => /^#{1,6}\s+\S/.test(line));
  const firstText = lines.find((line) => line && !/^(?:```|\$\$|\[|\])$/.test(line));
  const candidate = compactText((heading ?? firstText ?? "PasteLens 导出").replace(/^#{1,6}\s+/, ""));
  const safe = candidate
    .replace(/[\\/:*?"<>|：／＊？“”＜＞｜]/g, "-")
    .replace(/[.\s]+$/g, "")
    .slice(0, 64);
  return safe || "PasteLens 导出";
}

function isTauriRuntime(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

function mimeTypeForExtension(extension: string): string {
  const types: Record<string, string> = {
    html: "text/html;charset=utf-8",
    png: "image/png",
    svg: "image/svg+xml;charset=utf-8",
  };
  return types[extension] ?? "application/octet-stream";
}

async function saveBytes(
  bytes: Uint8Array,
  suggestedName: string,
  extension: string,
): Promise<boolean> {
  if (isTauriRuntime()) {
    const path = await save({
      defaultPath: suggestedName,
      filters: [{ name: extension.toUpperCase(), extensions: [extension] }],
    });
    if (!path) {
      return false;
    }
    await writeFile(path, bytes);
    return true;
  }

  const browserBytes = new Uint8Array(bytes.byteLength);
  browserBytes.set(bytes);
  const blob = new Blob([browserBytes.buffer], { type: mimeTypeForExtension(extension) });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.download = suggestedName;
  anchor.href = url;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

function bytesFromDataUrl(dataUrl: string): Uint8Array {
  const separator = dataUrl.indexOf(",");
  if (separator < 0) {
    throw new Error("Invalid image data URL");
  }
  const metadata = dataUrl.slice(0, separator);
  const payload = dataUrl.slice(separator + 1);
  if (metadata.endsWith(";base64")) {
    const binary = window.atob(payload);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  }
  return new TextEncoder().encode(decodeURIComponent(payload));
}

function removeExportControls(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>("[data-export-ignore]").forEach((element) => element.remove());
  root.querySelectorAll<HTMLElement>("mark.search-match").forEach((mark) => {
    mark.replaceWith(document.createTextNode(mark.textContent ?? ""));
  });
}

function exportClone(element: HTMLElement, className: string): { host: HTMLElement; clone: HTMLElement } {
  const host = document.createElement("div");
  const clone = element.cloneNode(true) as HTMLElement;
  host.className = "export-capture-host";
  clone.removeAttribute("id");
  clone.classList.add(className);
  clone.style.width = `${Math.max(640, Math.min(1100, element.clientWidth || 900))}px`;
  clone.style.height = "auto";
  clone.style.maxHeight = "none";
  clone.style.overflow = "visible";
  removeExportControls(clone);
  host.append(clone);
  document.body.append(host);
  return { host, clone };
}

export async function exportPreviewPng(
  preview: HTMLElement,
  baseName: string,
): Promise<boolean> {
  const { toPng } = await import("html-to-image");
  const { host, clone } = exportClone(preview, "export-document");
  try {
    const backgroundColor = getComputedStyle(preview).backgroundColor;
    const dataUrl = await toPng(clone, {
      backgroundColor,
      cacheBust: true,
      pixelRatio: 2,
      width: clone.scrollWidth,
      height: clone.scrollHeight,
    });
    return await saveBytes(bytesFromDataUrl(dataUrl), `${baseName}.png`, "png");
  } finally {
    host.remove();
  }
}

function cssTextFromDocument(): string {
  const rules: string[] = [];
  for (const styleSheet of document.styleSheets) {
    try {
      rules.push(Array.from(styleSheet.cssRules, (rule) => rule.cssText).join("\n"));
    } catch {
      continue;
    }
  }
  return rules.join("\n");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export async function exportPreviewHtml(
  preview: HTMLElement,
  baseName: string,
): Promise<boolean> {
  const clone = preview.cloneNode(true) as HTMLElement;
  removeExportControls(clone);
  clone.removeAttribute("id");
  clone.classList.add("export-document");

  let fontCss = "";
  try {
    const { getFontEmbedCSS } = await import("html-to-image");
    fontCss = await getFontEmbedCSS(preview);
  } catch {
    fontCss = "";
  }

  const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(baseName)}</title>
  <style>${cssTextFromDocument()}\n${fontCss}\nhtml,body{height:auto;overflow:auto;background:var(--surface-strong)}body{margin:0}.export-document{max-width:1080px;margin:0 auto;overflow:visible;}</style>
</head>
<body>${clone.outerHTML}</body>
</html>`;
  return saveBytes(new TextEncoder().encode(html), `${baseName}.html`, "html");
}

function formulaCapture(element: HTMLElement): { host: HTMLElement; surface: HTMLElement } {
  const host = document.createElement("div");
  const surface = document.createElement("div");
  const clone = element.cloneNode(true) as HTMLElement;
  const styles = getComputedStyle(element);
  host.className = "export-capture-host";
  surface.className = "formula-export-surface";
  surface.style.color = styles.color;
  surface.style.background = getComputedStyle(document.documentElement).getPropertyValue("--surface-strong");
  surface.append(clone);
  host.append(surface);
  document.body.append(host);
  return { host, surface };
}

export async function exportFormulaImage(
  formula: HTMLElement,
  baseName: string,
  format: ImageExportFormat,
): Promise<boolean> {
  const { toPng, toSvg } = await import("html-to-image");
  const { host, surface } = formulaCapture(formula);
  try {
    const dataUrl = format === "png"
      ? await toPng(surface, { cacheBust: true, pixelRatio: 3, skipFonts: true })
      : await toSvg(surface, { cacheBust: true, skipFonts: true });
    return await saveBytes(
      bytesFromDataUrl(dataUrl),
      `${baseName}.${format}`,
      format,
    );
  } finally {
    host.remove();
  }
}

export async function saveSvgMarkup(svg: string, baseName: string): Promise<boolean> {
  return saveBytes(new TextEncoder().encode(svg), `${baseName}.svg`, "svg");
}

export async function printPreview(): Promise<void> {
  document.body.classList.add("printing-preview");
  try {
    if (isTauriRuntime()) {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("print_viewer");
    } else {
      window.print();
    }
  } finally {
    window.setTimeout(() => document.body.classList.remove("printing-preview"), 500);
  }
}
