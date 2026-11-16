"use client"

import {
  Room,
  RoomEvent,
  Track,
  type LocalTrack,
  type Participant,
  type RemoteTrack,
} from "livekit-client"
import { useCallback, useEffect, useMemo, useState } from "react"

/**
 * Camera publishing and participant video, layered on a room someone else owns.
 *
 * This hook deliberately does not create or connect a room. `use-livekit-chat`
 * already owns the connection, the audio sink and the agent handshake, and
 * opening a second one would mean two `Room` objects racing for the same
 * session. So this takes the room as an argument and only ever reads from it.
 *
 * State is derived, never mirrored. The room events do nothing but bump a
 * revision counter, and the feed list is recomputed from the room's current
 * truth on each render. That is the shape that does not rot: a mirrored list
 * has to be patched on every one of the eight event types below, and any event
 * added to LiveKit later becomes a silent gap in it. A counter cannot drift,
 * because it holds no data of its own.
 *
 * Agent detection reads the same `lk.agent.state` participant attribute the
 * transport keys on, rather than `Participant.kind`. That enum is a protobuf
 * value, and reusing the attribute the room already agrees on means "who is the
 * agent" has one answer in this app instead of two that could disagree.
 */

/** Mirrors `AGENT_STATE_ATTRIBUTE` in `use-livekit-chat`. Kept as a literal
 *  rather than exported from there because that module is the transport and
 *  this is a view concern; a participant carrying this attribute is the agent. */
const AGENT_STATE_ATTRIBUTE = "lk.agent.state"

export type VideoFeed = {
  /** Participant identity — stable for the life of the connection. */
  id: string
  name: string
  isLocal: boolean
  isAgent: boolean
  /** True when the publication exists but the track is muted, so a tile can say
   *  "camera off" rather than vanishing and reflowing the grid. */
  cameraOff: boolean
  /** The camera track, or null when the participant has not published one. */
  track: LocalTrack | RemoteTrack | null
}

function cameraTrackOf(participant: Participant): {
  track: LocalTrack | RemoteTrack | null
  cameraOff: boolean
} {
  const publication = participant.getTrackPublication(Track.Source.Camera)
  /* No publication at all and a muted publication are different states: the
   * first means "no camera", the second means "a camera that is switched off".
   * Collapsing them would make a muted camera look like a missing one. */
  if (!publication) return { track: null, cameraOff: true }
  if (publication.isMuted) return { track: null, cameraOff: true }
  const track = publication.track
  return { track: (track as LocalTrack | RemoteTrack | undefined) ?? null, cameraOff: false }
}

function buildFeeds(room: Room): VideoFeed[] {
  const feeds: VideoFeed[] = []
  const local = room.localParticipant
  const localCamera = cameraTrackOf(local)
  feeds.push({
    id: local.identity,
    name: local.name || local.identity,
    isLocal: true,
    isAgent: false,
    cameraOff: localCamera.cameraOff,
    track: localCamera.track,
  })
  for (const participant of room.remoteParticipants.values()) {
    const camera = cameraTrackOf(participant)
    feeds.push({
      id: participant.identity,
      name: participant.name || participant.identity,
      isLocal: false,
      isAgent: participant.attributes?.[AGENT_STATE_ATTRIBUTE] !== undefined,
      cameraOff: camera.cameraOff,
      track: camera.track,
    })
  }
  /* The agent first among the remotes, then a stable order by identity, so a
   * participant joining does not reshuffle the whole grid. */
  return feeds.sort((a, b) => {
    if (a.isLocal !== b.isLocal) return a.isLocal ? 1 : -1
    if (a.isAgent !== b.isAgent) return a.isAgent ? -1 : 1
    return a.id.localeCompare(b.id)
  })
}

/** Every event that can change what a tile should render. */
const WATCHED_EVENTS = [
  RoomEvent.ParticipantConnected,
  RoomEvent.ParticipantDisconnected,
  RoomEvent.TrackSubscribed,
  RoomEvent.TrackUnsubscribed,
  RoomEvent.TrackMuted,
  RoomEvent.TrackUnmuted,
  RoomEvent.LocalTrackPublished,
  RoomEvent.LocalTrackUnpublished,
  RoomEvent.ConnectionStateChanged,
] as const

export type UseRoomMedia = {
  /** Whether this browser is publishing a camera track right now. */
  cameraEnabled: boolean
  /** A publish is in flight — the permission prompt is open or the track is
   *  still negotiating. The button stays disabled so it cannot be spammed. */
  cameraPending: boolean
  cameraError: string | null
  /** Local first, then remotes with the agent ahead of the humans. */
  feeds: VideoFeed[]
  /** Remotes only, which is what a "who else is here" count wants. */
  remoteCount: number
  toggleCamera: () => void
  clearCameraError: () => void
}

export function useRoomMedia(room: Room | null): UseRoomMedia {
  const [revision, setRevision] = useState(0)
  const [cameraEnabled, setCameraEnabled] = useState(false)
  const [cameraPending, setCameraPending] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)

  /* Re-derive on every event instead of patching a list. See the note at the
   * top of the file: the counter holds no data, so there is nothing to drift. */
  useEffect(() => {
    if (!room) return
    const bump = () => setRevision((value) => value + 1)
    for (const event of WATCHED_EVENTS) {
      room.on(event, bump)
    }
    bump()
    return () => {
      for (const event of WATCHED_EVENTS) {
        room.off(event, bump)
      }
    }
  }, [room])

  /* A new room means a new session: any camera state from the previous one is
   * a lie now. Reset on identity rather than on every render. */
  useEffect(() => {
    setCameraEnabled(false)
    setCameraPending(false)
    setCameraError(null)
  }, [room])

  const feeds = useMemo(
    () => (room ? buildFeeds(room) : []),
    // `room` plus the counter is the whole dependency set. `room` is in the
    // list as well so the first render after a join is not left empty.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [room, revision]
  )

  const toggleCamera = useCallback(() => {
    if (!room) return
    const next = !cameraEnabled
    setCameraPending(true)
    setCameraError(null)
    void room.localParticipant
      .setCameraEnabled(next)
      .then((publication) => {
        setCameraEnabled(next && Boolean(publication))
        setCameraPending(false)
      })
      .catch((error: unknown) => {
        /* A denied permission is the expected failure, not an exception worth
         * alarming about, so it gets a sentence the operator can act on rather
         * than the browser's own wording. */
        setCameraEnabled(false)
        setCameraPending(false)
        setCameraError(
          next
            ? "Не удалось включить камеру — браузер не дал доступ или устройство занято."
            : "Не удалось выключить камеру."
        )
        console.warn("[portal] camera toggle failed", error)
      })
  }, [room, cameraEnabled])

  const clearCameraError = useCallback(() => setCameraError(null), [])

  return {
    cameraEnabled,
    cameraPending,
    cameraError,
    feeds,
    remoteCount: feeds.filter((feed) => !feed.isLocal).length,
    toggleCamera,
    clearCameraError,
  }
}
