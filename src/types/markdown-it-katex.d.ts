declare module "markdown-it-katex" {
  import type MarkdownIt from "markdown-it";

  const markdownItKatex: (md: MarkdownIt, options?: unknown) => void;
  export default markdownItKatex;
}
