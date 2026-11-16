/**
 * Synthetic records for every surface except chat.
 *
 * The dataset is written to be believable rather than decorative, because the
 * view lanes are going to build real tables, filters, timelines and empty
 * states on top of it: counts have to reconcile, timestamps have to run
 * backwards, and a project referenced by an artifact has to exist. So the
 * projects are the same three the chat surface advertises in its starter
 * questions (`components/examples/research-workflow`), and every time in the
 * file is derived from `DEMO_NOW` rather than from the clock.
 *
 * Nothing here is random and nothing here reads the browser. That is a
 * deliberate constraint, not a shortcut: `now`-relative data in a module that a
 * server render and a client render both import is the usual way a gallery
 * grows a hydration warning. Slicing the ISO strings and doing the arithmetic
 * by hand keeps the markup identical on both sides.
 *
 * Plain data and pure functions only — no JSX, no components, no imports beyond
 * a type. A view lane can pull any of it and replace it wholesale once the real
 * service is wired up.
 */

import type { ViewId } from "./view-registry"

export const DEMO_NOW = "2026-02-14T17:20:00.000Z"

const SECOND = 1_000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** Short month names, so `dayShort` never reaches for a locale-dependent
 *  formatter and the same string is produced on the server and in the browser.
 *  These are the short forms Russian interfaces use: `14 фев`, `5 мая`. */
const MONTHS = [
  "янв",
  "фев",
  "мар",
  "апр",
  "мая",
  "июн",
  "июл",
  "авг",
  "сен",
  "окт",
  "ноя",
  "дек",
] as const

/* ------------------------------------------------------------------ time --- */

/** ISO timestamp `minutes` before `DEMO_NOW`. Every `at`/`updated`/`started`
 *  field in this file comes from here, which is what keeps the timeline
 *  coherent: the newest record is two minutes old and the oldest is a week. */
export function minutesAgo(minutes: number): string {
  return new Date(Date.parse(DEMO_NOW) - minutes * MINUTE).toISOString()
}

/** `17:08` — a wall clock read straight out of the ISO string. */
export function clockOf(iso: string): string {
  return iso.slice(11, 16)
}

/** `17 Feb` — the date half of an ISO string, in the same locale-free way. */
export function dayShort(iso: string): string {
  const month = MONTHS[Number(iso.slice(5, 7)) - 1]
  return `${Number(iso.slice(8, 10))} ${month}`
}

/** How long ago, relative to `DEMO_NOW`: `только что`, `12 мин назад`,
 *  `3 ч назад`, or the day label once it is older than a day. */
export function ago(iso: string): string {
  const minutes = Math.max(
    0,
    Math.round((Date.parse(DEMO_NOW) - Date.parse(iso)) / MINUTE)
  )
  if (minutes < 1) return "только что"
  if (minutes < 60) return `${minutes} мин назад`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} ч назад`
  return dayLabel(iso)
}

/** `сегодня`, `вчера`, or `4 дня назад`.
 *
 *  The plural is spelled out rather than handed to a formatter, for the same
 *  reason `MONTHS` is a table: Russian counts three forms where English counts
 *  one, and picking between them needs the number itself — `21 день назад`
 *  and `24 дня назад` both end in a 1 or a 4 and neither takes `-дней`. */
export function dayLabel(iso: string): string {
  const days = Math.floor(
    (Date.parse(DEMO_NOW) - Date.parse(iso)) / DAY
  )
  if (days <= 0) return "сегодня"
  if (days === 1) return "вчера"
  return `${days} ${plural(days, ["день", "дня", "дней"])} назад`
}

/** Picks the Russian count form for `count`: one, few, many.
 *
 *  Exported because the voice sessions count exchanges too, and a count that
 *  reads `3 обменов` is the sort of thing an operator stops trusting the whole
 *  column over. */
export function plural(
  count: number,
  forms: readonly [string, string, string]
): string {
  const mod100 = Math.abs(count) % 100
  const mod10 = mod100 % 10
  if (mod100 >= 11 && mod100 <= 14) return forms[2]
  if (mod10 === 1) return forms[0]
  if (mod10 >= 2 && mod10 <= 4) return forms[1]
  return forms[2]
}

/** `mm:ss`, widening to `h:mm:ss` past an hour. */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const rest = seconds % 60
  const pad = (value: number) => String(value).padStart(2, "0")
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(rest)}`
    : `${pad(minutes)}:${pad(rest)}`
}

