"use client"

import { cn } from "@/lib/utils"
import {
  Bot as IconPopsicle2,
  Check as IconCheckmark1Small,
  ChevronDown as IconChevronDownSmall,
  Home as IconHome,
  LogOut as IconArrowBoxLeft,
  PanelLeftClose as IconSidebarLeftArrow,
  Plus as IconPlusMedium,
  Search as IconMagnifyingGlass,
  Settings as IconSettingsGear1,
  SquarePen as IconEditBig,
  UserPlus as IconUserAdd,
  X as IconCrossSmall,
} from "lucide-react"
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react"
import { createPortal } from "react-dom"
import GlideMenu from "./glide-menu"

export type SidebarRecent = {
  id: string
  label: string
  prompt?: string
}

export type SidebarNavItem = {
  key: string
  label: string
  icon: ReactNode
  count?: string
}

export type SidebarWorkspace = {
  name: string
  monogram: string
}

export type SidebarWorkspaceAction = {
  label: string
  icon: ReactNode
  onSelect?: () => void
}

const DEFAULT_WORKSPACE: SidebarWorkspace = { name: "Портал", monogram: "P" }

const DEFAULT_NAV_ITEMS: SidebarNavItem[] = [
  { key: "home", label: "Главная", icon: <IconHome size={18} /> },
  {
    key: "invite",
    label: "Пригласить людей",
    icon: <IconUserAdd size={18} />,
    count: "3/10",
  },
]

const DEFAULT_WORKSPACE_ACTIONS: SidebarWorkspaceAction[] = [
  { label: "Новая рабочая область", icon: <IconPlusMedium size={16} /> },
  { label: "Настройки рабочей области", icon: <IconSettingsGear1 size={16} /> },
  { label: "Пригласить участников команды", icon: <IconUserAdd size={16} /> },
]

const DEFAULT_RECENTS: SidebarRecent[] = [
  { id: "suppliers", label: "Записи поставщиков" },
  { id: "todos", label: "Срочные дела на сегодня" },
  { id: "flavor", label: "Заявка по странице вкусов" },
  { id: "workload", label: "Сводка по загрузке" },
  { id: "offboarding", label: "Отключение поставщика" },
  { id: "restock", label: "Массовое пополнение запасов" },
  { id: "edits", label: "Правки к странице вкусов" },
  { id: "subway", label: "Метро в часы пик" },
]

export type SidebarNavProps = {
  /** Title of the selected chat. Undefined leaves the rail in demo mode. */
  activeTitle?: string | null
  /** Id of the selected chat. Wins over `activeTitle`, which cannot tell two
   *  identically named chats apart. */
  activeId?: string | null
  className?: string
  fill?: boolean
  onNewChat?: () => void
  onPick?: (id: string, label: string, prompt?: string) => void
  /** Controlled primary-nav selection (e.g. "home" | "invite"). */
  activeNav?: string
  onNavigate?: (key: string) => void
  navItems?: SidebarNavItem[]
  workspace?: SidebarWorkspace
  /** Middle group of the workspace menu. Empty leaves just the workspace row. */
  workspaceActions?: SidebarWorkspaceAction[]
  /** Show the menu's sign-out row. Omit it and the row is left out. */
  onSignOut?: () => void
  /** Optional footer call-to-action — needs a label, an icon, or a click. */
  footerLabel?: string
  footerIcon?: ReactNode
  onFooterClick?: () => void
  recents?: SidebarRecent[]
}

const SIDEBAR_MOTION = {
  expandedWidth: 224,
  collapsedWidth: 52,
  duration: 280,
  copyDuration: 180,
  copyOffset: 8,
  easing: "cubic-bezier(0.16, 1, 0.3, 1)",
}

const CHAT_SEARCH_MOTION = {
  duration: 180,
  closedWidth: 28,
  easing: "cubic-bezier(0.16, 1, 0.3, 1)",
}

/** Hosts below the `md` breakpoint open on the icon rail. */
const NARROW_HOST = "(max-width: 767px)"

