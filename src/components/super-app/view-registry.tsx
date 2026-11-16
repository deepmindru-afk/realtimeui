import {
  Activity as ActivityIcon,
  AudioWaveform,
  Boxes,
  LayoutGrid,
  MessagesSquare,
  SlidersHorizontal,
  TableProperties,
  Waves,
  type LucideIcon,
} from "lucide-react"

/**
 * The app's information architecture, in one place.
 *
 * Everything that switches surfaces reads this file: the rail, the narrow
 * sheet, the topbar's breadcrumb, the footer, the number-key shortcuts, and the
 * `key` on the view wrapper. Adding a surface means adding one row here and one
 * entry in `VIEW_COMPONENTS` — nothing else in the shell needs to learn about
 * it, and no other file has to agree on the order.
 *
 * `VIEWS` is flat and ordered, and the groups are derived from the `group`
 * field rather than declared separately, so a row cannot end up filed under a
 * heading that does not exist. The order is also the keyboard order: pressing
 * `1` selects the first row, `2` the second, and so on down to `8`.
 *
 * Group keys stay ASCII even though their labels are Russian. The key is what
 * ends up in `id` and `aria-labelledby` attributes and in the sheet's focus
 * lookup; a Cyrillic id is legal HTML5 but it leaks into selectors and
 * `querySelector` for no benefit. The label is display-only and may be any
 * script, so `VIEW_GROUP_LABEL` keeps the two apart.
 *
 * No "use client" here on purpose. The module holds data and component
 * references but no JSX and no browser API, so it stays importable from a
 * server component and costs the client nothing it did not already need.
 */
export type ViewId =
  | "chat"
  | "workspace"
  | "activity"
  | "artifacts"
  | "data"
  | "voice"
  | "motion"
  | "setup"

/** Heading order in the rail. Work first, then what comes out of it, then the
 *  playground — the order an operator actually moves through. Keys are ASCII;
 *  the visible headings come from `VIEW_GROUP_LABEL`. */
export const VIEW_GROUP_ORDER = [
  "work",
  "output",
  "input",
  "playground",
] as const

export type ViewGroup = (typeof VIEW_GROUP_ORDER)[number]

export const VIEW_GROUP_LABEL: Record<ViewGroup, string> = {
  work: "Работа",
  output: "Результаты",
  input: "Ввод",
  playground: "Лаборатория",
}

export type ViewMeta = {
  id: ViewId
  /** Rail label. One or two words, so it survives a 264px rail and a phone
   *  sheet without truncating. */
  label: string
  group: ViewGroup
  /** One plain sentence saying what the surface shows. Used as the topbar's
   *  trailing line, so it has to stand on its own without its label. */
  blurb: string
  icon: LucideIcon
}

export const VIEWS = [
  {
    id: "chat",
    label: "Чат",
    group: "work",
    blurb:
      "живой разговор с Порталом — голосом или текстом, переписка и поле ввода в одном столбце.",
    icon: MessagesSquare,
  },
  {
    id: "workspace",
    label: "Проекты",
    group: "work",
    blurb: "проекты, над которыми вы работаете, и задачи в их очереди.",
    icon: LayoutGrid,
  },
  {
    id: "activity",
    label: "Активность",
    group: "work",
    blurb:
      "что делал агент, комната и команда, в порядке, в котором это происходило.",
    icon: ActivityIcon,
  },
  {
    id: "artifacts",
    label: "Артефакты",
    group: "output",
    blurb: "файлы, которые написал агент: отчёты, черновики, правки и экспорты.",
    icon: Boxes,
  },
  {
    id: "data",
    label: "Данные",
    group: "output",
    blurb:
      "таблицы записей, из которых собраны эти файлы, с фильтром и выгрузкой.",
    icon: TableProperties,
  },
  {
    id: "voice",
    label: "Голос",
    group: "input",
    blurb: "микрофон, орб и все сессии голоса, сохранённые в журнале.",
    icon: AudioWaveform,
  },
  {
    id: "motion",
    label: "Анимация",
    group: "playground",
    blurb:
      "все анимационные элементы — запущенные прямо на этой странице, а не описанные.",
    icon: Waves,
  },
  {
    id: "setup",
    label: "Настройка",
    group: "playground",
    blurb: "запрос, модель и подключение к комнате, с которых приложение стартует.",
    icon: SlidersHorizontal,
  },
] as const satisfies readonly ViewMeta[]

export type ViewGroupBlock = {
  group: ViewGroup
  label: string
  views: ViewMeta[]
}

/** The rail's shape: one block per group, in `VIEW_GROUP_ORDER`, each holding
 *  the views that claim it, in `VIEWS` order. */
export const VIEW_GROUPS: readonly ViewGroupBlock[] = VIEW_GROUP_ORDER.map(
  (group) => ({
    group,
    label: VIEW_GROUP_LABEL[group],
    views: VIEWS.filter((view) => view.group === group).map((view) => ({
      ...view,
    })),
  })
)

/** Metadata for one surface. Falls back to the first row so a stale id in
 *  storage can never leave the shell rendering a blank header. */
export function viewById(id: ViewId): ViewMeta {
  return VIEWS.find((view) => view.id === id) ?? { ...VIEWS[0] }
}

/** Zero-based position in `VIEWS`, which is also the number-key index. */
export function viewIndex(id: ViewId): number {
  return VIEWS.findIndex((view) => view.id === id)
}
