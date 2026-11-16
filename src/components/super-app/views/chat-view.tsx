"use client"

import { FieldworkAssistant } from "@/components/fieldwork-assistant"

/**
 * The chat surface: the live Portal conversation, unchanged, living inside the
 * shell's content column.
 *
 * `FieldworkAssistant` is a whole screen — it brings its own rail, header,
 * transcript, composer and status footer — and the shell brings its own rail
 * and header too. Two of each would be two navigations forty pixels apart and
 * two theme toggles, so the assistant's navigation and page identity step aside
 * and the transcript and the status footer stay. That is what the two
 * structural selectors below do, and they are the only place this coupling
 * lives:
 *
 *   [&>aside]         the assistant's `SidebarNav` — the shell's rail replaces it
 *   [&>div>header]    the assistant's title row — the shell's topbar replaces it
 *
 * They are structural because the component exposes no props for either, and
 * `fieldwork-assistant.tsx` is not this lane's to change. They are also the
 * first thing to break if that file's shape moves: if the rail or the header
 * stops being a direct child of the section, the extra rail simply comes back,
 * which is a cosmetic regression rather than a broken screen.
 *
 * The two size classes undo its viewport sizing. It ships `h-dvh min-h-[560px]`
 * because it used to own the window; here the shell owns the height and hands
 * down a box with a definite one, so the view fills it and the transcript
 * scrolls inside it. Left as `h-dvh`, it would be a viewport tall inside a
 * viewport-tall frame and the composer would sit below the fold.
 */
const ASSISTANT_CLASS =
  "h-full min-h-0 w-full [&>aside]:hidden [&>div>header]:hidden"

export function ChatView() {
  return (
    <div data-chat-view className="h-full min-h-0 w-full">
      {/* `initialVoice={false}` on purpose. The assistant's default is to open
          with the microphone live, which is right when this screen is the whole
          app and wrong here: the shell has a Voice surface of its own, and an
          operator opening a console should not be asked for mic permission
          before they have read a word. The composer's own toggle still turns
          voice on, and it still focuses the textarea afterwards. */}
      <FieldworkAssistant initialVoice={false} className={ASSISTANT_CLASS} />
    </div>
  )
}
