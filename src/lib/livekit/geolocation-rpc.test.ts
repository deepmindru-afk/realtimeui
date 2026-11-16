import {
  RpcError,
  type LocalParticipant,
  type RpcInvocationData,
} from "livekit-client"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  DEFAULT_GEOLOCATION_TIMEOUT_MS,
  GET_USER_LOCATION_METHOD,
  registerGeolocationRpc,
  resolveBrowserLocation,
  type UserLocation,
} from "./geolocation-rpc"

/* The cross-process contract, restated here as literals. If either side drifts,
   one of these assertions fails instead of the tool silently returning nothing
   at runtime. */
const METHOD = "getUserLocation"
const REQUEST_PAYLOAD = '{"highAccuracy":true}'
const RESPONSE_KEYS = ["accuracy", "latitude", "longitude"]

/** Custom RpcError codes, deliberately outside LiveKit's reserved 1001-1999. */
const CODE_UNAVAILABLE = 4001
const CODE_DENIED = 4002

type RpcHandler = (data: RpcInvocationData) => Promise<string>

type FakePosition = {
  latitude: number
  longitude: number
  accuracy?: number
}

const AMSTERDAM: FakePosition = {
  latitude: 52.379189,
  longitude: 4.899431,
  accuracy: 12.5,
}
const COARSE: FakePosition = { latitude: 1, longitude: 2, accuracy: 3 }
const COARSE_RESPONSE = { latitude: 1, longitude: 2, accuracy: 3 }

/* --- fakes ---------------------------------------------------------------- */

/** Stubs `navigator.geolocation` and returns the array it appends each
 *  `PositionOptions` it was handed to, so forwarding can be asserted. */
function stubGeolocation(
  outcome: { position: FakePosition } | { error: { code: number; message: string } }
) {
  const options: { enableHighAccuracy?: boolean; timeout?: number }[] = []
  const getCurrentPosition = (
    success: PositionCallback,
    failure?: PositionErrorCallback | null,
    positionOptions?: PositionOptions
  ) => {
    options.push({
      enableHighAccuracy: positionOptions?.enableHighAccuracy,
      timeout: positionOptions?.timeout,
    })
    if ("error" in outcome) {
      failure?.(outcome.error as GeolocationPositionError)
      return
    }
    const { accuracy, ...coords } = outcome.position
    success({
      coords: { ...coords, accuracy } as GeolocationCoordinates,
    } as GeolocationPosition)
  }
  vi.stubGlobal("navigator", { geolocation: { getCurrentPosition } })
  return options
}

function stubNoGeolocation() {
  vi.stubGlobal("navigator", {})
}

function fakeParticipant() {
  const handlers = new Map<string, RpcHandler>()
  const unregistered: string[] = []
  const participant = {
    registerRpcMethod(method: string, handler: RpcHandler) {
      handlers.set(method, handler)
    },
    unregisterRpcMethod(method: string) {
      unregistered.push(method)
      handlers.delete(method)
    },
  }
  return {
    participant: participant as unknown as LocalParticipant,
    handlerFor: (method: string) => {
      const handler = handlers.get(method)
      if (!handler) throw new Error(`no handler registered for "${method}"`)
      return handler
    },
    unregistered,
  }
}

function invocation(
  payload: string,
  overrides: Partial<RpcInvocationData> = {}
): RpcInvocationData {
  return {
    requestId: "req_0001",
    callerIdentity: "agent",
    payload,
    responseTimeout: DEFAULT_GEOLOCATION_TIMEOUT_MS,
    ...overrides,
  }
}

/** Invoke the browser side of the contract, the way the agent would. */
function callRpc(
  handler: RpcHandler,
  payload: string,
  overrides: Partial<RpcInvocationData> = {}
) {
  return handler(invocation(payload, overrides))
}

