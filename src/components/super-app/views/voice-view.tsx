"use client"

/**
 * Voice: the microphone, the orb, and the session record.
 *
 * This surface deliberately does not open a room. The live LiveKit transport
 * lives on the Chat surface, where it is the whole point; opening a second one
 * here would mean the microphone could be live in two places at once and the
 * operator would have no idea which one they were talking to. So what this view
 * is for is the two things you cannot see on the chat screen: what the agent
 * looks like while it works, and what happened on the previous runs.
 *
 * The state machine that drives the orbs is local and honest — `idle`,
 * `listening`, `thinking` and `talking` are all reachable by pressing something
 * on this page, and none of them pretend a room exists. Where a control would
 * normally say "connect", it says what it would do instead.
 *
 * The orbs are the orbkit shaders, which take a real `state` and synthesise
 * their own volume signals from it, so a state change is a prop flip rather
 * than a set of hand-tuned numbers. The waveform below them is drawn from a
 * fixed amplitude series with plain divs: it is deterministic, so the server
 * and the browser render identical bars and nothing shifts on hydration.
 *
 * Reduced motion is handled by holding every orb at `idle`. Their field still
 * breathes slowly, but the state-driven restlessness that is the actual point
 * of the view is off — and the shape survives, because the shape is the
 * information.
 */

import { useState } from "react"
import { Mic } from "lucide-react"
import { useReducedMotion } from "motion/react"

import { Shdr11 } from "@/components/voice-agents/orbkit/shdr-11"
import { Shdr13 } from "@/components/voice-agents/orbkit/shdr-13"
import { Shdr14 } from "@/components/voice-agents/orbkit/shdr-14"
import { Shdr21 } from "@/components/voice-agents/orbkit/shdr-21"
import {
  VOICE_MODE_LABEL,
  VOICE_SESSIONS,
  ago,
  byNewest,
  clockOf,
  dayShort,
  formatDuration,
  plural,
  type VoiceSession,
} from "@/components/super-app/demo-data"
import { cn } from "@/lib/utils"

type Phase = "idle" | "listening" | "thinking" | "talking"

/** The orb shaders speak in three states. The four phases an operator actually
 *  cares about collapse onto those three: hearing someone is close enough to
 *  thinking that the visual difference is noise, and pretending otherwise would
 *  mean inventing a state the shader has no preset for. */
const ORB_STATE: Record<Phase, "idle" | "thinking" | "speaking"> = {
  idle: "idle",
  listening: "thinking",
  thinking: "thinking",
  talking: "speaking",
}

const PHASE_LABEL: Record<Phase, string> = {
  idle: "Покой — комната закрыта",
  listening: "Слушает микрофон",
  thinking: "Думает",
  talking: "Говорит",
}

/** Fixed amplitudes, so the bars are identical on the server and in the
 *  browser. A `Math.random()` here would be a hydration bug, not a flourish. */
const AMPLITUDE = [
  0.18, 0.42, 0.31, 0.66, 0.52, 0.24, 0.74, 0.39, 0.58, 0.28, 0.81, 0.45,
  0.62, 0.33, 0.7, 0.26, 0.55, 0.36, 0.78, 0.48, 0.29, 0.6, 0.4, 0.72,
  0.22, 0.5, 0.34, 0.68,
]

/** A fixed device list. Enumerating real inputs needs `getUserMedia`, and this
 *  view must not ask for the microphone just to render a select — so the list
 *  is illustrative and says so. */
const DEVICES = [
  { id: "default", label: "Системное устройство по умолчанию" },
  { id: "headset", label: "Гарнитура — офис западного дока" },
  { id: "depot", label: "Встроенный микрофон" },
]

