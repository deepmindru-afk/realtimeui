"use client"

import {
  applyCommand,
  COMMANDS,
  matchCommands,
  parseCommand,
  type Command,
  type CommandMatch,
} from "@/lib/completion/commands"
import {
  applySample,
  applyTail,
  matchSamples,
  SAMPLES,
  type Sample,
  type SampleMatch,
} from "@/lib/completion/match-samples"
import { useCallback, useEffect, useMemo, useState } from "react"

/**
 * Autocompletion for the chat composer: one suggestion surface, three sources,
 * and a keyboard model that never has to guess which one a key press means.
 *
 * Which surface is live follows from what the draft matched, and the rule is a
 * partition rather than a priority list:
 *
 *   one suggestion that continues it → its tail, drawn at the caret
 *   two or more suggestions         → the list
 *   none at all                     → the model's continuation, at the caret
 *
 * The rule is the same whichever corpus it is applied to, and that is why there
 * is one hook rather than a command menu bolted onto the side: samples, slash
 * commands and the model all answer the same three questions — is there one,
 * are there several, is there none — and a second surface with its own keyboard
 * would be a second set of answers to `Tab` and `Enter` on the same input.
 *
 * Which corpus applies is decided by the draft, not by the source. A draft that
 * is a command token (a slash at the very start) completes against the commands
 * and nothing else — in particular not the model, because there is no sensible
 * completion of the middle of a command name and a plausible-looking one is
 * worse than silence. Every other draft completes against the samples, and
 * falls through to the model only when no sample matches.
 *
 * Both corpora are arguments. They used to be module constants read from
 * `research-workflow` and `commands.ts`, which made the questions this menu
 * offers a thing you changed by committing; they are service data now, and the
 * only requirement on this file is that it ranks whatever it is given the same
 * way it ranked the bundled set.
 *
 * A single suggestion found in the middle of a question — the operator typed
 * `передачу смен`, which is inside «Что замедляет передачу смены?» but is not a
 * prefix of it — has no tail to draw, so it goes to the list with everything
 * else. It is a suggestion, not a continuation, and putting it at the caret
 * would be claiming a sentence the operator did not start.
 *
 * The reason it is a partition and not "samples first, model as a fallback" is
 * that two suggestions on one screen is two answers to "what does Tab do", and
 * a key that means different things depending on which source answered last is
 * a key nobody trusts. So the ghost and the list never coexist: the list appears
 * exactly when the caret has no single "the rest" to show, and it takes the
 * keys the ghost would otherwise have had.
 *
 * The empty draft matches every sample, so it always lands in the list. That is
 * how the starters are reachable from an empty composer without a second list
 * somewhere on the screen.
 */

/** A suggestion, tagged with the corpus it came from. */
export type Suggestion =
  | { kind: "sample"; match: SampleMatch }
  | { kind: "command"; match: CommandMatch }

/** Long enough to sit still for, and still be worth completing. */
const MIN_MODEL_PROMPT = 3

/** Long enough that a pause in typing means "I stopped", not "I am mid-word". */
const MODEL_DEBOUNCE = 300

export type ComposerAutocomplete = {
  /** The tail to draw at the caret, or `""` when there is no ghost. */
  ghost: string
  /** Suggestions, best first. Empty unless the list is the surface. */
  matches: Suggestion[]
  /** Whether the list is showing. */
  listOpen: boolean
  /** The highlighted row, or `0`. Always inside `matches` when the list is up. */
  activeIndex: number
  /* `onKeyDownCapture`, not `onKeyDown`. See `onEnter` for why Enter cannot be
   * handled from a prop handler at all; this is the same hazard one key over.
   * `PromptInputTextarea` sets its own `onKeyDown` and spreads caller props
   * *after* it, so a `onKeyDown` passed down would replace the handler that
   * turns Enter into a submission. The capture prop is one nothing overwrites,
   * and running first is a bonus rather than a dependency — every key claimed
   * here is a key the textarea does not act on. */
  onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void
  onFocus: () => void
  onBlur: () => void
  /** `PromptInput`'s `onSubmit`: did this Enter take a row, or send? */
  onEnter: () => boolean
  acceptMatch: (suggestion: Suggestion) => void
}

