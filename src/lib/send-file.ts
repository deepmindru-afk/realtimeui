import type { LocalParticipant } from "livekit-client"

/**
 * The transport for an attached note: the file travels the room's data channel,
 * not the chat.
 *
 * A note used to go out as a block of text pasted onto the front of the
 * question, which meant the bytes were re-encoded into prose the agent had to
 * trust, counted against the request, and copied into the chat log where anyone
 * reading the session would see a field note they never sent to the room. The
 * room's own file channel carries the bytes as bytes and the far end decides
 * whether to fetch them, so the file is delivered intact, out of band, and the
 * request that follows can name it in a single line.
 */
export interface SendFileOptions {
  /** Data-channel topic the receiving side subscribes on. */
  topic?: string
  /** 0..1 as the bytes go out, for a progress indicator. */
  onProgress?: (progress: number) => void
}

/** What the room accepted: the transfer's id, plus what the operator picked. */
export interface SendFileResult {
  id: string
  name: string
  size: number
  type: string
}

/**
 * Hands the file to the room and reports back once it has fully arrived.
 *
 * Resolving is the completion signal: the text that refers to this file is only
 * sent afterwards, so an agent cannot be asked about bytes that are still in
 * flight. A rejection is left to the caller to word — the reasons worth
 * distinguishing (a dead room, a refused permission) are the caller's to know.
 */
export async function sendFile(
  participant: LocalParticipant,
  file: File,
  options: SendFileOptions = {}
): Promise<SendFileResult> {
  const { topic = "files", onProgress } = options
  const { id } = await participant.sendFile(file, {
    topic,
    mimeType: file.type,
    onProgress,
  })

  return { id, name: file.name, size: file.size, type: file.type }
}