/** `48 кБ` — decimal units, two significant figures, no locale. */
export function formatBytes(bytes: number): string {
  if (bytes < 1_000) return `${Math.round(bytes)} Б`
  const units = ["кБ", "МБ", "ГБ"]
  let value = bytes / 1_000
  let unit = 0
  while (value >= 1_000 && unit < units.length - 1) {
    value /= 1_000
    unit += 1
  }
  return `${value >= 100 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`
}

/* -------------------------------------------------------------- projects --- */

export type ProjectStage = "scoping" | "fieldwork" | "synthesis" | "handoff"

export type Project = {
  id: string
  name: string
  client: string
  stage: ProjectStage
  /** 0–100. A bar, not a percentage the operator has to read. */
  progress: number
  /** How many field notes back this project. */
  notes: number
  updated: string
  summary: string
}

export const PROJECTS: Project[] = [
  {
    id: "field-notes",
    name: "Интервью на западном доку",
    client: "Northline Logistics",
    stage: "fieldwork",
    progress: 62,
    notes: 5,
    updated: minutesAgo(38),
    summary:
      "Пять интервью с операторами о передаче приёмки и два наблюдения за сменой на западном доку.",
  },
  {
    id: "accessibility",
    name: "Аудит навигации",
    client: "Управление метрополитена",
    stage: "synthesis",
    progress: 78,
    notes: 2,
    updated: minutesAgo(96),
    summary:
      "Обходы при прибытии на повороте к платформе, прочитанные по действующему плану указателей.",
  },
  {
    id: "handoff",
    name: "Передача исследования",
    client: "Продуктовая команда",
    stage: "handoff",
    progress: 94,
    notes: 1,
    updated: minutesAgo(1_260),
    summary:
      "Бриф на проверку, который заказала продуктовая команда: наблюдаемое поведение, интерпретация и открытые вопросы — разделённые.",
  },
]

/* ----------------------------------------------------------------- tasks --- */

export type TaskStatus = "todo" | "running" | "blocked" | "done"
export type TaskPriority = "low" | "normal" | "high"

export type Task = {
  id: string
  projectId: string
  title: string
  /** Initials of whoever is carrying it. */
  owner: string
  status: TaskStatus
  priority: TaskPriority
  due: string
}

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "К выполнению",
  running: "В работе",
  blocked: "Заблокировано",
  done: "Готово",
}

export const TASKS: Task[] = [
  {
    id: "task-01",
    projectId: "field-notes",
    title: "Расшифровать две записи эфира с передачи смены",
    owner: "RB",
    status: "running",
    priority: "high",
    due: "2026-02-16T09:00:00.000Z",
  },
  {
    id: "task-02",
    projectId: "field-notes",
    title: "Посчитать повторяющиеся идентификаторы отгрузок по операторам",
    owner: "AM",
    status: "todo",
    priority: "high",
    due: "2026-02-17T09:00:00.000Z",
  },
  {
    id: "task-03",
    projectId: "field-notes",
    title: "Добавить второе наблюдение за передачей смены",
    owner: "AM",
    status: "todo",
    priority: "normal",
    due: "2026-02-19T09:00:00.000Z",
  },
  {
    id: "task-04",
    projectId: "field-notes",
    title: "Подтвердить утверждение о подтверждении приёмки у двух операторов",
    owner: "RB",
    status: "blocked",
    priority: "high",
    due: "2026-02-20T09:00:00.000Z",
  },
  {
    id: "task-05",
    projectId: "accessibility",
    title: "Отметить поворот на карте обхода при прибытии",
    owner: "TK",
    status: "done",
    priority: "normal",
    due: "2026-02-13T09:00:00.000Z",
  },
  {
    id: "task-06",
    projectId: "accessibility",
    title: "Сравнить две формулировки названий направлений",
    owner: "TK",
    status: "running",
    priority: "normal",
    due: "2026-02-16T09:00:00.000Z",
  },
  {
    id: "task-07",
    projectId: "accessibility",
    title: "Показать план указателей двум посетителям, проходящим маршрут впервые",
    owner: "—",
    status: "todo",
    priority: "low",
    due: "2026-02-24T09:00:00.000Z",
  },
  {
    id: "task-08",
    projectId: "handoff",
    title: "Развести бриф на поведение, интерпретацию и открытые вопросы",
    owner: "RB",
    status: "done",
    priority: "high",
    due: "2026-02-12T09:00:00.000Z",
  },
  {
    id: "task-09",
    projectId: "handoff",
    title: "Назначить ответственного за каждую находку, которую нужно проверить",
    owner: "AM",
    status: "todo",
    priority: "normal",
    due: "2026-02-18T09:00:00.000Z",
  },
]

