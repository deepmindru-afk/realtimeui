import { researchProjects } from "@/components/examples/research-workflow"

/**
 * Matching a half-typed question against the field-research starters.
 *
 * Pure, and deliberately so: this is the piece the composer, the suggestion
 * list and any test all have to agree on, and a rule that lives in a component
 * is a rule that gets re-implemented slightly differently the next time the
 * samples move. The two splices below are pure too, so "what does accepting do
 * to my text" has one answer per caller rather than one per keyboard handler.
 *
 * No React, no `window`, no fetch — `matchSamples` reads only its arguments and
 * the fixtures, which is what lets it be reasoned about (and tested) without a
 * browser.
 */

/** One starter, narrowed to the fields a suggestion needs. The notes behind a
 *  project never travel with it: a suggestion is a question to ask, not a body
 *  of evidence to paste. */
export type Sample = {
  id: string
  question: string
  /** The project the question came from, shown beside it in the list. */
  title: string
  subtitle: string
}

/**
 * The questions the composer completes against.
 *
 * The same array the empty state renders as chips, taken straight from the
 * fixtures. That is the whole point of the coupling: a starter an operator can
 * click but not complete toward would be two different sets of questions, and
 * the one only reachable by clicking would be the one nobody finds.
 */
export const SAMPLES: Sample[] = researchProjects.map((project) => ({
  id: project.id,
  question: project.question,
  title: project.title,
  subtitle: project.subtitle,
}))

export type SampleMatch = {
  id: string
  question: string
  title: string
  subtitle: string
  /** Index in `question` where the matched fragment begins. */
  start: number
  /** Length of that fragment, for the list to highlight it. */
  length: number
  /**
   * The rest of the question, and non-empty only when the draft is a true
   * prefix of it. This is the difference between the two surfaces: a tail can
   * be drawn at the caret as ghost text, while a match found somewhere in the
   * middle of a question only ever belongs in a list.
   */
  tail: string
}

/**
 * The shortest fragment worth matching.
 *
 * One Cyrillic letter is a real word — `в`, `к`, `с` all are — so a one-letter
 * floor would offer every sample from the second keystroke and turn the list
 * into noise. Two is the shortest prefix that still says something.
 */
const MIN_FRAGMENT = 2

/** The word being typed — everything after the last space. */
function fragmentOf(text: string): string {
  return text.slice(text.lastIndexOf(" ") + 1)
}

/**
 * Every sample the draft could be heading towards, best first.
 *
 * Two kinds of hit, and the difference is load-bearing:
 *
 *   - the draft is a prefix of the question, which yields a `tail`. The
 *     operator has started the question at its first word, so the rest of it is
 *     what they were about to type, and it can be shown at the caret.
 *
 *   - the word being typed begins one of a question's words, which yields no
 *     tail. `давай, передачу смен` should still find «Что замедляет передачу
 *     смены?» even though the draft is not a prefix of it, and that hit can only
 *     be offered as a list row.
 *
 * A prefix hit with nothing left to add is dropped rather than returned: the
 * operator has already typed the whole question, and offering to complete it
 * would put a row in the list whose tail is empty and whose acceptance changes
 * nothing.
 */
