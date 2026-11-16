"use client"

import { cn } from "@/lib/utils"
import { motion, useReducedMotion } from "motion/react"

/**
 * The placeholder every not-yet-built surface sits in.
 *
 * It has to read as a deliberate gap rather than a broken screen, so it says
 * three things: what this surface is for, that it is not written yet, and
 * exactly which components are going into it. The last one is the useful part
 * — the list is the hand-off note to whoever fills the view in, and keeping it
 * on screen means the shape of the app is legible before any of it is built.
 *
 * Framing is the console's own vocabulary: a dotted ground, two corner ticks
 * placed off-axis rather than all four, and mono micro-labels at the same size
 * the rail uses for its group headings. Motion is a three-step rise with the
 * steps 60ms apart, so the card assembles top-down instead of arriving at once.
 */

/** A 14px dot grid in the border colour, masked to a top-down fade. The mask is
 *  what stops the dots competing with the text: the grid is loudest where the
 *  eyebrow is and gone by the time the chip list starts. */
const DOTTED_GROUND =
  "pointer-events-none absolute inset-0 opacity-60 " +
  "[background-image:radial-gradient(var(--border)_1px,transparent_1px)] " +
  "[background-size:14px_14px] " +
  "[mask-image:linear-gradient(to_bottom,black,transparent_72%)]"

/** One corner tick. The two are placed as a diagonal pair, which is enough to
 *  make the card read as a measured panel rather than a bordered box. */
const TICK = "absolute size-3 border-foreground/25"

export function ViewStub({
  blurb,
  upcoming,
  className,
}: {
  blurb: string
  /** Component names this surface will showcase. */
  upcoming: string[]
  className?: string
}) {
  const reduce = useReducedMotion()

  return (
    <div
      data-view-stub
      className={cn(
        "flex min-h-full w-full flex-col items-center justify-center px-5 py-14 sm:px-8",
        className
      )}
    >
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduce ? 0 : 0.3, ease: [0.2, 0, 0, 1] }}
        className="relative w-full max-w-lg"
      >
        {/* Two ticks, not four. The pair is diagonal, which is enough to make
            the card read as a measured panel rather than a bordered box. */}
        <span aria-hidden className={cn(TICK, "-top-2 -left-2 border-t border-l")} />
        <span
          aria-hidden
          className={cn(TICK, "-right-2 -bottom-2 border-r border-b")}
        />

        <div className="relative overflow-hidden rounded-xl border border-border bg-card px-5 py-6 sm:px-7 sm:py-7">
          <div aria-hidden className={DOTTED_GROUND} />

          <motion.p
            initial={reduce ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduce ? 0 : 0.3, delay: reduce ? 0 : 0.06, ease: [0.2, 0, 0, 1] }}
            className="text-muted-foreground relative font-mono text-[10px] tracking-[0.16em] uppercase"
          >
            ещё не собрано
          </motion.p>

          <motion.p
            initial={reduce ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduce ? 0 : 0.3, delay: reduce ? 0 : 0.12, ease: [0.2, 0, 0, 1] }}
            className="relative mt-2.5 text-lg leading-7 font-medium tracking-tight text-balance"
          >
            Здесь будет показано: {blurb}
          </motion.p>

          <motion.div
            initial={reduce ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduce ? 0 : 0.3, delay: reduce ? 0 : 0.18, ease: [0.2, 0, 0, 1] }}
            className="border-border relative mt-6 border-t pt-4"
          >
            <p className="text-muted-foreground font-mono text-[10px] tracking-[0.16em] uppercase">
              что попадёт внутрь
            </p>
            <ul className="mt-2.5 flex flex-wrap gap-1.5">
              {upcoming.map((name) => (
                <li
                  key={name}
                  className="bg-muted text-muted-foreground rounded-md border border-border px-2 py-1 font-mono text-[11px] leading-4"
                >
                  {name}
                </li>
              ))}
            </ul>
          </motion.div>
        </div>
      </motion.div>
    </div>
  )
}
