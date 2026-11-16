"use client"

import { useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import { VideoOff, X } from "lucide-react"
import { motion, useReducedMotion } from "motion/react"

import type { VideoFeed } from "@/lib/livekit/use-room-media"

/**
 * One participant's video, opened over the grid.
 *
 * The track is attached a second time rather than screenshotted, so what opens
 * is the same live stream: someone caught mid-sentence is still mid-sentence a
 * second later. A still image of a talking person is the one thing a video call
 * must never show, and it is also the only version that would survive the
 * participant leaving.
 *
 * The dialog is built out of ordinary elements rather than a native `<dialog>`.
 * The native element brings its own backdrop, its own top layer and its own
 * `::backdrop` rules, none of which speak the tile's visual language, and its
 * open state is a property of the DOM rather than of the room.
 *
 * The modal semantics are built by hand to match: `inert` on everything behind
 * takes the page out of the tab order and out of the accessibility tree in one
 * attribute, and the explicit tab loop below is the guarantee for the strays —
 * a programmatic focus, a browser that has not shipped `inert` — that the
 * browser's own ordering would let through.
 */

/** What can hold focus inside the dialog. The close button is the only such
 *  element today, and a single stop has to loop onto itself to be a trap. */
const FOCUSABLE = 'a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])'

export function RoomVideoZoom({ feed, onClose }: { feed: VideoFeed; onClose: () => void }) {
  const { track, cameraOff, isAgent, isLocal, name } = feed
  const holder = useRef<HTMLDivElement>(null)
  const surface = useRef<HTMLDivElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const still = useReducedMotion() === true
  /* The grid dims the agent's suffix, so the expanded view says the same
   * identity in the same words rather than inventing a second name for it. */
  const who = `${isLocal ? "Вы" : name}${isAgent ? " · агент" : ""}`

  useEffect(() => {
    const container = holder.current
    /* The same rule the tile follows, for the same reason: nothing to attach
     * without a track, and this effect can run before the ref settles. */
    if (!track || !container) return
    const media = track.attach()
    /* The tile under the backdrop is already playing this track unmuted, and
     * one track on two audible elements says the same sentence twice. Muting
     * the expanded copy keeps exactly one of them speaking, which is
     * indistinguishable to the ear and half the decoding. */
    media.muted = true
    /* `playsInline` is video-only, so the base media element does not have it —
     * without the narrow, a phone camera opens in fullscreen over the app. */
    if (media instanceof HTMLVideoElement) media.playsInline = true
    container.replaceChildren(media)
    return () => {
      track.detach(media)
      media.remove()
    }
  }, [track])

  /* Focus in, focus back, scroll locked, background inert. One effect on
   * purpose: the teardown has to put the page back the way it found it before
   * it hands focus to something on it, and a single cleanup cannot get that
   * order wrong the way two effects can. */
  useEffect(() => {
    const opener =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeButton.current?.focus()

    /* Scroll lock, with the scrollbar's own width added back as padding so the
     * page under the backdrop does not slide sideways when the bar goes. The
     * inline values are read first, so a page that arrived with its own lock
     * gets that lock back instead of a reset one. */
    const { body } = document
    const gap = window.innerWidth - document.documentElement.clientWidth
    const overflow = body.style.overflow
    const padding = body.style.paddingRight
    body.style.overflow = "hidden"
    if (gap > 0) body.style.paddingRight = `${gap}px`

    const release = markBackgroundInert(surface.current)

    return () => {
      release()
      body.style.overflow = overflow
      body.style.paddingRight = padding
      /* The participant who opened this can leave while their video is zoomed,
       * in which case the tile that started it is gone and there is nothing to
       * hand focus back to. Dropping focus on the body is honest about that. */
      if (opener?.isConnected) opener.focus()
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose()
        return
      }
      if (event.key !== "Tab") return
      const [first, ...rest] = focusableStops(surface.current)
      const last = rest.pop() ?? first
      if (!first || !last) return
      const active = document.activeElement
      /* Either end of the list wraps to the other, and focus that is somehow
       * outside the dialog is pulled back in rather than left behind it. */
      if (event.shiftKey && (active === first || !surface.current?.contains(active))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (active === last || !surface.current?.contains(active))) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [onClose])

  return createPortal(
    <motion.div
      className="bg-background/85 fixed inset-0 z-50 flex items-center justify-center p-3 backdrop-blur-md sm:p-6"
      initial={still ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      /* Under reduced motion the exit is still declared, only with no duration:
       * an absent exit would leave the presence bookkeeping waiting on an
       * animation that never runs. */
      exit={{ opacity: still ? 1 : 0 }}
      transition={still ? { duration: 0 } : { duration: 0.16, ease: "easeOut" }}
      onClick={(event) => {
        /* Only a press that lands on the backdrop itself dismisses, so clicking
         * the video or the header does not. */
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <motion.div
        ref={surface}
        role="dialog"
        aria-modal="true"
        aria-label={who}
        tabIndex={-1}
        className="border-border bg-card flex max-h-[calc(100dvh-1.5rem)] w-full max-w-5xl flex-col overflow-hidden rounded-lg border shadow-2xl ring-1 ring-white/10"
        initial={still ? false : { opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: still ? 1 : 0, scale: still ? 1 : 0.98, y: still ? 0 : 4 }}
        transition={
          still
            ? { duration: 0 }
            : { type: "spring", stiffness: 420, damping: 34, mass: 0.7 }
        }
      >
        <div className="border-border flex shrink-0 items-center gap-3 border-b px-3 py-2 sm:px-4">
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{who}</span>
          <kbd className="border-border bg-muted text-muted-foreground hidden rounded border px-1.5 py-0.5 font-mono text-[10px] leading-none sm:block">
            Esc
          </kbd>
          <button
            ref={closeButton}
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:ring-ring/50 inline-flex size-8 shrink-0 items-center justify-center rounded-md border transition-colors focus-visible:ring-[3px] focus-visible:outline-none"
          >
            <X aria-hidden className="size-4" />
          </button>
        </div>

        {/* `object-contain` because a phone held upright is a portrait frame,
         * and cropping it to the tile's 4:3 box cuts off the head — the one part
         * of the picture anyone opened this to see. The mat behind the video is
         * the same near-black the tile's caption fades into, so the letterbox
         * reads as a frame around the picture rather than a gap in the layout. */}
        <div className="bg-black/70 relative flex min-h-0 flex-1 items-center justify-center p-2 sm:p-4">
          <div
            ref={holder}
            className="h-full w-full [&>video]:h-full [&>video]:w-full [&>video]:object-contain"
          />
          {/* Present with the camera off as much as present with it on: the tile
           * already treats being in the room as the fact worth showing. */}
          {cameraOff && (
            <div className="bg-muted text-muted-foreground absolute inset-0 flex flex-col items-center justify-center gap-3">
              <VideoOff aria-hidden className="size-8 sm:size-10" />
              <span className="text-sm">Камера выключена</span>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>,
    document.body
  )
}

function focusableStops(root: HTMLElement | null): HTMLElement[] {
  if (!root) return []
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE))
}

/** Puts every layer under the backdrop into `inert`, which is one attribute
 *  doing two jobs: the page leaves the tab order and the accessibility tree at
 *  the same time. `aria-hidden` alone would only do the second, and a page you
 *  can tab through behind a lightbox is a page you can get lost in. */
function markBackgroundInert(dialog: HTMLElement | null): () => void {
  const claimed: HTMLElement[] = []
  for (const child of Array.from(document.body.children)) {
    if (!(child instanceof HTMLElement)) continue
    /* The dialog is portalled into the body, so its own layer is the one child
     * that contains the surface and therefore the one child left alone. */
    if (dialog && child.contains(dialog)) continue
    /* Something that was already inert before this opened is not ours to hand
     * back — putting it live on close would be worse than leaving it alone. */
    if (child.inert) continue
    child.inert = true
    claimed.push(child)
  }
  /* Only the layers claimed here are released, so a toast or another portal
   * that mounted while the zoom was open keeps the state it arrived with. */
  return () => {
    for (const node of claimed) {
      if (node.isConnected) node.inert = false
    }
  }
}
