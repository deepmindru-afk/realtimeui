/**
 * How large an attachment may be, and why that number is this number.
 *
 * The old limit was 64 KB, which was a chat limit: the file's text used to be
 * pasted into the request, so anything larger was a request the model had to be
 * fed by hand. The file now travels the room's data channel as bytes, where size
 * is a throughput question rather than a correctness one, and 64 KB would reject
 * nearly every real attachment — a photo of a whiteboard, a PDF of a report.
 *
 * So the cap guards the two things that still scale with size in this browser: a
 * text file is decoded whole to build its preview, and an operator is left
 * watching a progress bar. Ten megabytes is a judgement call rather than an
 * inherited one — comfortably above a phone photo or a scanned document, well
 * below what would leave someone waiting on a hotel connection.
 */
export const NOTE_LIMIT_BYTES = 10 * 1024 * 1024
/** How many lines of a note the transcript shows before it stops. */
const PREVIEW_LINES = 4
/** How much of a file is read before deciding whether it is text at all. */
const SNIFF_BYTES = 8 * 1024

export type NoteRecord = {
  /** The file name, which is also how the user recognises the note. */
  title: string
  bytes: number
  /** Zero for a binary file: it has no lines, and saying otherwise would be a
   *  claim nobody can check. */
  lines: number
  /** The opening lines, verbatim and cut only at a line boundary. Empty for a
   *  binary file, which is what keeps its card from printing decoded garbage. */
  preview: string
  /** Whether the file is bytes rather than readable text. Decoded by the app,
   *  never by the extension: a PDF named `.txt` is still a PDF. */
  binary: boolean
}

/**
 * A note on its way out: the record for display, and the file itself.
 *
 * The `File` is carried because the bytes have to still be there at send time —
 * they travel the room's data channel, not the composer, and nothing in the
 * component that holds a pending note is around long enough for the object the
 * picker produced to still be in scope. The decoded text is deliberately not
 * kept: the chip previews a few lines out of the record, and the whole decoded
 * copy used to be the payload for the wire, which is what the data channel
 * replaced.
 */
export type PendingNote = {
  record: NoteRecord
  file: File
}

/** Exported because the drop overlay states the limit in prose, and a number
 *  written into a sentence drifts from the number it claims to describe. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`
  return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} КБ`
}

/** One line of provenance: how big the note is, and how much of it there is. */
export function describeNote(note: NoteRecord): string {
  const size = formatBytes(note.bytes)
  if (note.binary) return size
  return `${size} · ${note.lines} ${count(note.lines, "строка", "строки", "строк")}`
}

/** Picks the Russian count form for `value`: one, few, many. */
function count(value: number, one: string, few: string, many: string) {
  const mod100 = Math.abs(value) % 100
  const mod10 = mod100 % 10
  if (mod100 >= 11 && mod100 <= 14) return many
  if (mod10 === 1) return one
  if (mod10 >= 2 && mod10 <= 4) return few
  return many
}

/**
 * Whether the head of a file is text: no NUL byte anywhere in it, and every byte
 * a valid UTF-8 sequence. Two tests rather than one because they fail for
 * different reasons — a NUL catches UTF-16 and most container formats whatever
 * their extension claims, and the fatal decode catches the rest.
 *
 * Both errors run the same way, and deliberately: calling a binary file text
 * would print mojibake in the transcript, while calling a text file binary costs
 * one missing preview. A head cut in the middle of a multi-byte sequence counts
 * as binary for the same reason — it is a truncation, not evidence.
 */
function isTextual(head: Uint8Array): boolean {
  for (const byte of head) {
    if (byte === 0) return false
  }
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(head)
    return true
  } catch {
    return false
  }
}

/**
 * Turns a dropped or picked file into what the app keeps: the record for
 * display, and the file to send.
 *
 * Rejects by throwing with a message written for the person reading it, because
 * both entry points — the picker and drag-and-drop — need to say the same thing
 * when a file cannot be used. Size is the only thing left that can refuse a
 * file; what it is decides nothing, because the room's data channel carries any
 * bytes at all. Whether it is *readable* is answered afterwards, by the bytes.
 */
export async function noteFromFile(file: File): Promise<PendingNote> {
  if (file.size > NOTE_LIMIT_BYTES) {
    throw new Error("Файл больше 10 МБ — возьмите файл поменьше.")
  }
  let buffer: ArrayBuffer
  try {
    buffer = await file.arrayBuffer()
  } catch {
    throw new Error("Не удалось прочитать файл. Попробуйте другой.")
  }
  const bytes = new Uint8Array(buffer)
  const head = bytes.subarray(0, Math.min(bytes.length, SNIFF_BYTES))
  const binary = !isTextual(head)
  /* Decoded whole, exactly as `file.text()` did it, because the line count and
   * the preview are both meant to describe the file rather than its first few
   * kilobytes. A binary file never gets past this line, which is the point: it
   * decodes to `""`, and empty text is what leaves the card with no preview and
   * no line count to state. */
  const text = binary ? "" : new TextDecoder("utf-8").decode(bytes)
  return {
    record: {
      title: file.name,
      bytes: file.size,
      lines: text.length === 0 ? 0 : text.split("\n").length,
      preview: text.split("\n").slice(0, PREVIEW_LINES).join("\n"),
      binary,
    },
    file,
  }
}
