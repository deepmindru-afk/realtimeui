"use client"

import { ThinkingBar } from "@/components/prompt-kit/thinking-bar"
import { cn } from "@/lib/utils"
import { motion, useReducedMotion } from "motion/react"

/**
 * The in-transcript working state, placed where the next turn will appear.
 *
 * It lives inside the transcript rather than above the composer because that is
 * where the answer is going to land, and a progress cue separated from its
 * destination reads as an unrelated event. The wording changes with the one
 * fact that matters — whether any text has arrived yet — because "Thinking" over
 * a paragraph that is visibly growing would be a second, worse description of
 * something already on screen.
 *
 * No stop button. The transport exposes no way to interrupt a turn, and a
 * control that looks like it stops generation while doing nothing is the exact
 * kind of affordance this app should not ship.
 */
export function WorkingIndicator({
  streaming,
  className,
}: {
  streaming: boolean
  className?: string
}) {
  const reduce = useReducedMotion()

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
      transition={{ duration: reduce ? 0 : 0.2, ease: [0.2, 0, 0, 1] }}
      className={cn("pl-0.5", className)}
    >
      <ThinkingBar
        text={
          streaming
            ? "Пишем ответ"
            : "Думаем над вашим вопросом"
        }
      />
    </motion.div>
  )
}
