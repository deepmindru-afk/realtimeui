"use client"

import { MessageAction, MessageActions } from "@/components/prompt-kit/message"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Check, Copy, ThumbsDown, ThumbsUp } from "lucide-react"
import { useState } from "react"

export type TurnRating = "helpful" | "not"

/** How long the confirmation stays up before the button returns to its rest. */
const COPY_FEEDBACK_MS = 2200

const COPY_LABEL = {
  idle: "Копировать исходный Markdown",
  copied: "Copied",
  failed: "Копирование заблокировано",
} as const

const RATING_SAY: Record<TurnRating, string> = {
  helpful: "Отмечено как полезное.",
  not: "Отмечено как бесполезное.",
}

/**
 * The row under an answer: copy it, say whether it helped.
 *
 * Both are real operations. Copy writes the exact markdown to the clipboard and
 * reports the outcome out loud — including the failure case, because a copy
 * button that silently does nothing is worse than no button at all, and a
 * refused clipboard (insecure origin, denied permission) is a real outcome that
 * has to be visible.
 *
 * The rating is a controlled `aria-pressed` pair rather than two icons that look
 * identical whether or not you touched them. Pressing one clears the other, so
 * a turn holds at most one opinion, and pressing it again withdraws it.
 *
 * Ratings are local and volatile, and the interface does not pretend otherwise.
 * There is no server to receive them, so the copy says what happened rather
 * than implying a submission.
 */
export function TurnActions({
  text,
  rating,
  onRate,
  className,
}: {
  text: string
  rating: TurnRating | null
  onRate: (rating: TurnRating | null) => void
  className?: string
}) {
  const [copyState, setCopyState] = useState<keyof typeof COPY_LABEL>("idle")

  const copy = async () => {
    let state: keyof typeof COPY_LABEL = "copied"
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      state = "failed"
    }
    setCopyState(state)
    setTimeout(() => setCopyState("idle"), COPY_FEEDBACK_MS)
  }

  const say =
    copyState === "copied"
      ? "Ответ скопирован как Markdown."
      : copyState === "failed"
        ? "Браузер заблокировал буфер обмена."
        : ""

  return (
    <MessageActions className={cn("gap-0.5", className)}>
      <MessageAction tooltip={COPY_LABEL[copyState]} side="top">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label={COPY_LABEL[copyState]}
          onClick={() => void copy()}
        >
          {copyState === "copied" ? (
            <Check className="text-primary size-3.5" aria-hidden />
          ) : (
            <Copy className="size-3.5" aria-hidden />
          )}
        </Button>
      </MessageAction>

      <MessageAction
        tooltip={rating === "helpful" ? "Withdraw" : "Mark helpful"}
        side="top"
      >
        <Button
          type="button"
          variant={rating === "helpful" ? "secondary" : "ghost"}
          size="icon"
          className="size-7"
          aria-pressed={rating === "helpful"}
          aria-label="Отметить ответ как полезный"
          onClick={() => onRate(rating === "helpful" ? null : "helpful")}
        >
          <ThumbsUp
            className={cn("size-3.5", rating === "helpful" && "fill-current")}
            aria-hidden
          />
        </Button>
      </MessageAction>

      <MessageAction
        tooltip={rating === "not" ? "Withdraw" : "Не полезно"}
        side="top"
      >
        <Button
          type="button"
          variant={rating === "not" ? "secondary" : "ghost"}
          size="icon"
          className="size-7"
          aria-pressed={rating === "not"}
          aria-label="Отметить ответ как бесполезный"
          onClick={() => onRate(rating === "not" ? null : "not")}
        >
          <ThumbsDown
            className={cn("size-3.5", rating === "not" && "fill-current")}
            aria-hidden
          />
        </Button>
      </MessageAction>

      {/* The icon swap and the label change are visual; this is what actually
          reaches a screen reader, and it is the reason either button is not
          merely decorative. */}
      <span role="status" className="sr-only">
        {say}
        {rating ? RATING_SAY[rating] : ""}
      </span>
    </MessageActions>
  )
}
