declare module "markdown-it" {
  type MarkdownItOptions = {
    html?: boolean;
    linkify?: boolean;
    breaks?: boolean;
  };

  export default class MarkdownIt {
    constructor(options?: MarkdownItOptions);
    render(markdown: string): string;
    use(plugin: (md: MarkdownIt, options?: unknown) => void, options?: unknown): MarkdownIt;
  }
}
