"use client"

import { X } from "lucide-react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useEffect, useRef, type RefObject } from "react"

import { cn } from "@/lib/utils"

import {
  ARTIFACTS,
  PROJECTS,
  VOICE_SESSIONS,
  openTaskCount,
} from "./demo-data"
import {
  VIEWS,
  VIEW_GROUPS,
  viewIndex,
  type ViewId,
  type ViewMeta,
} from "./view-registry"

/**
 * The app's own rail, built rather than borrowed.
 *
 * `beautiful-ui/sidebar-nav` is a good rail and it is not this one. It renders
 * `navItems` as a single flat list with no group headings, and the middle of it
 * is a chat-history block — a "Chats" label, a chat search box, and a list of
 * recents — that a surface switcher has no use for and cannot switch off. Eight
 * rows in one undivided column with a stale "Chats" section under them is the
 * flat list this app is trying not to be, and the file is not mine to change.
 *
 * So the vocabulary is borrowed and the structure is new: the same
 * monogram-and-label header, the same 32px rows, the same rail width, in the
 * same tokens — but grouped, with `aria-current` on the active surface, and a
 * count of the surfaces in the header where `sidebar-nav` puts a chat log.
 *
 * Two presentations share one list. From `md` up it is a fixed rail; below that
 * it becomes a sheet, because 8 labelled rows and 4 headings do not compress
 * into a phone without turning into a wall of icons that no longer means
 * anything. The sheet keeps the same focus order, the same `aria-current`, and
 * the same Escape-to-close, so the switcher is the same control at every width.
 */

/** One focus treatment for every interactive row and control in the shell, so
 *  keyboard focus is never ambiguous. `ring-foreground` rather than `ring-ring`:
 *  the neutral ring token is 50% grey on both themes, which is easy to lose
 *  against a card, while the foreground token inverts with the theme. */
const FOCUS =
  "outline-none focus-visible:ring-2 focus-visible:ring-foreground/50"

/** Rail width. Wide enough for "Workspace" and a group heading to sit on one
 *  line, narrow enough to leave 760px of content at a 1024px viewport. */
const RAIL_WIDTH = "w-[264px]"

/** The sheet is the same width where there is room for it and most of the
 *  screen where there is not, so a 320px phone is not left with a 56px sliver
 *  of the page to tap. */
const SHEET_WIDTH = "w-[min(19rem,85vw)]"

/** The brand header is `h-14` to match the topbar, so the two read as one
 *  horizontal band with a single rule under it rather than two bars. */
const BRAND_HEIGHT = "h-14"

type NavProps = {
  active: ViewId
  onSelect: (id: ViewId) => void
  /** Shared-layout id for the active pill. Left undefined in the sheet, where
   *  the list mounts fresh each time and there is nothing to glide from. */
  highlightId?: string
  className?: string
}

function NavRow({
  meta,
  index,
  active,
  onSelect,
  highlightId,
}: {
  meta: ViewMeta
  index: number
  active: boolean
  onSelect: (id: ViewId) => void
  highlightId?: string
}) {
  const reduce = useReducedMotion()
  const Icon = meta.icon

  return (
    <button
      type="button"
      data-view-nav={meta.id}
      data-active={active || undefined}
      aria-current={active ? "page" : undefined}
      onClick={() => onSelect(meta.id)}
      className={cn(
        "relative flex h-8 w-full items-center gap-2 rounded-md px-2 text-left transition-colors",
        FOCUS,
        active
          ? "text-foreground"
          : "text-muted-foreground hover:bg-accent/60 hover:text-accent-foreground"
      )}
    >
      {/* The one moving part in the shell: a single pill that slides between
          rows instead of each row blinking its own background. */}
      {active && (
        <motion.span
          layoutId={highlightId}
          aria-hidden
          transition={
            reduce
              ? { duration: 0 }
              : { type: "spring", stiffness: 520, damping: 44, mass: 0.8 }
          }
          className="bg-accent pointer-events-none absolute inset-0 rounded-md"
        />
      )}

      <span className="relative z-10 flex size-4 shrink-0 items-center justify-center">
        <Icon className="size-4" strokeWidth={active ? 2 : 1.75} aria-hidden />
      </span>
      <span className="relative z-10 min-w-0 flex-1 truncate text-[13px] font-medium">
        {meta.label}
      </span>
      {/* The number is the shortcut, printed where the operator's eye already
          is. Hidden from the tree so the row is announced as "Chat" and not
          "Chat 1"; the `title` still offers it on hover. */}
      <span
        aria-hidden
        title={`Нажмите ${index + 1}, чтобы открыть «${meta.label}»`}
        className="relative z-10 shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground/70"
      >
        {index + 1}
      </span>
    </button>
  )
}

