"use client"

/**
 * Workspace: the projects under way and the queue behind them.
 *
 * The view is built around one piece of local state — which project is
 * selected — because that is the only question this surface actually answers.
 * Everything else is a read: the projects come from the shared dataset so their
 * counts agree with the Data and Artifacts surfaces, and the task queue is that
 * project's tasks translated into the vocabulary the queue component speaks.
 *
 * That translation is the one piece of real logic here. The shared dataset
 * describes a task as `todo | running | blocked | done` because that is how an
 * operator talks about it; the queue component wants `queued | running |
 * blocked | completed | failed | paused`, because that is how an execution
 * engine reports it. `toAgentTask` is the whole of the mapping, and it lives at
 * the bottom of this file so the JSX above can stay about layout.
 */

import { useMemo, useState } from "react"
import { FolderOpen, ListTodo } from "lucide-react"

import { AgentCard } from "@/components/agents-ui/application/agent-card/agent-card"
import { AgentContextMeter } from "@/components/agents-ui/application/context-meter/context-meter"
import { PlanBuilder } from "@/components/agents-ui/application/plan-builder/plan-builder"
import { StatusPanel } from "@/components/agents-ui/application/status-panel/status-panel"
import {
  TaskQueue,
  type AgentTask,
  type AgentTaskPriority,
  type AgentTaskStatus,
} from "@/components/agents-ui/application/task-queue/task-queue"
import {
  PROJECTS,
  TASK_STATUS_LABEL,
  clockOf,
  dayShort,
  minutesAgo,
  openTaskCount,
  tasksForProject,
  type Project,
  type Task,
} from "@/components/super-app/demo-data"
import { cn } from "@/lib/utils"

const STAGE_LABEL: Record<Project["stage"], string> = {
  scoping: "Разведка",
  fieldwork: "Полевые работы",
  synthesis: "Синтез",
  handoff: "Передача",
}

/** The plan the agent proposes for the selected project. Static per project
 *  because nothing in this demo mutates a plan — `PlanBuilder` takes callbacks
 *  and the surface passes ones that record intent, so the buttons respond
 *  without pretending the plan was rewritten. */
const PLANS: Record<string, { objective: string; steps: string[] }> = {
  "field-notes": {
    objective:
      "Завершить набор интервью на западном доку, сверить журналы смен и передать письменную сводку в Northline.",
    steps: [
      "Расшифровать две записи передачи смены",
      "Сверить идентификаторы отгрузок с выгрузкой журнала",
      "Сгруппировать темы интервью в сводку",
    ],
  },
  "route-audit": {
    objective:
      "Пройти шесть проверяемых маршрутов, оценить каждый по расписанию депо и отметить те, что нельзя закрыть.",
    steps: [
      "Загрузить расписание депо за неделю проверки",
      "Оценить каждый маршрут по плановому окну",
      "Составить список исключений для менеджера депо",
    ],
  },
  "spill-report": {
    objective:
      "Превратить журнал локализации в отчёт, который регулятор прочитает без выезда на объект.",
    steps: [
      "Собрать хронологию локализации",
      "Приложить фотоматериал к каждой записи",
      "Собрать отчёт по разделам регулятора",
    ],
  },
}

