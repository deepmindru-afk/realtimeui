/**
 * The connection the page URL asks for.
 *
 * A link like `/?room=alpha&user=Alice&identity=alice-1` names the room, the
 * participant name, and the participant identity, and the token route has
 * accepted all three since before any of this existed. What was missing was a
 * single place that reads them, which is what let a URL be silently ignored:
 * the host component passes its own `roomName`, and a `roomName` that wins by
 * default beats a `room=` in the address bar.
 *
 * So the resolution lives here, in a module both callers share, and the
 * precedence is one exported function rather than a habit each side repeats.
 *
 * No React, no `window`, no side effects: every function takes the query string
 * as an argument, which is what makes the whole thing unit-testable under node
 * with no jsdom and no DOM stubs.
 */

export type ConnectionParams = {
  /** The room the URL names, or `""` when it names none.
   *
   * Empty rather than absent on purpose: `""` is a string, so the type stays
   * honest and `resolveRoomName` can fall through without every caller
   * repeating a null check. */
  roomName: string
  /** Display name for this participant, when the URL supplies one. */
  participantName?: string
  /** Stable participant identity, when the URL supplies one. */
  participantIdentity?: string
  /** Agent worker the room should dispatch, when the URL or a connect form
   *  names one. Optional on purpose: left out, the token route falls back to
   *  `LIVEKIT_AGENT_NAME` and then to whatever that worker name resolves to,
   *  which is the behaviour from before a request could ask for one. */
  agentName?: string
}

/** The room param, the identity param, and the name param — the names
 *  `GET /api/token` already documents, so the wire format stays one contract
 *  rather than a page-only dialect on one side and the route's own on the
 *  other. */
const ROOM_PARAM = "room"
const IDENTITY_PARAM = "identity"
const NAME_PARAM = "name"

/** `user` is the page-URL spelling; `name` is the alias the token route has
 *  always documented, kept so a link that already used it still resolves. */
const PARTICIPANT_NAME_PARAMS = ["user", NAME_PARAM] as const

/** `agent` is the worker name the token route hands to
 *  `RoomAgentDispatch`, so a `?agent=` in the address bar and an agent field on
 *  a connect form reach the same dispatch decision under one name. Read last, to
 *  keep `buildTokenQuery`'s output in the route's own read order. */
const AGENT_PARAM = "agent"

/** A value worth passing on, or undefined.
 *
 *  Whitespace-only counts as absent: `?room=%20%20` is someone who hit space
 *  too many times, not a room with spaces in it, and forwarding it would mint
 *  a token for a room nobody can name. Trimming the rest is the only
 *  normalisation applied — case and inner punctuation are left alone, because
 *  a room is a user-chosen label and not ours to case-fold. */
function meaningful(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

/**
 * Reads the connection out of a raw query string, e.g. `"?room=alpha&user=Alice"`.
 *
 * `URLSearchParams` semantics, so a leading `?` is optional and a repeated key
 * takes its first value. A key that is missing, empty, or blank comes back as
 * absent — there is no value in telling "asked for nothing" apart from "not
 * asked for" when both mean the same thing downstream: the server's fallback.
 */
export function resolveConnectionParams(search: string): ConnectionParams {
  const query = new URLSearchParams(search)
  /* First match wins, which is what makes `user` preferred over `name`:
   * `user` is checked first and its presence ends the search. */
  let participantName: string | undefined
  for (const key of PARTICIPANT_NAME_PARAMS) {
    participantName = meaningful(query.get(key))
    if (participantName) break
  }
  return {
    roomName: meaningful(query.get(ROOM_PARAM)) ?? "",
    participantName,
    participantIdentity: meaningful(query.get(IDENTITY_PARAM)),
    agentName: meaningful(query.get(AGENT_PARAM)),
  }
}

/**
 * Picks the room to join: URL first, then the caller's own `roomName`, then the
 * supplied fallback.
 *
 * The URL wins because typing a room into the address bar is explicit intent,
 * whereas a caller's `roomName` is usually a default it happens to be holding.
 * Every candidate goes through the same empty check, so a caller passing `""`
 * falls through instead of joining a room with no name.
 *
 * The three-argument shape is deliberate: it names the order at the call site,
 * which is the whole point of having this function instead of a `||` chain
 * repeated in the hook and the host component.
 */
export function resolveRoomName(
  fromUrl: string | undefined,
  fromCaller: string | undefined,
  fallback: string
): string {
  return meaningful(fromUrl) ?? meaningful(fromCaller) ?? fallback
}

/**
 * Builds the query string for `GET /api/token`.
 *
 * Absent values are left out entirely rather than sent blank, because the
 * route's `??` fallbacks (`process.env.LIVEKIT_ROOM`, a random
 * `user-<uuid>`, `LIVEKIT_AGENT_NAME`) only fire on a missing key — sending
 * `name=` would replace a generated name with an empty one.
 */
export function buildTokenQuery(params: ConnectionParams): string {
  const query = new URLSearchParams()
  // Each value goes through `meaningful` again rather than being assumed
  // pre-checked: this is also where a caller-supplied `ConnectionParams`
  // arrives, and `{"room":"  "}` should not mint a token for a blank room.
  const room = meaningful(params.roomName)
  const identity = meaningful(params.participantIdentity)
  const name = meaningful(params.participantName)
  const agent = meaningful(params.agentName)
  // Parameter order matches the route's own reads, so the two read side by side.
  if (room) query.set(ROOM_PARAM, room)
  if (identity) query.set(IDENTITY_PARAM, identity)
  if (name) query.set(NAME_PARAM, name)
  if (agent) query.set(AGENT_PARAM, agent)
  return query.toString()
}
