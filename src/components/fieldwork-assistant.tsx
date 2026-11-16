"use client"

import { useAutocompleteSources } from "@/components/autocomplete-sources"
import SidebarNav from "@/components/beautiful-ui/sidebar-nav"
import {
  ConnectPanel,
  type ConnectValues,
} from "@/components/conversation/connect-panel"
import { ConversationFeedback, type ConversationRating } from "@/components/conversation/conversation-feedback"
import {
  ComposerInput,
  ComposerSuggestionList,
  rowId,
} from "@/components/conversation/composer-suggestions"
import { ConversationTurn } from "@/components/conversation/conversation-turn"
import {
  pairAnswerStyles,
  pairDispatches,
  type Dispatch,
} from "@/components/conversation/dispatch"
import { DragOverlay } from "@/components/conversation/drag-overlay"
import { EmptyState } from "@/components/conversation/empty-state"
import { LiveStatus } from "@/components/conversation/live-status"
import { RoomVideo } from "@/components/conversation/room-video"
import { PendingNote as PendingNoteChip } from "@/components/conversation/note-card"
import { noteFromFile, type PendingNote } from "@/components/conversation/notes"
import {
  buildRequest,
  DETAIL_INSTRUCTION,
  type SentPayload,
} from "@/components/conversation/payload"
import { deriveStatus, streamingTurn } from "@/components/conversation/status"
import { WorkingIndicator } from "@/components/conversation/working-indicator"
import { useShowFeedback } from "@/components/feedback-visibility"
import {
  ChatContainerContent,
  ChatContainerRoot,
  ChatContainerScrollAnchor,
} from "@/components/prompt-kit/chat-container"
import { FileUpload, FileUploadTrigger } from "@/components/prompt-kit/file-upload"
import {
  PromptInput,
  PromptInputAction,
  PromptInputActions,
} from "@/components/prompt-kit/prompt-input"
import { ScrollButton } from "@/components/prompt-kit/scroll-button"
import { SystemMessage } from "@/components/prompt-kit/system-message"
import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/ui/theme-toggle"
import { AgentTrackToggle } from "@/components/voice-agents/livekit/agent-track-toggle"
import { expandCommand } from "@/lib/completion/commands"
import { useComposerAutocomplete } from "@/lib/completion/use-composer-autocomplete"
import {
  resolveConnectionParams,
  resolveRoomName,
  type ConnectionParams,
} from "@/lib/livekit/connection-params"
import { useLiveKitChat } from "@/lib/livekit/use-livekit-chat"
import { useRoomMedia } from "@/lib/livekit/use-room-media"
import { sendFile } from "@/lib/send-file"
import { cn } from "@/lib/utils"
import { ArrowUp, AudioLines, Mic, Paperclip, Square, Unplug, Video, VideoOff, X } from "lucide-react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useCallback, useId, useRef, useState, useSyncExternalStore } from "react"

type Session = {
  id: string
  title: string
}

const WORKSPACE = { name: "Портал", monogram: "P" }
/** The data-channel topic a note is published under. The far end has to
 *  subscribe on the same name to see the file, so it is one constant here
 *  rather than a literal at the call site. */
const NOTE_TOPIC = "files"
/* The `?room=` from the address bar, resolved through the same pure helper the
 * transport uses, so the room named here and the room joined there cannot be
 * two different rooms. `""` during the server's prerender, where there is no
 * `window` to read; that then falls through to the random room below, which is
 * what a render with no page behind it wants anyway. */
const PAGE_PARAMS = resolveConnectionParams(
  typeof window === "undefined" ? "" : window.location.search
)
/** `?room=` if the URL named one, otherwise a fresh room per page load, so two
 *  open tabs never land in the same session. Evaluated once at module load,
 *  which is what makes it safe: the transport, the session list, and the
 *  active session all key off this one value and have to agree for the life of
 *  the load. Deliberately a module-level expression and not a `useMemo` or
 *  `useState`, either of which could resolve per render and let the sidebar
 *  disagree with the room actually joined. */
const INITIAL_ROOM = resolveRoomName(
  PAGE_PARAMS.roomName,
  undefined,
  `va_room_${Math.floor(Math.random() * 10_000)}`
)
/** `?agent=`, read through a narrow view of the params so this file still
 *  compiles against a resolver that does not carry the key yet. A URL that names
 *  no agent is already the "no agent named" case, so the absence is the answer
 *  rather than a gap to fill in. */
function agentNameOf(params: ConnectionParams): string {
  return (params as { agentName?: string }).agentName ?? ""
}
/** The page's query string, read as a store rather than during a render.
 *
 *  The third argument is the whole trick: React renders the *server* answer for
 *  the hydration pass and re-renders with the browser's one as soon as it may,
 *  so a caller cannot disagree with its own prerender — which is exactly the
 *  failure `PAGE_PARAMS` above would cause in a form that rendered its boxes.
 *  The subscription never fires: nothing but this page changes the address bar,
 *  and it does so by writing values it already holds. */
