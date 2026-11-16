"use client"

import type { NoteRecord } from "@/components/conversation/notes"
import { SentNoteCard } from "@/components/conversation/note-card"
import type { SentPayload } from "@/components/conversation/payload"
import { TurnActions, type TurnRating } from "@/components/conversation/turn-actions"
import {
  TurnDisclosure,
  TurnStyleDisclosure,
} from "@/components/conversation/turn-disclosure"
import { useShowFeedback } from "@/components/feedback-visibility"
import { Message, MessageContent } from "@/components/prompt-kit/message"
import { TextShimmer } from "@/components/prompt-kit/text-shimmer"
import type { Turn } from "@/lib/livekit/use-livekit-chat"
import { cn } from "@/lib/utils"
import { AudioLines } from "lucide-react"
import { motion } from "motion/react"

/**
 * The caret that marks a half-written answer.
 *
 * Appended to the last block of the rendered markdown rather than drawn as a
 * sibling of the text, because only the last block knows where the text
 * actually ends — mid-paragraph, after a table, following a fence.
 *
 * Three things about this string are load-bearing, and each one is a way the
 * obvious version silently renders nothing:
 *
 * 1. The variant is `&>*:last-child`, not `&_.markdown-body>*:last-child`.
 *    `MessageContent markdown` hands its `className` to `Markdown`, which puts
 *    it on the same element as `markdown-body` — so the class carrier *is* the
 *    markdown body, and a descendant selector for it can never match.
 * 2. One `after:` per class token. A chain like `…:after:ml-1.5:after:inline-block`
 *    is not a candidate at all; the parser splits it and the geometry utilities
 *    end up applying to the message instead of to the caret.
 * 3. Every token is a whole literal. The content scanner reads source text, so
 *    `` `${head}:after:ml-1.5` `` never becomes a candidate.
 *
 * `animate-pulse` is stilled for reduced motion by the global block in
 * `styles/agents.css`, so this component needs no media query of its own.
 * Baseline alignment is already what an `inline-block` gets, so it is not
 * spelled out.
 *
 * The `:not()` clause drops the caret when the last block is a table or a code
 * card. Both stream as a single block, so a truncated one really can be last,
 * and a 1px bar hanging under a horizontally scrolling table — or below a code
 * card that is already full-height — reads as a rendering artefact rather than
 * as a cursor. The shimmering "writing" label still carries the signal there.
 */
const STREAMING_CARET = [
  "[&>*:last-child:not(pre):not(.markdown-table-scroll)]:after:content-['']",
  "[&>*:last-child:not(pre):not(.markdown-table-scroll)]:after:inline-block",
  "[&>*:last-child:not(pre):not(.markdown-table-scroll)]:after:ml-1.5",
  "[&>*:last-child:not(pre):not(.markdown-table-scroll)]:after:h-[1.05em]",
  "[&>*:last-child:not(pre):not(.markdown-table-scroll)]:after:w-[0.09em]",
  "[&>*:last-child:not(pre):not(.markdown-table-scroll)]:after:rounded-[1px]",
  "[&>*:last-child:not(pre):not(.markdown-table-scroll)]:after:bg-primary",
  "[&>*:last-child:not(pre):not(.markdown-table-scroll)]:after:animate-pulse",
].join(" ")

/**
 * The classes that carry the user bubble's own settings.
 *
 * `markdown-bubble` is a scope, not a style. `styles/markdown.css` pairs it
 * with `markdown-body` to re-state the flow tokens, the heading scale and the
 * two inset panels for a chip rather than for a column, so a user turn reads as
 * a note and an assistant turn reads as an article out of one type layer. The
 * assistant branch below deliberately does not carry it.
 *
 * `text-sm` is the same 14px the assistant turn inherits from the shell, kept
 * explicit so the bubble does not follow the base size if it moves.
 *
 * There is deliberately no `whitespace-pre-wrap`. The plain-text branch this
 * replaced had it because nothing else preserved a newline; `remark-breaks`
 * already turns every typed newline into a `<br>`, and layering the utility on
 * top of that gives each line a second break, which reads as double spacing. It
 * is the one class that has to stay off.
 */
const USER_BUBBLE = "markdown-bubble text-sm"

