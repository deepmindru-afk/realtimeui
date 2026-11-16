import type { AgentState, Turn } from "@/lib/livekit/use-livekit-chat"

/**
 * How much attention a status deserves, which is the only thing the visual
 * treatment needs to know. Six tones is the whole vocabulary of the strip, and
 * every state on the wire maps onto exactly one of them, so the surface can
 * never disagree with itself: there is no state that renders as one thing here
 * and another thing in the orb or the transcript.
 */
export type StatusTone =
  | "connecting"
  | "working"
  | "live"
  | "ready"
  | "muted"
  | "problem"

export type AgentStatus = {
  tone: StatusTone
  /** What is true right now, in the fewest words that are still exact. */
  label: string
  /**
   * The single clause that says why it matters. It never repeats the label, and
   * it never claims something the transport cannot actually tell us — no
   * "ищет по вашим заметкам", no "читает файл", because nothing on the wire
   * says the agent did either of those.
   */
  detail: string
  /** The orb only knows three states, so everything folds into one of these. */
  phase: "idle" | "thinking" | "speaking"
  /** True while the agent is mid-answer, which is also when text is arriving. */
  working: boolean
}

export type StatusInput = {
  agentState: AgentState
  connecting: boolean
  voice: boolean
  micEnabled: boolean
  micPending: boolean
}

/**
 * The single derivation behind every live indicator in the app.
 *
 * `agentState` is the one honest signal the transport gives us, and it is
 * genuinely rich: connecting, idle, listening, thinking, speaking,
 * disconnected, failed. Rather than spread that across three components that
 * each guess at a label, it is folded into one record here and read by the
 * status strip, the orb, and the transcript's working affordance. If they ever
 * disagree it is a bug in one function, not in three.
 */
export function deriveStatus({
  agentState,
  connecting,
  voice,
  micEnabled,
  micPending,
}: StatusInput): AgentStatus {
  const working = agentState === "thinking"

  if (agentState === "failed") {
    return {
      tone: "problem",
      label: "Портал недоступен",
      detail: "Не удалось открыть сессию — ваши заметки остались здесь.",
      phase: "idle",
      working,
    }
  }
  if (agentState === "disconnected") {
    return {
      tone: "problem",
      label: "Нет соединения",
      detail: "Агент покинул комнату. Начните новый чат, чтобы переподключиться.",
      phase: "idle",
      working,
    }
  }
  if (connecting || agentState === "connecting") {
    return {
      tone: "connecting",
      label: "Подключение к Порталу",
      detail: "Открываем аудиоканал и ждём агента.",
      phase: "idle",
      working,
    }
  }
  if (micPending) {
    return {
      tone: "connecting",
      label: voice ? "Открываем микрофон" : "Переключаемся на голос",
      detail: "Браузер запросит разрешение.",
      phase: "idle",
      working,
    }
  }
  if (working) {
    return {
      tone: "working",
      label: "Думает",
      detail: "Формирует ответ из вопроса и приложенной заметки.",
      phase: "thinking",
      working,
    }
  }
  if (agentState === "speaking") {
    return {
      tone: "live",
      label: "Говорит",
      detail: "Ответ зачитывается вслух.",
      phase: "speaking",
      working,
    }
  }
  if (voice && !micEnabled) {
    return {
      tone: "muted",
      label: "Микрофон выключен",
      detail: "Продолжайте печатать — тот же разговор всё ещё открыт.",
      phase: "idle",
      working,
    }
  }
  if (voice) {
    return {
      tone: "live",
      label: "Слушает",
      detail: "Задайте вопрос голосом или напишите ниже.",
      phase: "idle",
      working,
    }
  }
  return {
    tone: "ready",
    label: "Готов",
    detail: "Задайте вопрос или добавьте заметку для разбора.",
    phase: "idle",
    working,
  }
}

/**
 * Whether the transcript's newest turn is still being written.
 *
 * The transport gives us no per-turn streaming flag, and inventing one by
 * watching text lengths would mean a ref mutated during render. What it does
 * give us is `thinking`, which the agent only reports while it is still
 * working on the current turn — so an assistant turn sitting at the end of the
 * transcript during `thinking` is mid-stream by definition, and the moment the
 * state moves on, the turn is complete. No polling, no extra state, and no way
 * for the indicator to lie.
 */
export function streamingTurn(
  turns: readonly Turn[],
  working: boolean
): Turn | null {
  if (!working) return null
  const last = turns[turns.length - 1]
  return last?.role === "assistant" ? last : null
}