const noSearch = () => ""
function pageSearch() {
  return typeof window === "undefined" ? "" : window.location.search
}
function subscribeToNothing() {
  return () => {}
}
/** A query string as the four boxes the connect form opens with: what the link
 *  asked for, and empty strings where it asked for nothing. */
function pageValues(search: string): ConnectValues {
  const params = resolveConnectionParams(search)
  return {
    room: params.roomName,
    identity: params.participantIdentity ?? "",
    name: params.participantName ?? "",
    agent: agentNameOf(params),
  }
}
const MAX_SESSIONS = 12
const UNTITLED_SESSION = "Новый чат"
/** Long enough to read a first question at a glance, short enough to fit a row. */
const TITLE_LIMIT = 40

/**
 * Writes the joined session into the address bar, so the link reproduces it.
 *
 * `replaceState` rather than a navigation: this is bookkeeping, not a page
 * change, and a history entry would put the back button one room away from a
 * live session. A box the operator cleared has its key deleted rather than
 * written blank, so a reload does not resurrect a value someone abandoned, and
 * every other key on the page is left exactly as it was found.
 */
function writeSessionUrl(room: string, values: ConnectValues) {
  if (typeof window === "undefined") return
  const url = new URL(window.location.href)
  url.searchParams.set("room", room)
  for (const [key, value] of [
    ["identity", values.identity],
    ["name", values.name],
    ["agent", values.agent],
  ] as const) {
    if (value) url.searchParams.set(key, value)
    else url.searchParams.delete(key)
  }
  window.history.replaceState(
    null,
    "",
    `${url.pathname}${url.search}${url.hash}`
  )
}

/** Flattens a message into a single-line chat title, cut at the first words. */
function sessionTitle(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim()
  if (!flat) return UNTITLED_SESSION
  return flat.length > TITLE_LIMIT
    ? `${flat.slice(0, TITLE_LIMIT).trimEnd()}…`
    : flat
}