export function matchSamples(
  draft: string,
  samples: Sample[] = SAMPLES
): SampleMatch[] {
  /* Both ends: a leading indent is not part of the question, and a trailing
   * space means the next word has not been started yet. */
  const text = draft.trim()

  if (!text) {
    /* An empty draft matches every sample, and each one's tail is the whole
     * question. This is what makes the samples reachable from an empty
     * composer — the list is a starter list, not a way to finish a sentence. */
    return samples.map((sample) => ({
      id: sample.id,
      question: sample.question,
      title: sample.title,
      subtitle: sample.subtitle,
      start: 0,
      length: 0,
      tail: sample.question,
    }))
  }

  const needle = text.toLocaleLowerCase()
  const fragment = fragmentOf(needle)
  const found: SampleMatch[] = []

  for (const sample of samples) {
    const question = sample.question
    const lower = question.toLocaleLowerCase()
    const shared = {
      id: sample.id,
      question,
      title: sample.title,
      subtitle: sample.subtitle,
    }

    if (lower.startsWith(needle)) {
      const tail = question.slice(text.length)
      if (tail) found.push({ ...shared, start: 0, length: text.length, tail })
      continue
    }

    /* The word being typed has to *begin* one of the question's words. That is
     * the whole rule, and both halves of it matter:
     *
     *   `indexOf` alone would match inside a longer word, and the questions are
     *   short enough that one such hit fills the list with samples nobody asked
     *   about — `медл` is nowhere near a word in «Что замедляет передачу
     *   смены?», it is the middle of one.
     *
     *   Requiring the fragment to be a *whole* word, on the other hand, throws
     *   away the moment autocompletion exists for: `передачу смен` is a prefix
     *   of `смены`, and the operator is three keystrokes from a question the
     *   list can finish for them.
     *
     * So a word start is enough, and the highlight runs to the end of that word
     * rather than to the end of the fragment — the list says "your typing is
     * heading into this word", which is what a bold `смен` in the middle of
     * `смены` actually means. */
    if (fragment.length < MIN_FRAGMENT) continue
    const at = wordStartIndex(lower, fragment)
    if (at === -1) continue
    found.push({
      ...shared,
      start: at,
      length: wordEndIndex(lower, at) - at,
      tail: "",
    })
  }

  /* Prefix hits first, because they are the ones the caret can take. Then word
   * hits by how early they sit in the question, so a match in the opening words
   * outranks one near the end. `sort` is stable, so hits that tie keep the order
   * the fixtures list them — which is the order the empty state shows them in,
   * so the two surfaces cannot rank the same question differently. */
  return found.sort((a, b) => {
    if (Boolean(a.tail) !== Boolean(b.tail)) return a.tail ? -1 : 1
    return a.start - b.start
  })
}

/** The first index of `word` in `lower` that begins a word, or -1. */
function wordStartIndex(lower: string, word: string): number {
  let at = lower.indexOf(word)
  while (at !== -1) {
    if (at === 0 || lower[at - 1] === " ") return at
    at = lower.indexOf(word, at + 1)
  }
  return -1
}

/** Where the word beginning at `at` ends: the next space, or the end. */
function wordEndIndex(lower: string, at: number): number {
  const space = lower.indexOf(" ", at)
  return space === -1 ? lower.length : space
}

/**
 * The draft with a sample spliced in.
 *
 * Two splices, and which one runs is decided by the match rather than by the
 * caller.
 *
 * A match with a `tail` is one the draft is a prefix of, so the question
 * continues *this* text and the tail is all that is missing. Replacing the last
 * word there would repeat the words in front of it — `Что дол` plus
 * `Что должно…` is `Что Что должно…` — so this is `applyTail`, and a list row
 * and a ghost write the same message for the same suggestion.
 *
 * A match without one is a question the draft ran into somewhere in the middle
 * of, so the word being typed is what gets replaced. That is what a browser
 * address bar does, and for the same reason: a suggestion reached by typing one
 * word must not destroy the sentence around it. An operator who typed
 * `давай, передачу смен` and takes the match gets `давай, ` kept and the
 * question after it, not the question on its own.
 *
 * `trimStart` before the index is taken, and the offset added back, because the
 * index is into the trimmed string and has to land in the original one.
 */
export function applySample(draft: string, sample: SampleMatch): string {
  if (sample.tail) return applyTail(draft, sample)
  const body = draft.trimStart()
  const lead = draft.length - body.length
  const start = lead + body.lastIndexOf(" ") + 1
  return draft.slice(0, start) + sample.question
}

/**
 * The draft with a sample's tail appended — the ghost text, taken.
 *
 * A different splice from `applySample` on purpose. The ghost is only ever
 * offered when the draft is a genuine prefix of the question, so the question
 * continues *this* text rather than replacing a word inside it, and the result
 * has to be `question`, not `draft + tail` with whatever the operator's own
 * spelling of the first words happened to be.
 *
 * `trimEnd` first because a ghost shown with the caret at the end is a ghost
 * after trailing spaces, and `draft + tail` would put the sample's own leading
 * space next to them.
 */
export function applyTail(draft: string, sample: SampleMatch): string {
  return draft.trimEnd() + sample.tail
}
