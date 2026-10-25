import { describe, expect, it } from "vitest";
import { renderMarkdown } from "../src/render";

describe("renderMarkdown", () => {
  it.each([
    ["**已经是现有做法。**微软的 agent router", "<strong>已经是现有做法。</strong>微软的 agent router"],
    ["判断**“是否值得花钱获取更多信息”**，已有研究。", "判断<strong>“是否值得花钱获取更多信息”</strong>，已有研究。"],
    ["这是**（中文重点）**后续说明。", "这是<strong>（中文重点）</strong>后续说明。"],
  ])("renders CJK punctuation next to emphasis: %s", async (source, expected) => {
    expect(await renderMarkdown(source)).toBe(`<p>${expected}</p>`);
  });

  it.each([" ", "  ", "\t", "\u00a0", "\u3000"])("recovers padding before a CJK bold closer (%j)", async (padding) => {
    const html = await renderMarkdown(`**已经是现有做法。${padding}**微软的 agent router`);

    expect(html).toBe(`<p><strong>已经是现有做法。</strong>${padding}微软的 agent router</p>`);
  });

  it("renders all four bold passages from the reported screenshot", async () => {
    const source = [
      "- **给路由器增加历史和运行状态，已经是现有做法。 **微软的 agent router 会接收完整上下文。 [微软文档](https://example.com/microsoft)",
      "- **判断“是否值得花钱获取更多信息”，Google 已有直接研究。 **Pandora 把估值开销纳入路由决策。",
      "- **更丰富的状态也不保证更划算。 **近期 MARS 联合使用会话状态、记忆和模型选择。",
      "",
      "跨领域最有用的启发来自决策导向学习：**预测准确、诊断准确与选对动作，是三个不同目标。 **我们需要直接检验最后一个。",
    ].join("\n");
    const html = await renderMarkdown(source);

    expect(html.match(/<strong>/g)).toHaveLength(4);
    expect(html).not.toContain("**");
    expect(html).toContain('<a href="https://example.com/microsoft">微软文档</a>');
    expect(html).toContain("</strong> 微软");
    expect(html).toContain("</strong> 我们");
  });

  it("preserves valid nested formatting, links and inline code inside CJK bold", async () => {
    const html = await renderMarkdown("**中文 *重点*、[文档](https://example.com) 和 `code`。**后文");

    expect(html).toBe('<p><strong>中文 <em>重点</em>、<a href="https://example.com">文档</a> 和 <code>code</code>。</strong>后文</p>');
  });

  it("recovers padded bold around nested formatting without changing link or code content", async () => {
    const html = await renderMarkdown("**中文 *重点*、[文档](https://example.com) 和 `**code**`。 **后文");

    expect(html).toBe('<p><strong>中文 <em>重点</em>、<a href="https://example.com">文档</a> 和 <code>**code**</code>。</strong> 后文</p>');
  });

  it("pairs consecutive padded passages without making the intervening prose bold", async () => {
    const html = await renderMarkdown("**甲。 **介绍；**乙。 **后文；**正常**。");

    expect(html).toBe("<p><strong>甲。</strong> 介绍；<strong>乙。</strong> 后文；<strong>正常</strong>。</p>");
  });

  it("recovers headings, table cells and link labels without changing destinations or titles", async () => {
    const html = await renderMarkdown([
      "## **标题。 **后文",
      "",
      '| 列名 | 内容 |',
      '| --- | --- |',
      '| **中文。 **后文 | [**标签。 **文字](https://example.com/**url** "**标题。 **说明") |',
    ].join("\n"));

    expect(html).toContain("<h2><strong>标题。</strong> 后文</h2>");
    expect(html).toContain("<td><strong>中文。</strong> 后文</td>");
    expect(html).toContain('<a href="https://example.com/**url**" title="**标题。 **说明"><strong>标签。</strong> 文字</a>');
  });

  it("preserves whitespace recovery next to entities and escaped punctuation", async () => {
    const html = await renderMarkdown(String.raw`A &amp; B：**中文 \[重点\]。 **后文`);

    expect(html).toBe("<p>A &#x26; B：<strong>中文 [重点]。</strong> 后文</p>");
  });

  it("does not treat image alt text, HTML attributes or link titles as emphasis", async () => {
    const html = await renderMarkdown([
      '![**图片。 **说明](https://example.com/image.png "**标题。 **后文")',
      '<span title="**属性。 **后文">文字</span>',
      '[文档](https://example.com "**标题。 **后文")',
    ].join("\n\n"));

    expect(html).not.toContain("<strong>");
    expect(html).toContain('alt="**图片。 **说明"');
    expect(html.match(/title="\*\*标题。 \*\*后文"/g)).toHaveLength(2);
    expect(html).not.toContain("<span");
  });

  it("does not interpret literal stars in a bare URL as bold markers", async () => {
    const html = await renderMarkdown("https://example.com/**中文。 **后文");

    expect(html).toContain('href="https://example.com/**%E4%B8%AD%E6%96%87%E3%80%82"');
    expect(html).toContain("https://example.com/**中文。</a> **后文");
    expect(html).not.toContain("<strong>");
  });

  it.each([
    [String.raw`\*\*中文。 **后文`, "**中文。 **后文"],
    ["&#42;&#42;中文。 **后文", "**中文。 **后文"],
    ["**中文。 &#42;&#42;后文", "**中文。 **后文"],
    ["**未闭合中文。", "**未闭合中文。"],
    ["文字 ** **", "文字 ** **"],
    ["**English. **following", "**English. **following"],
    ["**中文\n **后文", "**中文\n**后文"],
    [String.raw`**中文。 \*\*后文`, "**中文。 **后文"],
    [String.raw`\**中文。 **后文`, "**中文。 **后文"],
  ])("does not guess at escaped, unmatched or ambiguous markers: %s", async (source, expected) => {
    expect(await renderMarkdown(source)).toBe(`<p>${expected}</p>`);
  });

  it("leaves emphasis-like text inside code and formulas untouched", async () => {
    const html = await renderMarkdown([
      "`**中文。 **后文`",
      "",
      "```text",
      "**中文。 **后文",
      "```",
      "",
      "$\\text{**中文。 **后文}$",
      "",
      "$$",
      "\\text{**中文。 **后文}",
      "$$",
    ].join("\n"));

    expect(html).not.toContain("<strong>");
    expect(html).toContain("<code>**中文。 **后文</code>");
    expect(html).toContain('<code class="hljs language-text">**中文。 **后文\n</code>');
    expect(html.match(/<annotation encoding="application\/x-tex">\\text\{\*\*中文。 \*\*后文\}<\/annotation>/g)).toHaveLength(2);
  });

  it("keeps English emphasis, literal operators and GFM features working", async () => {
    const html = await renderMarkdown("**bold** and *italic* and ~~deleted~~ and a ** b\n\n---\n\n- [x] done");

    expect(html).toContain("<strong>bold</strong> and <em>italic</em> and <del>deleted</del> and a ** b");
    expect(html).toContain("<hr>");
    expect(html).toContain('type="checkbox"');
  });

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
