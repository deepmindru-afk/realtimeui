"use client"

/**
 * Artifacts: the files the agent has written, and the tools that read them.
 *
 * The shape is a browser, not a gallery. A list of the shared dataset's
 * artifacts sits on the left; selecting one renders it on the right with the
 * tool that suits its kind — a diff viewer for a patch, a document scanner for
 * a scanned note, a generated-artifact frame for a report or an export. The
 * three tools that are not a renderer of a selected artifact (the grammar
 * checker, the evaluator) sit underneath as the review stage, because that is
 * where they sit in the real workflow: after something is written, before it
 * ships.
 *
 * The mapping from artifact kind to renderer is the only logic in the file, and
 * it is a `switch` at the bottom rather than a lookup table threaded through the
 * JSX — a record keyed by kind would need an unreachable branch for kinds the
 * dataset has not grown yet, and this way a new kind fails loudly in review
 * rather than rendering nothing.
 */

import { useMemo, useState } from "react"
import { FileText, GitCompare } from "lucide-react"

import { ArtifactOutput } from "@/components/agents-ui/application/artifact-output/artifact-output"
import { AgentDocScanner } from "@/components/agents-ui/application/document-scanner/document-scanner"
import { AgentGrammarChecker } from "@/components/agents-ui/application/grammar-checker/grammar-checker"
import { Evaluator } from "@/components/agents-ui/application/evaluator/evaluator"
import { FileDiff, type FileDiffLine } from "@/components/beui/components/agents/file-diff"
import {
  ARTIFACTS,
  ARTIFACT_KIND_LABEL,
  PROJECTS,
  ago,
  artifactsForProject,
  dayShort,
  clockOf,
  formatBytes,
  type Artifact,
} from "@/components/super-app/demo-data"
import { cn } from "@/lib/utils"

