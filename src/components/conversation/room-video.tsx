"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { VideoOff } from "lucide-react"
import { AnimatePresence } from "motion/react"

import type { VideoFeed } from "@/lib/livekit/use-room-media"
import { cn } from "@/lib/utils"

import { RoomVideoZoom } from "./room-video-zoom"

/**
 * Participant video: this browser's camera and everyone else's, in one grid.
 *
 * The tiles attach LiveKit's own media elements rather than reimplementing a
 * `<video>` with a stream id. `track.attach()` hands back the element the SDK
 * has already wired to the WebRTC peer connection, including the simulcast
 * layer negotiation, so hand-rolling it would mean re-solving the part that is
 * actually hard. The only thing this component owns is lifetime: an element
 * attached in an effect is detached in that effect's cleanup, which is what
 * keeps a participant leaving from leaking a decoder.
 *
 * A muted camera and an absent one render differently on purpose. "Camera off"
 * is a state the person can change; "no camera" is a fact about their client.
 * Collapsing them makes the grid reflow every time somebody flips a switch.
 *
 * Everybody else's tile opens, and opens onto the same live track rather than
 * onto a picture of it. Your own tile stays a mirror, because a mirror is not
 * something you look at — the ask is about the other people, and making your
 * own face a thing you can click is a small lie about the grid.
 */

export function RoomVideo({
  feeds,
  className,
}: {
  feeds: VideoFeed[]
  className?: string
}) {
  const [zoomedId, setZoomedId] = useState<string | null>(null)
  const closeZoom = useCallback(() => setZoomedId(null), [])

  /* The zoomed feed is looked up rather than remembered. A participant who
   * leaves while their tile is open is a tile whose id stops resolving, so the
   * zoom is gone the moment the grid stops offering it — no effect keeping two
   * lists in step, and nothing left on screen for someone who is not in the
   * room. `AnimatePresence` re-renders the child it removes with that child's
   * last props, so the dismissal still animates and still owns the track it
   * attached until it unmounts. */
  const zoomed = feeds.find((feed) => feed.id === zoomedId) ?? null

  if (feeds.length === 0) return null

  return (
    <>
      <section
        aria-label="Видео участников"
        data-room-video
        className={cn(
          "grid grid-cols-2 gap-2 sm:grid-cols-3",
          /* More than three people and the tiles get unreadable fast, so the grid
           * stops growing and starts wrapping. The chat column is the narrowest
           * part of the shell, so this is the common case, not the exception. */
          feeds.length > 3 && "sm:grid-cols-2",
          className
        )}
      >
        {feeds.map((feed) => (
          <FeedTile
            key={feed.id}
            feed={feed}
            onZoom={feed.isLocal ? undefined : () => setZoomedId(feed.id)}
          />
        ))}
      </section>
      <AnimatePresence>
        {zoomed && <RoomVideoZoom key={zoomed.id} feed={zoomed} onClose={closeZoom} />}
      </AnimatePresence>
    </>
  )
}

function FeedTile({ feed, onZoom }: { feed: VideoFeed; onZoom?: () => void }) {
  const holder = useRef<HTMLDivElement>(null)
  const { track, isLocal, isAgent, cameraOff, name } = feed

  useEffect(() => {
    const container = holder.current
    /* No track, or no mounted node: nothing to attach. The `!container` guard
     * matters because this effect can run before the ref settles on the first
     * paint of a track that arrives with the room. */
    if (!track || !container) return
    /* `attach()` with no argument is the form that creates the element. The
     * overload taking an argument expects an existing media element, not a
     * container to append into, so placement here is this component's job. */
    const media = track.attach()
    /* The local tile is muted for the obvious reason: without it a browser
     * plays your own microphone back at you through the speakers. Remote tiles
     * stay audible because the room already unlocked playback in `send()`. */
    if (isLocal) media.muted = true
    /* `playsInline` is a video-only property, so the base media element does
     * not have it — without the narrow, a camera track on iOS Safari opens in
     * fullscreen instead of staying in its tile. */
    if (media instanceof HTMLVideoElement) media.playsInline = true
    container.replaceChildren(media)
    return () => {
      track.detach(media)
      media.remove()
    }
  }, [track, isLocal])

  return (
    <figure
      className={cn(
        "border-border bg-card relative overflow-hidden rounded-md border",
        /* The "this opens" signal is the tile itself — it lifts and warms its
         * border on hover and on keyboard focus — because a cursor is the one
         * affordance a keyboard user never sees.
         *
         * `has-` rather than `group-` here, and the difference is the whole
         * reason it works: `group-hover:` compiles to a descendant combinator
         * (`.group:hover *`), which styles a child of the group, and this
         * `<figure>` is the group — nothing is its own descendant. `has-[:hover]`
         * compiles to `:has()`, which matches the element itself as soon as the
         * stretched button inside it is hovered or takes keyboard focus. */
        onZoom &&
          "cursor-pointer transition duration-200 ease-out motion-reduce:transition-none has-[:hover]:scale-[1.03] has-[:focus-visible]:scale-[1.03] has-[:hover]:border-ring/70 has-[:focus-visible]:border-ring/70"
      )}
      /* A 4:3 box keeps every tile the same shape, so one participant
       * arriving does not resize the others. */
      data-room-tile={feed.isLocal ? "local" : isAgent ? "agent" : "remote"}
    >
      <div ref={holder} className="aspect-[4/3] w-full [&>video]:h-full [&>video]:w-full [&>video]:object-cover" />

      {cameraOff && (
        <div className="bg-muted text-muted-foreground absolute inset-0 flex flex-col items-center justify-center gap-1.5">
          <VideoOff aria-hidden className="size-4" />
          <span className="max-w-full truncate px-2 text-[11px]">
            {isLocal ? "Камера выключена" : "Камера выключена"}
          </span>
        </div>
      )}

      <figcaption className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-gradient-to-t from-black/70 to-transparent px-2 pt-4 pb-1.5 text-[11px] text-white">
        <span className="min-w-0 flex-1 truncate">
          {isLocal ? "Вы" : name}
          {isAgent && <span className="text-white/70"> · агент</span>}
        </span>
      </figcaption>

      {onZoom && (
        <button
          type="button"
          onClick={onZoom}
          aria-label={`Открыть видео — ${isLocal ? "Вы" : name}${isAgent ? " · агент" : ""}`}
          /* A button stretched over the whole tile rather than a button wrapped
           * around it: a <button> may only hold phrasing content, so it cannot
           * contain this <figure> and its <figcaption> without making the
           * document invalid. Stretched, it still gives the tile one hit area
           * and one tab stop, and it costs the local tile nothing.
           *
           * The focus ring is drawn inward with a negative outline offset, the
           * way shadcn draws it, so the tile's own `overflow-hidden` cannot crop
           * the part of it that falls outside the border. Nothing is switched
           * off: this replaces the browser's outline with the app's. */
          className="focus-visible:outline-ring absolute inset-0 z-10 cursor-pointer rounded-md focus-visible:outline-2 focus-visible:outline-offset-[-3px]"
        />
      )}
    </figure>
  )
}