const subscribeNarrowHost = (onChange: () => void) => {
  const list = window.matchMedia(NARROW_HOST)
  list.addEventListener("change", onChange)
  return () => list.removeEventListener("change", onChange)
}

const narrowHost = () => window.matchMedia(NARROW_HOST).matches

/** The server has no viewport to measure, so it always renders the full rail. */
const wideHost = () => false

function GlideGroup({ children }: { children: ReactNode }) {
  return (
    <GlideMenu
      rowSelector="[data-row]"
      highlightClassName="sidebar-glide-highlight rounded-[7px] bg-hover-2"
      className="group/glide flex flex-col gap-px"
    >
      {children}
    </GlideMenu>
  )
}

function RailButton({
  icon,
  label,
  active = false,
  count,
  onClick,
}: {
  icon: ReactNode
  label: string
  active?: boolean
  count?: string
  onClick?: () => void
}) {
  return (
    <button
      data-row
      type="button"
      title={label}
      onClick={onClick}
      className={cn(
        "sidebar-row relative z-10 mx-2 flex h-8 items-center rounded-[8px] px-2 text-left",
        "transition-[width,background-color,color,transform] duration-150 active:scale-[0.98]",
        active && "bg-hover-2 group-hover/glide:bg-transparent"
      )}
    >
      <span
        className={cn(
          "flex size-5 shrink-0 items-center justify-center",
          active ? "text-ink" : "text-ink-2"
        )}
      >
        {icon}
      </span>
      <span
        className={cn(
          "sidebar-copy ml-1.5 min-w-0 flex-1 truncate text-[14px] font-medium",
          active ? "text-ink" : "text-ink-2"
        )}
      >
        {label}
      </span>
      {count && (
        <span className="sidebar-copy mr-2 shrink-0 text-[12px] font-medium tabular-nums text-ink-3">
          {count}
        </span>
      )}
    </button>
  )
}

function WorkspaceMenu({
  position,
  workspace,
  actions,
  onSignOut,
  onClose,
}: {
  position: { top: number; left: number }
  workspace: SidebarWorkspace
  actions: SidebarWorkspaceAction[]
  onSignOut?: () => void
  onClose: () => void
}) {
  return createPortal(
    <div
      data-workspace-menu
      className="beautiful-ui-scope fixed z-50 w-64 rounded-[14px] bg-surface p-1.5 text-ink shadow-overlay"
      style={{
        top: position.top,
        left: position.left,
        animation:
          "beautiful-pop-in 180ms cubic-bezier(0.23,1,0.32,1) both",
        transformOrigin: "top left",
      }}
    >
      <GlideMenu
        className="flex flex-col gap-px"
        highlightClassName="inset-x-0 rounded-[8px] bg-hover-2"
      >
        <button
          data-menu-row
          type="button"
          onClick={onClose}
          className="relative z-10 flex h-10 w-full items-center gap-1.5 rounded-[8px] px-2 text-left"
        >
          <span className="flex size-6 shrink-0 items-center justify-center rounded-[7px] bg-ink text-[11px] font-semibold text-surface">
            {workspace.monogram}
          </span>
          <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-ink">
            {workspace.name}
          </span>
          <span className="shrink-0 text-ink">
            <IconCheckmark1Small size={18} />
          </span>
        </button>
        {actions.length > 0 && (
          <>
            <div className="my-1 h-px bg-line" />
            {actions.map((item) => (
              <button
                key={item.label}
                data-menu-row
                type="button"
                onClick={() => {
                  item.onSelect?.()
                  onClose()
                }}
                className="relative z-10 flex h-9 w-full items-center gap-1.5 rounded-[8px] px-2 text-left"
              >
                <span className="flex size-5 shrink-0 items-center justify-center text-ink-2">
                  {item.icon}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink">
                  {item.label}
                </span>
              </button>
            ))}
          </>
        )}
        {onSignOut && (
          <>
            <div className="my-1 h-px bg-line" />
            <button
              data-menu-row
              type="button"
              onClick={onSignOut}
              className="relative z-10 flex h-9 w-full items-center gap-1.5 rounded-[8px] px-2 text-left"
            >
              <span className="flex size-5 shrink-0 items-center justify-center text-ink-2">
                <IconArrowBoxLeft size={16} />
              </span>
              <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink">
                Выйти
              </span>
            </button>
          </>
        )}
      </GlideMenu>
    </div>,
    document.body
  )
}