/* -------------------------------------------------------------- activity --- */

export type ActivityKind = "agent" | "voice" | "artifact" | "data" | "you"

export const ACTIVITY_KIND_LABEL: Record<ActivityKind, string> = {
  agent: "Агент",
  voice: "Голос",
  artifact: "Артефакт",
  data: "Данные",
  you: "Вы",
}

export type ActivityItem = {
  id: string
  at: string
  kind: ActivityKind
  /** Who or what caused the line — a person, or the agent, or the room. */
  actor: string
  title: string
  detail: string
  /** The surface this line belongs to, so a timeline row can offer a jump. */
  view: ViewId
}

export const ACTIVITY: ActivityItem[] = [
  {
    id: "act-01",
    at: minutesAgo(2),
    kind: "agent",
    actor: "Портал",
    title: "Ответил на вопрос о передаче",
    detail:
      "Процитировал две полевые заметки и остановился, не предлагая изменений.",
    view: "chat",
  },
  {
    id: "act-02",
    at: minutesAgo(11),
    kind: "data",
    actor: "Приёмка",
    title: "Две записи об отгрузке пришли несопоставленными",
    detail:
      "NW-41220 записали дважды с разными кодами доку, и в одной из копий нет времени прибытия.",
    view: "data",
  },
  {
    id: "act-03",
    at: minutesAgo(26),
    kind: "voice",
    actor: "Комната agentsuite",
    title: "Голосовая сессия завершилась",
    detail: "11 обменов репликами, 6 минут 40 секунд, всё расшифровано.",
    view: "voice",
  },
  {
    id: "act-04",
    at: minutesAgo(38),
    kind: "you",
    actor: "AM",
    title: "Добавили полевую заметку",
    detail: "Наблюдение за передачей смены, западный док, вторая запись.",
    view: "workspace",
  },
  {
    id: "act-05",
    at: minutesAgo(44),
    kind: "artifact",
    actor: "Портал",
    title: "Написал исследовательский бриф",
    detail: "west-dock-brief.md, 48 кБ, собран из пяти заметок.",
    view: "artifacts",
  },
  {
    id: "act-06",
    at: minutesAgo(96),
    kind: "agent",
    actor: "Портал",
    title: "Отметил противоречие между двумя заметками",
    detail:
      "Планшет приходит после бумажного листа — в обоих интервью.",
    view: "chat",
  },
  {
    id: "act-07",
    at: minutesAgo(180),
    kind: "data",
    actor: "Импорт",
    title: "Импортировано 412 строк",
    detail: "shipments.csv, 4 столбца сохранено, 2 отброшено как пустые.",
    view: "data",
  },
  {
    id: "act-08",
    at: minutesAgo(320),
    kind: "artifact",
    actor: "RB",
    title: "Предложил правку надписи на указателе",
    detail: "wayfinding-labels.diff, 12 строк, один файл.",
    view: "artifacts",
  },
  {
    id: "act-09",
    at: minutesAgo(610),
    kind: "voice",
    actor: "Комната agentsuite",
    title: "Голосовая сессия завершилась",
    detail:
      "3 обмена репликами, брошена после того, как оператор перестал говорить.",
    view: "voice",
  },
  {
    id: "act-10",
    at: minutesAgo(1_260),
    kind: "you",
    actor: "RB",
    title: "Перевели проект на передачу",
    detail: "Передача исследования, готово на 94%.",
    view: "workspace",
  },
]

/* ------------------------------------------------------------- artifacts --- */

export type ArtifactKind = "report" | "draft" | "diff" | "export" | "note"

export const ARTIFACT_KIND_LABEL: Record<ArtifactKind, string> = {
  report: "Отчёт",
  draft: "Черновик",
  diff: "Различия",
  export: "Выгрузка",
  note: "Заметка",
}

export type Artifact = {
  id: string
  projectId: string
  name: string
  kind: ArtifactKind
  /** Extension, kept separate so a table can align a column of them. */
  format: string
  bytes: number
  /** Where it came from: a question, an import, or a person. */
  source: string
  updated: string
  /** Human line count, when the format has one. */
  lines?: number
}

