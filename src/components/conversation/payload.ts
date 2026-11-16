import type { NoteRecord } from "@/components/conversation/notes"

/**
 * The one sentence that flips a concise request into a detailed one. It is a
 * constant because the composer and the disclosure both need it: the composer
 * appends it to the request, and the disclosure shows the user that exact
 * sentence. Held in two places, the two would drift and the app would start
 * describing a request it did not send.
 */
export const DETAIL_INSTRUCTION = "Пожалуйста, дай развёрнутый ответ."

/** Everything that actually went on the wire for one turn, kept for display. */
export type SentPayload = {
  /** What the person typed — or the transcript, when they spoke it. */
  question: string
  source: "text" | "voice"
  /** The note sent alongside this turn, when one was attached. Its content is
   *  not here: the bytes went over the data channel, and this is only the
   *  receipt the transcript shows. */
  note: NoteRecord | null
  /** The appended sentence, or null when the request went out as typed. */
  instruction: string | null
}

/**
 * Assembles the request text.
 *
 * The app is a front end to someone else's agent, which means what the user
 * reads in the composer and what the agent receives are not the same string: a
 * style sentence may be appended. Keeping the assembly here means the disclosure
 * panel in the transcript can describe the request accurately instead of
 * reconstructing it and hoping.
 *
 * An attached note contributes a name and nothing else. The file itself is
 * already on the room's file channel by the time this runs, so the request says
 * which file the turn is about and lets the receiving end fetch the bytes; a
 * transcript that quoted the note into the question would claim the content
 * travelled as chat text, which it no longer does.
 */
export function buildRequest(payload: SentPayload): string {
  const parts: string[] = []
  if (payload.note) {
    parts.push(`К запросу приложен файл «${payload.note.title}».`)
  }
  if (payload.question) parts.push(payload.question)
  if (payload.instruction) parts.push(payload.instruction)
  return parts.join("\n\n")
}
