import {
  RpcError,
  type LocalParticipant,
  type RpcInvocationData,
} from "livekit-client"

/**
 * The browser half of the agent's `get_user_location` tool.
 *
 * The agent exposes an LLM function tool, and when the model calls it the
 * agent fulfils it with an RPC call back to this participant rather than
 * answering itself — a Python worker has no `navigator`, so the browser is
 * the only place the fix can come from. See
 * https://docs.livekit.io/agents/logic/tools/forwarding/ .
 *
 * Payloads and responses cross the wire as JSON *strings* because that is the
 * only shape LiveKit RPC carries. The agent parses the response string, so the
 * key names below are a cross-process contract, not a local detail.
 *
 * No React in this module on purpose: it is plain functions over the DOM and
 * LiveKit, which is what makes it directly unit-testable.
 */

/** Frozen contract: the agent calls this exact method name on the browser. */
export const GET_USER_LOCATION_METHOD = "getUserLocation"

/** Budget used when the caller does not say how long it will wait. Matches the
 *  agent's high-accuracy timeout, the more generous of the two it chooses. */
export const DEFAULT_GEOLOCATION_TIMEOUT_MS = 10000

/** `GeolocationPositionError.PERMISSION_DENIED`. */
const PERMISSION_DENIED = 1

/** LiveKit reserves 1001-1999 for its own errors (1001-1099 transport, 1400s
 *  method/participant, 1500s request lifecycle), so these sit well outside it:
 *  4001 for a fix we could not obtain, 4002 for one the user actively refused.
 *  The agent branches on the code to say "you declined" rather than
 *  "something broke". */
const RPC_ERROR_LOCATION_UNAVAILABLE = 4001
const RPC_ERROR_PERMISSION_DENIED = 4002

/** `RpcError` refuses messages over 256 bytes, so a browser's own verbose
 *  wording is clipped instead of throwing on the way back to the agent. The
 *  cap is in characters and below the byte limit to leave room for the
 *  multi-byte text browsers like to put in these messages. */
const MAX_RPC_MESSAGE_CHARS = 200

export type UserLocationRpcPayload = {
  /** `true` asks the browser for a GPS-grade fix. It is slower and prompts
   *  harder, so the agent only sets it when the answer actually needs it. */
  highAccuracy?: boolean
}

export type UserLocation = {
  latitude: number
  longitude: number
  /** Metres. `0` when the platform did not report one. */
  accuracy: number
}

type FailureKind = "unavailable" | "denied" | "failed"

/** Carries the browser's own error code alongside the message, so the RPC layer
 *  can tell a refused permission from a dead fix without matching on prose. */
class GeolocationFailure extends Error {
  readonly kind: FailureKind
  readonly code: number | null

  constructor(kind: FailureKind, message: string, code: number | null = null) {
    super(message)
    this.name = "GeolocationFailure"
    this.kind = kind
    this.code = code
  }
}

function fromPositionError(
  error: GeolocationPositionError | Error
): GeolocationFailure {
  // Read the fields off the shape rather than off `Error`: the browser passes a
  // `GeolocationPositionError`, but a polyfill or a stub can hand over any
  // error-like object and the message is the part worth keeping either way.
  const raw = error as { code?: unknown; message?: unknown }
  const code = typeof raw?.code === "number" ? raw.code : null
  const detail =
    typeof raw?.message === "string" && raw.message ? raw.message : String(error)
  if (code === PERMISSION_DENIED) {
    return new GeolocationFailure(
      "denied",
      `Geolocation permission denied (code ${code}): ${detail}`,
      code
    )
  }
  const suffix = code === null ? "" : ` (code ${code})`
  return new GeolocationFailure(
    "failed",
    `Geolocation request failed${suffix}: ${detail}`,
    code
  )
}

/**
 * Promisified `navigator.geolocation.getCurrentPosition`.
 *
 * Rejects with a `GeolocationFailure` — an `Error` carrying the browser's own
 * message and `GeolocationPositionError` code — when geolocation is missing,
 * the user refuses, the fix times out, or the provider errors.
 */
