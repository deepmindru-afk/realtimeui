"use client"

import { ChevronLeft, ChevronRight, Menu } from "lucide-react"
import { motion, useReducedMotion } from "motion/react"
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentType,
} from "react"

import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/ui/theme-toggle"

import { ShellNavSheet, ShellSidebar } from "./shell-sidebar"
import { VIEWS, viewById, viewIndex, type ViewId } from "./view-registry"
import { ActivityView } from "./views/activity-view"
import { ArtifactsView } from "./views/artifacts-view"
import { ChatView } from "./views/chat-view"
import { DataView } from "./views/data-view"
import { MotionView } from "./views/motion-view"
import { SetupView } from "./views/setup-view"
import { VoiceView } from "./views/voice-view"
import { WorkspaceView } from "./views/workspace-view"

/**
 * The super app: one rail, one column, eight surfaces.
 *
 * Layout is a fixed frame with exactly one scroller in it. The rail and the
 * topbar are flex children of a `h-dvh` root and never scroll; the content
 * column below the topbar is the single `overflow-y-auto` region. That is the
 * whole trick, and it is why views must not bring their own page scroller —
 * the chat view in particular scrolls inside its own transcript, so the shell's
 * scrollport is sized to fit it exactly and never engages.
 *
 * The shell hands each view a full-bleed box and stays out of the way of the
 * measure. Padding, max-width, and the scroller inside a view belong to that
 * view: the chat wants its own `max-w-3xl` column, a data table wants the full
 * width, and neither should have to argue with a wrapper here. A view that wants
 * to fill the height says so on its own root; one that wants to be top-aligned
 * just ignores the box and its content still scrolls.
 */
