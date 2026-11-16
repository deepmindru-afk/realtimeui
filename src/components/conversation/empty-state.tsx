"use client"

import { useAutocompleteSources } from "@/components/autocomplete-sources"
import { PromptSuggestion } from "@/components/prompt-kit/prompt-suggestion"
import { cn } from "@/lib/utils"
import { motion } from "motion/react"

/**
 * What the app is, and three real questions to ask it.
 *
 * The starters come from the same corpora the composer completes against, rather
 * than from a copy of them. That is the whole point of the coupling: a starter an
 * operator can click but not complete toward would be two different sets of
 * questions, and the one only reachable by clicking would be the one nobody
 * finds. This screen shows the list; focusing the composer on an empty draft
 * shows the same list one keystroke away. Reading them from one provider rather
 * than two constants is what keeps that true once the questions are served
 * instead of bundled — a set of starters hardcoded here would drift from the
 * completions the moment the service said something different.
 *
 * Nothing here simulates an answer; they are questions the real agent can be
 * asked.
 *
 * Staggered because three chips arriving together read as a single block, and
 * the point of this screen is that it is a starting point rather than a wall.
 */
export function EmptyState({
  onPick,
  reduce,
  className,
}: {
  onPick: (question: string) => void
  reduce: boolean
  className?: string
}) {
  const { samples } = useAutocompleteSources()
  return (
    <div className={cn("mb-6", className)}>
      <motion.p
        initial={reduce ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduce ? 0 : 0.3, ease: [0.2, 0, 0, 1] }}
        className="text-muted-foreground text-[11px] tracking-[0.08em] uppercase"
      >
        Агент Портала
      </motion.p>
      <motion.h1
        initial={reduce ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          duration: reduce ? 0 : 0.3,
          delay: reduce ? 0 : 0.05,
          ease: [0.2, 0, 0, 1],
        }}
        className="mt-2 text-2xl leading-8 font-medium tracking-tight text-balance"
      >
        Work with your field notes
      </motion.h1>
      <motion.p
        initial={reduce ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          duration: reduce ? 0 : 0.3,
          delay: reduce ? 0 : 0.1,
          ease: [0.2, 0, 0, 1],
        }}
        className="text-muted-foreground mt-2 max-w-md text-sm leading-6"
      >
        Ask a question, talk it through, or drop in a note. Answers quote what
        the notes actually say.
      </motion.p>

      <div className="mt-5 flex flex-wrap gap-2">
        {samples.map((project, index) => (
          <motion.div
            key={project.id}
            initial={reduce ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: reduce ? 0 : 0.3,
              delay: reduce ? 0 : 0.15 + index * 0.05,
              ease: [0.2, 0, 0, 1],
            }}
          >
            <PromptSuggestion
              size="sm"
              className="h-auto min-h-8 rounded-lg text-xs font-normal whitespace-normal"
              onClick={() => onPick(project.question)}
            >
              {project.question}
            </PromptSuggestion>
          </motion.div>
        ))}
      </div>
    </div>
  )
}