export function resolveBrowserLocation({
  highAccuracy = false,
  timeoutMs = DEFAULT_GEOLOCATION_TIMEOUT_MS,
}: {
  highAccuracy?: boolean
  timeoutMs?: number
} = {}): Promise<UserLocation> {
  return new Promise<UserLocation>((resolve, reject) => {
    const geolocation: Geolocation | undefined =
      typeof navigator === "undefined"
        ? undefined
        : (navigator.geolocation as Geolocation | undefined)
    if (!geolocation) {
      reject(
        new GeolocationFailure(
          "unavailable",
          "Geolocation is not available in this browser."
        )
      )
      return
    }
    geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords
        resolve({
          latitude,
          longitude,
          // The DOM type says `accuracy` is always there, but some platforms
          // omit it. `0` keeps the payload shape the agent expects either way.
          accuracy: Number.isFinite(accuracy) ? accuracy : 0,
        })
      },
      (error) => {
        reject(fromPositionError(error))
      },
      { enableHighAccuracy: highAccuracy, timeout: timeoutMs }
    )
  })
}

/** The caller's budget. The SDK names it `responseTimeout`; the forwarding
 *  contract calls it `timeout`. Read both so neither naming is load-bearing. */
function invocationTimeout(data: RpcInvocationData): number {
  const raw = data as { responseTimeout?: number; timeout?: number } | undefined
  const candidate = raw?.responseTimeout ?? raw?.timeout
  return typeof candidate === "number" &&
    Number.isFinite(candidate) &&
    candidate > 0
    ? candidate
    : DEFAULT_GEOLOCATION_TIMEOUT_MS
}

/** A payload we cannot read is a request we can still serve: `{}` means the
 *  defaults, which is a usable coarse fix. Failing here would turn a
 *  version skew between the two processes into a dead tool call. */
function parsePayload(payload: string | undefined): UserLocationRpcPayload {
  if (typeof payload !== "string" || payload === "") return {}
  try {
    const parsed: unknown = JSON.parse(payload)
    if (!parsed || typeof parsed !== "object") return {}
    return parsed as UserLocationRpcPayload
  } catch {
    return {}
  }
}

function toRpcError(error: unknown): RpcError {
  const failure =
    error instanceof GeolocationFailure
      ? error
      : new GeolocationFailure(
          "failed",
          `Unexpected geolocation failure: ${
            error instanceof Error ? error.message : String(error)
          }`
        )
  const code =
    failure.kind === "denied"
      ? RPC_ERROR_PERMISSION_DENIED
      : RPC_ERROR_LOCATION_UNAVAILABLE
  const message =
    failure.message.length > MAX_RPC_MESSAGE_CHARS
      ? failure.message.slice(0, MAX_RPC_MESSAGE_CHARS)
      : failure.message
  return new RpcError(code, message)
}

/**
 * Answers the agent's `getUserLocation` RPC with this browser's position.
 *
 * Registration is explicit and reversible: the returned closure unregisters the
 * method, which the transport calls when the room goes away, so a stale handler
 * cannot outlive its participant.
 */
export function registerGeolocationRpc(
  participant: LocalParticipant,
  options: { onLocation?: (location: UserLocation) => void } = {}
): () => void {
  const handler = async (data: RpcInvocationData): Promise<string> => {
    const payload = parsePayload(data?.payload)
    try {
      const location = await resolveBrowserLocation({
        highAccuracy: payload.highAccuracy === true,
        timeoutMs: invocationTimeout(data),
      })
      options.onLocation?.(location)
      // JSON string, not an object: RPC payloads are strings, and the agent
      // parses exactly this shape.
      return JSON.stringify(location)
    } catch (error) {
      // An `RpcError` is the only throw the caller can read as structured; a
      // plain `Error` reaches the agent as an opaque "handler failed".
      throw toRpcError(error)
    }
  }
  participant.registerRpcMethod(GET_USER_LOCATION_METHOD, handler)
  return () => {
    participant.unregisterRpcMethod(GET_USER_LOCATION_METHOD)
  }
}
