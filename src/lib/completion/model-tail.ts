/**
 * Turning whatever the model said into text a composer can show as ghost.
 *
 * A completion is drawn inline, immediately after the operator's own words, and
 * everything a model does in the first token of a continuation is wrong for
 * that position: it opens a quotation to repeat the prompt, it restates the
 * instruction, it says `Sure!` and puts a newline before getting to the point.
 * None of it can be deleted afterwards without leaving a seam, so it is refused
 * here instead — one place, before the text ever reaches a component.
 *
 * Pure and server-side, because the route is the only caller and a `fetch` of a
 * completion is not something the browser should be trusted to tidy up.
 */

/** Long enough for a clause, short enough to read at a glance in the composer. */
export const MAX_TAIL = 160

/** A draft this long is not being started, it is already written. */
export const MAX_PROMPT = 400

/**
 * An acknowledgement followed by a real sentence — `Sure! Here is…`,
 * `Of course. The second one…`.
 *
 * The run of characters between the greeting and the punctuation is capped at
 * 40 and the match is lazy about where it stops, which sounds contradictory and
 * is not: greedy with a backtrack lands on the *last* delimiter, so
 * `Here is the continuation: передача` loses the whole clause head rather than
 * stopping at the full stop in `is`. That is the one we want — the greeting
 * keeps going until the part that is actually the continuation.
 */
const GREETING =
  /^(?:sure|of course|certainly|got it|understood|here(?:'s| is)|okay|ok|alright)\b[^\n]{0,40}[.!…:—-]\s*/i

/**
 * An acknowledgement with nothing after it to point at — `Ok передача`,
 * `Sure! передача`.
 *
 * Separate from `GREETING` because it has no punctuation to anchor on, and
 * without it `Ok передача смены` survives intact and the ghost opens with an
 * "Ok". Safe for a model to over-apply here in a way the long form is not: a
 * completion cannot legitimately begin `Ok ` or `Sure `, because whatever the
 * operator typed comes immediately before it.
 */
const ACKNOWLEDGEMENT = /^(?:okay|ok|alright|sure|got it|certainly)\b\s+/i

/** A run of opening quotation marks, which is the model repeating the prompt. */
const OPENERS = /^[«„“"']+\s*/

/** Opening mark to its closing, for the pair a well-behaved repetition uses. */
const CLOSERS: Record<string, string> = {
  "«": "»",
  "„": "”",
  "“": "”",
  '"': '"',
  "'": "'",
}

/**
 * A continuation worth drawing at the caret, or `""` if there is not one.
 *
 * The first line only, because a completion is inline: a model that starts
 * drafting a second paragraph has stopped completing and started answering,
 * and the operator's Enter belongs to *their* question, not to the model's
 * guess at where it ended.
 *
 * A leading space is kept, not trimmed. The tail is spliced onto the end of a
 * draft, and whether that splice needs a word boundary depends on what the
 * operator last typed: `передачу` needs one, `передачу ` already has it. The
 * caller drops the draft's trailing space first, so the model's leading one is
 * what separates the two — trim it here and the two words arrive welded
 * together whenever the operator had not typed a space.
 */
export function cleanModelTail(raw: string): string {
  const first = raw.replace(/\r/g, "").split("\n")[0] ?? ""
  const spoken = first
    .replace(GREETING, "")
    .replace(ACKNOWLEDGEMENT, "")
    .replace(OPENERS, "")

  const tail = unquote(spoken).trimEnd()
  if (tail.length > MAX_TAIL) return `${tail.slice(0, MAX_TAIL).trimEnd()}…`
  return tail
}

/**
 * The quotation, gone.
 *
 * A whole layer if it is balanced — the model quoted the whole continuation —
 * and whatever is left dangling either way if it is not, because a single
 * `»` at the end of a ghost tail is exactly the kind of thing an operator stops
 * to ask about mid-sentence. A quotation that was opened and never closed is
 * not a quotation; it is the model still working.
 */
function unquote(text: string): string {
  const opener = text[0]
  const closer = opener ? CLOSERS[opener] : undefined
  if (closer && text.length > 1 && text.endsWith(closer)) {
    return text.slice(1, -1).trim()
  }
  return text.replace(OPENERS, "").replace(/\s*[»”“"']+\s*$/, "")
}