export function useComposerAutocomplete({
  value,
  onChange,
  getTextarea,
  disabled = false,
  offerSamples = false,
  samples = SAMPLES,
  commands = COMMANDS,
}: {
  value: string
  onChange: (value: string) => void
  /** The composer's textarea, reached rather than handed over.
   *
   *  `PromptInputTextarea` owns its own ref and spreads caller props after it,
   *  so a `ref` passed down would replace the one that keeps the context's
   *  element and autosizes the box. A getter is the same node with none of
   *  that risk, and it is what the rest of this file already does. */
  getTextarea: () => HTMLTextAreaElement | null
  disabled?: boolean
  /** Whether an empty draft should offer the samples at all. The empty
   *  transcript is the one place a list of starters is wanted rather than in
   *  the way. */
  offerSamples?: boolean
  /** The questions to complete toward, and the commands to complete toward.
   *
   *  Taken as arguments rather than imported, because they are deployment data
   *  now: `AutocompleteSourcesProvider` hands over the service's answer once it
   *  has one, and this hook has no business knowing a bundled copy exists. The
   *  defaults keep it usable standalone — the same role the defaults inside
   *  `matchSamples` and `matchCommands` play for their own callers. */
  samples?: Sample[]
  commands?: Command[]
}): ComposerAutocomplete {
  const [focused, setFocused] = useState(false)
  /* The draft as it was when Escape last dismissed the suggestions. Compared by
   * value rather than cleared on the next keystroke, so a dismissal survives the
   * re-render the dismissal itself causes and lifts the moment the text really
   * changes. */
  const [dismissedAt, setDismissedAt] = useState<string | null>(null)
  /* The highlighted row, tagged with the ranking it was chosen from.
   *
   * An index alone cannot survive a keystroke: typing a character re-ranks the
   * list, so row 2 of the old list is not row 2 of the new one, and a bare
   * index would leave the highlight somewhere the text is not. Tagging it with
   * the array it belongs to derives the reset — a new ranking is a new
   * reference, so the highlight is back at the top — without an effect that
   * writes state on every render to achieve it. */
  const [highlight, setHighlight] = useState<{
    list: Suggestion[]
    index: number
  } | null>(null)
  /* Whether the caret sits at the end of the draft. The ghost is drawn at the
   * caret, and a tail spliced onto the end of a draft whose caret is in the
   * middle lands behind the cursor — which reads as a bug even though the text
   * is fine. Read off the element rather than tracked, because the caret moves
   * on clicks and selections that no keystroke announces. */
  const [caretAtEnd, setCaretAtEnd] = useState(true)
  /* The model's answer, tagged with the draft it was asked about. Derived the
   * same way as the highlight, and for the same reason: a tail that belonged to
   * the last word of a draft is a tail for a draft that no longer exists, and
   * comparing the tag is what makes it vanish without an effect clearing it. */
  const [model, setModel] = useState<{ text: string; tail: string } | null>(
    null
  )

  const dismissed = dismissedAt === value
  const modelTail = model && model.text === value ? model.tail : ""

  /* The corpus, chosen by the draft rather than by the source. A command token
   * takes the whole input: the operator is naming a command, and offering a
   * sample question or a model's guess at the middle of a command name would be
   * two different answers to the same keystroke. Once the name is finished the
   * token stops parsing, and the draft completes against nothing at all — which
   * is the right answer, because `/summary ` is a question the operator is
   * halfway through writing, not something to suggest the rest of. */
  const command = useMemo(() => parseCommand(value), [value])
  const matches = useMemo<Suggestion[]>(() => {
    if (command) {
      return matchCommands(command, commands).map((match) => ({
        kind: "command" as const,
        match,
      }))
    }
    if (!value.trim() && !offerSamples) return []
    return matchSamples(value, samples).map((match) => ({
      kind: "sample" as const,
      match,
    }))
  }, [command, commands, offerSamples, samples, value])
  const activeIndex = highlight?.list === matches ? highlight.index : 0
  const moveHighlight = useCallback(
    (index: number) => setHighlight({ list: matches, index }),
    [matches]
  )

  const live = focused && !disabled && !dismissed
  /* One match is the ghost only when it can be drawn at the caret. */
  const single = matches.length === 1 ? matches[0] : null
  const listOpen = live && (matches.length > 1 || Boolean(single && !single.match.tail))

  const ghost = useMemo(() => {
    if (!live || listOpen || !caretAtEnd) return ""
    if (single) return single.match.tail
    /* Nothing local that could continue the draft, so whatever the model last
     * offered for this exact text — `""` until it answers, and again as soon
     * as the draft is not the one it saw. */
    return matches.length === 0 ? modelTail : ""
  }, [live, listOpen, caretAtEnd, single, matches.length, modelTail])

  /* The model's turn is last in the partition, and only for a draft that has
   * stopped looking like any sample.
   *
   * Never for anything starting with a slash, and the test for that is the
   * first character rather than `parseCommand`. `parseCommand` is
   * deliberately strict — it only matches a name *being typed* — so the moment
   * a command is accepted the draft is `/summary ` and no longer a token. Keying
   * off the parse alone would drop straight through to the model and ask it to
   * finish the sentence after a slash, which is the one completion nobody
   * wanted. A leading slash is a command or a URL, and neither is the model's
   * business. */
  const wantsModel =
    !value.startsWith("/") &&
    live &&
    matches.length === 0 &&
    value.trim().length >= MIN_MODEL_PROMPT

  /* Keystrokes, tab switches, undo and a paste all move the caret without
   * changing the value, so the position is sampled off the element. `focused`
   * is in the dependency list because the listeners are attached only once the
   * element exists and can be clicked — and because a ghost is never shown
   * before that, nothing is missed by waiting. */
  useEffect(() => {
    if (!focused) return
    const textarea = getTextarea()
    if (!textarea) return
    const sample = () =>
      setCaretAtEnd(textarea.selectionStart === textarea.value.length)
    sample()
    textarea.addEventListener("select", sample)
    textarea.addEventListener("click", sample)
    textarea.addEventListener("keyup", sample)
    return () => {
      textarea.removeEventListener("select", sample)
      textarea.removeEventListener("click", sample)
      textarea.removeEventListener("keyup", sample)
    }
  }, [getTextarea, focused, value])

  /* The model call, in an effect of its own rather than folded into the caret
   * one: this one waits out a pause in typing and that one answers immediately,
   * and sharing a trigger would mean every caret move scheduled a request. */
  useEffect(() => {
    if (!wantsModel) return
    const abort = new AbortController()
    const timer = setTimeout(() => {
      void fetch("/api/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: value }),
        signal: abort.signal,
      })
        .then((response) => (response.ok ? response.json() : { completion: "" }))
        .then((body: { completion?: string }) => {
          if (abort.signal.aborted) return
          setModel({
            text: value,
            tail: typeof body.completion === "string" ? body.completion : "",
          })
        })
        /* A completion that fails is a completion that does not appear. The
         * samples still work, the composer still works, and the operator finds
         * out from the absence of grey text rather than from a message. */
        .catch(() => {
          /* Nothing to undo and nothing to say: the tagged tail for this draft
           * was never set, so the ghost is already empty. */
        })
    }, MODEL_DEBOUNCE)
    return () => {
      clearTimeout(timer)
      abort.abort()
    }
  }, [wantsModel, value])

  /* The caret belongs at the end of whatever a suggestion just wrote, and the
   * element is the only place that can be told so. On the next frame, because
   * the value the DOM has to adopt is the one this write schedules. */
  const settleCaret = useCallback(() => {
    requestAnimationFrame(() => {
      const textarea = getTextarea()
      if (!textarea) return
      textarea.focus()
      const end = textarea.value.length
      textarea.setSelectionRange(end, end)
    })
  }, [getTextarea])

  const acceptMatch = useCallback(
    (suggestion: Suggestion) => {
      onChange(
        suggestion.kind === "command"
          ? applyCommand(value, suggestion.match)
          : applySample(value, suggestion.match)
      )
      settleCaret()
    },
    [onChange, settleCaret, value]
  )

  const acceptGhost = useCallback(() => {
    if (!ghost) return
    /* A local tail is spliced rather than appended, so the suggestion comes out
     * whole and in its own spelling — the sample question, or the rest of a
     * command name. A model's continuation is text the draft never had, so
     * appending is the whole of it. All three are only offered with the caret
     * already at the end. */
    onChange(
      single
        ? single.kind === "command"
          ? applyCommand(value, single.match)
          : applyTail(value, single.match)
        : value.trimEnd() + ghost
    )
    settleCaret()
  }, [ghost, onChange, settleCaret, single, value])

  /* Escape does not have to tidy up after itself. `dismissedAt` is compared
   * against the draft, so the suggestions are already out of play from the
   * render that sets it, and the in-flight request is already cancelled because
   * `wantsModel` went false with it. */
  const dismiss = useCallback(() => setDismissedAt(value), [value])

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.defaultPrevented) return
      const plain =
        !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey

      if (event.key === "Escape" && (listOpen || ghost)) {
        /* Kept from the shell, which also listens for Escape. It ignores
         * typing targets today, so this is belt and braces for a listener that
         * does not. */
        event.preventDefault()
        event.stopPropagation()
        dismiss()
        return
      }

      if (listOpen) {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          /* `preventDefault` is what stops the arrow moving the caret and
           * leaving the highlight pointed at a row the text is not on. */
          event.preventDefault()
          if (matches.length < 2) return
          const step = event.key === "ArrowDown" ? 1 : -1
          moveHighlight((activeIndex + step + matches.length) % matches.length)
          return
        }
        if (event.key === "Tab" && plain) {
          event.preventDefault()
          const match = matches[activeIndex] ?? matches[0]
          if (match) acceptMatch(match)
          return
        }
      }

      if (ghost && event.key === "Tab" && plain) {
        event.preventDefault()
        acceptGhost()
        return
      }

      /* ArrowRight takes the ghost the way Tab does, and only here: with the
       * caret at the end an ArrowRight has nowhere to go, so the key is free to
       * mean "yes, that one" rather than "stay where you are". */
      if (ghost && event.key === "ArrowRight" && caretAtEnd && plain) {
        event.preventDefault()
        acceptGhost()
      }
    },
    [acceptGhost, acceptMatch, activeIndex, caretAtEnd, dismiss, ghost, listOpen, matches, moveHighlight]
  )

  /**
   * Enter, arbitrated here rather than in `onKeyDown`.
   *
   * `PromptInputTextarea` submits on Enter *before* it forwards the event to
   * `onKeyDown`, so a key handler cannot un-ring that bell — `preventDefault`
   * and `stopPropagation` are both too late by the time a prop handler runs.
   * Routing `PromptInput`'s own `onSubmit` through here puts the decision in
   * the one place that runs first, and makes the question explicit: did this
   * Enter take a row, or send the message?
   */
  const onEnter = useCallback(() => {
    if (!listOpen) return false
    const match = matches[activeIndex] ?? matches[0]
    if (!match) return false
    acceptMatch(match)
    return true
  }, [acceptMatch, activeIndex, listOpen, matches])

  return {
    ghost,
    matches: listOpen ? matches : [],
    listOpen,
    activeIndex,
    onKeyDown,
    onEnter,
    onFocus: useCallback(() => setFocused(true), []),
    onBlur: useCallback(() => setFocused(false), []),
    acceptMatch,
  }
}
