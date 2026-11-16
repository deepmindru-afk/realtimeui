/**
 * Switches for UI that is not always on, resolved on the server.
 *
 * One reader per flag over one parser, so the next flag is a line here rather
 * than a second way of asking the same question. A flag that governs more than
 * one surface is read in every one of them, so there is never a half-visible
 * feature to explain.
 */

/**
 * Reads an environment boolean as an operator writes it.
 *
 * Parsed rather than coerced, and the reason is a single string: `Boolean("false")`
 * is `true`, and "false" is what someone types into a deploy dashboard when they
 * mean to switch something off. So the only values that mean on are `"1"` and
 * `"true"`, and everything else — unset, empty, `"0"`, `"no"`, `"off"`, a typo —
 * is off. An undocumented value must never be able to turn on a feature the
 * operator was told was hidden.
 */
function isEnabled(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase()
  return normalized === "1" || normalized === "true"
}

/**
 * The like/dislike controls: under each finished answer, and once at the end of
 * a session. Off unless it was asked for, which is why the default is the one
 * that says no.
 *
 * Read on the server, per request, rather than inlined into the client bundle at
 * build time — which is what a `NEXT_PUBLIC_` name would do, freezing the
 * answer into the artefact and making a flip a rebuild. Here a flip is the
 * server picking up a new environment, and the browser's next page load is all
 * it takes to see it.
 */
export function showFeedback(): boolean {
  return isEnabled(process.env.SHOW_FEEDBACK)
}
