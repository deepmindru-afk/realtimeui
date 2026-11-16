"use client"

import {
  AgentActivity,
  type AgentActivityItem,
} from "@/components/beui/components/agents/agent-activity"
import { ToolApproval } from "@/components/beui/components/agents/tool-approval"
import { cn } from "@/lib/utils"
import {
  ArrowUpRight,
  AudioWaveform,
  ChevronDown,
  Database,
  FileText,
  LayoutGrid,
  Sparkles,
  User,
  type LucideIcon,
} from "lucide-react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useState } from "react"

import {
  ACTIVITY,
  ACTIVITY_KIND_LABEL,
  ARTIFACTS,
  DATA_RECORDS,
  DEMO_NOW,
  PROJECTS,
  RECORD_STATE_LABEL,
  TASKS,
  TASK_STATUS_LABEL,
  VOICE_SESSIONS,
  ago,
  byNewest,
  clockOf,
  dayLabel,
  formatBytes,
  formatDuration,
  minutesAgo,
  openTaskCount,
  projectById,
  type ActivityItem,
  type ActivityKind,
} from "../demo-data"
import { viewById, type ViewId } from "../view-registry"

/**
 * Activity — the record, in the order it happened.
 *
 * `ACTIVITY` is the spine and nothing here invents a second feed. Ten lines
 * arrive newest first from `../demo-data`, and everything else on the page is
 * derived from them: the day headings, the kind tallies, the filters, the
 * cross-references. The traces underneath each line are the one thing written
 * by hand, because a record that says only "ответил на вопрос" is not a
 * record of anything — the trace is where the tool calls, the reasoning and the
 * search results become legible as separate kinds.
 *
 * Two things are deliberately not links. The surface tag on a row and the chips
 * on its cross-references name where the work lives, but the shell owns surface
 * selection and a view has no way to drive it, so a control that looks like a
 * jump and does nothing is worse than a label. Everything here is a record, not
 * a control surface.
 *
 * The page is one normally-scrolling document. The shell's `main` is the
 * scroller, so nothing here brings its own `overflow-y-auto` except the trace
 * viewport inside `AgentActivity`, which is that component's own design. The
 * only height this view states is the sticky context column at `xl`, and it is
 * sticky against the shell's scrollport rather than sized in viewport units.
 */

/* -------------------------------------------------------------- vocabulary --- */

/** The shell's one focus treatment, so keyboard focus is never ambiguous. */
const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-foreground/50"

/** Mono micro-label, the same size and tracking the rail uses for its group
 *  headings. Every label in this view is set in it, which is what holds the
 *  page together: one register for structure, one for reading. */
const MICRO = "text-muted-foreground font-mono text-[10px] tracking-[0.16em] uppercase"

/** Where the spine runs, in rem. The feed's first grid column is `1.75rem`
 *  wide, so the line and every marker on it share this one number. */
const SPINE = "left-[0.8125rem]"

/** The kinds, in the order `ACTIVITY_KIND_LABEL` declares them, each with an
 *  icon, a chip, and the colour its markers and tallies are drawn in.
 *
 *  The palette is mostly a refusal. Four of the five kinds are machine lines
 *  and get a cool tint; a person gets plain ink; the agent gets the foreground
 *  token, because it is the loudest thing in the record and does not need a
 *  colour to say so. Amber is held back entirely and used only where someone
 *  has to decide something, so the one warm colour on the page always means
 *  "участвует человек". */
const KIND_CHROME: Record<
  ActivityKind,
  { icon: LucideIcon; chip: string; dot: string; bar: string }
> = {
  agent: {
    icon: Sparkles,
    chip: "border-foreground/15 bg-foreground/[0.06] text-foreground",
    dot: "bg-foreground",
    bar: "bg-foreground",
  },
  data: {
    icon: Database,
    chip: "border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300",
    dot: "bg-sky-500",
    bar: "bg-sky-500",
  },
  voice: {
    icon: AudioWaveform,
    chip: "border-teal-500/25 bg-teal-500/10 text-teal-700 dark:text-teal-300",
    dot: "bg-teal-500",
    bar: "bg-teal-500",
  },
  artifact: {
    icon: FileText,
    chip: "border-violet-500/25 bg-violet-500/10 text-violet-700 dark:text-violet-300",
    dot: "bg-violet-500",
    bar: "bg-violet-500",
  },
  you: {
    icon: User,
    chip: "border-border bg-muted text-muted-foreground",
    dot: "bg-muted-foreground",
    bar: "bg-muted-foreground",
  },
}