export default function SidebarNav({
  activeTitle,
  activeId,
  className = "",
  fill = false,
  onNewChat,
  onPick,
  activeNav,
  onNavigate,
  navItems = DEFAULT_NAV_ITEMS,
  workspace = DEFAULT_WORKSPACE,
  workspaceActions = DEFAULT_WORKSPACE_ACTIONS,
  onSignOut,
  footerLabel,
  footerIcon,
  onFooterClick,
  recents = DEFAULT_RECENTS,
}: SidebarNavProps) {
  // Narrow hosts open on the rail. Reading it through the store keeps the
  // server snapshot and the first client render identical, so there is no
  // hydration mismatch; the user's own toggle then takes over from the viewport.
  const narrow = useSyncExternalStore(subscribeNarrowHost, narrowHost, wideHost)
  const [collapseChoice, setCollapseChoice] = useState<boolean | null>(null)
  const collapsed = collapseChoice ?? narrow
  const setCollapsed = (next: boolean) => setCollapseChoice(next)
  const [internalNav, setInternalNav] = useState("chats")
  const currentNav = activeNav ?? internalNav
  const selectNav = (key: string) => {
    setInternalNav(key)
    onNavigate?.(key)
  }
  const [demoActiveTitle, setDemoActiveTitle] = useState<string | null>(null)
  const [workspaceOpen, setWorkspaceOpen] = useState(false)
  const [workspacePosition, setWorkspacePosition] = useState({ top: 0, left: 0 })
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState("")
  const workspaceButtonRef = useRef<HTMLButtonElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const selectedTitle = activeTitle === undefined ? demoActiveTitle : activeTitle
  const isActive = (item: SidebarRecent) =>
    activeId != null ? item.id === activeId : item.label === selectedTitle
  const visibleRecents = recents.filter((item) =>
    item.label.toLowerCase().includes(query.trim().toLowerCase())
  )
  const hasFooter = Boolean(footerLabel || footerIcon || onFooterClick)

  useEffect(() => {
    if (!workspaceOpen) return
    const close = (event: PointerEvent) => {
      const target = event.target as Element
      if (
        !target.closest("[data-workspace-trigger]") &&
        !target.closest("[data-workspace-menu]")
      ) {
        setWorkspaceOpen(false)
      }
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      setWorkspaceOpen(false)
      workspaceButtonRef.current?.focus()
    }
    document.addEventListener("pointerdown", close)
    document.addEventListener("keydown", escape)
    return () => {
      document.removeEventListener("pointerdown", close)
      document.removeEventListener("keydown", escape)
    }
  }, [workspaceOpen])

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus()
  }, [searchOpen])

  const collapse = () => {
    setCollapsed(true)
    setWorkspaceOpen(false)
    setSearchOpen(false)
    setQuery("")
  }

  return (
    <aside
      data-sidebar-collapsed={collapsed}
      aria-label="Навигация рабочей области"
      className={cn(
        "relative flex shrink-0 overflow-hidden transition-[width]",
        fill ? "h-full" : "h-[600px]",
        className
      )}
      style={{
        width: collapsed
          ? SIDEBAR_MOTION.collapsedWidth
          : SIDEBAR_MOTION.expandedWidth,
        transitionDuration: `${SIDEBAR_MOTION.duration}ms`,
        transitionTimingFunction: SIDEBAR_MOTION.easing,
        "--sidebar-copy-duration": `${SIDEBAR_MOTION.copyDuration}ms`,
        "--sidebar-copy-offset": `${SIDEBAR_MOTION.copyOffset}px`,
        "--sidebar-easing": SIDEBAR_MOTION.easing,
      } as CSSProperties}
    >
      <div className="flex min-h-0 w-[224px] shrink-0 flex-col">
        <div className="relative mb-2.5 h-10 shrink-0">
          <button
            ref={workspaceButtonRef}
            data-workspace-trigger
            type="button"
            aria-expanded={workspaceOpen}
            aria-hidden={collapsed}
            tabIndex={collapsed ? -1 : 0}
            onClick={() => {
              if (!workspaceOpen && workspaceButtonRef.current) {
                const rect = workspaceButtonRef.current.getBoundingClientRect()
                setWorkspacePosition({ top: rect.bottom + 6, left: rect.left })
              }
              setWorkspaceOpen((open) => !open)
            }}
            className="sidebar-workspace-control absolute left-2 top-1 flex h-8 w-[164px] items-center rounded-[8px] px-2 text-left transition-[background-color,transform] duration-100 hover:bg-hover-2 active:scale-[0.99]"
          >
            <span className="sidebar-logo flex size-5 shrink-0 items-center justify-center text-ink">
              <IconPopsicle2 size={18} />
            </span>
            <span className="sidebar-copy ml-1.5 min-w-0 flex-1 truncate text-[14px] font-medium text-ink-2">
              {workspace.name}
            </span>
            <span className="sidebar-copy ml-1 flex shrink-0 text-ink-3">
              <IconChevronDownSmall size={16} />
            </span>
          </button>

          {workspaceOpen && (
            <WorkspaceMenu
              position={workspacePosition}
              workspace={workspace}
              actions={workspaceActions}
              onSignOut={onSignOut}
              onClose={() => setWorkspaceOpen(false)}
            />
          )}

          <button
            type="button"
            aria-label="Свернуть боковую панель"
            aria-hidden={collapsed}
            tabIndex={collapsed ? -1 : 0}
            onClick={collapse}
            className="sidebar-collapse-control absolute right-2 top-1 flex size-8 items-center justify-center rounded-[8px] text-ink-3 transition-[opacity,background-color,color] duration-150 hover:bg-hover-2 hover:text-ink"
          >
            <IconSidebarLeftArrow size={18} />
          </button>
          <button
            type="button"
            aria-label="Развернуть боковую панель"
            aria-hidden={!collapsed}
            tabIndex={collapsed ? 0 : -1}
            onClick={() => setCollapsed(false)}
            className="sidebar-expand-control absolute left-2 top-0.5 flex size-9 items-center justify-center rounded-[8px] text-ink-3 transition-[opacity,background-color,color] duration-150 hover:bg-hover-2 hover:text-ink"
          >
            <IconSidebarLeftArrow size={18} className="rotate-180" />
          </button>
        </div>

        <GlideGroup>
          <RailButton
            icon={<IconEditBig size={18} />}
            label="Новый чат"
            onClick={() => {
              if (activeTitle === undefined) setDemoActiveTitle(null)
              selectNav("chats")
              onNewChat?.()
            }}
          />
          {navItems.map((item) => (
            <RailButton
              key={item.key}
              icon={item.icon}
              label={item.label}
              count={item.count}
              active={currentNav === item.key}
              onClick={() => selectNav(item.key)}
            />
          ))}
        </GlideGroup>

        <div className="sidebar-history mt-3 min-h-0 flex-1 overflow-y-auto">
          <div className="sidebar-copy relative mx-2 mb-1 h-8">
            <div
              aria-hidden={searchOpen}
              className={cn(
                "absolute inset-0 flex items-center gap-1.5 px-2 text-[12.5px] font-medium text-ink-3 transition-[opacity,transform]",
                searchOpen
                  ? "pointer-events-none -translate-x-1 opacity-0"
                  : "translate-x-0 opacity-100"
              )}
              style={{
                transitionDuration: `${CHAT_SEARCH_MOTION.duration}ms`,
                transitionTimingFunction: CHAT_SEARCH_MOTION.easing,
              }}
            >
              <IconChevronDownSmall size={16} />
              <span>Чаты</span>
            </div>

            <button
              type="button"
              aria-label="Искать по чатам"
              aria-expanded={searchOpen}
              onClick={() => setSearchOpen(true)}
              className={cn(
                "absolute right-0 top-0 z-10 flex size-8 items-center justify-center rounded-[8px] text-ink-3 transition-[opacity,background-color,color,transform] hover:bg-hover-2 hover:text-ink active:scale-[0.96]",
                searchOpen ? "pointer-events-none opacity-0" : "opacity-100"
              )}
              style={{
                transitionDuration: `${CHAT_SEARCH_MOTION.duration}ms`,
              }}
            >
              <IconMagnifyingGlass size={16} />
            </button>

            <div
              className={cn(
                "absolute right-0 top-0 z-20 flex h-8 items-center overflow-hidden rounded-[8px] bg-field text-ink-3 shadow-hairline transition-[width,opacity] focus-within:text-ink-2",
                searchOpen
                  ? "pointer-events-auto opacity-100"
                  : "pointer-events-none opacity-0"
              )}
              style={{
                width: searchOpen
                  ? "100%"
                  : CHAT_SEARCH_MOTION.closedWidth,
                transitionDuration: `${CHAT_SEARCH_MOTION.duration}ms`,
                transitionTimingFunction: CHAT_SEARCH_MOTION.easing,
              }}
            >
              <span className="ml-2 flex shrink-0 items-center justify-center">
                <IconMagnifyingGlass size={15} />
              </span>
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setSearchOpen(false)
                    setQuery("")
                  }
                }}
                placeholder="Искать по чатам"
                aria-label="Поиск по истории чатов"
                className="ml-1.5 min-w-0 flex-1 bg-transparent text-[13px] font-medium text-ink outline-none placeholder:text-ink-3"
              />
              <button
                type="button"
                aria-label="Закрыть поиск по чатам"
                onClick={() => {
                  setSearchOpen(false)
                  setQuery("")
                }}
                className="flex size-8 shrink-0 items-center justify-center rounded-[8px] text-ink-3 transition-[background-color,color,transform] duration-150 hover:bg-hover-2 hover:text-ink active:scale-[0.96]"
              >
                <IconCrossSmall size={16} />
              </button>
            </div>
          </div>

          <GlideGroup>
            {visibleRecents.map((item) => {
              const active = isActive(item)
              return (
                <button
                  key={item.id}
                  data-row
                  type="button"
                  title={item.label}
                  onClick={() => {
                    selectNav("chats")
                    if (activeTitle === undefined) setDemoActiveTitle(item.label)
                    onPick?.(item.id, item.label, item.prompt)
                  }}
                  className={cn(
                    "sidebar-row relative z-10 mx-2 flex h-8 items-center rounded-[8px] px-2 text-left transition-[width,background-color,color,transform] duration-150 active:scale-[0.98]",
                    active && "bg-hover-2 group-hover/glide:bg-transparent"
                  )}
                >
                  <span
                    className={cn(
                      "sidebar-copy min-w-0 flex-1 truncate text-[14px] font-medium",
                      active ? "text-ink" : "text-ink-2"
                    )}
                  >
                    {item.label}
                  </span>
                </button>
              )
            })}
            {query && visibleRecents.length === 0 && (
              <div className="sidebar-copy mx-2 px-2 py-2 text-[12.5px] text-ink-3">
                Чатов не найдено
              </div>
            )}
          </GlideGroup>
        </div>

        {hasFooter && (
          <div className="sidebar-copy sidebar-footer mx-2 mt-3 w-[208px] border-t border-line pt-3">
            <button
              type="button"
              onClick={onFooterClick ?? onNewChat}
              className="flex h-8 w-full items-center justify-center gap-1.5 rounded-control bg-hover-2 text-[12.5px] font-medium text-ink transition-[background-color,transform] duration-150 hover:bg-line-strong active:scale-[0.98]"
            >
              {footerIcon}
              {footerLabel}
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}