/**
 * One turn of the conversation.
 *
 * Both roles go through the markdown renderer, and they still do not look the
 * same. That split used to live in this component — user text was plain, with
 * every markdown construct inert — and it now lives in the stylesheet, as
 * `USER_BUBBLE`. One decision, moved down a layer where the density of a chip
 * can be tuned without the two branches drifting apart.
 *
 * Authorship is therefore carried by shape rather than by inert markup: the
 * right-aligned `bg-secondary` bubble under a `You` header, against an
 * assistant turn that runs the full width of the column with no bubble at all. A
 * `#` typed into a user turn comes out as a 16px label rather than a document
 * title, so it cannot be mistaken for something the agent said.
 *
 * Two consequences worth stating rather than leaving to be rediscovered. A
 * rendered turn is no longer byte-for-byte what was sent, since markdown
 * normalises whitespace and line breaks. And raw HTML in message text is
 * rendered as live markup, without sanitization, by explicit product decision —
 * in both roles. That is a property of the markdown renderer rather than of this
 * component, and nothing downstream filters it, so whoever changes it should
 * know it was chosen and not missed.
 */
export function ConversationTurn({
  turn,
  streaming,
  reduce,
  note,
  payload,
  /* The request's style sentence, shown under the answer rather than under the
   * turn that asked for it. `undefined` means no request has been attributed to
   * this answer yet — the streaming one, most often — and renders nothing;
   * `null` is a known request that went out as typed. */
  styleInstruction,
  styleOpen,
  onStyleOpenChange,
  rating,
  onRate,
  disclosureOpen,
  onDisclosureOpenChange,
  className,
}: {
  turn: Turn
  streaming: boolean
  reduce: boolean
  note: NoteRecord | null
  payload: SentPayload | null
  styleInstruction?: string | null
  styleOpen: boolean
  onStyleOpenChange: (open: boolean) => void
  rating: TurnRating | null
  onRate: (rating: TurnRating | null) => void
  disclosureOpen: boolean
  onDisclosureOpenChange: (open: boolean) => void
  className?: string
}) {
  const isUser = turn.role === "user"
  /* Asked of the provider, not of the environment: the browser cannot read the
     server's variables, and the flag exists to be flipped without a rebuild.
     False until the answer arrives, so an unconfigured deployment shows no
     rating buttons at any point. */
  const showFeedback = useShowFeedback()

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduce ? 0 : 0.28, ease: [0.2, 0, 0, 1] }}
      className={cn("group", className)}
    >
      <Message
        data-turn={turn.id}
        data-input={turn.input}
        data-role={turn.role}
        data-streaming={streaming || undefined}
        aria-busy={streaming || undefined}
        className={cn("w-full", isUser ? "justify-end" : "justify-start")}
      >
        <div
          className={cn(
            "flex min-w-0 flex-col",
            isUser ? "max-w-[85%] items-end" : "w-full"
          )}
        >
          <p
            className={cn(
              "text-muted-foreground mb-1.5 flex items-center gap-1.5 text-[11px]",
              isUser && "flex-row-reverse"
            )}
          >
            <span>{isUser ? "You" : "Portal"}</span>
            {turn.input === "voice" && (
              <span className="inline-flex items-center gap-1">
                <AudioLines className="size-3" aria-hidden />
                Голос
              </span>
            )}
            {streaming && (
              <TextShimmer
                as="span"
                duration={3}
                className="text-muted-foreground text-[11px]"
              >
                writing
              </TextShimmer>
            )}
          </p>

          {isUser ? (
            <div className="min-w-0">
              <MessageContent markdown className={USER_BUBBLE}>
                {turn.text}
              </MessageContent>
              {note && <SentNoteCard note={note} />}
            </div>
          ) : (
            <MessageContent
              markdown
              className={cn(
                "max-w-none bg-transparent p-0",
                streaming && STREAMING_CARET
              )}
            >
              {turn.text}
            </MessageContent>
          )}

          {payload && (
            <TurnDisclosure
              payload={payload}
              open={disclosureOpen}
              onOpenChange={onDisclosureOpenChange}
              className={cn("mt-1.5", isUser ? "mr-0" : "ml-0.5")}
            />
          )}

          {/* The style the agent answered in, under the answer it produced.
              Nothing while the answer is still being written: the request it
              belongs to is the one above, and a disclosure trailing a
              half-sentence describes a turn that has not happened. */}
          {!isUser && styleInstruction !== undefined && !streaming && (
            <TurnStyleDisclosure
              instruction={styleInstruction}
              open={styleOpen}
              onOpenChange={onStyleOpenChange}
              className="mt-1 ml-0.5"
            />
          )}

          {/* Rating is behind a flag, folded into the same condition rather than
              wrapped in something of its own: an answer nobody is asked to rate
              looks exactly like an answer that is not finished yet. */}
          {!isUser && !streaming && showFeedback && (
            <TurnActions
              text={turn.text}
              rating={rating}
              onRate={onRate}
              className="mt-1 ml-0.5 opacity-60 transition-opacity focus-within:opacity-100 group-hover:opacity-100"
            />
          )}
        </div>
      </Message>
    </motion.div>
  )
}