export function SuperApp() {
  const reduce = useReducedMotion()
  const [view, setView] = useState<ViewId>(DEFAULT_VIEW)
  /* Whether the stored view has been read back. See the persistence note. */
  const [restored, setRestored] = useState(false)
  const [navOpen, setNavOpen] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement>(null)

  const meta = viewById(view)
  const position = viewIndex(view)
  const Current = VIEW_COMPONENTS[view]
  const previous = VIEWS[(position - 1 + VIEWS.length) % VIEWS.length]
  const next = VIEWS[(position + 1) % VIEWS.length]

  const select = useCallback((id: ViewId) => {
    setView(id)
    /* Picking a row in the sheet also dismisses it — the sheet exists to be
       gone once the operator has chosen. */
    setNavOpen(false)
  }, [])

  /* Persistence. The read happens in an effect, not in a lazy initialiser, so
     the server render and the first client render are both the default view and
     the two agree. The write is gated on `restored` for the same reason: an
     ungated effect would fire on mount with the default value still in state
     and overwrite the very thing it just read. */
  useEffect(() => {
    const stored = readStoredView()
    if (stored) setView(stored)
    setRestored(true)
  }, [])

  useEffect(() => {
    if (!restored) return
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, view)
    } catch {
      /* Private mode, a full quota, storage disabled by policy. The app works
         exactly the same without it; there is nothing worth interrupting the
         operator over. */
    }
  }, [restored, view])

  /* Keyboard. `1`–`8` select a surface in rail order, and the number is printed
     next to every row so the shortcut is discoverable rather than folklore.
     Escape closes the sheet. Typing is checked first, so the chat composer —
     which is a textarea on this same screen — keeps its digits. */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      if (event.metaKey || event.ctrlKey || event.altKey || event.isComposing) {
        return
      }
      if (event.key === "Escape") {
        setNavOpen(false)
        return
      }
      if (isTypingTarget(event.target)) return
      const target = VIEWS[Number(event.key) - 1]
      if (!target) return
      event.preventDefault()
      select(target.id)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [select])

  return (
    <div
      data-super-app
      data-active-view={view}
      className="bg-background text-foreground flex h-dvh w-full overflow-hidden"
    >
      <ShellSidebar active={view} onSelect={select} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header
          data-super-app-topbar
          className="border-border flex h-14 shrink-0 items-center gap-2 border-b px-3 sm:gap-3 sm:px-5"
        >
          <Button
            ref={menuButtonRef}
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Открыть навигацию"
            aria-expanded={navOpen}
            onClick={() => setNavOpen(true)}
            className="md:hidden"
          >
            <Menu aria-hidden />
          </Button>

          {/* Group, then surface, then what it shows. A paragraph rather than a
              heading: the chat view's own empty state owns the page's `h1`, and
              two of them on one screen is worse than none. */}
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="text-muted-foreground hidden shrink-0 font-mono text-[10px] tracking-[0.16em] uppercase sm:block">
              {meta.group}
            </span>
            <span
              aria-hidden
              className="border-border hidden h-3 w-px border-l sm:block"
            />
            <p className="truncate text-sm font-medium">{meta.label}</p>
            <p className="text-muted-foreground hidden truncate text-xs xl:block">
              {meta.blurb}
            </p>
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
            <p className="text-muted-foreground mr-1 hidden items-center gap-1.5 font-mono text-[11px] lg:flex">
              разделы
              <kbd className="border-border rounded border px-1 leading-4 text-foreground">
                1
              </kbd>
              –
              <kbd className="border-border rounded border px-1 leading-4 text-foreground">
                8
              </kbd>
            </p>
            <ThemeToggle />
          </div>
        </header>

        {/* The single scroller. `h-full` on the wrapper is load-bearing: it is
            what gives a view a definite height to fill, which is how the chat
            view's own transcript can scroll without this region ever having a
            scrollbar of its own. */}
        <main
          data-super-app-content
          aria-label={meta.label}
          className="min-h-0 flex-1 overflow-y-auto"
        >
          <motion.div
            key={view}
            initial={reduce ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: reduce ? 0 : 0.26,
              ease: [0.2, 0, 0, 1],
            }}
            className="h-full"
          >
            <Current />
          </motion.div>
        </main>

        {/* Stepping through surfaces without the rail. Hidden on the chat
            surface, which draws its own status footer and would end up with
            two stacked bars saying different things. */}
        {view !== "chat" && (
          <footer
            data-super-app-footer
            className="border-border flex h-11 shrink-0 items-center gap-2 border-t px-3 sm:px-5"
          >
            <span className="text-muted-foreground font-mono text-[10px] tracking-[0.16em] uppercase">
              разделы
            </span>
            <span className="text-muted-foreground font-mono text-[11px] tabular-nums">
              {position + 1}/{VIEWS.length}
            </span>
            <div className="ml-auto flex min-w-0 items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Предыдущий раздел: ${previous.label}`}
                onClick={() => select(previous.id)}
                className="min-w-0"
              >
                <ChevronLeft aria-hidden />
                <span className="hidden truncate sm:inline">
                  {previous.label}
                </span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Следующий раздел: ${next.label}`}
                onClick={() => select(next.id)}
                className="min-w-0"
              >
                <span className="hidden truncate sm:inline">{next.label}</span>
                <ChevronRight aria-hidden />
              </Button>
            </div>
          </footer>
        )}
      </div>

      <ShellNavSheet
        open={navOpen}
        onClose={() => setNavOpen(false)}
        active={view}
        onSelect={select}
        returnFocusTo={menuButtonRef}
      />
    </div>
  )
}

const VIEW_STORAGE_KEY = "portal.super-app.view"
const DEFAULT_VIEW: ViewId = "chat"

/** Which surface renders for which id. Adding one is a row in
 *  `view-registry` plus a row here; nothing else in the shell lists them. */
const VIEW_COMPONENTS: Record<ViewId, ComponentType> = {
  chat: ChatView,
  workspace: WorkspaceView,
  activity: ActivityView,
  artifacts: ArtifactsView,
  data: DataView,
  voice: VoiceView,
  motion: MotionView,
  setup: SetupView,
}

/** Reads the remembered surface, treating anything unrecognised — an id from an
 *  older build, a hand-edited value — as no answer at all. */
function readStoredView(): ViewId | null {
  try {
    const stored = window.localStorage.getItem(VIEW_STORAGE_KEY)
    return VIEWS.some((view) => view.id === stored) ? (stored as ViewId) : null
  } catch {
    return null
  }
}

/** True when a keystroke belongs to whatever the operator is typing into, so
 *  `1`–`8` stay characters in the chat composer and in any filter a view adds. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return Boolean(
    target.closest("input, textarea, select, [contenteditable='true']")
  )
}
