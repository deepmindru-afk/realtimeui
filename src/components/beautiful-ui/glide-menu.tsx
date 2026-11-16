"use client"

import { cn } from "@/lib/utils"
import {
  useCallback,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react"

/** The sidebar's own easing, so a glide reads at the same pace as a collapse. */
const GLIDE_EASING = "cubic-bezier(0.16, 1, 0.3, 1)"
const GLIDE_DURATION = 220
const GLIDE_FADE = 120

export type GlideMenuProps = {
  children: ReactNode
  /** Classes for the relatively positioned container that owns the highlight. */
  className?: string
  /** Classes for the highlight element that follows the pointer. */
  highlightClassName?: string
  /** Selector matching the rows the pointer highlights. */
  rowSelector?: string
}

/**
 * Lays one highlight under whichever row the pointer is over and glides it
 * there, rather than painting a background on each row on its own — the row
 * underneath never stops moving, so the surface only has to travel.
 *
 * The highlight is `pointer-events-none` and sits at `z-0` under the rows
 * (`z-10`), so a row's own `bg-*` still wins where it needs to: an active row
 * yields to the travelling highlight with `group-hover/glide:bg-transparent`,
 * which is why the container carries the group class. Position and height are
 * written straight to the node, so pointer movement costs no re-render.
 *
 * Because the highlight is a child of this container it travels with the
 * content when a host scrolls the list, and there is nothing to re-sync.
 */
export default function GlideMenu({
  children,
  className,
  highlightClassName,
  rowSelector = "[data-menu-row]",
}: GlideMenuProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const highlightRef = useRef<HTMLDivElement>(null)

  const track = useCallback(
    (target: EventTarget | null) => {
      const container = containerRef.current
      const highlight = highlightRef.current
      if (!container || !highlight || !(target instanceof Element)) return
      const row = target.closest(rowSelector)
      // Pointer is over the container but not over a row (a gap, or the
      // container's own padding): hold the last spot so crossing a seam never
      // makes the highlight twitch.
      if (!row || !container.contains(row)) return
      const box = row.getBoundingClientRect()
      const origin = container.getBoundingClientRect()
      highlight.style.height = `${box.height}px`
      highlight.style.transform = `translateY(${box.top - origin.top}px)`
      highlight.style.opacity = "1"
    },
    [rowSelector]
  )

  const hide = useCallback(() => {
    const highlight = highlightRef.current
    if (highlight) highlight.style.opacity = "0"
  }, [])

  return (
    <div
      ref={containerRef}
      onPointerMove={(event: ReactPointerEvent) => track(event.target)}
      onPointerLeave={hide}
      onPointerCancel={hide}
      className={cn("relative", className)}
    >
      <div
        ref={highlightRef}
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 z-0 h-0 opacity-0",
          highlightClassName
        )}
        style={{
          transition: `transform ${GLIDE_DURATION}ms ${GLIDE_EASING}, height ${GLIDE_DURATION}ms ${GLIDE_EASING}, opacity ${GLIDE_FADE}ms ease`,
        }}
      />
      {children}
    </div>
  )
}