export function VoiceView() {
  const reduce = useReducedMotion()
  const [phase, setPhase] = useState<Phase>("idle")
  const [muted, setMuted] = useState(false)
  const [device, setDevice] = useState(DEVICES[0].id)

  const active = phase !== "idle"
  /* Under reduced motion every orb is pinned to idle regardless of phase. The
   * label still reports the real phase, so the information survives even though
   * the movement does not. */
  const orbState = reduce ? "idle" : ORB_STATE[phase]

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Голос</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Как агент выглядит, пока работает, и что произошло за{" "}
          {VOICE_SESSIONS.length} запусков до этого.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1fr_18rem] lg:items-start">
        <div className="grid min-w-0 gap-4">
          <section
            aria-label="Панель голоса агента"
            className="border-border bg-card flex flex-col items-center gap-5 rounded-xl border p-6 sm:p-8"
          >
            {/* The hero orb. Nimbus is the one that reads at a glance, so it
                gets the space; the other three sit in the row below as
                alternatives rather than competing for the console. */}
            <div className="flex h-40 w-40 items-center justify-center sm:h-48 sm:w-48">
              <Shdr21 size={260} state={orbState} />
            </div>

            {/* The state is spelled out, not just shown. An orb that changes
                shape is invisible to a reader who cannot see it change, and
                this is the one line that tells them what the agent is doing. */}
            <p
              aria-live="polite"
              className="text-foreground flex items-center gap-2 text-sm font-medium"
            >
              <Mic aria-hidden className="size-4" />
              {PHASE_LABEL[phase]}
              {reduce && active && (
                <span className="text-muted-foreground font-normal">
                  (анимация уменьшена — орб зафиксирован в покое)
                </span>
              )}
            </p>

            <div className="flex flex-wrap items-center justify-center gap-2">
              <PhaseButton
                label="Слушать"
                onClick={() =>
                  setPhase((current) =>
                    current === "listening" ? "idle" : "listening"
                  )
                }
                pressed={phase === "listening"}
                disabled={muted}
              />
              <PhaseButton
                label="Думать"
                onClick={() =>
                  setPhase((current) =>
                    current === "thinking" ? "idle" : "thinking"
                  )
                }
                pressed={phase === "thinking"}
              />
              <PhaseButton
                label="Говорить"
                onClick={() =>
                  setPhase((current) =>
                    current === "talking" ? "idle" : "talking"
                  )
                }
                pressed={phase === "talking"}
              />
            </div>

            <div className="w-full max-w-sm">
              <Waveform active={active} />
            </div>
          </section>

          {/* The other three orbkit shaders. They are variants of the same
              engine rather than different libraries, which is the point worth
              making on this surface: one orb, four looks, one state prop. */}
          <section aria-label="Варианты орба" className="border-border bg-card rounded-xl border p-6">
            <h2 className="text-muted-foreground text-xs font-medium">
              Варианты орба · все четыре реагируют на одно состояние
            </h2>
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              {(
                [
                  { key: "shdr-11", label: "Водород", Orb: Shdr11 },
                  { key: "shdr-13", label: "Ион", Orb: Shdr13 },
                  { key: "shdr-14", label: "Дизеринг", Orb: Shdr14 },
                  { key: "shdr-21", label: "Нимб", Orb: Shdr21 },
                ] as const
              ).map(({ key, label, Orb }) => (
                <figure key={key} className="flex flex-col items-center gap-2">
                  <div className="flex h-24 w-24 items-center justify-center">
                    <Orb size={96} state={orbState} />
                  </div>
                  <figcaption className="text-muted-foreground text-[11px]">
                    {label}
                  </figcaption>
                </figure>
              ))}
            </div>
          </section>
        </div>

        <aside className="grid gap-4 lg:sticky lg:top-4">
          <section aria-label="Ввод" className="border-border rounded-lg border p-4">
            <h2 className="text-sm font-medium">Ввод</h2>
            <div className="mt-3 grid gap-3">
              <label>
                <span className="text-muted-foreground mb-1 block text-xs">
                  Микрофон
                </span>
                <select
                  value={device}
                  onChange={(event) => setDevice(event.target.value)}
                  className="border-border bg-background focus-visible:ring-ring h-9 w-full rounded-md border px-2.5 text-sm focus-visible:ring-2 focus-visible:outline-none"
                >
                  {DEVICES.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={muted}
                  onChange={(event) => setMuted(event.target.checked)}
                  className="accent-foreground"
                />
                Выключить микрофон
              </label>

              <p className="text-muted-foreground text-xs">
                {muted
                  ? "Микрофон выключен. Кнопка «Слушать» недоступна, пока микрофон выключен."
                  : "Список условный. Чтение реальных устройств требует getUserMedia, а эта страница не запрашивает микрофон при открытии."}
              </p>
            </div>
          </section>

          <section aria-label="Сессии" className="border-border rounded-lg border p-4">
            <h2 className="text-sm font-medium">Предыдущие сессии</h2>
            <ul className="mt-3 grid gap-2">
              {byNewest(VOICE_SESSIONS).map((session) => (
                <SessionRow key={session.id} session={session} />
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ parts --- */

function PhaseButton({
  label,
  onClick,
  pressed,
  disabled,
}: {
  label: string
  onClick: () => void
  pressed: boolean
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      className={cn(
        "focus-visible:ring-ring rounded-md border px-3 py-1.5 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none",
        "disabled:cursor-not-allowed disabled:opacity-50",
        pressed
          ? "border-ring bg-accent text-accent-foreground"
          : "border-border bg-background hover:bg-accent/50"
      )}
    >
      {label}
    </button>
  )
}

/** The amplitude series as bars. `aria-hidden` because the phase is already
 *  announced in the status line above — a decorative readout that a screen
 *  reader would otherwise try to narrate bar by bar. */
function Waveform({ active }: { active: boolean }) {
  return (
    <div
      aria-hidden
      className={cn(
        "flex h-10 items-center gap-[3px] transition-opacity",
        active ? "opacity-100" : "opacity-40"
      )}
    >
      {AMPLITUDE.map((value, index) => (
        <span
          key={index}
          className="bg-foreground/60 min-w-0 flex-1 rounded-full"
          style={{ height: `${Math.round(value * 100)}%` }}
        />
      ))}
    </div>
  )
}

function SessionRow({ session }: { session: VoiceSession }) {
  return (
    <li className="border-border rounded-md border p-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-sm">{session.room}</span>
        <span className="text-muted-foreground shrink-0 font-mono text-[11px] tabular-nums">
          {formatDuration(session.durationSeconds)}
        </span>
      </div>
      <p className="text-muted-foreground mt-0.5 text-xs">
        {dayShort(session.started)} {clockOf(session.started)} ·{" "}
        {VOICE_MODE_LABEL[session.mode]} · {session.turns}{" "}
        {plural(session.turns, ["обмен", "обмена", "обменов"])} ·{" "}
        <OutcomeLabel outcome={session.outcome} />
      </p>
      <p className="text-muted-foreground mt-1 truncate text-[11px]">
        {session.topics.join(" · ")} · {ago(session.started)}
      </p>
    </li>
  )
}

/** Outcome gets a word rather than only a colour, for the same reason the
 *  console spells out its state. The dataset writes this outcome with a space
 *  in it, so the lookup key has to match it exactly. */
function OutcomeLabel({ outcome }: { outcome: VoiceSession["outcome"] }) {
  const text: Record<VoiceSession["outcome"], string> = {
    answered: "отвечено",
    abandoned: "прервано",
    "handed off": "передано",
  }
  return <span className="capitalize">{text[outcome]}</span>
}
