import { COMMANDS, type Command } from "@/lib/completion/commands"
import { SAMPLES, type Sample } from "@/lib/completion/match-samples"

/**
 * The two local corpora, and the one contract for getting them from somewhere
 * else.
 *
 * The composer used to complete from arrays that lived in this repository: the
 * starters out of `research-workflow`, the commands out of this folder. Both are
 * still here, and both are still the default — but they are now a *fallback*
 * rather than the source, because the questions an operator is offered and the
 * commands they can type are deployment data. Pinning them in a bundle means a
 * new set of questions is a commit and a release, which is the wrong tool for
 * changing what a menu says.
 *
 * So the service behind `AUTOCOMPLETE_API_URL` decides, and this file decides
 * what happens to whatever it sends back. That second job is the reason this
 * module exists at all: JSON arriving from a URL is not the same thing as an
 * array someone typed, and the difference has to be handled once, here, rather
 * than in every component that reads it.
 *
 *   - a sample without a `question` is dropped, because the question is the
 *     sample — it is what gets written into the composer, and a row that writes
 *     nothing is a row that lies about what picking it does;
 *
 *   - a command whose `key` could never be typed is dropped, because
 *     `parseCommand` only ever recognises `/([\w-]*)` and a name that the parser
 *     cannot match is a menu entry that does nothing when pressed;
 *
 *   - a corpus the service did not send falls back to the bundled one, so an
 *     endpoint that only knows about questions does not silently delete the
 *     command menu.
 *
 * Pure, and for the same reason `match-samples` and `commands` are: no React, no
 * `window`, no fetch. It runs on the server to validate a response and on the
 * browser to validate the route that carried it, and one rule in one place is
 * what stops those two from disagreeing about what a valid sample is.
 */

/** The two corpora, as the composer and the empty state consume them. */
export type AutocompleteSources = {
  samples: Sample[]
  commands: Command[]
}

/**
 * The corpora as this repository ships them.
 *
 * A function rather than a constant, so a caller holding the fallback cannot
 * write to the array every other caller in the app is also holding. Nothing
 * mutates them today; the point is that the next thing to arrive does not have
 * to be that thing.
 */
export function bundledSources(): AutocompleteSources {
  return { samples: SAMPLES, commands: COMMANDS }
}

/**
 * How many of each a service may send.
 *
 * Not a politeness limit on the data — a bound on the menu. Everything here
 * re-runs `matchSamples` on every keystroke and then renders whatever survives,
 * so a service that returns ten thousand questions does not get a slow composer,
 * it gets a browser tab that stops responding, and the failure looks like a bug
 * in the app rather than a mistake in the response. Three questions and six
 * commands are what the feature is built for; these numbers are far above that
 * and exist only so that "far above" has a ceiling.
 */
const MAX_SAMPLES = 200
const MAX_COMMANDS = 60

/** A plain object, or null for everything else. Arrays are not objects here. */
function recordOf(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/** A trimmed string, or `""` for anything that is not a string. */
function textOf(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

/**
 * `parseCommand`'s own character class, applied to the key before it is kept.
 *
 * The same expression the parser uses, on purpose: the set of keys that can be
 * typed is defined in exactly one place, and a service is held to it rather than
 * a second, nearly-identical rule being applied here and drifting from the one
 * in `commands.ts`.
 */
const COMMAND_KEY = /^[\w-]+$/u

function toSample(value: unknown, index: number): Sample | null {
  const row = recordOf(value)
  if (!row) return null
  const question = textOf(row.question)
  if (!question) return null
  return {
    /* The id is the list's React key and nothing else — matching is by text —
     * so an id is only worth having when the service sent one, and an index is
     * an honest stand-in when it did not. */
    id: textOf(row.id) || `sample-${index}`,
    question,
    /* The two labels are decoration beside the question, so a service that
     * sends none of them gets a row that is shorter rather than a dropped
     * question. */
    title: textOf(row.title),
    subtitle: textOf(row.subtitle),
  }
}

function toCommand(value: unknown): Command | null {
  const row = recordOf(value)
  if (!row) return null
  /* The slash is stripped and the key lowercased, because both `parseCommand`
   * and `expandCommand` compare a candidate against a lowercased draft. A
   * service that wrote `"/Summary"` would otherwise ship a command the parser
   * cannot see at all — present in the list, unreachable by keyboard. */
  const key = textOf(row.key).replace(/^\/+/u, "").toLowerCase()
  if (!COMMAND_KEY.test(key)) return null
  return {
    key,
    hint: textOf(row.hint),
    /* A command with no prompt is still a menu entry — the operator gets the
     * name and the space, and writes the sentence themselves. It simply is not
     * expandable, which `expandCommand` accounts for. */
    prompt: textOf(row.prompt),
  }
}

/** `value` run through `build`, dropping what it rejects and the duplicates. */
function listOf<T>(
  value: unknown,
  build: (item: unknown, index: number) => T | null,
  fingerprint: (item: T) => string,
  limit: number
): T[] {
  if (!Array.isArray(value)) return []
  const out: T[] = []
  const taken = new Set<string>()
  for (const [index, item] of value.slice(0, limit).entries()) {
    const built = build(item, index)
    if (!built) continue
    /* Deduplicated on what the operator would see, not on the id: two rows
     * carrying the same question, or the same command name, offer the same thing
     * twice and take the same splice to accept, so the second is noise. Ids are
     * only the list's keys and may legitimately repeat. */
    const key = fingerprint(built)
    if (taken.has(key)) continue
    taken.add(key)
    out.push(built)
  }
  return out
}

/**
 * What a service sent, as far as it can be believed.
 *
 * Liberal about the envelope and strict about the contents. A bare array is read
 * as a list of samples, because a service whose entire job is "these are the
 * questions" should not have to know this app's field names; `{ samples, commands
 * }` is the documented shape and the only one that can carry both. Anything
 * else is `null`.
 *
 * `null` means *nothing usable at all*, which is not the same as one corpus
 * missing: a response with samples but no commands is a partial answer and comes
 * back as an empty `commands` array for `sourcesWithFallback` to fill.
 */
export function parseSources(payload: unknown): AutocompleteSources | null {
  const body = Array.isArray(payload)
    ? { samples: payload }
    : recordOf(payload)
  if (!body) return null

  const samples = listOf(
    body.samples,
    toSample,
    (sample) => sample.question,
    MAX_SAMPLES
  )
  const commands = listOf(
    body.commands,
    toCommand,
    (command) => command.key,
    MAX_COMMANDS
  )
  if (!samples.length && !commands.length) return null
  return { samples, commands }
}

/**
 * A service's answer laid over the bundled corpora, and the only place that
 * decides what "the service did not answer" means.
 *
 * `null` — unset environment, unreachable host, non-JSON, a shape with nothing
 * in it — is the whole bundled set. An empty corpus is the bundled one, because
 * an empty menu is indistinguishable from a broken one to the person looking at
 * it, and the bundled questions are real questions this agent can answer.
 *
 * Deliberately unable to *reduce* the menu. A service that wants a different set
 * of questions sends a different set; one that wants no commands cannot say so,
 * and should not need to — the commands are the part the agent's own
 * instructions promise, so losing them is a broken deployment rather than a
 * configuration.
 */
export function sourcesWithFallback(parsed: AutocompleteSources | null): AutocompleteSources {
  const bundled = bundledSources()
  if (!parsed) return bundled
  return {
    samples: parsed.samples.length ? parsed.samples : bundled.samples,
    commands: parsed.commands.length ? parsed.commands : bundled.commands,
  }
}