/** The grouped list, shared by the rail and the sheet. */
export function ShellNav({
  active,
  onSelect,
  highlightId,
  className,
}: NavProps) {
  return (
    <nav
      aria-label="Разделы"
      data-super-app-nav
      className={cn("min-h-0 flex-1 overflow-y-auto px-2 py-1", className)}
    >
      {VIEW_GROUPS.map((block, blockIndex) => {
        const labelId = `super-app-group-${block.group.toLowerCase()}`
        return (
          <div key={block.group} className={blockIndex === 0 ? "mt-1" : "mt-4"}>
            {/* A heading and a rule that runs to the edge. The rule is what
                turns four lists into four groups without four boxes. */}
            <p
              id={labelId}
              className="text-muted-foreground flex items-center gap-2 px-2 pb-1.5"
            >
              <span className="font-mono text-[10px] tracking-[0.16em] uppercase">
                {block.label}
              </span>
              <span aria-hidden className="border-border h-px flex-1 border-t" />
            </p>
            <ul aria-labelledby={labelId} className="flex flex-col gap-0.5">
              {block.views.map((meta) => (
                <li key={meta.id}>
                  <NavRow
                    meta={meta}
                    index={viewIndex(meta.id)}
                    active={meta.id === active}
                    onSelect={onSelect}
                    highlightId={highlightId}
                  />
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </nav>
  )
}

/** A short read on the workspace, under the list. It exists so the rail has a
 *  bottom edge with something on it — and it is derived from the shared demo
 *  data, so the numbers can never drift from the tables behind them. */
const READOUTS = [
  { label: "проектов", value: PROJECTS.length },
  { label: "открытых задач", value: openTaskCount() },
  { label: "артефактов", value: ARTIFACTS.length },
  { label: "сеансов голоса", value: VOICE_SESSIONS.length },
] as const

/** A plain icon control: square, quiet, and the same focus ring as a nav row. */
const ICON_BUTTON = cn(
  "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
  "flex size-8 items-center justify-center rounded-md transition-colors",
  FOCUS
)

/** The identity line. `compact` drops the rule and the surface count so the
 *  sheet can put a close control on the same band. */
function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-2.5",
        compact ? "pl-3" : "border-border border-b px-3",
        BRAND_HEIGHT
      )}
    >
      <span
        aria-hidden
        className="bg-foreground text-background flex size-7 shrink-0 items-center justify-center rounded-md font-mono text-[11px] font-semibold"
      >
        P
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] leading-4 font-medium">Портал</p>
        <p className="text-muted-foreground truncate font-mono text-[10px] leading-4 tracking-[0.14em] uppercase">
          консоль
        </p>
      </div>
      {!compact && (
        <p className="text-muted-foreground shrink-0 font-mono text-[10px] tabular-nums">
          {VIEWS.length} разделов
        </p>
      )}
    </div>
  )
}

function Readout() {
  return (
    <div className="border-border shrink-0 border-t px-3 py-3">
      <p className="text-muted-foreground font-mono text-[10px] tracking-[0.16em] uppercase">
        эта рабочая область
      </p>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5">
        {READOUTS.map((item) => (
          <div
            key={item.label}
            className="flex items-baseline justify-between gap-2"
          >
            <dt className="text-muted-foreground truncate text-[11px]">
              {item.label}
            </dt>
            <dd className="font-mono text-[11px] tabular-nums">{item.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

/** The fixed rail. `hidden` below `md` — the sheet takes over there. */
export function ShellSidebar({ active, onSelect }: Omit<NavProps, "highlightId">) {
  return (
    <aside
      aria-label="Консоль Портала"
      data-super-app-sidebar
      /* The rail is the one plane that recedes, and the page background cannot
         do that job for it: `bg-sidebar` and `bg-background` are the same
         token. So the separation is a tint laid over the background, and it has
         to be declared per theme — `bg-muted` would go darker in light mode and
         lighter in dark mode, which is backwards for chrome. */
      className={cn(
        "border-border hidden shrink-0 flex-col border-r md:flex",
        RAIL_WIDTH,
        /* A wash of the *opposite* end of the canvas, so the rail steps off the
         * page in either theme. A black tint is invisible on a black canvas and
         * a white one is invisible on white, which is why this cannot be a
         * single value. */
        "bg-black/[0.02] dark:bg-white/[0.02]"
      )}
    >
      <Brand />
      <ShellNav
        active={active}
        onSelect={onSelect}
        highlightId="super-app-active-surface"
      />
      <Readout />
    </aside>
  )
}

/** The narrow-screen presentation of the same list. */
export function ShellNavSheet({
  open,
  onClose,
  active,
  onSelect,
  returnFocusTo,
}: Omit<NavProps, "highlightId"> & {
  open: boolean
  onClose: () => void
  returnFocusTo: RefObject<HTMLButtonElement | null>
}) {
  const reduce = useReducedMotion()
  const panelRef = useRef<HTMLDivElement>(null)
  const wasOpen = useRef(false)

  /* Focus in on the first row, back to the trigger on the way out. The sheet
     is a dialog, so leaving focus behind it would mean tabbing through a page
     the sheet is covering. */
  useEffect(() => {
    if (open) {
      wasOpen.current = true
      panelRef.current
        ?.querySelector<HTMLButtonElement>("[data-view-nav]")
        ?.focus()
      return
    }
    if (!wasOpen.current) return
    wasOpen.current = false
    returnFocusTo.current?.focus()
  }, [open, returnFocusTo])

  /* A modal that does not hold focus is a modal that lies: `aria-modal` tells a
     screen reader the rest of the page is gone, so Tab has to agree. The trap is
     the two ends of the panel and nothing in between — the panel holds one close
     control and the nav rows, so there is no third place to go. */
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return
      const panel = panelRef.current
      if (!panel) return
      const focusable = panel.querySelectorAll<HTMLElement>(
        "button:not([disabled]), a[href], input, select, textarea"
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const current = document.activeElement
      if (!panel.contains(current)) {
        event.preventDefault()
        first.focus()
      } else if (event.shiftKey && current === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && current === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [open])

  return (
    <AnimatePresence initial={false}>
      {open && (
        <div data-super-app-sheet className="fixed inset-0 z-50 md:hidden">
          <motion.div
            aria-hidden
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.18 }}
            /* A black scrim has nothing to darken on a black canvas, so the
             * separation comes from the blur instead. The panel's own hairline
             * and raised surface do the rest. */
            className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Разделы"
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{
              duration: reduce ? 0 : 0.24,
              ease: [0.16, 1, 0.3, 1],
            }}
            className={cn(
              "border-border bg-background absolute inset-y-0 left-0 flex flex-col border-r",
              SHEET_WIDTH
            )}
          >
            <div
              className={cn(
                "border-border flex shrink-0 items-center border-b pr-2",
                BRAND_HEIGHT
              )}
            >
              <div className="min-w-0 flex-1">
                <Brand compact />
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Закрыть навигацию"
                className={ICON_BUTTON}
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
            <ShellNav active={active} onSelect={onSelect} />
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