export function WorkspaceView() {
  /* Defaulting to the first project rather than to `undefined` keeps the queue
   * populated on first paint. A surface that opens empty reads as broken, and
   * there is no "all projects" case worth modelling here — the operator always
   * has one project in mind when they come to this screen. */
  const [projectId, setProjectId] = useState(PROJECTS[0].id)

  const project = PROJECTS.find((entry) => entry.id === projectId) ?? PROJECTS[0]
  const tasks = useMemo(() => tasksForProject(project.id), [project.id])
  const queue = useMemo(() => tasks.map(toAgentTask), [tasks])
  const running = queue.find((task) => task.status === "running")

  const plan = PLANS[project.id] ?? {
    objective: "Обработать очередь и отчитаться.",
    steps: tasks.map((task) => task.title),
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Рабочая область</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {openTaskCount()} открытых задач в {PROJECTS.length} проектах. Выберите
          проект, чтобы увидеть его очередь и план, который предлагает агент.
        </p>
      </header>

      {/* Connection, model and machine. Compact because the detail is a
          disclosure, not the point — the point is "is anything wrong". */}
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <StatusPanel
          connectionStatus="connected"
          version="0.3.0"
          modelInfo={{
            name: "portal-agent",
            provider: "internal",
            contextLength: 200_000,
            capabilities: ["chat", "code", "function-calling"],
          }}
          systemResources={{ cpu: 34, memory: 58, latency: 82, uptime: "3 ч 41 м" }}
          compact
        />
        <AgentContextMeter
          usedTokens={61_400}
          totalTokens={200_000}
          label="Контекстное окно Портала"
          sources={[
            { id: "sys", label: "Системные инструкции", tokens: 4_200, kind: "system" },
            { id: "conv", label: "Интервью на западном доку", tokens: 28_900, kind: "conversation" },
            { id: "tools", label: "Определения инструментов", tokens: 9_100, kind: "tools" },
            { id: "ret", label: "Журнал отгрузок Northline", tokens: 16_800, kind: "retrieval" },
          ]}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[18rem_1fr] lg:items-start">
        <nav aria-label="Проекты" className="lg:sticky lg:top-4">
          <h2 className="text-muted-foreground mb-2 flex items-center gap-1.5 text-xs font-medium">
            <FolderOpen aria-hidden className="size-3.5" />
            Проекты
          </h2>
          <ul className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1">
            {PROJECTS.map((entry) => (
              <li key={entry.id}>
                <ProjectRow
                  project={entry}
                  selected={entry.id === project.id}
                  open={openTaskCount(entry.id)}
                  onSelect={() => setProjectId(entry.id)}
                />
              </li>
            ))}
          </ul>
        </nav>

        <div className="grid min-w-0 gap-4">
          <section aria-label={`Очередь для ${project.name}`}>
            <h2 className="sr-only">Очередь задач</h2>
            <TaskQueue
              tasks={queue}
              activeTaskId={running?.id ?? null}
              isProcessing={Boolean(running)}
              concurrencyLimit={1}
              showTimeline={Boolean(running)}
              timestamp={`Обновлено ${dayShort(project.updated)} в ${clockOf(project.updated)}`}
            />
          </section>

          <PlanBuilder
            planTitle={`План: ${project.name}`}
            objective={plan.objective}
            steps={plan.steps.map((title, index) => ({
              id: `${project.id}-step-${index}`,
              title,
              description: index === 0 ? "Выполняется первым" : `После шага ${index}`,
              tool: index === 0 ? "transcribe" : index === 1 ? "reconcile" : "summarise",
              duration: `${6 + index * 4} мин`,
              dependencies: index === 0 ? [] : [index - 1],
              status: "pending" as const,
            }))}
            totalEstimate="18 мин"
            estimatedCost="$0.40"
            confidence={82}
          />
        </div>
      </div>

      {/* Who is on the room. Small, static, and deliberately last: it is
          context for the queue above rather than something to act on. */}
      <section aria-label="Агенты в этой рабочей области" className="mt-4">
        <h2 className="text-muted-foreground mb-2 flex items-center gap-1.5 text-xs font-medium">
          <ListTodo aria-hidden className="size-3.5" />
          В комнате
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <AgentCard
            name="Портал"
            description="Отвечает на вопросы по полевым заметкам и журналу отгрузок."
            status={running ? "running" : "idle"}
            capabilities={[
              { name: "Расшифровка", description: "Аудио эфира и встреч" },
              { name: "Сверка", description: "Идентификаторы между выгрузками" },
            ]}
          />
          <AgentCard
            name="Редактор черновиков"
            description="Превращает сгруппированные заметки в отчёт, который можно прочитать."
            status="idle"
            capabilities={[
              { name: "Сводка", description: "Темы в разделы" },
              { name: "Ссылка на источник", description: "Прикрепить источник к утверждению" },
            ]}
          />
          <AgentCard
            name="Ночная проверка"
            description="Сверяет журнал отгрузок с расписанием депо."
            status="completed"
            capabilities={[{ name: "Различия", description: "Отметить исключения" }]}
          />
        </div>
      </section>
    </div>
  )
}

/* ------------------------------------------------------------------ parts --- */

function ProjectRow({
  project,
  selected,
  open,
  onSelect,
}: {
  project: Project
  selected: boolean
  open: number
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
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 text-sm font-medium">{project.name}</span>
        <span className="text-muted-foreground shrink-0 font-mono text-[11px] tabular-nums">
          {open}
        </span>
      </div>
      <p className="text-muted-foreground mt-0.5 truncate text-xs">
        {project.client} · {STAGE_LABEL[project.stage]}
      </p>
      {/* The bar carries the number; the number itself is already in the corner,
          so repeating it here would be noise. `role` is left off deliberately —
          this is decoration next to a real count, not a second progressbar. */}
      <span
        aria-hidden
        className="bg-muted mt-2 block h-1 overflow-hidden rounded-full"
      >
        <span
          className="bg-foreground/70 block h-full rounded-full"
          style={{ width: `${project.progress}%` }}
        />
      </span>
    </button>
  )
}

/* -------------------------------------------------------------- translation --- */

/** Shared `Task` vocabulary → task-queue vocabulary. */
const STATUS_MAP: Record<Task["status"], AgentTaskStatus> = {
  todo: "queued",
  running: "running",
  blocked: "blocked",
  done: "completed",
}

const PRIORITY_MAP: Record<Task["priority"], AgentTaskPriority> = {
  low: "low",
  normal: "medium",
  high: "high",
}

function toAgentTask(task: Task): AgentTask {
  const status = STATUS_MAP[task.status]
  return {
    id: task.id,
    title: task.title,
    description: `Ответственный — ${task.owner}, срок ${dayShort(task.due)} в ${clockOf(task.due)}.`,
    status,
    /* Only a running task has a meaningful fraction to show. Anything else
       reporting 0 or 100 would imply a progress signal the dataset does not
       actually carry. */
    progress: status === "running" ? 64 : undefined,
    priority: PRIORITY_MAP[task.priority],
    updatedAt: task.due,
    updatedLabel: `${TASK_STATUS_LABEL[task.status]} · срок ${dayShort(task.due)}`,
    estimatedDuration: task.priority === "high" ? "45 мин" : "20 мин",
    assignee: { name: task.owner, initials: task.owner },
    relatedResources: [{ label: projectLabel(task.projectId) }],
    /* A running task gets checkpoints; a queued one has nothing to report yet. */
    checkpoints:
      status === "running"
        ? [
            {
              id: `${task.id}-c1`,
              title: "Прочитать исходные материалы",
              status: "completed",
              timestamp: minutesAgo(22),
            },
            {
              id: `${task.id}-c2`,
              title: "Обрабатывает набор",
              status: "active",
            },
            {
              id: `${task.id}-c3`,
              title: "Написать сводку",
              status: "pending",
            },
          ]
        : undefined,
  }
}

function projectLabel(projectId: string): string {
  return PROJECTS.find((entry) => entry.id === projectId)?.name ?? projectId
}