export const ARTIFACTS: Artifact[] = [
  {
    id: "art-01",
    projectId: "field-notes",
    name: "west-dock-brief.md",
    kind: "report",
    format: "md",
    bytes: 48_200,
    source: "вопрос: что замедляет передачу?",
    updated: minutesAgo(44),
    lines: 214,
  },
  {
    id: "art-02",
    projectId: "field-notes",
    name: "intake-confirmation-draft.md",
    kind: "draft",
    format: "md",
    bytes: 6_400,
    source: "Портал, после второго интервью",
    updated: minutesAgo(190),
    lines: 38,
  },
  {
    id: "art-03",
    projectId: "accessibility",
    name: "wayfinding-labels.diff",
    kind: "diff",
    format: "diff",
    bytes: 3_100,
    source: "RB, у поворота на платформу",
    updated: minutesAgo(320),
    lines: 12,
  },
  {
    id: "art-04",
    projectId: "accessibility",
    name: "arrival-walkthrough.csv",
    kind: "export",
    format: "csv",
    bytes: 22_800,
    source: "журнал наблюдений",
    updated: minutesAgo(1_450),
    lines: 61,
  },
  {
    id: "art-05",
    projectId: "handoff",
    name: "research-handoff.md",
    kind: "report",
    format: "md",
    bytes: 31_500,
    source: "вопрос: что должно войти в передачу?",
    updated: minutesAgo(1_260),
    lines: 158,
  },
  {
    id: "art-06",
    projectId: "field-notes",
    name: "shipment-duplicates.csv",
    kind: "export",
    format: "csv",
    bytes: 128_400,
    source: "выгрузка приёмки",
    updated: minutesAgo(180),
    lines: 412,
  },
  {
    id: "art-07",
    projectId: "handoff",
    name: "open-questions.md",
    kind: "note",
    format: "md",
    bytes: 1_900,
    source: "RB, во время проверки",
    updated: minutesAgo(1_600),
    lines: 21,
  },
]

/* ------------------------------------------------------------------ data --- */

/** Named `DataRecord`, not `Record`: the global `Record<K, V>` utility type is
 *  in scope everywhere, and shadowing it in a module every view imports is a
 *  trap waiting for someone else's lane. */
export type DataRecord = {
  id: string
  /** The source table the row came from. */
  table: string
  projectId: string
  /** The identifier an operator would read out loud. */
  key: string
  value: string
  state: DataRecordState
  tags: string[]
  updated: string
}

export type DataRecordState = "matched" | "pending" | "stale" | "unmatched"

/** The state is an English enum — it is a value that gets compared, filtered and
 *  indexed, not prose. So the Russian lives here, beside the values it names, and
 *  every render site looks it up rather than printing the raw enum. Printing
 *  `record.state` puts `unmatched` in front of a Russian reader and nothing
 *  catches it. */
export const RECORD_STATE_LABEL: Record<DataRecordState, string> = {
  matched: "Совпало",
  pending: "В ожидании",
  stale: "Устарело",
  unmatched: "Не найдено",
}

export const DATA_RECORDS: DataRecord[] = [
  {
    id: "rec-01",
    table: "shipments",
    projectId: "field-notes",
    key: "NW-41220",
    value: "Док 4 · паллета 12",
    state: "unmatched",
    tags: ["дубль", "приёмка"],
    updated: minutesAgo(11),
  },
  {
    id: "rec-02",
    table: "shipments",
    projectId: "field-notes",
    key: "NW-41220",
    value: "Док 9 · паллета 3",
    state: "unmatched",
    tags: ["дубль", "приёмка"],
    updated: minutesAgo(11),
  },
  {
    id: "rec-03",
    table: "shipments",
    projectId: "field-notes",
    key: "NW-41288",
    value: "Док 4 · паллета 1",
    state: "matched",
    tags: ["приёмка"],
    updated: minutesAgo(28),
  },
  {
    id: "rec-04",
    table: "observations",
    projectId: "accessibility",
    key: "turn-02",
    value: "Остановился на 4 с перед поворотом на платформу",
    state: "matched",
    tags: ["прибытие", "видео"],
    updated: minutesAgo(1_450),
  },
  {
    id: "rec-05",
    table: "observations",
    projectId: "accessibility",
    key: "turn-05",
    value: "Название направления различается между указателями",
    state: "stale",
    tags: ["указатели"],
    updated: minutesAgo(1_500),
  },
  {
    id: "rec-06",
    table: "interviews",
    projectId: "field-notes",
    key: "iv-03",
    value: "Сначала записывает идентификатор на бумаге",
    state: "matched",
    tags: ["расшифровка", "приёмка"],
    updated: minutesAgo(38),
  },
  {
    id: "rec-07",
    table: "interviews",
    projectId: "field-notes",
    key: "iv-04",
    value: "Ждёт планшет, чтобы подтвердить запись",
    state: "pending",
    tags: ["расшифровка", "эфир"],
    updated: minutesAgo(38),
  },
  {
    id: "rec-08",
    table: "questions",
    projectId: "handoff",
    key: "q-07",
    value: "Кто отвечает за эталонную запись?",
    state: "pending",
    tags: ["передача", "ответственный"],
    updated: minutesAgo(1_600),
  },
]

