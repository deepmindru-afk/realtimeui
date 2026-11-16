"use client"

import { formatBytes, NOTE_LIMIT_BYTES } from "@/components/conversation/notes"
import { FileUploadContent } from "@/components/prompt-kit/file-upload"
import { cn } from "@/lib/utils"
import { File as FileIcon } from "lucide-react"

/**
 * The full-window drop target, rendered only while a file is actually over the
 * window — `FileUploadContent` portals it to the body and unmounts it the
 * moment the drag counter returns to zero, so it never sits there dimming the
 * app for a gesture the user may have abandoned.
 *
 * It states the one rule left instead of hiding it. The whitelist is gone — the
 * room's data channel carries any bytes, and what a file is gets decided from
 * its own contents afterwards — so the only thing that can still refuse a drop
 * is its size, and a target that says "отпустите здесь" would teach that by
 * rejection. The number comes from the same constant the guard reads, because a
 * limit written into a sentence is a limit that quietly stops being true.
 */
export function DragOverlay({ className }: { className?: string }) {
  return (
    <FileUploadContent data-drag-overlay className={cn(className)}>
      <div className="border-primary/40 bg-card text-foreground flex w-full max-w-md flex-col items-center gap-3 rounded-xl border border-dashed px-8 py-12 text-center">
        <span className="bg-secondary flex size-11 items-center justify-center rounded-full">
          <FileIcon className="text-muted-foreground size-5" aria-hidden />
        </span>
        <p className="text-sm font-medium">Отпустите, чтобы добавить в контекст</p>
        <p className="text-muted-foreground text-xs leading-5">
          Любой файл, до {formatBytes(NOTE_LIMIT_BYTES)}. Он уйдёт вместе со
          следующим сообщением и останется виден на этом ходе.
        </p>
      </div>
    </FileUploadContent>
  )
}