/** Task states that still want a person, and so borrow the warm accent the
 *  decision records use. A running task is cool: a machine has it. */
const OPEN_CHROME: Record<"running" | "blocked", string> = {
  running:
    "border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  blocked:
    "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
}

/* ------------------------------------------------------------ derivations --- */

/** The feed, sorted rather than trusted. `ACTIVITY` is already written newest
 *  first, but the helper exists for the day a lane appends a record to the end,
 *  and a record that claims to be in order should be in order on principle. */
const FEED = byNewest(ACTIVITY)

/** Lines grouped under a day label, in the order the days first appear. */
const DAYS = FEED.reduce<{ label: string; items: ActivityItem[] }[]>(
  (groups, item) => {
    const label = dayLabel(item.at)
    const last = groups[groups.length - 1]
    if (last && last.label === label) last.items.push(item)
    else groups.push({ label, items: [item] })
    return groups
  },
  []
)

/** One chip per kind, with the count taken from the unfiltered feed so the
 *  numbers do not move while a filter is on. */
const KIND_FILTERS = (
  Object.keys(ACTIVITY_KIND_LABEL) as ActivityKind[]
).map((kind) => ({
  kind,
  label: ACTIVITY_KIND_LABEL[kind],
  count: FEED.filter((item) => item.kind === kind).length,
}))

/** Who is in the record, how often, and in which register they speak. An
 *  actor's colour is taken from the kind of their newest line, so Portal is
 *  drawn as the agent and RB as a person without either being hard-coded. */
const TALLY = (() => {
  const rows = new Map<string, { count: number; kind: ActivityKind }>()
  for (const item of FEED) {
    const row = rows.get(item.actor)
    if (row) row.count += 1
    else rows.set(item.actor, { count: 1, kind: item.kind })
  }
  return [...rows.entries()]
    .map(([actor, row]) => ({ actor, ...row }))
    .sort((a, b) => b.count - a.count || a.actor.localeCompare(b.actor))
})()

const TALLY_HIGH = TALLY[0]?.count ?? 1

/** Work still open, taken from `TASKS` rather than restated here. The project
 *  name comes from the lookup so a task cannot claim a project that is not in
 *  the workspace. */
const OPEN_WORK = TASKS.filter(
  (task) => task.status === "running" || task.status === "blocked"
).map((task) => ({
  task,
  project: projectById(task.projectId)?.name ?? task.projectId,
}))

/** The room, on its own terms. A voice session and a feed line are different
 *  events — a session can end without landing a line, and a line can describe a
 *  session that started earlier — so this is a readout and not a join. */
const ROOM = (() => {
  const longest = VOICE_SESSIONS.reduce((a, b) =>
    b.durationSeconds > a.durationSeconds ? b : a
  )
  return {
    sessions: VOICE_SESSIONS.length,
    rooms: new Set(VOICE_SESSIONS.map((session) => session.room)).size,
    turns: VOICE_SESSIONS.reduce((sum, session) => sum + session.turns, 0),
    longest: formatDuration(longest.durationSeconds),
    abandoned: VOICE_SESSIONS.filter((s) => s.outcome === "abandoned").length,
  }
})()

/** The two ends of the record, for the lede. */
const NEWEST = FEED[0]
const OLDEST = FEED[FEED.length - 1]

/** The frame's clock. `DEMO_NOW` rather than the wall clock, so the server render
 *  and the browser agree on every time this page prints. */
const AS_OF = clockOf(DEMO_NOW)

/* ------------------------------------------------- cross-referencing a line --- */

type Linked = {
  id: string
  /** The identifier an operator would read out loud, or the filename. */
  label: string
  detail: string
  icon: LucideIcon
  surface: ViewId
}

/**
 * What else in the workspace carries this line's exact timestamp.
 *
 * The join is equality on the ISO string, never a nearest-time guess, and that
 * is the only honest version of it: `minutesAgo` gives every record in
 * `demo-data` a shared origin, so a file, a row, and a feed line that were
 * written in the same operation carry the same string, and anything that does
 * not genuinely share it stays unlinked rather than being rounded onto it.
 *
 * Voice sessions are excluded on purpose, for the reason given at `ROOM`.
 */
