import {
  parseSources,
  sourcesWithFallback,
} from "@/lib/completion/sources"

/* Not cached, said twice on purpose — the same reasoning as `/api/complete` and
 * `/api/feature-flags`, and for the same reason: this is deployment data, and a
 * value that quietly became a build-time constant is the exact failure the route
 * exists to prevent. The segment config is for the framework, the header is for
 * anything sitting between the app and the browser. */
export const revalidate = 0

/**
 * GET /api/autocomplete — the two corpora the composer completes against.
 *
 * `AUTOCOMPLETE_API_URL` names a service that holds them. This route is the
 * indirection that lets the URL stay a server-side secret and still be honoured
 * without a rebuild: the browser asks this route, this route asks the service,
 * and the browser never learns where the service is. A `NEXT_PUBLIC_` name would
 * do the same job one hop earlier and freeze the answer into the bundle, which
 * is the pattern `feature-flags` exists to argue against.
 *
 * Always answers 200. Every failure mode — unset, unreachable, slow, non-JSON, a
 * shape with nothing usable in it — is answered with the bundled corpora rather
 * than an error, because this is data for a menu and the menu has to work in a
 * deployment where the service does not. A 500 here would mean an empty composer
 * with an error in the console, which is a worse outcome than the three questions
 * the app ships with.
 *
 * Response: `{ samples: Sample[]; commands: Command[] }`, both always present and
 * both always non-empty.
 */
export async function GET() {
  const headers = { "Cache-Control": "no-store" }
  const url = autocompleteApiUrl()

  if (!url) return Response.json(sourcesWithFallback(null), { headers })

  /* Bounded on both ends, because this request sits in front of the first
   * paint of the suggestion menu: a service that hangs must not become an
   * unbounded spinner over the composer, and one that answers with a megabyte
   * must not be read into memory in full to find three questions in it. */
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), UPSTREAM_TIMEOUT)

  try {
    const response = await fetch(url, {
      signal: abort.signal,
      /* The corpora are the deployment's, not this server's cache's: a flip on
       * the service has to be visible on the next page load, and a cached copy
       * is a menu that still offers last week's questions. */
      cache: "no-store",
      headers: { Accept: "application/json" },
    })
    if (!response.ok) {
      return Response.json(sourcesWithFallback(null), { headers })
    }
    const payload = await readJson(response)
    return Response.json(sourcesWithFallback(parseSources(payload)), { headers })
  } catch (error) {
    /* Logged, not surfaced. An operator debugging a missing menu needs to be
     * able to find this line, and the person using the composer needs not to be
     * interrupted by it — the bundled corpora are on their way either way. */
    console.warn("[portal] autocomplete service failed", error)
    return Response.json(sourcesWithFallback(null), { headers })
  } finally {
    clearTimeout(timer)
  }
}

/**
 * How long the composer waits for the service before carrying on without it.
 *
 * Longer than the model's debounce and shorter than a person notices. The
 * bundled set is already on screen by then, so the question is not "will this
 * arrive" but "is it worth holding the answer back for", and a service slower
 * than this has told us it would rather the operator typed first.
 */
const UPSTREAM_TIMEOUT = 4_000

/** Roughly 64KB of JSON — hundreds of samples, far past the cap. */
const MAX_UPSTREAM_BYTES = 64 * 1024

/**
 * The upstream body as JSON, or `null` if it is not a body we can read.
 *
 * Bounded, because `response.json()` on an unbounded stream is an unbounded
 * allocation reached through a URL an operator put in a deploy dashboard. The
 * limit is generous against the corpora and small against a runaway, which is the
 * asymmetry worth having: truncating a legitimate response costs a fallback,
 * reading one that is not legitimate costs the process.
 */
async function readJson(response: Response): Promise<unknown> {
  const reader = response.body?.getReader()
  if (!reader) return null
  const chunks: Uint8Array[] = []
  let total = 0
  while (total <= MAX_UPSTREAM_BYTES) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_UPSTREAM_BYTES) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  const body = new Uint8Array(total)
  let at = 0
  for (const chunk of chunks) {
    body.set(chunk, at)
    at += chunk.byteLength
  }
  try {
    return JSON.parse(new TextDecoder().decode(body))
  } catch {
    /* Not JSON. A service pointed at by mistake — an HTML error page, a login
     * wall — is the likeliest cause, and it is the same outcome as a timeout. */
    return null
  }
}

/**
 * `AUTOCOMPLETE_API_URL`, if it is set to something this route is willing to
 * fetch.
 *
 * Read per request, not at module load, for the reason `feature-flags` reads
 * per request: a value that appears in a running server's environment has to take
 * effect without a rebuild.
 *
 * Validated rather than passed through. `fetch` accepts a great deal that a
 * deploy setting should not — a `file:` URL, a `data:` one — and this route
 * exists to fetch *somewhere else*, so a value that is not plain http(s) is
 * treated as unset rather than followed. A typo falls back to the bundled
 * corpora instead of becoming a request failure on every keystroke.
 */
function autocompleteApiUrl(): string | null {
  const raw = process.env.AUTOCOMPLETE_API_URL?.trim()
  if (!raw) return null
  try {
    const url = new URL(raw)
    if (url.protocol !== "http:" && url.protocol !== "https:") return null
    return url.toString()
  } catch {
    return null
  }
}
