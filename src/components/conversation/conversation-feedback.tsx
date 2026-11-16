"use client"

import { FeedbackBar } from "@/components/prompt-kit/feedback-bar"
import { cn } from "@/lib/utils"
import { motion, useReducedMotion } from "motion/react"

export type ConversationRating = "helpful" | "not"

/**
 * `FeedbackBar` ships uncontrolled: it renders three buttons and no state, so on
 * its own it is a row of decorations. The pressed state has to come from
 * outside, and the vendored buttons expose no prop to inject it into — so the
 * wrapper carries the choice as `data-choice` and styles the pressed thumb
 * through an arbitrary descendant variant. Same three buttons, same real
 * handlers, and now the answer to the question is visible.
 *
 * The path into the vendored markup is a descendant, not a child chain:
 * `[&>div>div>button]` is silently dropped, while `[&_button]` compiles. The
 * two thumbs are told apart from the close button by their siblings — a thumb
 * is the first of two buttons in its row, and the close button is the only
 * child of its own — so `:first-of-type:not(:last-child)` reaches the helpful
 * thumb alone and `:last-of-type:not(:first-child)` reaches the other one.
 */
const PRESSED = [
  "data-[choice=helpful]:[&_button:first-of-type:not(:last-child)]:bg-accent",
  "data-[choice=helpful]:[&_button:first-of-type:not(:last-child)]:text-foreground",
  "data-[choice=not]:[&_button:last-of-type:not(:first-child)]:bg-accent",
  "data-[choice=not]:[&_button:last-of-type:not(:first-child)]:text-foreground",
].join(" ")

/**
 * One rating for the conversation as a whole, asked once at the end.
 *
 * Per-turn thumbs are handled by `TurnActions`, which is the right shape for
 * "этот конкретный ответ был неверным". This is the other question — was this
 * session worth having — and it wants the larger, self-contained treatment, so
 * it appears only after there is an answer to have an opinion about.
 *
 * The bar stays mounted once a choice is made rather than being replaced by a
 * thank-you line. That is what makes the pressed thumb above reachable at all:
 * a bar that unmounts on click has no pressed state to show, and the `data-choice`
 * variants would be dead code. The thumbs toggle, so a second click on the same
 * thumb clears the rating, and there is a labelled Undo for anyone who would not
 * guess that.
 *
 * Nothing is transmitted. There is no endpoint for it, so the title reports
 * where the answer went rather than performing a submission that does not exist.
 */
export function ConversationFeedback({
  rating,
  onRate,
  onDismiss,
  className,
}: {
  rating: ConversationRating | null
  onRate: (rating: ConversationRating | null) => void
  onDismiss: () => void
  className?: string
}) {
  const reduce = useReducedMotion()

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      data-choice={rating ?? "none"}
      className={cn(PRESSED, className)}
    >
      <FeedbackBar
        title={
          rating === "helpful"
            ? "Отмечено как полезное — только на этом устройстве."
            : rating === "not"
              ? "Отмечено как бесполезное — только на этом устройстве."
              : "Был ли этот ответ полезен?"
        }
        onHelpful={() => onRate(rating === "helpful" ? null : "helpful")}
        onNotHelpful={() => onRate(rating === "not" ? null : "not")}
        onClose={onDismiss}
      />

      {/* The title changes, but a changed title is silent; this is what a
          screen reader hears when a choice lands. */}
      <p className="sr-only" role="status">
        {rating
          ? `Сохранено только на этом устройстве. ${rating === "helpful" ? "Полезно" : "Не полезно"}.`
          : ""}
      </p>

      {rating && (
        <div className="px-0.5 pt-1.5">
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground rounded text-xs underline underline-offset-2 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            onClick={() => onRate(null)}
          >
            Undo
          </button>
        </div>
      )}
    </motion.div>
  )
}
