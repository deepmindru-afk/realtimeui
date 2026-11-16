"use client"

/**
 * Data: the record layer the artifacts are built from.
 *
 * The spine is `RecordsTable`, which brings sorting and selection for free, and
 * the two panels around it answer the questions a table alone cannot: what
 * produced these rows (`ContextCards`) and what they add up to (`InsightCards`).
 *
 * All three read the shared dataset, so the row counts here agree with the
 * counts on Workspace and Artifacts. The one thing this view computes for
 * itself is the filter — a text search, a state filter and a project filter —
 * because `RecordsTable` sorts but does not narrow, and narrowing is the thing
 * an operator actually comes here to do.
 */

import { useMemo, useState } from "react"
import { Search } from "lucide-react"

import { ContextCards } from "@/components/beautiful-ui/context-cards"
import { InsightCards } from "@/components/beautiful-ui/insight-cards"
import { RecordsTable, type RecordRow } from "@/components/beautiful-ui/records-table"
import {
  DATA_RECORDS,
  PROJECTS,
  RECORD_STATE_LABEL,
  clockOf,
  dayShort,
  recordsForProject,
  type DataRecord,
} from "@/components/super-app/demo-data"
import { cn } from "@/lib/utils"

type StateFilter = DataRecord["state"] | "all"

const STATE_LABEL = RECORD_STATE_LABEL

const STATE_FILTERS: { value: StateFilter; label: string }[] = [
  { value: "all", label: "Все состояния" },
  { value: "matched", label: STATE_LABEL.matched },
  { value: "pending", label: STATE_LABEL.pending },
  { value: "stale", label: STATE_LABEL.stale },
  { value: "unmatched", label: STATE_LABEL.unmatched },
]

/** What fed the table, as `ContextCards` wants it. Derived from the records
 *  themselves rather than invented, so the panel cannot claim a source the
 *  table does not actually contain. */
const SOURCES = [...new Set(DATA_RECORDS.map((record) => record.table))]

export function DataView() {
  const [query, setQuery] = useState("")
  const [state, setState] = useState<StateFilter>("all")
  const [projectId, setProjectId] = useState<string>("all")
  const [sortKey, setSortKey] = useState<keyof RecordRow>("name")
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc")
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return DATA_RECORDS.filter((record) => {
      if (projectId !== "all" && record.projectId !== projectId) return false
      if (state !== "all" && record.state !== state) return false
      if (!needle) return true
      return (
        record.key.toLowerCase().includes(needle) ||
        record.value.toLowerCase().includes(needle) ||
        record.tags.some((tag) => tag.toLowerCase().includes(needle))
      )
    })
  }, [projectId, query, state])

  const records = useMemo(() => rows.map(toRecordRow), [rows])

  const selected = useMemo(
    () => DATA_RECORDS.find((record) => record.id === selectedId) ?? null,
    [selectedId]
  )

  const counts = useMemo(() => {
    const tally = { matched: 0, pending: 0, stale: 0, unmatched: 0 }
    for (const record of rows) tally[record.state] += 1
    return tally
  }, [rows])

  /* Sorting lives here rather than in the table because the table reports a
   * sort key to its parent and expects the parent to hand back an ordered list.
   * `RecordsTable` also has no notion of a sort direction toggle, so the header
   * buttons below carry the affordance the table leaves out. */
  const sorted = useMemo(() => {
    const direction = sortDirection === "asc" ? 1 : -1
    return [...records].sort((a, b) => {
      const left = String(a[sortKey] ?? "")
      const right = String(b[sortKey] ?? "")
      return left.localeCompare(right) * direction
    })
  }, [records, sortDirection, sortKey])

  const toggleSort = (key: keyof RecordRow) => {
    if (key === sortKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"))
      return
    }
    setSortKey(key)
    setSortDirection("asc")
  }

  return (
    <div className="w-full px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight">Данные</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {DATA_RECORDS.length} записей из {SOURCES.length} таблиц-источников.
          {rows.length !== DATA_RECORDS.length &&
            ` Под фильтр подходит ${rows.length}.`}
        </p>
      </header>

      <div className="grid gap-4 xl:grid-cols-[1fr_20rem] xl:items-start">
        <div className="min-w-0">
          {/* Filters. The table can sort but cannot narrow, and a table you
              cannot narrow is not a working record view. */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <label className="relative flex-1 basis-56">
              <span className="sr-only">Поиск по записям</span>
              <Search
                aria-hidden
                className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
              />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Ключи, значения, теги…"
                className="border-border bg-background focus-visible:ring-ring h-9 w-full rounded-md border pr-3 pl-8 text-sm focus-visible:ring-2 focus-visible:outline-none"
              />
            </label>

            <FilterSelect
              label="Проект"
              value={projectId}
              onChange={setProjectId}
              options={[
                { value: "all", label: "Все проекты" },
                ...PROJECTS.map((project) => ({ value: project.id, label: project.name })),
              ]}
            />
            <FilterSelect
              label="Состояние"
              value={state}
              onChange={(value) => setState(value as StateFilter)}
              options={STATE_FILTERS}
            />
          </div>

          <div className="border-border overflow-x-auto rounded-lg border">
            <RecordsTable
              records={sorted}
              sortKey={sortKey}
              sortDirection={sortDirection}
              onSort={toggleSort}
              onSelect={(id) => setSelectedId((current) => (current === id ? null : id))}
            />
          </div>

          {/* Counts stay visible under the table because a filter that silently
              hides rows is indistinguishable from a filter that broke. */}
          <dl className="text-muted-foreground mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs">
            <Count label="совпало" value={counts.matched} />
            <Count label="в ожидании" value={counts.pending} />
            <Count label="устарело" value={counts.stale} />
            <Count label="не найдено" value={counts.unmatched} />
          </dl>
        </div>

        <aside className="grid gap-4 xl:sticky xl:top-4">
          {selected ? (
            <RecordDetail record={selected} onClear={() => setSelectedId(null)} />
          ) : (
            <div className="border-border text-muted-foreground rounded-lg border border-dashed p-4 text-sm">
              Выберите строку, чтобы увидеть, откуда она взялась и с чем сопоставлена.
            </div>
          )}

          <ContextCards
            chunks={SOURCES.map((source, index) => {
              const fromSource = DATA_RECORDS.filter((record) => record.table === source)
              return {
                id: source,
                title: source,
                source: `${fromSource.length} записей`,
                content: `Охватывает: ${projectNames(fromSource)}. Последняя сверка ${dayShort(fromSource[0].updated)} в ${clockOf(fromSource[0].updated)}.`,
                score: 0.5 + index * 0.1,
              }
            })}
          />

          <InsightCards
            insights={[
              {
                id: "coverage",
                title: "Покрытие в порядке",
                description: `${counts.matched} из ${rows.length || DATA_RECORDS.length} видимых записей сопоставлены с таблицей-источником.`,
                value: `${Math.round((counts.matched / Math.max(1, rows.length || DATA_RECORDS.length)) * 100)}%`,
                kind: "allocation",
              },
              {
                id: "устарело",
                title: "Устаревшие строки к обновлению",
                description: "Журнал отгрузок не сверялся с последнего изменения расписания депо.",
                value: String(counts.stale),
                kind: "anomaly",
              },
              {
                id: "spread",
                title: "Записей по проектам",
                description: PROJECTS.map(
                  (project) => `${project.name}: ${recordsForProject(project.id).length}`
                ).join(" · "),
                kind: "compare",
              },
            ]}
          />
        </aside>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ parts --- */

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <label className="relative">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="border-border bg-background focus-visible:ring-ring h-9 appearance-none rounded-md border pr-7 pl-2.5 text-sm focus-visible:ring-2 focus-visible:outline-none"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <span
        aria-hidden
        className="text-muted-foreground pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[10px]"
      >
        ▼
      </span>
    </label>
  )
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <dt className="capitalize">{label}</dt>
      <dd className="text-foreground font-mono tabular-nums">{value}</dd>
    </div>
  )
}

