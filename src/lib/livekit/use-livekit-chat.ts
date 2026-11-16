"use client"

import {
  ParticipantEvent,
  Room,
  RoomEvent,
  Track,
  type DataPacket_Kind,
  type LocalParticipant,
  type RemoteParticipant,
  type RemoteTrack,
  type TextStreamReader,
} from "livekit-client"
import { useCallback, useEffect, useRef, useState } from "react"

import {
  buildTokenQuery,
  resolveConnectionParams,
  resolveRoomName,
  type ConnectionParams,
} from "./connection-params"
import {
  registerGeolocationRpc,
  type UserLocation,
} from "./geolocation-rpc"

export type AgentState =
  | "connecting"
  | "idle"
  | "listening"
  | "thinking"
  | "speaking"
  | "disconnected"
  | "failed"

export type Turn = {
  id: number
  role: "user" | "assistant"
  text: string
  input: "text" | "voice"
}

export type UseLiveKitChatOptions = {
  /** Room to join on first mount. `reset(roomName)` rejoins a different room.
   *
   *  A `?room=` in the page URL still wins over this: a room typed into the
   *  address bar is explicit intent, where a caller's value is usually a
   *  default it happens to be holding. */
  roomName?: string
  /** Whether to join on mount. Defaults to `true`, so a caller that has not
   *  thought about it keeps the behaviour it always had.
   *
   *  `false` is for a UI that asks which room to join: the hook mounts idle —
   *  `connecting` starts false, no room, no token request — and waits for an
   *  explicit `connect({...})`. A form choosing the room is a better source of
   *  that answer than a mount-time guess. */
  autoConnect?: boolean
}

/** What one connect attempt joins as.
 *
 *  Every field is optional and every field falls back to the page URL's answer,
 *  so a caller can supply just the room, or just the participant identity, and
 *  leave the rest of the link's decision in place. This is the input half of
 *  the same `ConnectionParams` the URL produces — the difference is that
 *  nothing here is re-read per render. */
export type LiveKitConnectionInput = {
  roomName?: string
  participantName?: string
  participantIdentity?: string
  agentName?: string
}

/** Where the browser sends its own text, as a text stream. */
const CHAT_TOPIC = "lk.chat"
/** Where the agent's chat answers arrive, as a raw data packet.
 *
 *  A different channel from the text stream and not interchangeable with it:
 *  chat the agent publishes is a finished message per packet, so there is no
 *  reader to iterate and no `lk.segment_id` to group one by.
 *
 *  Both spellings are accepted because both are in use for this one purpose and
 *  the browser cannot tell which the agent on the other end chose. `lk.chat` is
 *  the topic LiveKit's own text chat uses, so it is the natural one for an agent
 *  publishing chat; `lk-chat-topic` is the name this app agreed with its agent
 *  on. Listening to only one of them shows every answer from an agent that
 *  picked the other as silence, and there is nothing in the room that says
 *  which convention is in play.
 *
 *  The two answers to the same reply — a packet on either topic and the agent's
 *  `lk.transcription` segment — carry the same words, so `handleChatData` drops
 *  a packet whose text is already the last thing the agent said. */
const CHAT_DATA_TOPICS = new Set(["lk.chat", "lk-chat-topic"])
const TRANSCRIPTION_TOPIC = "lk.transcription"
const AGENT_STATE_ATTRIBUTE = "lk.agent.state"
const DEFAULT_ROOM = `va_room_${Math.floor(Math.random() * 10_000)}`
const AGENT_FALLBACK_DELAY = 1600

const AGENT_STATES = [
  "connecting",
  "idle",
  "listening",
  "thinking",
  "speaking",
  "disconnected",
  "failed",
] as const

function parseAgentState(value: string | undefined): AgentState {
  if (value === undefined) return "idle"
  const index = (AGENT_STATES as readonly string[]).indexOf(value)
  return index === -1 ? "idle" : (AGENT_STATES[index] as AgentState)
}

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** The current page's query string, or `""` where there is no page to read.
 *
 *  `"use client"` is not the same as "always in a browser": Next prerenders
 *  client components on the server, where `window` does not exist. Guarding
 *  here means both the room resolution and the participant fall through to the
 *  caller's own defaults during that pass rather than throwing on a global. */