function linksFor(item: ActivityItem): Linked[] {
  const at = item.at
  return [
    ...ARTIFACTS.filter((artifact) => artifact.updated === at).map(
      (artifact) => ({
        id: `artifact-${artifact.id}`,
        label: artifact.name,
        detail: [
          artifact.format,
          formatBytes(artifact.bytes),
          artifact.lines ? `${artifact.lines} строк` : null,
        ]
          .filter(Boolean)
          .join(" · "),
        icon: FileText,
        surface: "artifacts" as ViewId,
      })
    ),
    ...DATA_RECORDS.filter((record) => record.updated === at).map((record) => ({
      id: `record-${record.id}`,
      label: record.key,
      detail: `${record.value} · ${RECORD_STATE_LABEL[record.state]}`,
      icon: Database,
      surface: "data" as ViewId,
    })),
    ...PROJECTS.filter((project) => project.updated === at).map((project) => ({
      id: `project-${project.id}`,
      label: project.name,
      detail: `${project.client} · ${project.progress}%`,
      icon: LayoutGrid,
      surface: "workspace" as ViewId,
    })),
  ]
}

/** The links for the whole feed, resolved once. Every row renders the same
 *  records on every re-render, so this never has to run inside a render path. */
const LINKS = new Map(FEED.map((item) => [item.id, linksFor(item)]))

/* -------------------------------------------------------------- the traces --- */

type Decision = {
  tool: string
  title: string
  description: string
  parameters: { id: string; label: string; value: string }[]
  decidedBy: string
  /** An ISO stamp from `minutesAgo`, so the decision sits inside the same
   *  `DEMO_NOW` frame as the line it belongs to. */
  decidedAt: string
}

type Trace = {
  /** The completed run's one-line summary, shown on the trace's own trigger. */
  summary: string
  items: AgentActivityItem[]
  /** Present only where a person had to say yes first. */
  decision?: Decision
}

/**
 * One trace per line, keyed by activity id.
 *
 * `AgentActivity` draws five item types and they are the reason this is the
 * right component for the job: a `step` reads as plan, a `tool` as a call with
 * its target in mono, a `trace` as reasoning or a message, a `search` as a
 * query with its results underneath, and `text` as the answer itself. Tool
 * calls, reasoning and search results therefore stay distinguishable by shape
 * rather than by a label this view has to keep in sync.
 *
 * Only one line carries a `decision`, and it is the one where a person proposed
 * a change to a file — the one place an approval is implied by the shared data
 * rather than invented. It is recorded as already approved: this is a record of
 * what happened, not a prompt waiting on someone, and a pending approval sitting
 * in a historical feed would be claiming a live state that does not exist.
 */
