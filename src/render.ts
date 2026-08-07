import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkMath)
  .use(remarkRehype)
  .use(rehypeHighlight, { plainText: ["mermaid"] })
  .use(rehypeKatex, {
    output: "htmlAndMathml",
    strict: "warn",
    trust: false,
  })
  .use(rehypeStringify);

export async function renderMarkdown(markdown: string): Promise<string> {
  const rendered = await processor.process(markdown);
  return String(rendered);
}
