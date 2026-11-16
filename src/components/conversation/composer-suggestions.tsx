"use client"

import { PromptInputTextarea } from "@/components/prompt-kit/prompt-input"
import type { Suggestion } from "@/lib/completion/use-composer-autocomplete"
import { cn } from "@/lib/utils"

/**
 * The two surfaces autocompletion draws on: ghost text at the caret, and the
 * list of matching suggestions above the composer.
 *
 * They are here rather than in `fieldwork-assistant` because both are about
 * how a suggestion *looks*, and the assembly is the one thing the assistant
 * should not have to keep doing correctly. The rule that they never appear
 * together is not here either — it is `use-composer-autocomplete`, which
 * guarantees it by construction. This file renders whichever one it is handed.
 *
 * One list, two kinds of row. A sample and a command are suggestions the same
 * way a button and a link are buttons, and splitting them into two lists would
 * mean two popups, two focus states and two sets of keys on one input. The
 * rows do not look the same — a command is set in the mono face it is typed
 * in, and a sample is prose — and the difference is the whole reason you can
 * tell at a glance which corpus you are looking at.
 */

/**
 * The classes the ghost layer and the textarea must agree on, character for
 * character.
 *
 * A `<textarea>` cannot show text after the caret, so the completion is drawn by
 * a second element underneath it, carrying the draft in `text-transparent` and
 * the tail in a muted colour. That only lines up if both boxes lay their text
 * out identically — same padding, same font, same size at every breakpoint, and
 * the textarea's own `whitespace-pre-wrap` wrapping reproduced by hand.
 *
 * This is the whole list, and it is deliberately not repeated in the caller's
 * `className`. Two copies of the same padding is one copy too many: the day
 * somebody raises the composer's padding and only the textarea's copy moves, the
 * ghost does not slide, it *desynchronises* — grey text that starts a few pixels
 * left of the caret and wraps at a different word. Editing this constant is the
 * only way to change the box, and it changes it for both elements at once.
 */
const GHOST_METRICS =
  "min-h-12 w-full break-words whitespace-pre-wrap px-2 py-2 text-base sm:text-sm"

/**
 * The composer's textarea, with a ghost tail drawn behind it.
 *
 * `aria-hidden` on the mirror because none of it is in the form: the value a
 * screen reader announces is the textarea's own, and a tail that has not been
 * accepted is not part of the message. That is also why accepting is a real
 * key press and not a click on the grey text — the operator commits it or it
 * does not happen.
 */
export function ComposerInput({
  value,
  ghost,
  className,
  ...props
}: {
  /** The draft, for the mirror only. The textarea reads its own value from
   *  `PromptInput`'s context and must not be given one. */
  value: string
  ghost: string
} & Omit<React.ComponentProps<typeof PromptInputTextarea>, "value">) {
  return (
    <div className="relative">
      {ghost ? (
        <div
          aria-hidden
          data-composer-ghost
          className={cn(
            GHOST_METRICS,
            "pointer-events-none absolute inset-0 overflow-hidden"
          )}
        >
          {/* The draft is here only to occupy the width it already occupies in
              the textarea above it, and is invisible so the two cannot double
              up. That is also why a metrics mismatch is silent rather than
              ugly: a drifted ghost does not fight the text, it lands beside
              it. */}
          <span className="text-transparent">{value}</span>
          <span className="text-muted-foreground">{ghost}</span>
        </div>
      ) : null}
      {/* `relative` is load-bearing, not decoration. The mirror is positioned
          and this was not, so the mirror would paint over the textarea — and
          over its caret with it. Two positioned siblings resolve by document
          order, and this one is later. */}
      <PromptInputTextarea
        {...props}
        className={cn("relative", GHOST_METRICS, className)}
      />
    </div>
  )
}

/**
 * The suggestions, as a listbox over the composer.
 *
 * A real listbox rather than a stack of buttons, so the textarea can point at
 * the highlighted row with `aria-activedescendant` instead of moving focus into
 * the list — which is what keeps the caret and the draft alive while the
 * operator arrows through six commands or three questions.
 *
 * `onMouseDown` is prevented on the whole list. Without it the first click
 * blurs the textarea, `onBlur` closes the list, and the click lands on a row
 * that is no longer there.
 */