const TRACES: Record<string, Trace> = {
  "act-01": {
    summary: "Прочитал бриф и ответил",
    items: [
      {
        id: "act-01-step-1",
        type: "step",
        label: "Найти утверждение в брифе по передаче смены",
        status: "complete",
        meta: "158 строк",
      },
      {
        id: "act-01-tool-1",
        type: "tool",
        action: "read",
        target: "research-handoff.md",
      },
      {
        id: "act-01-trace-1",
        type: "trace",
        kind: "thinking",
        label: "Проверяет, что действительно наблюдали",
        detail: "2 заметки, 1 открыта",
      },
      {
        id: "act-01-trace-2",
        type: "trace",
        kind: "message",
        label: "Ответ",
        detail: "процитировал 2 заметки",
      },
      {
        id: "act-01-text-1",
        type: "text",
        content:
          "Ответил по брифу и интервью на западном доку. Причину не назвал и изменений в форме приёмки не предложил.",
      },
    ],
  },
  "act-02": {
    summary: "Две строки, совпадений нет",
    items: [
      {
        id: "act-02-trace-1",
        type: "trace",
        kind: "read",
        label: "Строка попала без совпадения",
        detail: "NW-41220",
      },
      {
        id: "act-02-trace-2",
        type: "trace",
        kind: "read",
        label: "Вторая копия того же ключа",
        detail: "NW-41220",
      },
      {
        id: "act-02-step-1",
        type: "step",
        label: "Обе оставлены на проверку",
        status: "complete",
        meta: "не объединены",
      },
    ],
  },
  "act-03": {
    summary: "11 ходов, расшифровано",
    items: [
      {
        id: "act-03-trace-1",
        type: "trace",
        kind: "message",
        label: "Сессия начата",
        detail: "комната agentsuite",
      },
      {
        id: "act-03-step-1",
        type: "step",
        label: "Одиннадцать ходов обмена",
        status: "complete",
        meta: "6:40",
      },
      {
        id: "act-03-trace-2",
        type: "trace",
        kind: "write",
        label: "Расшифровка записана",
        detail: "11 ходов",
      },
      {
        id: "act-03-text-1",
        type: "text",
        content:
          "Оператор спросил, что замедляет передачу приёмки. Портал ответил по интервью на западном доку и на этом остановился.",
      },
    ],
  },
  "act-04": {
    summary: "Одна заметка занесена",
    items: [
      {
        id: "act-04-tool-1",
        type: "tool",
        action: "edit",
        target: "interviews/iv-04.md",
        additions: 12,
      },
      {
        id: "act-04-trace-1",
        type: "trace",
        kind: "read",
        label: "Фрагмент эфира, вторая смена",
        detail: "iv-04",
      },
      {
        id: "act-04-step-1",
        type: "step",
        label: "Занесено в «Интервью на западном доку»",
        status: "complete",
        meta: "заметка 5",
      },
    ],
  },
  "act-05": {
    summary: "Искал, прочитал 5 заметок, написал 214 строк",
    items: [
      {
        id: "act-05-search-1",
        type: "search",
        query: "почему буксует передача приёмки от дока до стойки",
        results: [
          {
            id: "act-05-result-1",
            title: "Бумажные идентификаторы при приёмке партий",
            domain: "logistics-notes.example",
          },
          {
            id: "act-05-result-2",
            title: "Измеряют передачу, а не док",
            domain: "northline.example",
          },
        ],
        moreCount: 3,
      },
      {
        id: "act-05-tool-1",
        type: "tool",
        action: "read",
        target: "interviews/iv-01.md",
      },
      {
        id: "act-05-tool-2",
        type: "tool",
        action: "read",
        target: "interviews/iv-03.md",
      },
      {
        id: "act-05-tool-3",
        type: "tool",
        action: "write",
        target: "west-dock-brief.md",
        additions: 214,
      },
      {
        id: "act-05-step-1",
        type: "step",
        label: "Поведение отделено от интерпретации",
        status: "complete",
        meta: "48 кБ",
      },
    ],
  },
  "act-06": {
    summary: "Сравнены две заметки",
    items: [
      {
        id: "act-06-tool-1",
        type: "tool",
        action: "read",
        target: "interviews/iv-03.md",
      },
      {
        id: "act-06-tool-2",
        type: "tool",
        action: "read",
        target: "interviews/iv-04.md",
      },
      {
        id: "act-06-trace-1",
        type: "trace",
        kind: "thinking",
        label: "Один и тот же порядок в обоих интервью",
        detail: "бумага, потом планшет",
      },
      {
        id: "act-06-trace-2",
        type: "trace",
        kind: "message",
        label: "Выявлено противоречие",
        detail: "исправление не предложено",
      },
    ],
  },
  "act-07": {
    summary: "412 строк, 4 столбца сохранено",
    items: [
      {
        id: "act-07-tool-1",
        type: "tool",
        action: "run",
        target: "импорт shipments.csv",
      },
      {
        id: "act-07-trace-1",
        type: "trace",
        kind: "read",
        label: "Четыре столбца сохранено",
        detail: "2 отброшено как пустые",
      },
      {
        id: "act-07-step-1",
        type: "step",
        label: "Проверка дубликатов записана",
        status: "complete",
        meta: "412 строк",
      },
    ],
  },
  "act-08": {
    summary: "Один файл изменён, 12 строк",
    items: [
      {
        id: "act-08-tool-1",
        type: "tool",
        action: "edit",
        target: "wayfinding-labels.diff",
        additions: 9,
        deletions: 3,
      },
      {
        id: "act-08-trace-1",
        type: "trace",
        kind: "message",
        label: "Сравнены две формулировки для таблички",
        detail: "ход 02, ход 05",
      },
      {
        id: "act-08-step-1",
        type: "step",
        label: "Правки оставлены на проверку",
        status: "complete",
        meta: "1 файл",
      },
    ],
    decision: {
      tool: "правка wayfinding-labels.diff",
      title: "Внести правку в план табличек",
      description:
        "Две формулировки названия направления для поворота на платформу, девять добавленных строк и три удалённые. RB прочитал различия до того, как их оставили; в действующий план ничего не отправлено.",
      parameters: [
        { id: "file", label: "файл", value: "wayfinding-labels.diff" },
        {
          id: "place",
          label: "место",
          value: "табличка прибытия, поворот на платформу",
        },
        {
          id: "basis",
          label: "основание",
          value: "2 обхода при прибытии, 1 посетитель впервые",
        },
      ],
      decidedBy: "RB",
      /* Two minutes before the line it is filed under, so the decision and the
         change it released sit either side of a single minute boundary. */
      decidedAt: minutesAgo(322),
    },
  },
  "act-09": {
    summary: "3 хода, прервано",
    items: [
      {
        id: "act-09-trace-1",
        type: "trace",
        kind: "message",
        label: "Сессия начата",
        detail: "комната agentsuite",
      },
      {
        id: "act-09-step-1",
        type: "step",
        label: "Оператор перестал говорить",
        status: "complete",
        meta: "ход 3",
      },
      {
        id: "act-09-step-2",
        type: "step",
        label: "Закрыто без ответа",
        status: "pending",
        meta: "нет расшифровки",
      },
    ],
  },
  "act-10": {
    summary: "Этап изменён, бриф открыт заново",
    items: [
      {
        id: "act-10-trace-1",
        type: "trace",
        kind: "message",
        label: "Этап переведён в «передачу»",
        detail: "готово на 94%",
      },
      {
        id: "act-10-tool-1",
        type: "tool",
        action: "edit",
        target: "research-handoff.md",
        additions: 12,
      },
      {
        id: "act-10-step-1",
        type: "step",
        label: "Находки без исполнителя открыты заново",
        status: "complete",
        meta: "назначен 1 исполнитель",
      },
    ],
  },
}