function registered(
  options: { onLocation?: (location: UserLocation) => void } = {}
) {
  const fake = fakeParticipant()
  registerGeolocationRpc(fake.participant, options)
  return {
    ...fake,
    call: (payload: string, overrides?: Partial<RpcInvocationData>) =>
      callRpc(fake.handlerFor(GET_USER_LOCATION_METHOD), payload, overrides),
  }
}

/* --- contract ------------------------------------------------------------- */

describe("geolocation rpc contract", () => {
  it("uses the method name the agent calls", () => {
    expect(GET_USER_LOCATION_METHOD).toBe(METHOD)
  })

  it("falls back to a 10s budget, the agent's high-accuracy timeout", () => {
    expect(DEFAULT_GEOLOCATION_TIMEOUT_MS).toBe(10000)
  })
})

/* --- resolveBrowserLocation ----------------------------------------------- */

describe("resolveBrowserLocation", () => {
  it("resolves with the coordinates the browser reports", async () => {
    stubGeolocation({ position: AMSTERDAM })

    await expect(resolveBrowserLocation()).resolves.toEqual({
      latitude: 52.379189,
      longitude: 4.899431,
      accuracy: 12.5,
    })
  })

  it("defaults accuracy to 0 when the platform omits it", async () => {
    stubGeolocation({ position: { latitude: 1, longitude: 2 } })

    const location = await resolveBrowserLocation()
    expect(location.accuracy).toBe(0)
  })

  it("passes enableHighAccuracy and the timeout through", async () => {
    const options = stubGeolocation({ position: COARSE })

    await resolveBrowserLocation({ highAccuracy: true, timeoutMs: 10000 })

    expect(options).toEqual([{ enableHighAccuracy: true, timeout: 10000 }])
  })

  it("defaults to a low-accuracy, module-timeout request", async () => {
    const options = stubGeolocation({ position: COARSE })

    await resolveBrowserLocation()

    expect(options).toEqual([
      { enableHighAccuracy: false, timeout: DEFAULT_GEOLOCATION_TIMEOUT_MS },
    ])
  })

  it("rejects when the browser has no geolocation at all", async () => {
    stubNoGeolocation()

    await expect(resolveBrowserLocation()).rejects.toThrow(
      /geolocation is not available/i
    )
  })

  it("rejects with the browser's own message and code on a position error", async () => {
    stubGeolocation({ error: { code: 3, message: "Timeout expired" } })

    const failure = (await resolveBrowserLocation().catch(
      (error: Error) => error
    )) as Error
    expect(failure).toBeInstanceOf(Error)
    expect(failure.message).toContain("Timeout expired")
    expect(failure.message).toContain("3")
  })

  it("flags a refused permission distinctly from other failures", async () => {
    stubGeolocation({ error: { code: 1, message: "User denied Geolocation" } })

    const failure = (await resolveBrowserLocation().catch(
      (error: Error) => error
    )) as Error & { kind: string; code: number | null }
    expect(failure.kind).toBe("denied")
    expect(failure.code).toBe(1)
    expect(failure.message).toContain("User denied Geolocation")
  })
})

/* --- registerGeolocationRpc ----------------------------------------------- */

