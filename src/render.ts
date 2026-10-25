import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import rehypeStringify from "rehype-stringify";
import remarkCjkFriendly from "remark-cjk-friendly/parseOnly";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { recoverPaddedCjkStrong } from "./markdown-emphasis";

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkCjkFriendly)
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
  const tree = processor.parse(markdown);
  const renderSource = recoverPaddedCjkStrong(markdown, tree);
  const rendered = await processor.run(renderSource === markdown ? tree : processor.parse(renderSource));
  return processor.stringify(rendered);
}