/** A line with no authored trace still renders — the trigger reads, the
 *  disclosure opens onto nothing. Better than a row that silently refuses to
 *  open when a new record lands in `ACTIVITY` without a trace beside it. */
function traceFor(id: string): Trace {
  return TRACES[id] ?? { summary: "Шаги не записаны", items: [] }
}

/* ----------------------------------------------------------------- pieces --- */

function KindChip({ kind }: { kind: ActivityKind }) {
  const chrome = KIND_CHROME[kind]
  const Icon = chrome.icon
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] leading-4 font-medium",
        chrome.chip
      )}
    >
      <Icon className="size-3" strokeWidth={1.9} aria-hidden />
      {ACTIVITY_KIND_LABEL[kind]}
    </span>
  )
}

/** Where a line lives. A label, not a link: the shell picks the surface. */
function SurfaceTag({ surface }: { surface: ViewId }) {
  const meta = viewById(surface)
  const Icon = meta.icon
  return (
    <span
      title={meta.blurb}
      className="text-muted-foreground/70 ml-auto hidden shrink-0 items-center gap-1 text-[10px] sm:inline-flex"
    >
      <Icon className="size-3" strokeWidth={1.75} aria-hidden />
      {meta.label}
    </span>
  )
}

/** The trace panel under an open line. Split out so the row body stays a
 *  readable list item and the panel can grow without the row re-flowing. */
function TracePanel({
  item,
  panelId,
}: {
  item: ActivityItem
  panelId: string
}) {
  const trace = traceFor(item.id)
  const decision = trace.decision

  return (
    <div className="pb-4 pl-6 pr-2 sm:pr-3">
      <div className="border-border bg-background rounded-lg border p-3">
        <p className={cn(MICRO, "mb-1")}>ход запуска</p>
        <AgentActivity
          items={trace.items}
          status="complete"
          open
          summary={trace.summary}
          maxHeight={260}
        />

        {decision && (
          <>
            <p className={cn(MICRO, "mt-4 mb-1")}>решение</p>
            <ToolApproval
              tool={decision.tool}
              title={decision.title}
              description={decision.description}
              status="approved"
              defaultOpen={false}
              parameters={[
                ...decision.parameters,
                {
                  id: "decided-by",
                  label: "решил",
                  value: decision.decidedBy,
                },
                {
                  id: "decided-at",
                  label: "решено в",
                  value: clockOf(decision.decidedAt),
                },
              ]}
            />
          </>
        )}
      </div>
    </div>
  )
}

/** One day heading, sitting on the spine with a notch where the day turned. */
function DayHeading({
  label,
  count,
  headingId,
}: {
  label: string
  count: number
  headingId: string
}) {
  return (
    <div className="relative flex items-center gap-2 pt-5 pb-1.5 pl-7">
      <span
        aria-hidden
        className={cn("border-background absolute size-2 -translate-x-1/2 rounded-full border-2 bg-muted-foreground", SPINE)}
      />
      <h2 id={headingId} className={cn(MICRO, "text-foreground/80")}>
        {label}
      </h2>
      <span aria-hidden className="bg-border h-px flex-1" />
      <span className={cn(MICRO, "shrink-0 tabular-nums")}>
        {count} {count === 1 ? "line" : "lines"}
      </span>
    </div>
  )
}