describe("registerGeolocationRpc", () => {
  it("registers the handler under the frozen method name", () => {
    stubGeolocation({ position: COARSE })
    const { participant, handlerFor } = fakeParticipant()

    registerGeolocationRpc(participant)

    expect(typeof handlerFor(GET_USER_LOCATION_METHOD)).toBe("function")
  })

  it("returns a closure that unregisters the method", () => {
    stubGeolocation({ position: COARSE })
    const { participant, handlerFor, unregistered } = fakeParticipant()

    const unregister = registerGeolocationRpc(participant)
    unregister()

    expect(unregistered).toEqual([METHOD])
    expect(() => handlerFor(METHOD)).toThrow(/no handler registered/)
  })

  it("answers the agent's JSON payload with a JSON string of the coordinates", async () => {
    const options = stubGeolocation({ position: AMSTERDAM })
    const rpc = registered()

    const response = await rpc.call(REQUEST_PAYLOAD)

    // High accuracy in, high accuracy forwarded to the browser.
    expect(options).toEqual([{ enableHighAccuracy: true, timeout: 10000 }])
    expect(typeof response).toBe("string")
    expect(JSON.parse(response)).toEqual({
      latitude: 52.379189,
      longitude: 4.899431,
      accuracy: 12.5,
    })
    expect(Object.keys(JSON.parse(response)).sort()).toEqual(RESPONSE_KEYS)
  })

  it("uses the caller's own response timeout for the geolocation budget", async () => {
    const options = stubGeolocation({ position: COARSE })
    const rpc = registered()

    await rpc.call(JSON.stringify({ highAccuracy: false }), {
      responseTimeout: 5000,
    })

    expect(options).toEqual([{ enableHighAccuracy: false, timeout: 5000 }])
  })

  it("throws an RpcError, not a plain Error, when geolocation fails", async () => {
    stubGeolocation({ error: { code: 2, message: "Position unavailable" } })
    const rpc = registered()

    const failure = await rpc.call(REQUEST_PAYLOAD).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(RpcError)
    const rpcError = failure as RpcError
    expect(rpcError.code).toBe(CODE_UNAVAILABLE)
    // 1001-1999 is LiveKit's own range; a custom code must stay out of it.
    expect(rpcError.code < 1001 || rpcError.code > 1999).toBe(true)
    expect(rpcError.message).toContain("Position unavailable")
  })

  it("reports a refused permission with its own RpcError code", async () => {
    stubGeolocation({ error: { code: 1, message: "User denied Geolocation" } })
    const rpc = registered()

    const failure = await rpc.call(REQUEST_PAYLOAD).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(RpcError)
    expect((failure as RpcError).code).toBe(CODE_DENIED)
    expect((failure as RpcError).code).not.toBe(CODE_UNAVAILABLE)
  })

  it("fails as an RpcError when the browser has no geolocation", async () => {
    stubNoGeolocation()
    const rpc = registered()

    const failure = await rpc.call(REQUEST_PAYLOAD).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(RpcError)
    expect((failure as RpcError).code).toBe(CODE_UNAVAILABLE)
  })

  it("tolerates a malformed payload and still answers", async () => {
    const options = stubGeolocation({ position: COARSE })
    const rpc = registered()

    const response = await rpc.call("{not json")

    expect(options).toEqual([
      { enableHighAccuracy: false, timeout: DEFAULT_GEOLOCATION_TIMEOUT_MS },
    ])
    expect(JSON.parse(response)).toEqual(COARSE_RESPONSE)
  })

  it("tolerates an absent payload and still answers", async () => {
    stubGeolocation({ position: COARSE })
    const rpc = registered()

    const response = await rpc.call("", {
      payload: undefined as unknown as string,
    })

    expect(JSON.parse(response)).toEqual(COARSE_RESPONSE)
  })

  it("calls onLocation with the resolved location", async () => {
    stubGeolocation({ position: AMSTERDAM })
    const onLocation = vi.fn<(location: UserLocation) => void>()
    const rpc = registered({ onLocation })

    await rpc.call(REQUEST_PAYLOAD)

    expect(onLocation).toHaveBeenCalledTimes(1)
    expect(onLocation).toHaveBeenCalledWith({
      latitude: 52.379189,
      longitude: 4.899431,
      accuracy: 12.5,
    })
  })

  it("does not call onLocation when geolocation fails", async () => {
    stubGeolocation({ error: { code: 1, message: "User denied Geolocation" } })
    const onLocation = vi.fn<(location: UserLocation) => void>()
    const rpc = registered({ onLocation })

    await expect(rpc.call(REQUEST_PAYLOAD)).rejects.toBeInstanceOf(RpcError)

    expect(onLocation).not.toHaveBeenCalled()
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})
