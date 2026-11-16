import { describe, expect, it } from "vitest"

import {
  buildTokenQuery,
  resolveConnectionParams,
  resolveRoomName,
} from "./connection-params"

/* The token route's own param names, restated as literals. If either side
   drifts, one of these fails instead of the URL quietly joining the wrong
   room or the server minting a blank participant. */
const ROOM = "alpha"
const NAME = "Alice"
const IDENTITY = "alice-1"

/* The room the hook would have joined on its own, and the one a host component
   passes as `roomName`. Both are the same string on purpose: the trap this
   guards against is the caller's value quietly beating the URL's. */
const CALLER_ROOM = "va_room_4213"
const FALLBACK_ROOM = "va_room_9999"

/* --- resolveConnectionParams ----------------------------------------------- */

describe("resolveConnectionParams", () => {
  it("resolves room, participant name, and identity together", () => {
    const params = resolveConnectionParams(
      `?room=${ROOM}&user=${NAME}&identity=${IDENTITY}`
    )

    expect(params).toEqual({
      roomName: ROOM,
      participantName: NAME,
      participantIdentity: IDENTITY,
    })
  })

  it("resolves the participant name through the name alias", () => {
    expect(resolveConnectionParams("?name=Bob").participantName).toBe("Bob")
  })

  it("prefers user over name when both are present", () => {
    const params = resolveConnectionParams("?user=Alice&name=Bob")

    expect(params.participantName).toBe("Alice")
  })

  it("falls through to the alias when user is blank", () => {
    expect(resolveConnectionParams("?user=&name=Bob").participantName).toBe("Bob")
  })

  it("leaves name and identity undefined when the URL omits them", () => {
    expect(resolveConnectionParams(`?room=${ROOM}`)).toEqual({
      roomName: ROOM,
      participantName: undefined,
      participantIdentity: undefined,
    })
  })

  it("reports an absent room as an empty string, never undefined", () => {
    // `roomName` is a string on the type, and `""` is how "not asked for" is
    // spelled so precedence can fall through without a null check per caller.
    const params = resolveConnectionParams("?user=Alice")

    expect(params.roomName).toBe("")
    expect(typeof params.roomName).toBe("string")
  })

  it("reads an empty search as no connection at all", () => {
    expect(resolveConnectionParams("")).toEqual({
      roomName: "",
      participantName: undefined,
      participantIdentity: undefined,
    })
  })

  it("treats an empty value as absent", () => {
    const params = resolveConnectionParams("?room=&user=&identity=")

    expect(params).toEqual({
      roomName: "",
      participantName: undefined,
      participantIdentity: undefined,
    })
  })

  it("treats a whitespace-only value as absent", () => {
    const params = resolveConnectionParams("?room=%20&user=%20%20&identity=+")

    expect(params).toEqual({
      roomName: "",
      participantName: undefined,
      participantIdentity: undefined,
    })
  })

  it("trims a real value and leaves the rest verbatim", () => {
    const params = resolveConnectionParams("?room=%20alpha%20&user=Alice+B")

    // Form encoding round-trips a space as `+`; case and inner punctuation are
    // left alone because a room is a user-chosen label, not ours to normalise.
    expect(params.roomName).toBe("alpha")
    expect(params.participantName).toBe("Alice B")
    expect(resolveConnectionParams("?room=Alpha-Room_1").roomName).toBe(
      "Alpha-Room_1"
    )
  })

  it("reads the search without a leading question mark", () => {
    expect(resolveConnectionParams(`room=${ROOM}`).roomName).toBe(ROOM)
  })

  it("ignores unrelated params rather than reading them as a room", () => {
    const params = resolveConnectionParams("?theme=dark&room=alpha")

    expect(params.roomName).toBe(ROOM)
  })
})

/* --- resolveRoomName ------------------------------------------------------ */