function pageSearch(): string {
  return typeof window === "undefined" ? "" : window.location.search
}

type TokenPayload = {
  state?: string
  token?: string
  url?: string
  room?: string
  identity?: string
  /** Which agent worker the room will dispatch, echoed back by the route.
   *  Absent when neither the request nor `LIVEKIT_AGENT_NAME` named one. */
  agent?: string
  message?: string
}

/**
 * One chat message the agent published on either chat data topic.
 *
 *  Plain UTF-8 is the contract this side can rely on, so a payload that is not
 *  valid UTF-8 or decodes to nothing is dropped rather than shown as an empty
 *  bubble. Anything more structured is a wire format this browser does not know,
 *  and inventing a reader for it here would be a guess about someone else's
 *  sender.
 */
function decodeChatData(payload: Uint8Array): string | null {
  let text: string
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(payload)
  } catch {
    return null
  }
  const trimmed = text.trim()
  return trimmed === "" ? null : trimmed
}

/**
 * Connects to a LiveKit room and drives a voice + text conversation:
 * text chat out on `lk.chat` and in on the data channel under either chat
 * topic, agent/user transcripts on `lk.transcription`, agent state from the
 * `lk.agent.state` participant attribute, and microphone publish/playback.
 */
export function useLiveKitChat({
  roomName: initialRoomName = DEFAULT_ROOM,
  autoConnect = true,
}: UseLiveKitChatOptions = {}) {
  /* What the page URL asked for, read exactly once per mount and then frozen.
   *
   * Not re-read inside `connect()`, deliberately. `reset()` reissues a join
   * token, and re-reading there would let the participant identity or name
   * change underneath a session that is already in flight — the transcript
   * stays put while the participant behind it is reissued. A link is a decision
   * made when the page is opened; every later connect in that page's life
   * should honour it. */
  const [connectionParams] = useState<ConnectionParams>(() =>
    resolveConnectionParams(pageSearch())
  )
  const [turns, setTurns] = useState<Turn[]>([])
  const [connected, setConnected] = useState(false)
  /* Whether a join is in flight, and nothing else: not "has not joined yet".
   * With `autoConnect: false` the mount effect never starts one, so starting
   * `true` would leave a UI that has connected nothing showing a spinner
   * forever. The auto-connecting case is unchanged — the effect sets it again
   * on the next tick, and it was already true when it began. */
  const [connecting, setConnecting] = useState(autoConnect)
  const [agentState, setAgentState] = useState<AgentState>("connecting")
  const [micEnabled, setMicEnabledState] = useState(false)
  const [micPending, setMicPending] = useState(false)
  const [notice, setNotice] = useState("")
  const [error, setError] = useState<string | null>(null)
  /* The live room, published as state rather than kept in the ref alone.
   *
   * `roomRef` is what the transport itself uses, and it is deliberately not
   * reactive — the chat never needed to re-render when the room changed. Video
   * does: a component that wants to publish a camera track or list the other
   * participants has to re-run when the room does. Exposing the same object
   * through state gives that, and `use-room-media` owns the subscription.
   *
   * It is the same instance the ref holds, not a second connection. */
  const [room, setRoom] = useState<Room | null>(null)
  /* The last fix the agent asked this browser for, kept so a UI layer can show
   * it without the agent having to ask twice. It is state, not a ref: nothing
   * renders from the transport today, and the value is cheap and unambiguous to
   * reset when the room is. */
  const [lastLocation, setLastLocation] = useState<UserLocation | null>(null)

  const roomRef = useRef<Room | null>(null)
  const audioSinkRef = useRef<HTMLDivElement | null>(null)
  const ownIdentityRef = useRef<string | null>(null)
  const agentIdentityRef = useRef<string | null>(null)
  const micEnabledRef = useRef(false)
  const sequenceRef = useRef(0)
  const segmentsRef = useRef(new Map<string, number>())
  const finalizedSegmentsRef = useRef(new Set<string>())
  const roomNameRef = useRef(
    /* URL, then the caller's `roomName`, then the random room. The host
     * component resolves its own `INITIAL_ROOM` through the same
     * `resolveRoomName`, so a `?room=` and the room the session list shows
     * cannot drift apart. */
    resolveRoomName(connectionParams.roomName, initialRoomName, DEFAULT_ROOM)
  )
  /* The URL's answer about *who* this browser is, read once beside the room and
   * held in refs for the reason above: a stable ref keeps `connect` free of a
   * dependency on them.
   *
   * Read once, not fixed forever. These are the default a connect falls back
   * to; an explicit `connect({ participantName, ... })` overwrites them, so a
   * form's choice is what the next `reset()` rejoins as rather than something
   * the address bar decides again on the user's behalf. The URL snapshot itself
   * above is never re-read. */
  const participantNameRef = useRef(connectionParams.participantName)
  const participantIdentityRef = useRef(connectionParams.participantIdentity)
  const agentNameRef = useRef(connectionParams.agentName)
  /* `autoConnect` read once for the same reason: it settles what mount does, so
   * re-rendering with a different value must not re-run the mount effect and
   * tear down a room that is already live. Changing it later is what `connect`
   * is for. */
  const autoConnectRef = useRef(autoConnect)
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const unregisterGeolocationRef = useRef<(() => void) | null>(null)

  const clearFallbackTimer = useCallback(() => {
    if (fallbackTimerRef.current) {
      clearTimeout(fallbackTimerRef.current)
      fallbackTimerRef.current = null
    }
  }, [])

  /** Hide the hidden audio sink until it is mounted, and replace its contents on (re)subscribe. */
  const handleTrackSubscribed = useCallback((track: RemoteTrack) => {
    if (track.kind !== Track.Kind.Audio) return
    const sink = audioSinkRef.current
    if (!sink) return
    const element = track.attach()
    sink.replaceChildren()
    sink.append(element)
  }, [])

  /** Live voice turns: accumulate chunk deltas per `lk.segment_id`, finalise on stream end. */
  const handleTextStream = useCallback(
    (reader: TextStreamReader, participantInfo: { identity: string }) => {
      const segmentId = reader.info.attributes?.["lk.segment_id"]
      if (!segmentId) return
      if (finalizedSegmentsRef.current.has(segmentId)) return

      const turnId = ++sequenceRef.current
      const role: Turn["role"] =
        participantInfo.identity === ownIdentityRef.current
          ? "user"
          : "assistant"
      segmentsRef.current.set(segmentId, turnId)

      void (async () => {
        let text = ""
        try {
          for await (const chunk of reader) {
            if (!chunk) continue
            text += chunk
            setTurns((current) => {
              const exists = current.some((turn) => turn.id === turnId)
              if (exists) {
                return current.map((turn) =>
                  turn.id === turnId ? { ...turn, text } : turn
                )
              }
              if (!text.trim()) return current
              return [...current, { id: turnId, role, text, input: "voice" }]
            })
          }
        } catch {
          // Stream broke mid-transcript; keep whatever arrived.
        } finally {
          finalizedSegmentsRef.current.add(segmentId)
          segmentsRef.current.delete(segmentId)
        }
        if (!text.trim()) {
          setTurns((current) => current.filter((turn) => turn.id !== turnId))
          return
        }
        setTurns((current) => {
          /* The same words already on the transcript as the previous agent turn
           * mean this transcript is the echo of a chat data packet rather than a
           * second thing to say. Which of the two lands first is the sender's
           * ordering, not ours, so the check has to live on both arrivals for
           * either order to collapse to one turn. */
          const previous = current
            .filter((turn) => turn.id !== turnId)
            .at(-1)
          if (previous?.role === "assistant" && previous.text.trim() === text.trim()) {
            return current.filter((turn) => turn.id !== turnId)
          }
          return current.map((turn) => (turn.id === turnId ? { ...turn, text } : turn))
        })
      })()
    },
    []
  )

  /** The agent's own chat answers, which arrive as one finished packet each.
   *
   *  A data packet rather than a text stream, so there is no reader to iterate
   *  and nothing to accumulate: the whole message is here, and it belongs in the
   *  transcript as one turn.
   *
   *  The dedupe against the previous turn is what keeps the transcript honest.
   *  An answer the agent also speaks comes over `lk.transcription` as well, and
   *  a reply shown twice reads as a glitch in the agent; `handleTextStream` makes
   *  the same check for the packets that arrive first, so either order collapses
   *  to one turn. Whitespace at the edges is not compared, because the two
   *  senders do not agree on it. */
  const handleChatData = useCallback(
    (
      payload: Uint8Array,
      participant?: RemoteParticipant,
      _kind?: DataPacket_Kind,
      topic?: string
    ) => {
      if (!topic || !CHAT_DATA_TOPICS.has(topic)) return
      if (participant?.identity === ownIdentityRef.current) return
      const text = decodeChatData(payload)
      if (!text) return
      setTurns((current) => {
        const previous = current.at(-1)
        if (previous?.role === "assistant" && previous.text.trim() === text) {
          return current
        }
        return [
          ...current,
          { id: ++sequenceRef.current, role: "assistant", text, input: "text" },
        ]
      })
    },
    []
  )

  const handleAgentAttributesChanged = useCallback(
    (changed: Record<string, string>) => {
      const value = changed[AGENT_STATE_ATTRIBUTE]
      if (typeof value !== "string") return
      setAgentState(parseAgentState(value))
    },
    []
  )

  const considerAgent = useCallback(
    (participant: RemoteParticipant) => {
      if (participant.identity === ownIdentityRef.current) return
      const currentAgentIdentity = agentIdentityRef.current
      if (currentAgentIdentity === participant.identity) return
      const candidateHasState =
        typeof participant.attributes[AGENT_STATE_ATTRIBUTE] === "string"
      const currentAgent = currentAgentIdentity
        ? roomRef.current?.remoteParticipants.get(currentAgentIdentity)
        : undefined
      const currentHasState =
        currentAgent !== undefined &&
        typeof currentAgent.attributes[AGENT_STATE_ATTRIBUTE] === "string"
      // Prefer the remote carrying `lk.agent.state`; otherwise keep/adopt the first remote.
      if (currentAgentIdentity !== null && !(candidateHasState && !currentHasState)) {
        return
      }
      agentIdentityRef.current = participant.identity
      participant.on(
        ParticipantEvent.AttributesChanged,
        handleAgentAttributesChanged
      )
      setAgentState(
        parseAgentState(participant.attributes[AGENT_STATE_ATTRIBUTE])
      )
    },
    [handleAgentAttributesChanged]
  )

  const handleParticipantConnected = useCallback(
    (participant: RemoteParticipant) => {
      considerAgent(participant)
    },
    [considerAgent]
  )

  const handleParticipantDisconnected = useCallback(
    (participant: RemoteParticipant) => {
      if (participant.identity !== agentIdentityRef.current) return
      agentIdentityRef.current = null
      setAgentState("disconnected")
    },
    []
  )

  const handleRoomAttributesChanged = useCallback(
    (
      changed: Record<string, string>,
      participant: RemoteParticipant | LocalParticipant
    ) => {
      if (participant.identity !== agentIdentityRef.current) return
      const value = changed[AGENT_STATE_ATTRIBUTE]
      if (typeof value !== "string") return
      setAgentState(parseAgentState(value))
    },
    []
  )

  const scanForAgent = useCallback(
    (room: Room) => {
      const remotes = [...room.remoteParticipants.values()]
      const attributed = remotes.find(
        (participant) =>
          typeof participant.attributes[AGENT_STATE_ATTRIBUTE] === "string"
      )
      const candidate = attributed ?? remotes[0]
      if (candidate) considerAgent(candidate)
    },
    [considerAgent]
  )

  const attachHandlers = useCallback(
    (room: Room) => {
      room.on(RoomEvent.TrackSubscribed, handleTrackSubscribed)
      room.on(RoomEvent.ParticipantConnected, handleParticipantConnected)
      room.on(RoomEvent.ParticipantDisconnected, handleParticipantDisconnected)
      room.on(
        RoomEvent.ParticipantAttributesChanged,
        handleRoomAttributesChanged
      )
      room.registerTextStreamHandler(TRANSCRIPTION_TOPIC, handleTextStream)
      room.on(RoomEvent.DataReceived, handleChatData)
    },
    [
      handleTrackSubscribed,
      handleParticipantConnected,
      handleParticipantDisconnected,
      handleRoomAttributesChanged,
      handleTextStream,
      handleChatData,
    ]
  )

  const teardown = useCallback(() => {
    clearFallbackTimer()
    // The handler belongs to the participant, so it goes before the room does.
    const unregisterGeolocation = unregisterGeolocationRef.current
    unregisterGeolocationRef.current = null
    unregisterGeolocation?.()
    setLastLocation(null)
    const closing = roomRef.current
    roomRef.current = null
    setRoom(null)
    if (closing) {
      closing.unregisterTextStreamHandler(TRANSCRIPTION_TOPIC)
      closing.off(RoomEvent.DataReceived, handleChatData)
      void closing.disconnect()
    }
    audioSinkRef.current?.replaceChildren()
  }, [clearFallbackTimer, handleChatData])

  /** Joins a room, as the named participant, optionally dispatching a named agent.
   *
   *  Safe to call more than once: each call tears the previous room down first,
   *  which is what `reset()` has always relied on. */
  const connect = useCallback(
    async (input?: LiveKitConnectionInput) => {
      /* The room this hook already settled on (URL, then the caller's
       * `roomName`, then the random room) is the floor, so `connect()` with
       * nothing resolves to the same room the mount effect would have joined
       * rather than a second random one. A room the caller supplies wins over
       * it, and `resolveRoomName` skips a blank either way. */
      const roomName = resolveRoomName(
        input?.roomName,
        roomNameRef.current,
        roomNameRef.current
      )
      /* `??`, so a field the caller did not mention keeps the frozen URL value
       * and only a field it did mention replaces it — an empty string included,
       * which `buildTokenQuery`'s existing blank check turns into an omitted
       * param, so a form submitting a blank name gets the route's own fallback
       * instead of a blank one. Written back into the refs so a later
       * `reset()` rejoins as the same participant, without a second copy of the
       * URL's decision to keep in sync. */
      const participantName =
        input?.participantName ?? participantNameRef.current
      const participantIdentity =
        input?.participantIdentity ?? participantIdentityRef.current
      const agentName = input?.agentName ?? agentNameRef.current

      teardown()
      roomNameRef.current = roomName
      participantNameRef.current = participantName
      participantIdentityRef.current = participantIdentity
      agentNameRef.current = agentName
      setConnecting(true)
      setError(null)
      setNotice("")
      setAgentState("connecting")
      setConnected(false)
      setMicEnabledState(false)
      micEnabledRef.current = false
      setMicPending(false)
      agentIdentityRef.current = null
      ownIdentityRef.current = null
      setLastLocation(null)
      finalizedSegmentsRef.current.clear()
      segmentsRef.current.clear()

      let url: string
      let token: string
      try {
        const response = await fetch(
          // Name, identity and agent only ride along when something supplied
          // them — a `?…` in the URL, or a field on the connect form; left out,
          // the route falls back to `LIVEKIT_ROOM` / a random `user-*` /
          // `LIVEKIT_AGENT_NAME`, which is the behaviour from before the URL
          // was ever consulted.
          `/api/token?${buildTokenQuery({
            roomName,
            participantName,
            participantIdentity,
            agentName,
          })}`
        )
        const payload = (await response.json()) as TokenPayload
        if (
          payload.state !== "ok" ||
          typeof payload.url !== "string" ||
          typeof payload.token !== "string"
        ) {
          setError(
            payload.message ??
              "Портал не настроен — токен для входа не удалось выпустить."
          )
          setNotice(
            "Портал не настроен — задайте LIVEKIT_URL/API_KEY/SECRET в .env.local."
          )
          setAgentState("failed")
          setConnecting(false)
          return
        }
        url = payload.url
        token = payload.token
      } catch (fetchError) {
        setError(
          `Не удалось обратиться к конечной точке токенов Портала (${messageFrom(fetchError)}).`
        )
        setNotice(
          "Портал не настроен — задайте URL/API_KEY/SECRET в .env.local."
        )
        setAgentState("failed")
        setConnecting(false)
        return
      }

      const room = new Room()
      roomRef.current = room
      setRoom(room)
      attachHandlers(room)
      try {
        await room.connect(url, token)
        if (roomRef.current !== room) return
        ownIdentityRef.current = room.localParticipant.identity
        // Registered only once the participant is really in the room — the
        // agent can call the method from its first turn, and the handler has to
        // be there before then.
        unregisterGeolocationRef.current = registerGeolocationRpc(
          room.localParticipant,
          { onLocation: setLastLocation }
        )
        setConnected(true)
        scanForAgent(room)
        clearFallbackTimer()
        fallbackTimerRef.current = setTimeout(() => {
          fallbackTimerRef.current = null
          if (roomRef.current !== room || agentIdentityRef.current) return
          setAgentState("listening")
        }, AGENT_FALLBACK_DELAY)
      } catch (connectError) {
        if (roomRef.current !== room) return
        setConnected(false)
        setAgentState("failed")
        setError(
          `Не удалось войти в комнату Портала «${roomName}». ${messageFrom(connectError)}`
        )
        setNotice(
          "Портал не настроен — задайте PORTAL_URL/API_KEY/SECRET в .env.local."
        )
        void room.disconnect()
      } finally {
        if (roomRef.current === room) setConnecting(false)
      }
    },
    [attachHandlers, scanForAgent, teardown, clearFallbackTimer]
  )

  const send = useCallback(
    async (
      text: string,
      input: Turn["input"] = "text",
      displayText?: string
    ) => {
      const room = roomRef.current
      if (!room) return
      const trimmed = text.trim()
      if (!trimmed) return
      try {
        await room.startAudio()
      } catch {
        // Autoplay unlock is best-effort; the send below is the important part.
      }
      try {
        await room.localParticipant.sendText(trimmed, { topic: CHAT_TOPIC })
      } catch (sendError) {
        setError(`Не удалось отправить сообщение. ${messageFrom(sendError)}`)
        setNotice("Сообщение не отправлено. Попробуйте ещё раз.")
        return
      }
      const rendered = (displayText ?? trimmed).trim()
      if (!rendered) return
      setTurns((current) => [
        ...current,
        { id: ++sequenceRef.current, role: "user", text: rendered, input },
      ])
    },
    []
  )

  const setMicEnabled = useCallback(async (enabled: boolean) => {
    const room = roomRef.current
    if (!room) return
    setMicPending(true)
    try {
      await room.startAudio()
    } catch {
      // Autoplay unlock is best-effort; the mic step below is what matters.
    }
    try {
      await room.localParticipant.setMicrophoneEnabled(enabled)
      micEnabledRef.current = enabled
      setMicEnabledState(enabled)
    } catch {
      micEnabledRef.current = false
      setMicEnabledState(false)
      setNotice("Микрофон недоступен — писать текстом по-прежнему можно.")
    } finally {
      setMicPending(false)
    }
  }, [])

  const toggleMic = useCallback(() => {
    void setMicEnabled(!micEnabledRef.current)
  }, [setMicEnabled])

  const setVoiceMode = useCallback(
    (on: boolean) => {
      void setMicEnabled(on)
    },
    [setMicEnabled]
  )

  const reset = useCallback(
    (roomName?: string) => {
      setTurns([])
      setError(null)
      setNotice("")
      setAgentState("connecting")
      // No participant input: rejoin as whoever this hook last connected as,
      // which is the URL's answer unless a form overrode it. The room itself is
      // omitted rather than re-resolved so the one already joined is reused.
      void connect(roomName === undefined ? undefined : { roomName })
    },
    [connect]
  )

  useEffect(() => {
    // `autoConnect: false` is the opt-in to a form-driven session: nothing
    // joins here, and the hook waits for `connect({...})` — so no token is
    // minted and no room is opened before someone has said which one.
    if (autoConnectRef.current) void connect()
    return () => {
      teardown()
      setTurns([])
    }
  }, [connect, teardown])

  return {
    turns,
    connected,
    connecting,
    agentState,
    micEnabled,
    micPending,
    notice,
    error,
    /** The most recent fix this browser gave the agent, or null before the
     *  agent has asked for one. Reset whenever the room is. */
    lastLocation,
    /** Joins a room now, as the named participant and with the named agent.
     *
     *  Every field falls back to the page URL's answer, so a form can pass the
     *  one value the user changed and leave the rest of the link intact; a
     *  field it does pass replaces that value for this and every later connect.
     *  `autoConnect: false` exists for a caller that wants this and nothing
     *  else on mount. */
    connect,
    send,
    toggleMic,
    setVoiceMode,
    reset,
    /** The live room, or null while disconnected. The same instance the
     *  transport uses; `use-room-media` layers camera and video on top of it. */
    room,
    /** Ref for the hidden `<div data-audio-sink hidden />` rendered by the host component. */
    audioSinkRef,
  }
}
