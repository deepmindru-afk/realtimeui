"use client"

import { describeNote, type NoteRecord } from "@/components/conversation/notes"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { File as FileIcon, FileText, X } from "lucide-react"
import { useReducedMotion } from "motion/react"

/**
 * The note waiting to go out, shown inside the composer.
 *
 * Carries its size on the chip, because attaching a 2 MB file and a 200-byte one
 * look identical otherwise, and it is the one moment the user can still change
 * their mind about what they are about to send.
 *
 * A `progress` turns the same chip into a state of the same object rather than a
 * different one: the send is under way, the bar runs along the chip's bottom
 * edge, and the remove button is gone — the composer has nothing left to take
 * back once the bytes are on the wire.
 */
export function PendingNote({
  note,
  progress,
  onRemove,
}: {
  note: NoteRecord
  /** 0..1 while the file is streaming to the room; undefined when merely staged. */
  progress?: number
  onRemove?: () => void
}) {
  const reduce = useReducedMotion()
  const uploading = progress !== undefined
  /* One percent is the grain of this bar. The track, the printed number and the
   * value a screen reader reads are the same integer, so nothing on screen can
   * disagree about how far along the send is, and a sender reporting out of
   * range gets a full or an empty bar rather than one that overshoots its own
   * track. */
  const percent = uploading
    ? Math.min(100, Math.max(0, Math.round(progress * 100)))
    : 0
  /* The composer takes any file now, so a page with ruled lines on it would be
   * claiming a PDF is a note. `File` is that same page without the lines, so the
   * binary chip reads as a file of unknown kind and nothing about the chip's
   * metrics changes with the swap. */
  const Icon = note.binary ? FileIcon : FileText

  return (
    <div
      data-pending-note
      className="bg-secondary relative flex w-fit max-w-full items-center gap-2 overflow-hidden rounded-md py-1 pr-1 pl-2 text-xs"
    >
      <Icon className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
      <span className="truncate font-medium">{note.title}</span>
      {/* The size keeps its place and the percent takes the remove button's
       * slot, not the other way round: once the send has started the byte count
       * can no longer change anything, while the wait still can, and the
       * transcript card states the size for good a moment later. The slot is a
       * fixed width so the number cannot grow the chip on its way to 100, and
       * its line box is the height of the button it replaces — which is what
       * makes the two states the same height, not merely similar. */}
      <span className="text-muted-foreground shrink-0">{describeNote(note)}</span>
      {uploading ? (
        <span
          aria-hidden
          className="text-muted-foreground w-9 shrink-0 pr-0.5 text-right text-[11px] leading-6 tabular-nums"
        >
          {percent}%
        </span>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-6"
          aria-label={`Убрать ${note.title}`}
          onClick={onRemove}
        >
          <X className="size-3" aria-hidden />
        </Button>
      )}
      {uploading && (
        /* The bar is the chip's bottom edge, not a row added inside it: absolutely
         * positioned and clipped by the chip's own radius, it costs no height, so
         * the composer does not shove the textarea down at the exact moment the
         * user is watching this chip. The fill is a width transition rather than a
         * spinner because the number it is drawing is real, and it is dropped
         * entirely under reduced motion, where a chase animation reads as
         * stuttering rather than as progress.
         *
         * No live region. A value that moves on every frame through `aria-live` is
         * an interrupt storm, and screen readers coalesce or drop it depending on
         * their own debounce, so it is worse than saying nothing. The role and
         * value below are what anyone who goes looking for the progress reads, and
         * the send finishing is the transcript card's news to make — this chip is
         * already unmounted by then. */
        <span
          role="progressbar"
          aria-label={`Отправка файла ${note.title}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="bg-primary/10 absolute inset-x-0 bottom-0 h-0.5"
        >
          <span
            aria-hidden
            style={{ width: `${percent}%` }}
            className={cn(
              "bg-primary block h-full rounded-r-full",
              !reduce && "transition-[width] duration-200 ease-out"
            )}
          />
        </span>
      )}
    </div>
  )
}

/**
 * The note, still attached to the turn it travelled with.
 *
 * The whole file goes on the wire ahead of the question, so a transcript that
 * only showed the question would be quietly lying about what the agent was
 * given. This keeps it visible for as long as the turn is on screen, one tap
 * away, and states its real size so the cost of the request is never a surprise.
 */
export function SentNoteCard({ note }: { note: NoteRecord }) {
  return (
    <div
      data-sent-note
      className="border-border bg-muted/50 text-muted-foreground mt-2 overflow-hidden rounded-lg border"
    >
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        <FileText className="size-3.5 shrink-0" aria-hidden />
        <span className="text-foreground truncate text-xs font-medium">
          {note.title}
        </span>
        <span className="ml-auto shrink-0 text-[11px] tabular-nums">
          {describeNote(note)}
        </span>
      </div>
      {note.preview && (
        <pre
          aria-hidden
          className="border-border max-h-24 overflow-hidden border-t px-2.5 py-1.5 font-mono text-[11px] leading-4 whitespace-pre-wrap"
        >
          {note.preview}
        </pre>
      )}
    </div>
  )
}