function RecordDetail({
  record,
  onClear,
}: {
  record: DataRecord
  onClear: () => void
}) {
  return (
    <section aria-label={`Запись ${record.key}`} className="border-border rounded-lg border p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-medium">{record.key}</h2>
          <p className="text-muted-foreground mt-0.5 font-mono text-[11px]">
            {record.table}
          </p>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring shrink-0 rounded text-xs focus-visible:ring-2 focus-visible:outline-none"
        >
          очистить
        </button>
      </div>
      <p className="mt-3 text-sm">{record.value}</p>
      <dl className="text-muted-foreground mt-3 space-y-1 text-xs">
        <div className="flex justify-between gap-2">
          <dt>состояние</dt>
          <dd className={cn("capitalize", stateTone(record.state))}>{STATE_LABEL[record.state]}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>проект</dt>
          <dd className="text-foreground">{projectNames([record])}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>обновлено</dt>
          <dd className="text-foreground tabular-nums">
            {dayShort(record.updated)} {clockOf(record.updated)}
          </dd>
        </div>
      </dl>
      {record.tags.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1">
          {record.tags.map((tag) => (
            <li
              key={tag}
              className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-[11px]"
            >
              {tag}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/* -------------------------------------------------------------- translation --- */

/** Shared `DataRecord` vocabulary → `RecordsTable`'s row vocabulary. */
function toRecordRow(record: DataRecord): RecordRow {
  return {
    id: record.id,
    name: record.key,
    categories: record.tags,
    updated: `${dayShort(record.updated)} ${clockOf(record.updated)}`,
    strength: STATE_LABEL[record.state],
  }
}

function projectNames(records: DataRecord[]): string {
  const names = [
    ...new Set(
      records
        .map((record) => PROJECTS.find((project) => project.id === record.projectId)?.name)
        .filter((name): name is string => Boolean(name))
    ),
  ]
  return names.length > 0 ? names.join(", ") : "без проекта"
}

/** State gets a tone so a stale row is visible without reading the word. The
 *  word is still always present — colour is a second signal, never the only
 *  one. */
function stateTone(state: DataRecord["state"]): string {
  switch (state) {
    case "matched":
      return "text-emerald-600 dark:text-emerald-400"
    case "pending":
      return "text-amber-600 dark:text-amber-400"
    case "stale":
      return "text-orange-600 dark:text-orange-400"
    case "unmatched":
      return "text-destructive"
  }
}