describe("resolveRoomName", () => {
  it("prefers the URL's room over the caller's explicit roomName", () => {
    expect(resolveRoomName(ROOM, CALLER_ROOM, FALLBACK_ROOM)).toBe(ROOM)
  })

  it("falls back to the caller's roomName when the URL names none", () => {
    expect(resolveRoomName("", CALLER_ROOM, FALLBACK_ROOM)).toBe(CALLER_ROOM)
  })

  it("falls back to the random room when neither side names one", () => {
    // This is the hook's `DEFAULT_ROOM` path, and the `undefined` is the
    // component's "I have no room of my own" argument.
    expect(resolveRoomName("", undefined, FALLBACK_ROOM)).toBe(FALLBACK_ROOM)
  })

  it("skips a blank candidate rather than joining an unnamed room", () => {
    expect(resolveRoomName("   ", "  ", FALLBACK_ROOM)).toBe(FALLBACK_ROOM)
  })

  it("agrees with itself when the host component and the hook read one URL", () => {
    // The exact bug this exists to prevent: a component that passes its own
    // `roomName` winning over the address bar and making `?room=` a no-op.
    const search = `?room=${ROOM}&user=${NAME}`
    const componentRoom = resolveRoomName(
      resolveConnectionParams(search).roomName,
      undefined,
      FALLBACK_ROOM
    )
    const transportRoom = resolveRoomName(
      resolveConnectionParams(search).roomName,
      componentRoom,
      FALLBACK_ROOM
    )

    expect(transportRoom).toBe(ROOM)
    expect(transportRoom).toBe(componentRoom)
  })
})

/* --- buildTokenQuery ------------------------------------------------------ */

describe("buildTokenQuery", () => {
  it("builds the query string the token route documents", () => {
    const query = buildTokenQuery({
      roomName: ROOM,
      participantName: NAME,
      participantIdentity: IDENTITY,
    })

    expect(query).toBe(`room=${ROOM}&identity=${IDENTITY}&name=${NAME}`)
  })

  it("sends the participant name as name, not as the page URL's user", () => {
    // The route reads `name`; `user` is only the page-URL spelling, and
    // forwarding it would leave the server's random name in place.
    const query = buildTokenQuery({ roomName: ROOM, participantName: NAME })

    expect(query).toContain("name=Alice")
    expect(query).not.toContain("user=")
  })

  it("omits params the URL did not supply", () => {
    // Omitted, not blank: the route's `??` fallback for a missing key never
    // fires for `name=`, so a blank here would erase the generated name.
    expect(buildTokenQuery({ roomName: ROOM })).toBe(`room=${ROOM}`)
  })

  it("omits blank params handed in directly", () => {
    const query = buildTokenQuery({
      roomName: "  ",
      participantName: "",
      participantIdentity: undefined,
    })

    expect(query).toBe("")
  })

  it("escapes values that would otherwise break the query", () => {
    const query = buildTokenQuery({
      roomName: "a&b=c",
      participantName: "Ünï Nãme +plus",
      participantIdentity: "id/1",
    })

    expect(query).toBe(
      "room=a%26b%3Dc&identity=id%2F1&name=%C3%9Cn%C3%AF+N%C3%A3me+%2Bplus"
    )
  })

  it("round-trips values that need escaping", () => {
    // The real check on the escaping above: what `/api/token` parses back out
    // of the query has to be the value that went in.
    const original = {
      roomName: "a&b=c",
      participantName: "Ünï Nãme +plus",
      participantIdentity: "id/1",
    }

    expect(resolveConnectionParams(buildTokenQuery(original))).toEqual({
      roomName: original.roomName,
      participantName: original.participantName,
      participantIdentity: original.participantIdentity,
    })
  })

  it("round-trips a full page URL through the token query", () => {
    const fromPage = resolveConnectionParams(
      `?room=${ROOM}&user=${NAME}&identity=${IDENTITY}`
    )

    expect(resolveConnectionParams(buildTokenQuery(fromPage))).toEqual({
      roomName: ROOM,
      participantName: NAME,
      participantIdentity: IDENTITY,
    })
  })
})
