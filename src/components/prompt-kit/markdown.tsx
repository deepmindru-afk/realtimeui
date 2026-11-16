import { cn } from "@/lib/utils"
import { marked } from "marked"
import { memo, useId, useMemo } from "react"
import ReactMarkdown, { Components } from "react-markdown"
import rehypeRaw from "rehype-raw"
import remarkBreaks from "remark-breaks"
import remarkGfm from "remark-gfm"
import { CodeBlock, CodeBlockCode } from "./code-block"

/** Plugin lists are module constants, not arrays rebuilt on every render.
 *  `MemoizedMarkdownBlock` exists so a streaming answer re-renders only the
 *  block whose text actually changed; handing `ReactMarkdown` a fresh array
 *  identity each render would defeat the `components` comparison the memo
 *  relies on, so the identity has to be stable. */
const REMARK_PLUGINS = [remarkGfm, remarkBreaks]
const REHYPE_PLUGINS = [rehypeRaw]

/** `rehypeRaw` reparses raw HTML embedded in the markdown source into the
 *  tree, which is what makes a `<br>`, a `<kbd>`, or a small hand-written
 *  `<table>` in a message render as markup instead of being escaped into
 *  visible angle brackets.
 *
 *  It runs as a rehype plugin, after the remark stage has produced hast, and
 *  it is the only rehype plugin in the chain — rehype plugins are
 *  order-sensitive, and with nothing else transforming the tree it has to come
 *  after remark's output is already built and before `rehype-sanitize` would,
 *  were one ever added ahead of it.
 *
 *  **No sanitizer is applied, by deliberate decision.** The consequences are
 *  worth stating precisely, because "no sanitizer" does not mean "everything
 *  runs":
 *
 *  - `<script>` does not execute. React creates elements with
 *    `createElement`, and a `<script>` element built that way never runs —
 *    the same reason react-markdown is not an execution vector on its own.
 *  - `javascript:` URLs are still stripped. react-markdown's built-in
 *    `urlTransform` / default URL sanitization runs regardless of which
 *    rehype plugins are present, and it is not something `rehypeRaw` disables.
 *  - What *is* live: HTML event-handler attributes such as `onerror` on an
 *    `<img>`, plus `src`/`href` pointing anywhere. `rehypeRaw` turns them into
 *    real hast properties, and react-markdown passes properties through to the
 *    elements it creates, so they arrive as live React props.
 *
 *  So message text from an untrusted source can carry attribute-level script
 *  execution, even though it cannot carry a `<script>` block. If that source
 *  ever stops being fully trusted, the fix is to add `rehype-sanitize` to
 *  `REHYPE_PLUGINS` ahead of `rehypeRaw` — not to remove `rehypeRaw`, which
 *  would silently take HTML rendering away again. */
export type MarkdownProps = {
  children: string
  id?: string
  className?: string
  components?: Partial<Components>
}

function parseMarkdownIntoBlocks(markdown: string): string[] {
  const tokens = marked.lexer(markdown)
  return tokens.map((token) => token.raw)
}

function extractLanguage(className?: string): string {
  if (!className) return "plaintext"
  const match = className.match(/language-(\w+)/)
  return match ? match[1] : "plaintext"
}

const INITIAL_COMPONENTS: Partial<Components> = {
  /** Splits react-markdown's single `code` node into the two things it can be.
   *  Inline code is a chip inside a sentence; a fence is a block, and gets the
   *  card treatment from `CodeBlock` with shiki doing the colouring. */
  code: function CodeComponent({ className, children, node, ...props }) {
    const isInline =
      !node?.position?.start.line ||
      node?.position?.start.line === node?.position?.end.line

    if (isInline) {
      /* A real `<code>` element rather than a `<span>`, so the chip is
       * selectable, announced as code, and — the reason it matters here —
       * reachable by the `.markdown-body :not(pre) > code` rule that owns its
       * appearance. A span could only be styled through a class this override
       * invented, which a consumer replacing `code` would then lose.
       *
       * `node` is destructured away rather than spread: it is react-markdown's
       * position metadata, and passing it to the DOM is an unknown-prop
       * warning. */
      return (
        <code className={className} {...props}>
          {children}
        </code>
      )
    }

    const language = extractLanguage(className)

    return (
      <CodeBlock className={className}>
        <CodeBlockCode code={children as string} language={language} />
      </CodeBlock>
    )
  },
  /** react-markdown wraps fenced code in a `<pre>`; the block renderer above
   *  already returns the finished card, so this only has to get out of the way.
   *  `styles/markdown.css` styles the `pre` inside the card for the window
   *  before hydration, when the card holds plain text. */
  pre: function PreComponent({ children }) {
    return <>{children}</>
  },
  /** A table arrives as a bare `<table>`, which cannot scroll: a wide findings
   *  table inside a chat column either stretches the bubble or overflows the
   *  viewport. This is the scroll container, and it means the table itself
   *  stays `display: table` — so `width: 100%` stretches it to the column and
   *  only its min-content width scrolls. `styles/markdown.css` keeps a
   *  `display: block` fallback for consumers who replace this component.
   *
   *  Only `children` crosses over. Everything react-markdown puts on a table
   *  besides children is the `node` position metadata, which is not a DOM
   *  attribute — GFM column alignment and everything else arrives on the cells. */
  table: function TableComponent({ children }: { children?: React.ReactNode }) {
    return (
      <div className="markdown-table-scroll">
        <table>{children}</table>
      </div>
    )
  },
}

const MemoizedMarkdownBlock = memo(
  function MarkdownBlock({
    content,
    components = INITIAL_COMPONENTS,
  }: {
    content: string
    components?: Partial<Components>
  }) {
    return (
      <ReactMarkdown
        remarkPlugins={REMARK_PLUGINS}
        rehypePlugins={REHYPE_PLUGINS}
        components={components}
      >
        {content}
      </ReactMarkdown>
    )
  },
  function propsAreEqual(prevProps, nextProps) {
    return prevProps.content === nextProps.content
  }
)

MemoizedMarkdownBlock.displayName = "MemoizedMarkdownBlock"

function MarkdownComponent({
  children,
  id,
  className,
  components = INITIAL_COMPONENTS,
}: MarkdownProps) {
  const generatedId = useId()
  const blockId = id ?? generatedId
  const blocks = useMemo(() => parseMarkdownIntoBlocks(children), [children])

  /* `markdown-body` carries the whole type layer (styles/markdown.css), so
   * every consumer of this component gets it without asking. It stays first in
   * `cn` so a caller's `className` — the bubble's padding, `text-sm`, the
   * `bg-transparent` an assistant turn uses — still wins on the properties it
   * sets.
   *
   * One container holds every block, and marked gives each top-level token its
   * own `ReactMarkdown`, so the children of this div are the block roots the
   * stylesheet spaces out. */
  return (
    <div className={cn("markdown-body", className)}>
      {blocks.map((block, index) => (
        <MemoizedMarkdownBlock
          key={`${blockId}-block-${index}`}
          content={block}
          components={components}
        />
      ))}
    </div>
  )
}

const Markdown = memo(MarkdownComponent)
Markdown.displayName = "Markdown"

export { Markdown }