export function ComposerSuggestionList({
  listId,
  matches,
  activeIndex,
  onAccept,
  className,
}: {
  listId: string
  matches: Suggestion[]
  activeIndex: number
  onAccept: (suggestion: Suggestion) => void
  className?: string
}) {
  if (!matches.length) return null

  /* Labelled by the corpus, because the two lists are not interchangeable: a
   * screen reader announcing "Примеры вопросов" over a list of commands is a
   * lie that costs the operator a second of confusion. */
  const commands = matches[0].kind === "command"

  return (
    <div
      onMouseDown={(event) => event.preventDefault()}
      className={cn(
        "bg-card animate-in fade-in-0 zoom-in-95 absolute inset-x-0 bottom-full z-20 mb-2",
        "border-border overflow-hidden rounded-xl border p-1 shadow-lg",
        "duration-150",
        className
      )}
    >
      <div
        id={listId}
        role="listbox"
        aria-label={commands ? "Команды" : "Примеры вопросов"}
        className="flex flex-col gap-0.5"
      >
        {matches.map((suggestion, index) => {
          const active = index === activeIndex
          return (
            <button
              key={rowKey(suggestion)}
              type="button"
              id={rowId(listId, index)}
              role="option"
              aria-selected={active}
              /* `onMouseDown` is prevented on the container above, which is
               * what keeps the caret here. `onClick` still fires, because
               * preventing the default of mousedown suppresses the focus change
               * and the selection, not the event that follows. */
              onClick={() => onAccept(suggestion)}
              className={cn(
                "hover:bg-accent flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left",
                active && "bg-accent"
              )}
            >
              <span className="min-w-0 flex-1">
                {suggestion.kind === "command" ? (
                  <CommandRow suggestion={suggestion} />
                ) : (
                  <SampleRow suggestion={suggestion} />
                )}
              </span>
              {active ? (
                /* The key, printed. An affordance nobody can discover is an
                 * affordance nobody uses, and this one is invisible until the
                 * row is. */
                <kbd className="text-muted-foreground border-border shrink-0 rounded border px-1 font-mono text-[10px] leading-4">
                  Tab
                </kbd>
              ) : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Stable across the two corpora, so React keeps the row it had. */
function rowKey(suggestion: Suggestion): string {
  return suggestion.kind === "command"
    ? `command:${suggestion.match.key}`
    : `sample:${suggestion.match.id}`
}

/**
 * A slash command, in the face it is typed in.
 *
 * Mono because that is the face the draft's own slash is in, and the hint
 * underneath because a name like `/gaps` says nothing about what it asks for.
 */
function CommandRow({ suggestion }: { suggestion: Suggestion & { kind: "command" } }) {
  const { key, hint, typed } = suggestion.match
  return (
    <>
      <span className="block truncate font-mono text-[13px]">
        <span className="text-muted-foreground">/</span>
        <span className="text-foreground">{key.slice(0, typed)}</span>
        <span className="text-muted-foreground">{key.slice(typed)}</span>
      </span>
      <span className="text-muted-foreground block truncate text-[11px]">
        {hint}
      </span>
    </>
  )
}

/**
 * A sample question, with the project it came from.
 *
 * The bold run is the part the draft already accounts for. It is a hint, not a
 * claim: it says *why* this row matched, which is the one thing a list of three
 * similar-looking questions cannot say by itself. A prefix match bolds from the
 * start, a word match bolds from wherever that word sits.
 */
function SampleRow({ suggestion }: { suggestion: Suggestion & { kind: "sample" } }) {
  const { question, subtitle, start, length } = suggestion.match
  return (
    <>
      <span className="block truncate text-sm">
        {length <= 0 ? (
          question
        ) : (
          <>
            {start > 0 ? (
              <span className="text-muted-foreground">{question.slice(0, start)}</span>
            ) : null}
            <span className="text-foreground font-medium">
              {question.slice(start, start + length)}
            </span>
            <span className="text-muted-foreground">
              {question.slice(start + length)}
            </span>
          </>
        )}
      </span>
      <span className="text-muted-foreground block truncate text-[11px]">
        {subtitle}
      </span>
    </>
  )
}

/** The id a row is addressed by, from the list's own id and the row's index. */
export function rowId(listId: string, index: number): string {
  return `${listId}-row-${index}`
}
