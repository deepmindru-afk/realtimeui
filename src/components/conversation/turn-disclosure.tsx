"use client"

import { describeNote } from "@/components/conversation/notes"
import type { SentPayload } from "@/components/conversation/payload"
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtItem,
  ChainOfThoughtStep,
  ChainOfThoughtTrigger,
} from "@/components/prompt-kit/chain-of-thought"
import { cn } from "@/lib/utils"
import { FileText, Keyboard, Mic, TextQuote } from "lucide-react"

function Line({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
}) {
  return (
    <ChainOfThoughtItem className="flex gap-2">
      <span className="text-muted-foreground/70 mt-0.5 size-3.5 shrink-0">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="text-muted-foreground block text-[11px] tracking-wide uppercase">
          {label}
        </span>
        <span className="text-foreground mt-0.5 block break-words text-sm">
          {children}
        </span>
      </span>
    </ChainOfThoughtItem>
  )
}

/**
 * What actually left the browser for this turn.
 *
 * The app wraps someone else's agent, so the string the user reads and the
 * string the agent receives are not the same: a note is prepended, and a style
 * sentence is appended. That gap is normally invisible, which makes it a
 * liability in an app whose whole output is supposed to be traceable to the
 * notes it was given. So every user turn carries a disclosure of its own, and
 * it is built from the same record the request was assembled from — it
 * describes the dispatch rather than paraphrasing it.
 *
 * The style sentence itself is not in here; it describes the answer, so it is
 * shown under the agent's turn by `TurnStyleDisclosure`.
 *
 * The host opens it while the turn is still in flight, because that is the
 * moment the payload is most interesting, and folds it away once the answer
 * lands unless the reader touched it — which is why `open` is a controlled prop
 * rather than something this panel decides for itself.
 */
export function TurnDisclosure({
  payload,
  open,
  onOpenChange,
  className,
}: {
  payload: SentPayload
  open: boolean
  onOpenChange: (open: boolean) => void
  className?: string
}) {
  return (
    <ChainOfThought className={cn("text-xs", className)}>
      <ChainOfThoughtStep open={open} onOpenChange={onOpenChange}>
        <ChainOfThoughtTrigger
          className="text-xs"
          leftIcon={<TextQuote className="size-3" aria-hidden />}
        >
          Что отправил Портал
        </ChainOfThoughtTrigger>
        <ChainOfThoughtContent>
          {payload.note && (
            <Line icon={<FileText className="size-3" aria-hidden />} label="Заметка в контексте">
              <span className="font-medium">{payload.note.title}</span>
              <span className="text-muted-foreground">
                {" "}
                · {describeNote(payload.note)} · prepended to the request
              </span>
            </Line>
          )}
          <Line
            icon={
              payload.source === "voice" ? (
                <Mic className="size-3" aria-hidden />
              ) : (
                <Keyboard className="size-3" aria-hidden />
              )
            }
            label={payload.source === "voice" ? "Вопрос голосом" : "Вопрос"}
          >
            {payload.question || "—"}
          </Line>
        </ChainOfThoughtContent>
      </ChainOfThoughtStep>
    </ChainOfThought>
  )
}

/**
 * The style the agent was asked to answer in, shown under the answer.
 *
 *  The style sentence rides along with the request, but it is a property of the
 *  answer rather than of the request: it says how long the reply should be, and
 *  the reply is what the reader is looking at. Under the user's turn it read as
 *  something the person had to scroll back up to connect to the paragraph
 *  below, so it lives here instead — the same words, under the answer they
 *  produced.
 *
 *  Carries the request's own `instruction` rather than a flag of its own, so
 *  the two surfaces cannot disagree about what was asked for.
 */
export function TurnStyleDisclosure({
  instruction,
  open,
  onOpenChange,
  className,
}: {
  instruction: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  className?: string
}) {
  return (
    <ChainOfThought className={cn("text-xs", className)}>
      <ChainOfThoughtStep open={open} onOpenChange={onOpenChange}>
        <ChainOfThoughtTrigger
          className="text-xs"
          leftIcon={<TextQuote className="size-3" aria-hidden />}
        >
          Стиль ответа
        </ChainOfThoughtTrigger>
        <ChainOfThoughtContent>
          {/* The trigger already names the style, so the line names the other
              half of the sentence — what the request carried. */}
          <Line
            icon={<TextQuote className="size-3" aria-hidden />}
            label="Приложено к запросу"
          >
            {instruction ? (
              <>
                <span className="text-muted-foreground">
                  Detailed — appended{" "}
                  <span className="text-foreground font-medium">
                    “{instruction}”
                  </span>
                </span>
              </>
            ) : (
              <span className="text-muted-foreground">
                Concise — the request went out as written.
              </span>
            )}
          </Line>
        </ChainOfThoughtContent>
      </ChainOfThoughtStep>
    </ChainOfThought>
  )
}
