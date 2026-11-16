import type { SentPayload } from "@/components/conversation/payload"

/**
 * A request that actually left the browser, kept for the turn it belongs to.
 *
 * The note and the payload live in one record on purpose. They describe the same
 * dispatch from two angles — what the file was, and what went on the wire — and
 * storing them separately would leave room for the transcript's note card to
 * describe a note the disclosure does not mention, or the reverse.
 */
export type Dispatch = {
  /** Stable identity for React keys and for the record's own use. */
  key: string
  /** The highest turn id that existed at the moment of sending. */
  afterTurnId: number
  payload: SentPayload
}

/**
 * Re-attaches each dispatched request to the user turn that carries it.
 *
 * `send()` is fire-and-forget and hands back nothing, so a turn id cannot be
 * known at dispatch time without guessing. Instead each dispatch records the
 * boundary it was sent across — the highest id that existed *before* the send —
 * and is paired with the first user turn past it. Turn ids increase
 * monotonically and sends are sequential, so the pairing is exact, including
 * when two messages carry identical text.
 *
 * Derived during render from two values the render already holds: no effect, no
 * reconciliation, and nothing to fall out of sync.
 */
export function pairDispatches(
  turns: readonly { id: number; role: "user" | "assistant" }[],
  dispatches: readonly Dispatch[]
): Map<number, Dispatch> {
  const paired = new Map<number, Dispatch>()
  const claimed = new Set<number>()
  for (const dispatch of dispatches) {
    const target = turns.find(
      (turn) =>
        turn.role === "user" &&
        turn.id > dispatch.afterTurnId &&
        !claimed.has(turn.id)
    )
    if (!target) continue
    claimed.add(target.id)
    paired.set(target.id, dispatch)
  }
  return paired
}

/**
 * The style sentence each answer was produced under, keyed by the answer.
 *
 * The style rides out with the request, so it is stored against the user turn —
 * but it describes the shape of the reply, and the reply is the thing a reader
 * is looking at, so the transcript shows it under the agent's turn. That makes
 * attribution necessary, and it is derived the same way `pairDispatches` is:
 * the agent answers what was asked most recently before it, so each assistant
 * turn takes the style of the last user turn ahead of it.
 *
 * `null` is a real value and not a gap: the request went out as typed. The map
 * simply has no entry for an answer with no request ahead of it — a greeting
 * that arrived before anyone typed — which is how the caller tells "no request
 * yet" from "a request that wanted no style sentence". */
export function pairAnswerStyles(
  turns: readonly { id: number; role: "user" | "assistant" }[],
  dispatchByTurn: ReadonlyMap<number, Dispatch>
): Map<number, string | null> {
  const styles = new Map<number, string | null>()
  let latest: number | null = null
  for (const turn of turns) {
    if (turn.role === "user") {
      latest = turn.id
      continue
    }
    /* `latest` is null for a greeting, and there is nothing truthful to show
     * about the style of an answer nobody asked for. */
    if (latest === null) continue
    styles.set(turn.id, dispatchByTurn.get(latest)?.payload.instruction ?? null)
  }
  return styles
}
