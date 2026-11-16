"use client"

import type { AgentStatus } from "@/components/conversation/status"
import { Shdr13 } from "@/components/voice-agents/orbkit/shdr-13"
import { cn } from "@/lib/utils"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"

const DOT_TONE: Record<AgentStatus["tone"], string> = {
  connecting: "bg-muted-foreground",
  working: "bg-primary",
  live: "bg-primary",
  ready: "bg-muted-foreground",
  muted: "bg-muted-foreground",
  problem: "bg-destructive",
}

/*
  Ion's parameters, retouched for a 36px box. At its own defaults the plasma
  globe is built to be looked AT: its filaments are thinner than a pixel at this
  size, so a dozen streamers average out into one flat violet wash and the
  silhouette dissolves into the black canvas. Measured over the 36px footprint,
  defaults land at a mean luminance of 0.09 — against 0.32 for the cloud this
  replaced — which is a smudge beside a text label rather than an indicator.

  Four knobs, each for the same reason: give the globe a body and a centre that
  survive being 32 pixels across.

    fils 3.6      fewer streamers, so they stay separated instead of aliasing
                  into grain
    sharp 2.2     softer falloff, so an arc is a few pixels wide rather than one
    soft 0.13     the same thing from the other side — a floor under the arc
                  core, so a filament cannot fall between samples and vanish
    coreGain 2.8  a hotter nucleus, the one feature the eye reads at a glance
    exposure 8    a lower tone-map knee, lifting the quiet states most — which
                  is where the strip rests, since the loud ones are not the
                  problem

  The 80px voice panel runs the orb at its own defaults, where the filaments are
  exactly the detail that makes it a plasma globe. These values exist only to
  rescue the size that cannot render them.
*/
const SMALL_ORB_PARAMS = {
  fils: 3.6,
  sharp: 2.2,
  soft: 0.13,
  coreGain: 2.8,
  exposure: 8,
}

/**
 * The one place the agent's state is written down in words.
 *
 * There used to be three indicators — the orb's own label, a bare "Думает…"
 * row in the transcript, and a notice under the composer — each deriving its
 * own idea of what the agent was doing, and each capable of being wrong on its
 * own. This strip takes the single `AgentStatus` record and shows it, and the
 * orb beside it is now amplitude only: it no longer repeats the label, so a
 * change of state moves the orb and the text together instead of announcing the
 * same fact twice.
 *
 * `role="status"` with an atomic label means a screen reader hears each new
 * state once, as a sentence, without reading the dot or the orb.
 */
export function LiveStatus({
  status,
  voice,
  className,
}: {
  status: AgentStatus
  voice: boolean
  className?: string
}) {
  const reduce = useReducedMotion()
  const working = status.tone === "working"

  return (
    <div
      role="status"
      aria-atomic="true"
      data-tone={status.tone}
      className={cn(
        "flex items-center gap-3 px-1 pb-3",
        className
      )}
    >
      <AnimatePresence initial={false}>
        {voice && (
          <motion.div
            key="orb"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: reduce ? 0 : 0.2, ease: [0.2, 0, 0, 1] }}
            className="size-9 shrink-0"
            data-voice-orb
          >
            <Shdr13
              size={36}
              state={status.phase}
              params={SMALL_ORB_PARAMS}
              maxDpr={2}
              pauseOffscreen
              ariaLabel={`Голос Портала: ${status.label.toLowerCase()}`}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <span className="relative flex size-2 shrink-0 items-center justify-center">
        {working && !reduce && (
          <motion.span
            aria-hidden
            className="bg-primary/40 absolute inset-0 rounded-full"
            animate={{ scale: [1, 2.4], opacity: [0.5, 0] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
          />
        )}
        <span
          aria-hidden
          className={cn(
            "size-2 rounded-full",
            DOT_TONE[status.tone],
            working && !reduce && "animate-pulse"
          )}
        />
      </span>

      <p className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-xs">
        <span className="text-foreground font-medium">{status.label}</span>
        <span className="text-muted-foreground truncate">{status.detail}</span>
      </p>
    </div>
  )
}