/* ----------------------------------------------------------------- voice --- */

export type VoiceMode = "voice" | "text" | "mixed"

export const VOICE_MODE_LABEL: Record<VoiceMode, string> = {
  voice: "Голос",
  text: "Текст",
  mixed: "Голос и текст",
}

export type VoiceSession = {
  id: string
  room: string
  started: string
  durationSeconds: number
  /** Question-and-answer pairs exchanged, both directions counted. */
  turns: number
  mode: VoiceMode
  outcome: "answered" | "abandoned" | "handed off"
  topics: string[]
}

export const VOICE_SESSIONS: VoiceSession[] = [
  {
    id: "vs-01",
    room: "agentsuite",
    started: minutesAgo(26),
    durationSeconds: 400,
    turns: 11,
    mode: "voice",
    outcome: "answered",
    topics: ["приёмка", "передача", "смена"],
  },
  {
    id: "vs-02",
    room: "agentsuite",
    started: minutesAgo(74),
    durationSeconds: 155,
    turns: 4,
    mode: "mixed",
    outcome: "answered",
    topics: ["повторяющиеся идентификаторы"],
  },
  {
    id: "vs-03",
    room: "agentsuite-1742",
    started: minutesAgo(310),
    durationSeconds: 72,
    turns: 2,
    mode: "voice",
    outcome: "abandoned",
    topics: ["указатели"],
  },
  {
    id: "vs-04",
    room: "agentsuite-1741",
    started: minutesAgo(610),
    durationSeconds: 1_284,
    turns: 19,
    mode: "voice",
    outcome: "answered",
    topics: ["навигация", "прибытие", "посетители впервые"],
  },
  {
    id: "vs-05",
    room: "agentsuite-1741",
    started: minutesAgo(2_100),
    durationSeconds: 940,
    turns: 14,
    mode: "mixed",
    outcome: "handed off",
    topics: ["бриф на передачу", "ответственные"],
  },
  {
    id: "vs-06",
    room: "agentsuite-1739",
    started: minutesAgo(3_010),
    durationSeconds: 318,
    turns: 6,
    mode: "text",
    outcome: "answered",
    topics: ["время появления планшета"],
  },
]

/* --------------------------------------------------------------- lookups --- */

export function projectById(id: string): Project | undefined {
  return PROJECTS.find((project) => project.id === id)
}

export function tasksForProject(projectId: string): Task[] {
  return TASKS.filter((task) => task.projectId === projectId)
}

export function artifactsForProject(projectId: string): Artifact[] {
  return ARTIFACTS.filter((artifact) => artifact.projectId === projectId)
}

export function recordsForProject(projectId: string): DataRecord[] {
  return DATA_RECORDS.filter((record) => record.projectId === projectId)
}

/** Anything not `done`. Pass a project id to count only that project's open
 *  work. Derived rather than stored, so a task flipped to `done` in a view
 *  updates the rail's readout with no second edit. */
export function openTaskCount(projectId?: string): number {
  return TASKS.filter(
    (task) =>
      task.status !== "done" && (!projectId || task.projectId === projectId)
  ).length
}

/** Newest first. The arrays above are already written that way, but a view that
 *  appends a new record to the end — the natural way to add one — needs a sort
 *  that does not care where it landed. The compare is on ISO strings, so it
 *  needs neither a `Date` nor a locale. */
export function byNewest<
  T extends { at?: string; updated?: string; started?: string },
>(items: readonly T[]): T[] {
  const stamp = (item: T) => item.at ?? item.updated ?? item.started ?? ""
  return [...items].sort((a, b) => stamp(b).localeCompare(stamp(a)))
}
