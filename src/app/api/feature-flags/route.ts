import { showFeedback } from "@/lib/feature-flags"

/* Not cached, said twice on purpose. Next runs a `GET` route handler at request
 * time unless the file opts into caching, so the default is already what this
 * route needs — but a flag that quietly became a build-time constant is the
 * exact failure this route exists to prevent, so the guarantee is written down:
 * the segment config for the framework, the response header for anything sitting
 * between the app and the browser. */
export const revalidate = 0

/**
 * GET /api/feature-flags — the flags the browser is allowed to see.
 *
 * One boolean, which is the point of the route: the answer is read out of this
 * server's environment per request, so the client is told what is on rather than
 * carrying a value that was compiled into it months ago. A second flag is a
 * second key here and a second reader next door.
 */
export function GET() {
  return Response.json(
    { showFeedback: showFeedback() },
    { headers: { "Cache-Control": "no-store" } }
  )
}