export function ArtifactsView() {
  const [selectedId, setSelectedId] = useState(ARTIFACTS[0].id)
  const [projectId, setProjectId] = useState<string>("all")

  const visible = useMemo(
    () =>
      projectId === "all"
        ? ARTIFACTS
        : artifactsForProject(projectId),
    [projectId]
  )

  const selected = useMemo(
    () => ARTIFACTS.find((artifact) => artifact.id === selectedId) ?? visible[0],
    [selectedId, visible]
  )

  return (
    <div className="w-full px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight">Артефакты</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {ARTIFACTS.length} файлов, написанных агентом. Выберите один, чтобы
          прочитать его тем инструментом, который подходит под его тип.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-[19rem_1fr] lg:items-start">
        <nav aria-label="Артефакты" className="lg:sticky lg:top-4">
          <label className="mb-2 block">
            <span className="sr-only">Фильтр по проекту</span>
            <select
              value={projectId}
              onChange={(event) => {
                setProjectId(event.target.value)
                /* Changing the project can hide the selected artifact, which
                 * would leave the right pane showing something the list no
                 * longer lists. Falling back to the first visible row keeps
                 * the two panes honest about belonging to the same filter. */
                const next = artifactsForProject(event.target.value)
                const pool = event.target.value === "all" ? ARTIFACTS : next
                if (pool.length > 0) setSelectedId(pool[0].id)
              }}
              className="border-border bg-background focus-visible:ring-ring h-9 w-full rounded-md border px-2.5 text-sm focus-visible:ring-2 focus-visible:outline-none"
            >
              <option value="all">Все проекты</option>
              {PROJECTS.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>

          <ul className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-1">
            {visible.map((artifact) => (
              <li key={artifact.id}>
                <ArtifactRow
                  artifact={artifact}
                  selected={artifact.id === selected?.id}
                  onSelect={() => setSelectedId(artifact.id)}
                />
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0">
          {selected ? (
            <div className="grid gap-4">
              <Renderer artifact={selected} />
              <GrammarReview />
              <QualityGate />
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              В этом проекте пока нет артефактов.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

/* ----------------------------------------------------------------- browser --- */

function ArtifactRow({
  artifact,
  selected,
  onSelect,
}: {
  artifact: Artifact
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "w-full rounded-lg border p-3 text-left transition-colors",
        "hover:bg-accent/50 focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
        selected ? "border-ring bg-accent" : "border-border bg-card"
      )}
    >
      <div className="flex items-center gap-2">
        <KindIcon kind={artifact.kind} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {artifact.name}
        </span>
        <span className="text-muted-foreground shrink-0 font-mono text-[10px] uppercase">
          {artifact.format}
        </span>
      </div>
      <p className="text-muted-foreground mt-1 text-xs">
        {ARTIFACT_KIND_LABEL[artifact.kind]} · {formatBytes(artifact.bytes)} ·{" "}
        {ago(artifact.updated)}
      </p>
    </button>
  )
}

function KindIcon({ kind }: { kind: Artifact["kind"] }) {
  if (kind === "diff") return <GitCompare aria-hidden className="size-3.5 shrink-0" />
  return <FileText aria-hidden className="size-3.5 shrink-0" />
}

/* ---------------------------------------------------------------- renderers --- */

/** Which tool shows a given artifact. The `default` arm is a report, because a
 *  report is the kind that arrives most often and a prose frame is the least
 *  surprising thing to put in front of one. */
function Renderer({ artifact }: { artifact: Artifact }) {
  switch (artifact.kind) {
    case "diff":
      return <DiffView artifact={artifact} />
    case "note":
      return <ScanView artifact={artifact} />
    case "report":
    case "draft":
    case "export":
      return <OutputView artifact={artifact} />
  }
}

function OutputView({ artifact }: { artifact: Artifact }) {
  return (
    <section aria-label={artifact.name}>
      <ArtifactOutput
        title={artifact.name}
        artifactType={artifact.kind === "export" ? "code" : "document"}
        language={artifact.format}
        content={bodyFor(artifact)}
        versions={[
          { id: "v1", label: "v1", timestamp: ago(artifact.updated), content: "первая версия" },
          { id: "v2", label: "v2", timestamp: ago(artifact.updated), content: bodyFor(artifact) },
        ]}
        currentVersion="v2"
        metadata={{
          generationTime: "18 с",
          model: "portal-agent",
          tokens: 2_140,
          size: formatBytes(artifact.bytes),
        }}
        onCopy={() => {}}
        onDownload={() => {}}
        onRegenerate={() => {}}
        onVersionChange={() => {}}
      />
    </section>
  )
}

function DiffView({ artifact }: { artifact: Artifact }) {
  return (
    <section aria-label={artifact.name} className="grid gap-3">
      <header className="flex items-center gap-2">
        <GitCompare aria-hidden className="size-4" />
        <h2 className="text-sm font-medium">{artifact.name}</h2>
        <span className="text-muted-foreground ml-auto font-mono text-[11px]">
          {artifact.lines ?? 0} строк
        </span>
      </header>
      <FileDiff
        file={<span className="font-mono text-xs">src/lib/reconcile.ts</span>}
        lines={DIFF_LINES}
        status="complete"
        defaultOpen
        collapseOnComplete={false}
        copyText={DIFF_LINES.map((line) => line.content).join("\n")}
        onCopy={() => {}}
      />
    </section>
  )
}

function ScanView({ artifact }: { artifact: Artifact }) {
  return (
    <AgentDocScanner
      document={{
        name: artifact.name,
        type: artifact.format === "csv" ? "csv" : "pdf",
        size: artifact.bytes,
        pages: artifact.lines ? Math.max(1, Math.round(artifact.lines / 40)) : 1,
        uploadedAt: artifact.updated,
      }}
      extractedSections={[
        {
          id: "s1",
          type: "metadata",
          title: "Идентификаторы отгрузок",
          content: "48 различных, 6 повторяются в двух сменах.",
          confidence: 0.94,
        },
        {
          id: "s2",
          type: "text",
          title: "Заметки о передаче смены",
          content:
            "Операторы трижды за неделю отмечали одну и ту же передачу приёмки, каждый раз в своей смене.",
          confidence: 0.88,
          page: 2,
        },
        {
          id: "s3",
          type: "table",
          title: "Дублирующиеся строки",
          content: "SH-4471, SH-4472, SH-4488 встречаются по два раза.",
          confidence: 0.91,
          page: 3,
        },
      ]}
      currentPage={1}
      totalPages={artifact.lines ? Math.max(1, Math.round(artifact.lines / 40)) : 1}
      timestamp={`Отсканировано ${dayShort(artifact.updated)} в ${clockOf(artifact.updated)}`}
      onExport={() => {}}
      onExtract={() => {}}
    />
  )
}

/* ------------------------------------------------------------------- review --- */

function GrammarReview() {
  return (
    <AgentGrammarChecker
      text="Передачу приёмки отметили три оператора в трёх разных сменах. Депо подтвердило, что форма приёмки не менялась с марта."
      originalText="Передачу приёмки отметили три оператора в трёх разных сменах, депо подтвердило, что форма приёмки не менялась с марта."
      issues={[
        {
          id: "g1",
          type: "punctuation",
          message: "Два предложения соединены запятой.",
          suggestion: "Разделить на два предложения.",
          position: { start: 78, end: 79 },
          severity: "warning",
        },
        {
          id: "g2",
          type: "clarity",
          message: "«Форма приёмки» при первом чтении неоднозначна.",
          suggestion: "Назовите форму: форма приёмки на западном доку.",
          position: { start: 110, end: 125 },
          severity: "info",
        },
      ]}
      stats={{ wordsCount: 28, readabilityScore: 74, issuesFixed: 3, totalIssues: 2 }}
      onAcceptSuggestion={() => {}}
      onRejectSuggestion={() => {}}
      onReanalyze={() => {}}
    />
  )
}

function QualityGate() {
  return (
    <Evaluator
      taskDescription="Проверьте сводку по западному доку на доказательность и ясность перед отправкой в Northline."
      iterations={[
        {
          id: "i1",
          number: 1,
          output: "Операторы описали передачу приёмки.",
          score: 58,
          feedback: "Слабо. Нет цитат, а передача описана, но не показана.",
          criteria: [
            { label: "Цитаты приведены", score: 1, maxScore: 5 },
            { label: "Ясность", score: 3, maxScore: 5 },
          ],
          status: "failed",
        },
        {
          id: "i2",
          number: 2,
          output:
            "Трое из пяти операторов описали одну и ту же передачу приёмки на западном доку, каждый в своей смене.",
          score: 91,
          feedback: "Сильно. Интервью процитированы, утверждение обосновано.",
          criteria: [
            { label: "Цитаты приведены", score: 5, maxScore: 5 },
            { label: "Ясность", score: 5, maxScore: 5 },
          ],
          status: "passed",
        },
      ]}
      currentIteration={2}
      qualityThreshold={85}
      maxIterations={5}
      onRunNext={() => {}}
      onAccept={() => {}}
      onReset={() => {}}
    />
  )
}

/* ---------------------------------------------------------------- fixtures --- */

/** Prose for the generated-artifact frame. Keyed by artifact kind rather than
 *  by id so a new artifact in the dataset gets a sensible body without anyone
 *  remembering to add a row here. */
function bodyFor(artifact: Artifact): string {
  switch (artifact.kind) {
    case "report":
      return [
        "Сводка по интервью на западном доку",
        "",
        "Трое из пяти операторов описали одну и ту же передачу приёмки на западном",
        "доку, каждый в своей смене. Ни один из них не видел, чтобы форма менялась.",
        "",
        "Депо подтвердило, что форма приёмки на западном доку не менялась с марта.",
        "Двое операторов упомянули второй блокнот, который ведёт сменщик; в",
        "описанный процесс он не входит.",
      ].join("\n")
    case "draft":
      return [
        "Черновик — для Northline",
        "",
        "Спасибо за интервью. Коротко: дело не в форме, а в передаче смены.",
        "Готов разобрать детали на созвоне.",
      ].join("\n")
    case "export":
      return [
        "идентификатор,смена,число",
        "SH-4471,утро,2",
        "SH-4472,вечер,2",
        "SH-4488,ночь,2",
      ].join("\n")
    default:
      return artifact.name
  }
}

/** A small, real-shaped diff. The point is to show the viewer doing its job, so
 *  the lines carry an actual change rather than filler. */
const DIFF_LINES: FileDiffLine[] = [
  { id: "d1", type: "context", oldLine: 1, newLine: 1, content: "export function reconcile(records: Shipment[]) {" },
  { id: "d2", type: "removed", oldLine: 2, content: "  const seen = new Set<string>()" },
  { id: "d3", type: "added", newLine: 2, content: "  const seen = new Map<string, string[]>()" },
  { id: "d4", type: "added", newLine: 3, content: "  const duplicates: string[] = []" },
  { id: "d5", type: "context", oldLine: 3, newLine: 4, content: "" },
  { id: "d6", type: "removed", oldLine: 4, content: "    seen.add(record.identifier)" },
  { id: "d7", type: "added", newLine: 5, content: "    const prior = seen.get(record.identifier)" },
  { id: "d8", type: "added", newLine: 6, content: "    if (prior) duplicates.push(record.identifier)" },
  { id: "d9", type: "added", newLine: 7, content: "    seen.set(record.identifier, [...(prior ?? []), record.shift])" },
  { id: "d10", type: "context", oldLine: 5, newLine: 8, content: "  }" },
  { id: "d11", type: "added", newLine: 9, content: "  return { duplicates: [...new Set(duplicates)], records }" },
  { id: "d12", type: "context", oldLine: 6, newLine: 10, content: "}" },
]