/** One line of the record. The whole row is the disclosure trigger, and nothing
 *  interactive is nested inside it — the trace's own trigger lives in the panel
 *  below, where a button inside a button would be. */
function FeedRow({
  item,
  index,
  open,
  onToggle,
}: {
  item: ActivityItem
  index: number
  open: boolean
  onToggle: () => void
}) {
  const reduce = useReducedMotion()
  const chrome = KIND_CHROME[item.kind]
  const links = LINKS.get(item.id) ?? []
  const panelId = `activity-trace-${item.id}`

  return (
    <motion.li
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: reduce ? 0 : 0.26,
        /* Staggered, but capped: a longer record should not make the reader
           wait on the bottom of the page for a fade to finish. */
        delay: reduce ? 0 : Math.min(index, 8) * 0.018,
        ease: [0.2, 0, 0, 1],
      }}
      className="relative"
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        className={cn(
          FOCUS,
          "group relative grid w-full grid-cols-[1.75rem_2.75rem_minmax(0,1fr)_1.25rem] items-start gap-x-2 py-2.5 pr-2 text-left transition-colors sm:grid-cols-[1.75rem_3.25rem_minmax(0,1fr)_1.25rem] sm:pr-3",
          open ? "bg-muted/50" : "hover:bg-muted/30"
        )}
      >
        {/* The marker, ringed in the page background so it reads as a bead on
            the line rather than a dot sitting near one. */}
        <span
          aria-hidden
          className={cn(
            "border-background absolute top-[1.45rem] size-2.5 -translate-x-1/2 rounded-full border-2",
            SPINE,
            chrome.dot,
            open ? "scale-110" : "group-hover:scale-110"
          )}
        />

        <span className="flex flex-col items-end pt-px leading-tight">
          <span className="text-foreground/80 font-mono text-[11px] tabular-nums">
            {clockOf(item.at)}
          </span>
          <span
            className={cn(
              MICRO,
              "hidden leading-tight tracking-normal normal-case sm:block"
            )}
          >
            {ago(item.at)}
          </span>
        </span>

        <span className="min-w-0">
          <span className="flex items-center gap-2">
            <KindChip kind={item.kind} />
            <span className="text-muted-foreground truncate text-[11px]">
              {item.actor}
            </span>
            <SurfaceTag surface={item.view} />
          </span>
          <span className="mt-1.5 block text-sm leading-5 font-medium text-balance">
            {item.title}
          </span>
          <span className="text-muted-foreground mt-0.5 block text-[12.5px] leading-5">
            {item.detail}
          </span>

          {links.length > 0 && (
            <span className="mt-2 flex flex-wrap gap-1.5">
              {links.map((link) => {
                const Icon = link.icon
                return (
                  <span
                    key={link.id}
                    className="border-border bg-background inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-md border px-1.5 py-1 text-[11px]"
                  >
                    <span className="sr-only">
                      {viewById(link.surface).label}:{" "}
                    </span>
                    <Icon
                      className="text-muted-foreground/60 size-3 shrink-0"
                      aria-hidden
                    />
                    <span className="text-foreground/85 font-mono">
                      {link.label}
                    </span>
                    <span
                      aria-hidden
                      className="text-muted-foreground/40"
                    >
                      ·
                    </span>
                    <span className="text-muted-foreground truncate">
                      {link.detail}
                    </span>
                  </span>
                )
              })}
            </span>
          )}
        </span>

        <ChevronDown
          aria-hidden
          className={cn(
            "text-muted-foreground mt-1 size-4 shrink-0 transition-transform duration-200",
            open && "rotate-180"
          )}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={panelId}
            key="trace"
            initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={reduce ? { opacity: 1 } : { height: "auto", opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{
              duration: reduce ? 0 : 0.24,
              ease: [0.16, 1, 0.3, 1],
            }}
            className="overflow-hidden"
          >
            <TracePanel item={item} panelId={panelId} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  )
}

/* ------------------------------------------------------------------- view --- */

