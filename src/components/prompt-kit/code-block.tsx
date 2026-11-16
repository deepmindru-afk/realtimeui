"use client"

import { cn } from "@/lib/utils"
import React, { useEffect, useState } from "react"
import { codeToHtml } from "shiki"

/** The two palettes `CodeBlockCode` ships by default: one highlighter pass
 *  emits both, and the stylesheet picks the live one from the theme class. */
const CODE_THEME_LIGHT = "github-light"
const CODE_THEME_DARK = "github-dark"

export type CodeBlockProps = {
  children?: React.ReactNode
  className?: string
} & React.HTMLProps<HTMLDivElement>

function CodeBlock({ children, className, ...props }: CodeBlockProps) {
  return (
    <div
      className={cn(
        // `markdown-code` is this card's way out of the markdown flow rules —
        // the successor to the `not-prose` class, which only ever meant
        // something alongside a typography plugin this app does not install.
        // It also names the surface for `styles/markdown.css`, which gives the
        // card more air than an ordinary block root.
        "markdown-code flex w-full flex-col overflow-clip border",
        "border-border bg-card text-card-foreground rounded-xl",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export type CodeBlockCodeProps = {
  code: string
  language?: string
  /** Explicit single theme. Setting it pins the block to that palette and opts
   *  out of following the host theme. */
  theme?: string
  /** Dark half of the host-following pair. Ignored when `theme` is set. */
  darkTheme?: string
  className?: string
} & React.HTMLProps<HTMLDivElement>

function CodeBlockCode({
  code,
  language = "tsx",
  theme,
  darkTheme,
  className,
  ...props
}: CodeBlockCodeProps) {
  const [highlighted, setHighlighted] = useState<{
    code: string
    html: string
  } | null>(null)

  // Resolved here rather than passed as an object so the effect depends on
  // plain strings — an inline `{ light, dark }` prop would be a new object on
  // every render and re-highlight the block forever.
  const lightTheme = theme ?? CODE_THEME_LIGHT
  const darkThemeName = darkTheme ?? CODE_THEME_DARK
  // One attribute, always present, that says which palette(s) produced the
  // markup: the theme name when one is pinned, `light/dark` when the block is
  // following the host.
  const themeLabel = theme ?? `${lightTheme}/${darkThemeName}`

  useEffect(() => {
    let active = true

    async function highlight() {
      if (!code) {
        setHighlighted({ code, html: "<pre><code></code></pre>" })
        return
      }

      try {
        const html = theme
          ? await codeToHtml(code, { lang: language, theme })
          : // `defaultColor: false` is what makes the pair themeable: shiki
            // emits `--shiki-light` and `--shiki-dark` on every token and
            // paints neither, so one highlight serves both themes and the
            // stylesheet owns the choice.
            await codeToHtml(code, {
              lang: language,
              themes: { light: lightTheme, dark: darkThemeName },
              defaultColor: false,
            })

        if (active) setHighlighted({ code, html })
      } catch {
        // shiki throws on a language it has no grammar for, which a model can
        // emit as a fence tag at any time. The unhighlighted branch below is a
        // perfectly good answer to that, so keep the block readable instead of
        // rejecting into nothing.
        if (active) setHighlighted(null)
      }
    }

    highlight()

    return () => {
      active = false
    }
  }, [code, language, theme, lightTheme, darkThemeName])

  // A streamed block re-lexes into new content under the same React key, so the
  // stored highlight can be one revision behind. Comparing the source it was
  // built from keeps the plain fallback on screen until the matching highlight
  // lands, instead of flashing the previous revision.
  const highlightedHtml =
    highlighted && highlighted.code === code ? highlighted.html : null

  const classNames = cn(
    "w-full overflow-x-auto text-[13px] [&>pre]:px-4 [&>pre]:py-4",
    className
  )

  // SSR fallback: render plain code if not hydrated yet
  return highlightedHtml ? (
    <div
      data-code-theme={themeLabel}
      className={classNames}
      dangerouslySetInnerHTML={{ __html: highlightedHtml }}
      {...props}
    />
  ) : (
    <div data-code-theme={themeLabel} className={classNames} {...props}>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  )
}

export type CodeBlockGroupProps = React.HTMLAttributes<HTMLDivElement>

function CodeBlockGroup({
  children,
  className,
  ...props
}: CodeBlockGroupProps) {
  return (
    <div
      className={cn("flex items-center justify-between", className)}
      {...props}
    >
      {children}
    </div>
  )
}

export { CodeBlockGroup, CodeBlockCode, CodeBlock }
