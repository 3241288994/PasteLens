import { describe, expect, it } from "vitest";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkCjkFriendly from "remark-cjk-friendly/parseOnly";
import { recoverPaddedCjkStrong } from "../src/markdown-emphasis";
import { recoverTerminalMarkdown } from "../src/recovery/normalize";
import { renderMarkdown } from "../src/render";

const parser = unified().use(remarkParse).use(remarkGfm).use(remarkMath).use(remarkCjkFriendly);
const recover = (source: string) => recoverPaddedCjkStrong(source, parser.parse(source));

describe("render-only CJK emphasis recovery", () => {
  it("moves padding without dropping text, and is idempotent", () => {
    const source = "- **中文。 \t**后文\n- **第二处。　**继续";
    const recovered = recover(source);

    expect(recovered).toBe("- **中文。** \t后文\n- **第二处。**　继续");
    expect(recovered.length).toBe(source.length);
    expect(recover(recovered)).toBe(recovered);
  });

  it("does not rewrite the user's recovered Markdown or repair records", async () => {
    const original = "**中文。 **后文";
    const document = recoverTerminalMarkdown(original);
    const snapshot = JSON.stringify(document);

    expect(await renderMarkdown(document.normalized)).toContain("<strong>中文。</strong>");
    expect(JSON.stringify(document)).toBe(snapshot);
    expect(document.source).toBe(original);
    expect(document.normalized).toBe(original);
  });

  it.each([
    "**正常**；**中文。**后文；***中文***",
    "***中文。 ***后文",
    "    **中文。 **后文",
    "~~~\n**中文。 **后文\n~~~",
    "$\\text{**中文。 **后文}$",
    "$$\n\\text{**中文。 **后文}\n$$",
    "<div>\n**中文。 **后文\n</div>",
    '![**图片。 **后文](file.png "**标题。 **后文")',
    '[文档](https://example.com/**路径。** "**标题。 **后文")',
    '[链接][id]\n\n[id]: https://example.com "**标题。 **后文"',
    "https://example.com/**中文。 **后文",
    "<https://example.com/**中文> **后文",
    "**中文\n继续。 **后文",
    "**中文\n\n第二段。 **后文",
    "** 前后空格 **",
    String.raw`\*\*中文。 **后文`,
    "&#42;&#42;中文。 **后文",
    "**English. **following",
  ])("leaves protected or ambiguous source unchanged: %s", (source) => {
    expect(recover(source)).toBe(source);
  });

  it("distinguishes an escaped backslash from an escaped delimiter", () => {
    expect(recover(String.raw`\\**中文。 **后文`)).toBe(String.raw`\\**中文。** 后文`);
    expect(recover(String.raw`\\\**中文。 **后文`)).toBe(String.raw`\\\**中文。 **后文`);
  });
});