/** Fieldwork assistant wired to a live LiveKit voice + chat agent room. */
export function FieldworkAssistant({
  initialVoice = true,
  className,
}: {
  initialVoice?: boolean
  className?: string
} = {}) {
  const {
    turns,
    connected,
    connecting,
    agentState,
    micEnabled,
    micPending,
    notice: liveNotice,
    error,
    connect,
    send,
    toggleMic,
    setVoiceMode,
    reset,
    audioSinkRef,
    room,
  } = /* `autoConnect: false` is the whole point of the connect form: nothing
   * joins on mount, so the first thing the operator sees is a form they can
   * change the room, the identity and the agent on. */ useLiveKitChat({
    roomName: INITIAL_ROOM,
    autoConnect: false,
  })
  /* Camera and participant video, layered on the room the transport already
   * owns. The video strip only appears once there is something to watch — a
   * camera of our own, or somebody else publishing one — so a text-only
   * conversation does not lose a row of the column to an empty grid. */
  const media = useRoomMedia(room)
  const showVideo =
    media.cameraEnabled || media.feeds.some((feed) => !feed.isLocal && feed.track)
  const [voice, setVoice] = useState(initialVoice)
  const [draft, setDraft] = useState("")
  const [concise, setConcise] = useState(true)
  const [attachment, setAttachment] = useState<PendingNote | null>(null)
  /** Bytes sent so far, 0..1, or `null` when no upload is in flight. `null`
   *  rather than a settled 1 so a finished transfer cannot keep the composer
   *  looking busy on the next render. */
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const uploading = uploadProgress !== null
  const [notice, setNotice] = useState("")
  const [sessions, setSessions] = useState<Session[]>([
    { id: INITIAL_ROOM, title: UNTITLED_SESSION },
  ])
  const [activeRoom, setActiveRoom] = useState(INITIAL_ROOM)
  /* The four boxes the connect form shows, as one derived record.
   *
   * The page URL is the bottom layer and the operator's typing is the top one,
   * which is how the pre-fill arrives without a `setState` in an effect. `search`
   * answers `""` for the server's render *and* for the hydration pass, and the
   * real query string as soon as React is allowed to ask the browser, so both
   * passes produce the same four empty boxes and the values land a frame later —
   * well inside the panel's fade-in, and with no second copy of the URL's
   * decision to keep in step.
   */
  const search = useSyncExternalStore(subscribeToNothing, pageSearch, noSearch)
  const [typed, setTyped] = useState<Partial<ConnectValues>>({})
  const form: ConnectValues = { ...pageValues(search), ...typed }
  /** One-way latch. The form is the pre-connection screen and it must not come
   * back: `reset()` drops `connected` for the length of a reconnect, and a
   * screen that swapped itself out mid-retry would replace the very transcript
   * it is reconnecting.
   *
   * The `&& !joined` on the line below is load-bearing, not decoration.
   * Adjusting state during render is only safe when the update converges, and
   * the convergence IS the `!joined` term. Unguarded, `setJoined(true)` runs on
   * every render pass for as long as `connected` holds, and React's bailout for
   * a same-value update lives in the eager-state path inside `dispatchSetState`
   * — which is skipped outright whenever the fiber already has pending lanes.
   * A render-phase update is precisely such a fiber, so the bailout never
   * applies, every pass schedules another, and the component dies with "Too
   * many re-renders" (#301). Reading `joined` makes the update fire once, on
   * the render that observes the transition; after that the guard is false and
   * the sequence stops. */
  const [joined, setJoined] = useState(false)
  if (connected && !joined) setJoined(true)
  /* The one rating switch, read once here for the same reason the per-answer
     thumbs read it in `ConversationTurn`: the flag is a server answer, not
     something the browser can see for itself, and both surfaces must agree or
     the app has half a feedback feature showing. */
  const showFeedback = useShowFeedback()
  /** The conversation replaces the form once a room has actually been joined,
   * and not before: a failed first attempt keeps the operator on the form with
   * the values they typed, which is the only place they can be corrected. */
  const showSession = joined || connected
  /* Everything below is presentation state. The transport carries none of it:
   * which note travelled with which turn, what a reader thought of an answer,
   * and which disclosures they opened are all things only this view knows. */
  const [dispatches, setDispatches] = useState<Dispatch[]>([])
  const [ratings, setRatings] = useState<Record<number, "helpful" | "not">>({})
  /* Keyed by string rather than turn id, because two disclosures hang off one
   * turn: the payload panel under a user turn, and the style panel under the
   * answer it produced. The `style:` prefix is what keeps them apart — one
   * shared record would have opening one close the other. */
  const [disclosures, setDisclosures] = useState<Record<string, boolean>>({})
  const [sessionRating, setSessionRating] = useState<ConversationRating | null>(
    null
  )
  const attachmentVersion = useRef(0)
  const composer = useRef<HTMLDivElement>(null)
  const reduce = useReducedMotion()
  /** The composer's own textarea, reached the way the rest of this file
   *  already reaches it rather than handed a `ref` it cannot accept: see
   *  `use-composer-autocomplete` on why `PromptInputTextarea` keeps its own. */
  const getTextarea = useCallback(
    () => composer.current?.querySelector("textarea") ?? null,
    []
  )
  const listId = useId()

  const status = deriveStatus({
    agentState,
    connecting,
    voice,
    micEnabled,
    micPending,
  })
  /** The turn being written right now, or null when nothing is in flight. */
  const streaming = streamingTurn(turns, status.working)
  const dispatchByTurn = pairDispatches(turns, dispatches)
  /** The style each answer was produced under, taken from the request ahead of
   * it. Shown under the agent's turn rather than the operator's: the sentence
   * says how long the reply should be, and the reply is what is on screen. */
  const styleByTurn = pairAnswerStyles(turns, dispatchByTurn)
  const answered = turns.some((turn) => turn.role === "assistant")
  /** The request currently on its way to the agent, which is the newest thing
   * the operator said. Only that turn's payload disclosure opens by itself —
   * opening every disclosure the moment the agent starts thinking turns a trace
   * of the request into the loudest thing in the transcript. */
  const inFlightUserId = status.working
    ? (turns.findLast((turn) => turn.role === "user")?.id ?? null)
    : null
  /** The questions and commands the composer completes against, from whichever
   *  side answered — the service `AUTOCOMPLETE_API_URL` names, or the ones
   *  bundled with the app. Read once here because two consumers below need the
   *  same arrays: the composer and the empty state's chips. */
  const sources = useAutocompleteSources()
  /** Autocompletion for the composer: a ghost tail at the caret, or a list of
   *  the sample questions the draft is heading towards. One surface at a time,
   *  and the rule for which one is the hook's — see
   *  `use-composer-autocomplete`.
   *
   *  Off while the agent is answering or a note is on the wire. Both make the
   *  send button unavailable, and a suggestion that offers to change the draft
   *  at the exact moment it cannot be sent is a suggestion that appears to
   *  work and then does not.
   *
   *  `offerSamples` is the empty transcript and nothing else: an untouched
   *  composer mid-conversation is a composer the operator is walking past, and
   *  opening a list of three questions every time they focus it to add a note
   *  to a running thread is the kind of help that gets in the way. On the empty
   *  transcript it is the same three chips the empty state already offers, one
   *  keystroke closer. */
  const autocomplete = useComposerAutocomplete({
    value: draft,
    onChange: setDraft,
    getTextarea,
    disabled: status.working || uploading,
    offerSamples: turns.length === 0,
    /* The same two arrays the empty state's chips come from, handed to the
     * matcher rather than imported by it. One provider means the questions an
     * operator can click and the questions they can complete toward cannot be
     * two different sets, whichever service the deployment is pointed at. */
    samples: sources.samples,
    commands: sources.commands,
  })
  const activeTitle =
    sessions.find((session) => session.id === activeRoom)?.title ?? null
  /* One notice channel, ordered by how badly the reader needs it: a real
   * failure first, then what the transport said, then the composer's own. */
  /* Camera failures ride the same banner as everything else. A denied
   * permission is the one the operator will actually hit, and it needs to say
   * so in the place they already look for problems rather than in a toast. */
  const banner = error ?? liveNotice ?? media.cameraError ?? notice
  const bannerVariant = error ? "error" : liveNotice ? "warning" : "action"
  /** Nothing can leave the browser until a session exists, and `connected` is
   *  the only claim to one the transport actually makes: `status.tone` folds in
   *  the agent's mood, which is not the same fact. */
  const unreachable = !connected || status.tone === "problem" || connecting

  /** First message in a room names it; later messages leave the name alone. */
  const labelActiveSession = (text: string) => {
    setSessions((current) =>
      current.map((session) =>
        session.id === activeRoom && session.title === UNTITLED_SESSION
          ? { ...session, title: sessionTitle(text) }
          : session
      )
    )
  }

  /** Drops the pending note and retires whatever upload owned it, so a byte
   *  count can never outlive the file it is counting. */
  const clearAttachment = () => {
    attachmentVersion.current += 1
    setUploadProgress(null)
    setAttachment(null)
  }

  /** Back to the composer state a fresh room should open with. */
  const clearComposer = () => {
    setVoice(initialVoice)
    setVoiceMode(initialVoice)
    setDraft("")
    setConcise(true)
    clearAttachment()
    setNotice("")
    setDispatches([])
    setRatings({})
    setDisclosures({})
    setSessionRating(null)
  }

  const handleSend = async () => {
    if (status.working || uploading) return
    const question = draft.trim()
    if (!question && !attachment) return
    /* A bare `/summary` is a question the operator did not finish writing, and
     * the agent has never heard of a slash token — it would answer the literal
     * text. Expanding here means the command can be picked, sent on its own, and
     * still say what it means. Anything with words after the command is the
     * operator's own sentence and goes out untouched. Expanded against the same
     * list the menu was drawn from, so a command offered by the service and a
     * command expanded on send cannot be two different things. */
    const asked = expandCommand(question, sources.commands)
    /* Refused here rather than after the send. `send()` is fire-and-forget
     * against a room that may not exist, so dispatching anyway would clear the
     * draft and the typed question would vanish with no turn to show for it. */
    if (unreachable) {
      setNotice("Портал не подключён — ваш вопрос остался здесь.")
      return
    }

    const payload: SentPayload = {
      question: asked,
      source: "text",
      note: attachment?.record ?? null,
      instruction: concise ? null : DETAIL_INSTRUCTION,
    }

    /* The file goes first and on its own, and the question waits for it.
     * `sendFile` resolving is the room saying the bytes arrived, and until then
     * a question about this note would put the agent on the case before it can
     * read what it is being asked about. */
    if (attachment && room) {
      const version = attachmentVersion.current
      setUploadProgress(0)
      try {
        await sendFile(room.localParticipant, attachment.file, {
          topic: NOTE_TOPIC,
          /* The version guard is the same one `attach` uses: a chip removed or a
           * second file picked while these bytes are in the air bumps the
           * counter, and a progress tick for the old file must not land on the
           * new one. */
          onProgress: (value) => {
            if (version !== attachmentVersion.current) return
            setUploadProgress(value)
          },
        })
      } catch {
        if (version !== attachmentVersion.current) return
        setUploadProgress(null)
        /* Nothing goes out and the chip stays, so the same send can simply be
         * pressed again; the question never left the composer either. */
        setNotice("Не удалось отправить заметку — попробуйте ещё раз.")
        return
      }
      /* Moved on underneath us: the room was reset, or another file replaced
       * this one. The text belongs to the turn that no longer exists. */
      if (version !== attachmentVersion.current) return
      setUploadProgress(null)
    }

    /* Recorded only now, once the request is genuinely going out. A dispatch is
     * a promise that something left the browser, and an upload that failed has
     * left nothing — an orphan record would claim the next turn instead. */
    const afterTurnId = turns.reduce((max, turn) => Math.max(max, turn.id), 0)
    setDispatches((current) => [
      ...current,
      {
        key: `${afterTurnId}-${attachment?.record.title ?? "plain"}`,
        afterTurnId,
        payload,
      },
    ])

    void send(
      buildRequest(payload),
      "text",
      /* The local echo is what the transcript shows as the operator's turn, so
       * it has to be the expanded question rather than the slash token: a
       * transcript reading `/summary` above an answer to a sentence is a turn
       * that does not match its own reply. */
      asked || attachment?.record.title || ""
    )
    if (asked) labelActiveSession(asked)
    /* Cleared only if the composer still holds what was sent. The upload is an
     * await, and whatever the operator typed across it is theirs, not a
     * leftover of this turn. */
    setDraft((current) => (current.trim() === question ? "" : current))
    clearAttachment()
    setNotice("")
  }

  const toggleVoice = () => {
    const next = !voice
    setVoice(next)
    setVoiceMode(next)
    setNotice("")
    requestAnimationFrame(() =>
      composer.current?.querySelector("textarea")?.focus()
    )
  }

  /**
   * The form's four boxes, and the room they add up to.
   *
   * The room is resolved here rather than passed through blank, because the
   * form, the session list and the transport all have to name one room and the
   * three read from the same `resolveRoomName` the hook does. The other three
   * go over as they are, blank included: the transport keeps a blank out of the
   * token query, so an empty box reaches the route as a missing key and takes
   * its own default, and it is the only way to *clear* a value the URL supplied
   * — a key left out entirely would fall through to the one the page was opened
   * with, which is not what clearing a box means.
   */
  const handleConnect = (values: ConnectValues) => {
    const room = resolveRoomName(
      values.room.trim(),
      INITIAL_ROOM,
      `va_room_${Date.now()}`
    )
    const identity = values.identity.trim()
    const name = values.name.trim()
    const agent = values.agent.trim()

    /* The form's room box is rewritten to what was actually joined, so it and
     * the rail cannot disagree for the rest of the page's life. */
    setTyped((current) => ({ ...current, room }))
    setActiveRoom(room)
    setSessions((current) =>
      [
        { id: room, title: UNTITLED_SESSION },
        ...current.filter((session) => session.id !== room),
      ].slice(0, MAX_SESSIONS)
    )
    void connect({
      roomName: room,
      participantIdentity: identity,
      participantName: name,
      agentName: agent,
    })
    writeSessionUrl(room, { room, identity, name, agent })
  }

  const handleNewChat = () => {
    const room = `va_room_${Date.now()}`
    /* Before a join, the form is the only thing that can open a room, and the
     * rail cannot open one by itself: joining here would take an identity, a
     * name and an agent the form was built to collect, and would leave the link
     * describing a session nobody chose. So the click moves the form's room
     * instead, and the same three lines that follow keep the rail honest about
     * which room the next press will open. */
    if (!showSession) {
      setTyped((current) => ({ ...current, room }))
      setActiveRoom(room)
      setSessions((current) =>
        [
          { id: room, title: UNTITLED_SESSION },
          ...current.filter((session) => session.id !== room),
        ].slice(0, MAX_SESSIONS)
      )
      return
    }
    reset(room)
    clearComposer()
    setActiveRoom(room)
    setSessions((current) =>
      [
        { id: room, title: UNTITLED_SESSION },
        ...current.filter((session) => session.id !== room),
      ].slice(0, MAX_SESSIONS)
    )
  }

  const handlePickSession = (id: string) => {
    if (id === activeRoom) return
    if (!showSession) {
      setTyped((current) => ({ ...current, room: id }))
      setActiveRoom(id)
      return
    }
    reset(id)
    clearComposer()
    setActiveRoom(id)
  }

  /**
   * A starter is a real question, so it is treated like one: it fills the
   * composer, and it only goes out on its own when there is somewhere for it to
   * go. With no session it would otherwise vanish into a `send()` that quietly
   * does nothing.
   */
  const pickStarter = (question: string) => {
    labelActiveSession(question)
    setDraft(question)
    if (!unreachable) void send(question)
    requestAnimationFrame(() =>
      composer.current?.querySelector("textarea")?.focus()
    )
  }

  /** Accepts the first file, from the picker or from a drop. */
  const attach = async (files: File[]) => {
    const file = files[0]
    if (!file) return
    const version = ++attachmentVersion.current
    /* Whatever was uploading is finished with either way — it succeeds or fails
     * and the bytes are gone. Its progress goes with the version it belonged to,
     * so the composer cannot be left showing a transfer for a file this one has
     * just replaced. */
    setUploadProgress(null)
    try {
      const pending = await noteFromFile(file)
      if (version !== attachmentVersion.current) return
      setAttachment(pending)
      setNotice("")
    } catch (attachError) {
      if (version !== attachmentVersion.current) return
      setNotice(
        attachError instanceof Error
          ? attachError.message
          : "Не удалось приложить эту заметку."
      )
    }
  }

  return (
    <section
      aria-label="Диалог Портала"
      data-conversation-preview
      data-app-example={initialVoice ? "voice" : "chat"}
      className={cn(
        "bg-background text-foreground flex h-dvh min-h-[560px] flex-row",
        className
      )}
    >
      <SidebarNav
        fill
        className="border-border border-r"
        workspace={WORKSPACE}
        navItems={[]}
        workspaceActions={[]}
        recents={sessions.map((session) => ({
          id: session.id,
          label: session.title,
        }))}
        activeTitle={activeTitle}
        activeId={activeRoom}
        onNewChat={handleNewChat}
        onPick={handlePickSession}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-border flex h-14 shrink-0 items-center justify-between gap-3 border-b px-4 sm:px-6">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{WORKSPACE.name}</p>
            <p className="text-muted-foreground truncate text-xs">
              {activeTitle ?? UNTITLED_SESSION}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <ThemeToggle />
          </div>
        </header>

        {/* `overflow-hidden` earns its place. The screen-reader-only text inside
            the transcript — the copy confirmation, the feedback announcement —
            is `position: absolute`, and an absolutely positioned element is
            only clipped by an ancestor that both contains it and clips. The
            scroller does not contain them, so their 1px boxes sat at the far
            end of the content flow and grew the *document* by a thousand-odd
            pixels of nothing: wheeling over the header or the composer scrolled
            the whole shell off screen. Clipping here contains them without
            touching anything a reader can see — tables scroll in their own
            wrapper, and the drag overlay is portaled to `document.body`. */}
        <div className="relative mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col overflow-hidden px-4 sm:px-6">
          {/* One screen in two states. The form and the transcript are the same
              column at the same measure, so the handover is one block moving
              rather than a page changing, and `mode="wait"` lets the form finish
              leaving before the conversation arrives. Only the exit is short: the
              conversation is the thing the operator is waiting to read. */}
          <AnimatePresence mode="wait" initial={false}>
            {showSession ? (
              <motion.div
                key="session"
                initial={reduce ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{
                  duration: reduce ? 0 : 0.26,
                  ease: [0.2, 0, 0, 1],
                }}
                className="flex min-h-0 flex-1 flex-col"
              >
                <ChatContainerRoot
                  data-transcript
                  aria-label="Переписка"
                  className="min-h-0 flex-1"
                >
                  <ChatContainerContent
                    className={cn(
                      "gap-5 px-1 sm:px-2",
                      turns.length === 0 ? "pt-10 pb-4" : "pt-6 pb-4"
                    )}
                  >
                    {turns.length === 0 && (
                      <EmptyState
                        onPick={pickStarter}
                        reduce={Boolean(reduce)}
                      />
                    )}

                    {turns.map((turn) => {
                      const dispatch = dispatchByTurn.get(turn.id)
                      /* A voice turn never went through the composer, so there is no
                       * dispatch record for it: the transcript that arrived on
                       * `lk.transcription` *is* what the agent received, and the
                       * disclosure says so rather than implying a request this app
                       * assembled. */
                      const payload: SentPayload | null =
                        dispatch?.payload ??
                        (turn.role === "user"
                          ? {
                              question: turn.text,
                              source: "voice",
                              note: null,
                              instruction: null,
                            }
                          : null)

                      return (
                        <ConversationTurn
                          key={turn.id}
                          turn={turn}
                          streaming={streaming?.id === turn.id}
                          reduce={Boolean(reduce)}
                          note={dispatch?.payload.note ?? null}
                          payload={payload}
                          /* `has` rather than a lookup, so an answer with no
                           * request ahead of it stays `undefined` and renders
                           * nothing instead of claiming the reply was concise. */
                          styleInstruction={
                            styleByTurn.has(turn.id)
                              ? (styleByTurn.get(turn.id) ?? null)
                              : undefined
                          }
                          styleOpen={disclosures[`style:${turn.id}`] ?? false}
                          onStyleOpenChange={(open) =>
                            setDisclosures((current) => ({
                              ...current,
                              [`style:${turn.id}`]: open,
                            }))
                          }
                          rating={ratings[turn.id] ?? null}
                          onRate={(rating) =>
                            setRatings((current) => {
                              const next = { ...current }
                              if (rating) next[turn.id] = rating
                              else delete next[turn.id]
                              return next
                            })
                          }
                          disclosureOpen={
                            disclosures[String(turn.id)] ??
                            (turn.role === "user" && turn.id === inFlightUserId)
                          }
                          onDisclosureOpenChange={(open) =>
                            setDisclosures((current) => ({
                              ...current,
                              [String(turn.id)]: open,
                            }))
                          }
                        />
                      )
                    })}

                    <AnimatePresence initial={false}>
                      {status.working && (
                        <WorkingIndicator
                          key="working"
                          streaming={streaming !== null}
                        />
                      )}
                    </AnimatePresence>

                    {banner && (
                      <SystemMessage
                        variant={bannerVariant}
                        fill
                        role={bannerVariant === "error" ? "alert" : "status"}
                        cta={error ? { label: "Повторить", onClick: () => reset() } : undefined}
                      >
                        {banner}
                      </SystemMessage>
                    )}

                    {/* The same flag the per-answer thumbs are behind, so the
                        session bar can never appear on its own. The rating state
                        above stays either way — it is inert while nothing renders
                        it, and keeping it makes turning the flag on a matter of
                        configuration rather than a rewrite. */}
                    {answered && showFeedback && (
                      <ConversationFeedback
                        rating={sessionRating}
                        onRate={setSessionRating}
                        onDismiss={() => setSessionRating(null)}
                      />
                    )}

                    {/* A zero-height sticky row: the button tracks the bottom of the
                        scrollport without spending a line of scroll distance on it,
                        and it has to sit under `ChatContainerRoot` because that is
                        where `use-stick-to-bottom` provides its context. */}
                    <div className="pointer-events-none sticky bottom-3 z-10 h-0">
                      <div className="pointer-events-auto absolute right-0 bottom-0">
                        <ScrollButton
                          aria-label="К последнему сообщению"
                          className="bg-card border"
                        />
                      </div>
                    </div>

                    {/* Stick-to-bottom needs a real target at the end of the flow.
                        Without it the scroller measures the last turn, overshoots the
                        viewport, and every streamed append lands off-screen. It is
                        the last child for the same reason: the anchor measures what
                        comes before it, so a zero-height row below it would leave it
                        marking a position the content no longer occupies. */}
                    <ChatContainerScrollAnchor />
                  </ChatContainerContent>
                </ChatContainerRoot>

                {/* Video sits between the transcript and the composer, which is where
                    a person expects it: the conversation stays the tallest thing on
                    screen, and the tiles are what you glance at between turns. */}
                {showVideo && (
                  <div className="shrink-0 pt-3">
                    <RoomVideo feeds={media.feeds} />
                  </div>
                )}

                {/* No `accept`: it filters the OS picker, so leaving a note-shaped
                    list on it would grey out every file the room can actually
                    carry. What a file is gets decided from its bytes, in
                    `noteFromFile`, and the only rule left is the size cap. */}
                <FileUpload
                  onFilesAdded={(files) => void attach(files)}
                  multiple={false}
                >
                  <motion.div
                    ref={composer}
                    layout="position"
                    data-composer-position
                    transition={{ duration: reduce ? 0 : 0.3, ease: [0.2, 0, 0, 1] }}
                    className="relative w-full shrink-0 pb-4"
                  >
                    <LiveStatus status={status} voice={voice} className="pb-3" />

                    <PromptInput
                      data-composer
                      value={draft}
                      onValueChange={setDraft}
                      /* Enter goes through the autocompletion first, because
                       * this is the only hook that runs before
                       * `PromptInputTextarea` has already called `onSubmit` —
                       * a key handler cannot take a submission back. With a list
                       * up, Enter takes the highlighted row and the message
                       * waits; with nothing suggested it sends, as it always
                       * did. */
                      onSubmit={() => {
                        if (!autocomplete.onEnter()) void handleSend()
                      }}
                      isLoading={status.working}
                      maxHeight={144}
                      className="bg-card focus-within:ring-ring rounded-xl p-2 focus-within:ring-1"
                    >
                      {attachment && (
                        <div className="mb-2 flex">
                          <PendingNoteChip
                            note={attachment.record}
                            progress={uploadProgress ?? undefined}
                            /* The remove handler is withheld while the bytes are in
                             * the air: the file is already on the wire, and a chip the
                             * operator could pull mid-upload would leave the question
                             * pointing at something that is still arriving. */
                            {...(uploading ? {} : { onRemove: clearAttachment })}
                          />
                        </div>
                      )}
                      {/* The composer is a combobox over the sample list: the
                          list is a popup it owns, the ghost is not one (it is
                          not focusable and there is nothing to land on), and
                          `aria-autocomplete` is left off rather than guessed at
                          because a screen reader announcing "inline completion"
                          for a list that is not there is worse than silence. */}
                      <ComposerInput
                        data-conversation-input
                        aria-label="Сообщение"
                        role="combobox"
                        aria-expanded={autocomplete.listOpen}
                        aria-controls={autocomplete.listOpen ? listId : undefined}
                        aria-activedescendant={
                          autocomplete.listOpen
                            ? rowId(listId, autocomplete.activeIndex)
                            : undefined
                        }
                        placeholder={
                          unreachable
                            ? "Портал не подключён…"
                            : voice
                              ? "Продолжайте печатать, голос включён…"
                              : "Спросите о полевых заметках…"
                        }
                        /* No padding or size here: `ComposerInput` owns them in
                         * the one constant its ghost layer also reads, and a
                         * second copy is a second thing to forget. */
                        value={draft}
                        ghost={autocomplete.ghost}
                        onFocus={autocomplete.onFocus}
                        onBlur={autocomplete.onBlur}
                        /* The capture prop, deliberately: `onKeyDown` would
                         * replace the one that turns Enter into a submission,
                         * because `PromptInputTextarea` spreads caller props
                         * after its own. */
                        onKeyDownCapture={autocomplete.onKeyDown}
                      />
                      <PromptInputActions className="justify-between gap-2 pt-1">
                        <div className="flex min-w-0 items-center gap-1">
                          <PromptInputAction tooltip="Добавить файл">
                            <FileUploadTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label="Добавить файл в контекст"
                                className="size-9"
                              >
                                <Paperclip />
                              </Button>
                            </FileUploadTrigger>
                          </PromptInputAction>
                          <PromptInputAction
                            tooltip={
                              concise
                                ? "Подробный ответ"
                                : "Краткий ответ"
                            }
                          >
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              aria-label={concise ? "Краткие ответы" : "Подробные ответы"}
                              aria-pressed={concise}
                              onClick={() => setConcise((value) => !value)}
                              className="text-muted-foreground text-xs"
                            >
                              {concise ? "Кратко" : "Подробно"}
                            </Button>
                          </PromptInputAction>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {voice && (
                            <PromptInputAction
                              tooltip={
                                micEnabled ? "Выключить микрофон" : "Включить микрофон"
                              }
                            >
                              <AgentTrackToggle
                                source="microphone"
                                pressed={micEnabled}
                                pending={micPending}
                                onPressedChange={() => {
                                  if (!micPending) toggleMic()
                                }}
                                aria-label={
                                  micEnabled ? "Выключить микрофон" : "Включить микрофон"
                                }
                              />
                            </PromptInputAction>
                          )}
                          {/* Camera is outside `voice` on purpose. The voice switch is
                              about the microphone and the agent's reply; the camera is
                              about what the room can see, and an operator turning it on
                              does not also want to be talking. */}
                          <PromptInputAction
                            tooltip={
                              media.cameraPending
                                ? "Подключение камеры…"
                                : media.cameraEnabled
                                  ? "Выключить камеру"
                                  : "Включить камеру"
                            }
                          >
                            <Button
                              type="button"
                              variant={media.cameraEnabled ? "secondary" : "outline"}
                              size="icon"
                              disabled={!room || media.cameraPending}
                              aria-pressed={media.cameraEnabled}
                              aria-label={
                                media.cameraEnabled ? "Выключить камеру" : "Включить камеру"
                              }
                              onClick={media.toggleCamera}
                            >
                              {media.cameraEnabled ? (
                                <VideoOff aria-hidden />
                              ) : (
                                <Video aria-hidden />
                              )}
                            </Button>
                          </PromptInputAction>
                          <PromptInputAction
                            tooltip={voice ? "Вернуться к вводу" : "Включить голосовой режим"}
                          >
                            <Button
                              type="button"
                              variant={voice ? "secondary" : "outline"}
                              size="icon"
                              aria-label={
                                voice ? "Выйти из голосового режима" : "Включить голосовой режим"
                              }
                              onClick={toggleVoice}
                            >
                              {voice ? <X /> : <AudioLines />}
                            </Button>
                          </PromptInputAction>
                          <PromptInputAction
                            tooltip={
                              uploading
                                ? "Отправляем заметку…"
                                : status.working
                                  ? "Портал формулирует ответ"
                                  : "Отправить сообщение"
                            }
                          >
                            <Button
                              type="button"
                              size="icon"
                              /* No stop control. The transport cannot interrupt a
                               * turn, so a square promising to stop is a promise the
                               * app cannot keep; the button is simply unavailable for
                               * the length of the reply — and for the length of an
                               * upload, which is the same situation: bytes that are
                               * already on the wire cannot be called back. */
                              disabled={
                                status.working ||
                                uploading ||
                                (!draft.trim() && !attachment)
                              }
                              aria-label={
                                uploading
                                  ? "Отправляем заметку"
                                  : status.working
                                    ? "Ждём, пока Портал закончит"
                                    : "Отправить сообщение"
                              }
                              onClick={() => void handleSend()}
                            >
                              {status.working || uploading ? (
                                <Square className="size-3.5 fill-current" />
                              ) : (
                                <ArrowUp />
                              )}
                            </Button>
                          </PromptInputAction>
                        </div>
                      </PromptInputActions>
                    </PromptInput>
                    {/* A sibling of `PromptInput` rather than a child of it, so
                        the popup is not part of the composer's rounded box and
                        does not inherit its `p-2`. `bottom-full` against the
                        `relative` wrapper above puts it in the gap over the
                        status line rather than over the transcript, which is
                        where a list that changes what the next keystroke means
                        belongs. */}
                    <ComposerSuggestionList
                      listId={listId}
                      matches={autocomplete.matches}
                      activeIndex={autocomplete.activeIndex}
                      onAccept={autocomplete.acceptMatch}
                    />
                    <div ref={audioSinkRef} data-audio-sink hidden />
                  </motion.div>

                  <DragOverlay />
                </FileUpload>
              </motion.div>
            ) : (
              <motion.div
                key="connect"
                initial={reduce ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{
                  duration: reduce ? 0 : 0.2,
                  ease: [0.2, 0, 0, 1],
                }}
                /* The one scrollport the transcript does not own. The column
                 * clips, so a form taller than a short window would otherwise
                 * put its own button out of reach instead of letting it scroll;
                 * on any window that fits, nothing scrolls and no bar appears. */
                className="flex min-h-0 flex-1 flex-col overflow-y-auto"
              >
                <ConnectPanel
                  values={form}
                  onChange={(key, value) =>
                    setTyped((current) => ({ ...current, [key]: value }))
                  }
                  onConnect={handleConnect}
                  connecting={connecting}
                  error={error}
                  notice={liveNotice}
                  reduce={Boolean(reduce)}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* The right-hand chip reports a session, and pre-connection there is
            none to report. "Live realtime session" with an unplugged socket
            underneath it would be a claim the page cannot back for the whole
            time the form is up. */}
        <footer className="text-muted-foreground border-border flex shrink-0 flex-wrap items-center justify-between gap-2 border-t px-4 py-3 text-[11px] sm:px-8">
          <span>
            {showSession
              ? "Живая сессия в реальном времени · Портал · голос и текст."
              : "Портал · сессия не открыта"}
          </span>
          <span className="inline-flex items-center gap-1.5">
            {showSession ? (
              <>
                <Mic className="size-3" aria-hidden />
                {voice ? "Голос включён" : "Только текст"}
              </>
            ) : (
              <>
                <Unplug className="size-3" aria-hidden />
                Не подключено
              </>
            )}
          </span>
        </footer>
      </div>
    </section>
  )
}