export function ActivityView() {
  const reduce = useReducedMotion()
  /* One line open at a time. A record that can be unfolded all the way down
     stops being a record, and only one trace needs to be measured at a time. */
  const [openId, setOpenId] = useState<string | null>(NEWEST?.id ?? null)
  const [filter, setFilter] = useState<ActivityKind | "all">("all")

  const visible = filter === "all" ? DAYS : DAYS.map((day) => ({
    ...day,
    items: day.items.filter((item) => item.kind === filter),
  })).filter((day) => day.items.length > 0)
  const shown = visible.reduce((sum, day) => sum + day.items.length, 0)

  return (
    <div className="mx-auto min-h-full w-full max-w-[92rem] px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      {/* A dotted ground behind the masthead only, masked to a top-down fade so
          the grid never reaches the text it is meant to sit under. */}
      <div className="relative">
        <span
          aria-hidden
          className="pointer-events-none absolute -top-8 -left-4 -right-4 h-64 opacity-50 [background-image:radial-gradient(var(--border)_1px,transparent_1px)] [background-size:15px_15px] [mask-image:linear-gradient(to_bottom,black,transparent)]"
        />

        <motion.div
          initial={reduce ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduce ? 0 : 0.3, ease: [0.2, 0, 0, 1] }}
          className="relative"
        >
          <p className={cn(MICRO, "flex items-center gap-2")}>
            журнал
            <span aria-hidden className="bg-border h-px w-8" />
            <span className="tracking-normal normal-case">
              по состоянию на {AS_OF}
            </span>
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
            Активность
          </h1>
          <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-6 text-pretty">
            что делали агент, комната и ваша команда, в порядке, в котором это
            происходило. Строк: {FEED.length}, самая свежая —{" "}
            {NEWEST ? ago(NEWEST.at) : "только что"}, самая старая —{" "}
            {OLDEST ? ago(OLDEST.at) : "только что"}. Откройте строку, чтобы
            прочитать, что происходило под ней.
          </p>
        </motion.div>
      </div>

      <div className="mt-8 flex flex-col gap-8 xl:mt-10 xl:flex-row xl:items-start xl:gap-10">
        {/* ------------------------------------------------------------ feed */}
        <div className="order-1 min-w-0 flex-1">
          <div className="border-border flex flex-wrap items-center gap-2 border-b pb-3">
            <div role="group" aria-label="Фильтровать записи по типу" className="flex flex-wrap gap-1.5">
              <button
                type="button"
                aria-pressed={filter === "all"}
                onClick={() => setFilter("all")}
                className={cn(
                  FOCUS,
                  "h-7 rounded-md border px-2 text-[11px] font-medium transition-colors",
                  filter === "all"
                    ? "border-foreground/20 bg-foreground text-background"
                    : "border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                Все
                <span className="ml-1.5 font-mono tabular-nums opacity-70">
                  {FEED.length}
                </span>
              </button>
              {KIND_FILTERS.map((option) => {
                const Icon = KIND_CHROME[option.kind].icon
                const pressed = filter === option.kind
                return (
                  <button
                    key={option.kind}
                    type="button"
                    aria-pressed={pressed}
                    onClick={() => setFilter(option.kind)}
                    className={cn(
                      FOCUS,
                      "inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-[11px] font-medium transition-colors",
                      pressed
                        ? "border-foreground/20 bg-foreground text-background"
                        : "border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    )}
                  >
                    <Icon className="size-3" strokeWidth={1.9} aria-hidden />
                    {option.label}
                    <span className="font-mono tabular-nums opacity-70">
                      {option.count}
                    </span>
                  </button>
                )
              })}
            </div>

            <p className={cn(MICRO, "ml-auto shrink-0 tabular-nums")}>
              Показано {shown} из {FEED.length}
            </p>
          </div>

          {/* The frame's top edge. Everything below runs down one line. */}
          <div className="flex items-center gap-2 pt-4 pb-1">
            <span aria-hidden className="bg-foreground size-1.5 rounded-full" />
            <span className={cn(MICRO, "text-foreground/80")}>сейчас</span>
            <span aria-hidden className="bg-border h-px flex-1" />
          </div>

          <div className="relative">
            <span
              aria-hidden
              className={cn("bg-border absolute top-1 bottom-1 w-px", SPINE)}
            />
            {visible.map((day) => {
              const headingId = `activity-day-${day.label.replace(/\s+/g, "-")}`
              return (
                <section key={day.label} aria-labelledby={headingId}>
                  <DayHeading
                    label={day.label}
                    count={day.items.length}
                    headingId={headingId}
                  />
                  <ul className="divide-border divide-y">
                    {day.items.map((item) => {
                      const index = FEED.indexOf(item)
                      return (
                        <FeedRow
                          key={item.id}
                          item={item}
                          index={index < 0 ? 0 : index}
                          open={openId === item.id}
                          onToggle={() =>
                            setOpenId((current) =>
                              current === item.id ? null : item.id
                            )
                          }
                        />
                      )
                    })}
                  </ul>
                </section>
              )
            })}
          </div>
        </div>

        {/* --------------------------------------------------------- context */}
        <aside
          aria-label="Активность коротко"
          className="order-2 flex w-full flex-col gap-4 xl:sticky xl:top-6 xl:w-[19rem] xl:shrink-0"
        >
          <motion.section
            initial={reduce ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: reduce ? 0 : 0.3,
              delay: reduce ? 0 : 0.06,
              ease: [0.2, 0, 0, 1],
            }}
            aria-labelledby="activity-who"
            className="border-border rounded-xl border p-4"
          >
            <h2 id="activity-who" className={cn(MICRO, "mb-3")}>
              кто
            </h2>
            <ul className="flex flex-col gap-2.5">
              {TALLY.map((row) => (
                <li key={row.actor} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2">
                  <span className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-[12px]">
                    <span
                      aria-hidden
                      className={cn(
                        "size-1.5 shrink-0 rounded-full",
                        KIND_CHROME[row.kind].dot
                      )}
                    />
                    <span className="truncate">{row.actor}</span>
                  </span>
                  <span className="font-mono text-[11px] tabular-nums">
                    {row.count}
                  </span>
                  <span
                    aria-hidden
                    className="bg-muted col-span-2 mt-1 block h-px overflow-hidden"
                  >
                    <span
                      className={cn(
                        "block h-px",
                        KIND_CHROME[row.kind].bar
                      )}
                      /* A data-driven length, so the one place this view needs
                         a value it cannot name as a class. */
                      style={{ width: `${(row.count / TALLY_HIGH) * 100}%` }}
                    />
                  </span>
                </li>
              ))}
            </ul>
          </motion.section>

          <motion.section
            initial={reduce ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: reduce ? 0 : 0.3,
              delay: reduce ? 0 : 0.12,
              ease: [0.2, 0, 0, 1],
            }}
            aria-labelledby="activity-open"
            className="border-border rounded-xl border p-4"
          >
            <h2 id="activity-open" className={cn(MICRO, "mb-1")}>
              ещё в работе
            </h2>
            <p className="text-muted-foreground text-[12px] leading-5">
              {openTaskCount()} из {TASKS.length} задач в рабочей области. Две из
              них ждут человека — они в списке «в работе».
            </p>
            <ul className="mt-3 flex flex-col gap-2.5">
              {OPEN_WORK.map(({ task, project }) => (
                <li
                  key={task.id}
                  className="border-border/70 border-t pt-2.5 first:border-t-0 first:pt-0"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 text-[12px] leading-5 font-medium text-balance">
                      {task.title}
                    </p>
                    <span
                      className={cn(
                        "shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] leading-4 font-medium",
                        OPEN_CHROME[task.status as "running" | "blocked"]
                      )}
                    >
                      {TASK_STATUS_LABEL[task.status]}
                    </span>
                  </div>
                  <p className="text-muted-foreground mt-1 font-mono text-[10px] tracking-[0.1em] uppercase">
                    {project} · {task.owner}
                  </p>
                </li>
              ))}
            </ul>
          </motion.section>

          <motion.section
            initial={reduce ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: reduce ? 0 : 0.3,
              delay: reduce ? 0 : 0.18,
              ease: [0.2, 0, 0, 1],
            }}
            aria-labelledby="activity-room"
            className="border-border rounded-xl border p-4"
          >
            <h2 id="activity-room" className={cn(MICRO, "mb-3")}>
              комната
            </h2>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
              {[
                { label: "сессии", value: String(ROOM.sessions) },
                { label: "комнаты", value: String(ROOM.rooms) },
                { label: "ходы", value: String(ROOM.turns) },
                { label: "дольше всего", value: ROOM.longest },
              ].map((figure) => (
                <div key={figure.label}>
                  <dt className={MICRO}>{figure.label}</dt>
                  <dd className="mt-0.5 font-mono text-[13px] tabular-nums">
                    {figure.value}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="text-muted-foreground mt-3 border-t border-border/70 pt-2.5 text-[12px] leading-5">
              {ROOM.abandoned} из них закончились до ответа. Комната считается
              отдельно: сессия может закончиться, не оставив строки, а строка —
              описывать сессию, которая началась раньше.
            </p>
          </motion.section>
        </aside>
      </div>
    </div>
  )
}
