import { describe, expect, it } from "vitest";
import { renderMarkdown } from "../src/render";

describe("renderMarkdown", () => {
  it("preserves the original LaTeX source for formula copying", async () => {
    const html = await renderMarkdown("$$\nx^2 + y_1\n$$");

    expect(html).toContain('<annotation encoding="application/x-tex">x^2 + y_1</annotation>');
  });

  it("preserves local file link destinations", async () => {
    const html = await renderMarkdown("[实验报告](file:///Users/demo/report.md)");

    expect(html).toContain('href="file:///Users/demo/report.md"');
  });

  it("highlights fenced code while leaving Mermaid source untouched", async () => {
    const codeHtml = await renderMarkdown("```js\nconst answer = 42;\n```");
    const mermaidHtml = await renderMarkdown("```mermaid\ngraph TD\nA --> B\n```");

    expect(codeHtml).toContain("hljs-keyword");
    expect(mermaidHtml).toContain('class="language-mermaid"');
    expect(mermaidHtml).not.toContain("hljs-keyword");
  });
});
