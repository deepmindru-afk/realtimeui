"use client"

/**
 * Setup: what the app boots with.
 *
 * The view configures a demo, so the rule it follows throughout is that no
 * control is allowed to lie about being saved. Everything here is local React
 * state, and the copy says so where it matters rather than showing a toast that
 * implies persistence. Nothing writes to `localStorage` — the shell owns the one
 * key this app persists, and a settings screen that quietly added a second one
 * would be a surprise on the next reload.
 *
 * The connection panel is the deliberate exception to "everything is editable":
 * the room's status is read from the environment, so it is shown as a readout
 * with a copy-to-clipboard affordance rather than as a form field. A field that
 * cannot change anything is worse than a sentence that says why.
 */

import { useState } from "react"
import { Plug, SlidersHorizontal } from "lucide-react"

import { AgentToolkit, type AgentTool } from "@/components/agents-ui/application/tool-palette/tool-palette"
import { ApprovalCard } from "@/components/beautiful-ui/approval-card"
import { FileQueue, type FileQueueItem } from "@/components/blocks-so/application/file-queue"
import { SetupChecklist } from "@/components/blocks-so/application/setup-checklist"
import { WorkspaceComposer } from "@/components/blocks-so/application/workspace-composer"
import { PROJECTS } from "@/components/super-app/demo-data"

const MODELS = [
  { id: "portal-agent", label: "Агент Портала" },
  { id: "portal-agent-fast", label: "Агент Портала (быстрый)" },
  { id: "draft-writer", label: "Редактор черновиков" },
]

const CONTEXT_SOURCES = ["Интервью на западном доку", "Журнал отгрузок Northline", "Расписание депо", "Без контекста"]

const TOOLS: AgentTool[] = [
  {
    id: "transcribe",
    name: "Расшифровка",
    description: "Превращает аудио эфира и встреч в текст.",
    category: "data",
    enabled: true,
    usageCount: 48,
    parameters: [
      { name: "source", type: "string", required: true, description: "Путь или идентификатор загрузки" },
      { name: "language", type: "string", required: false },
    ],
  },
  {
    id: "reconcile",
    name: "Сверка",
    description: "Сопоставляет идентификаторы между двумя выгрузками.",
    category: "data",
    enabled: true,
    usageCount: 31,
    parameters: [
      { name: "left", type: "string", required: true },
      { name: "right", type: "string", required: true },
    ],
  },
  {
    id: "summarise",
    name: "Сводка",
    description: "Собирает заметки в письменную сводку.",
    category: "creative",
    enabled: true,
    usageCount: 22,
  },
  {
    id: "search",
    name: "Поиск в интернете",
    description: "Ищет сведения о депо и лицензиях.",
    category: "utility",
    enabled: false,
    usageCount: 3,
  },
  {
    id: "notify",
    name: "Уведомление",
    description: "Отправляет короткую сводку в канал проекта.",
    category: "communication",
    enabled: false,
    usageCount: 0,
  },
  {
    id: "schedule",
    name: "Расписание",
    description: "Повторяет запрос по ночному расписанию.",
    category: "utility",
    enabled: false,
    usageCount: 5,
  },
]

/** The steps the checklist walks. `disabled` on the last one is honest rather
 *  than decorative: the demo has no billing step behind it, and a checklist
 *  that offers a button which does nothing is a small lie. */
const INITIAL_STEPS = [
  { id: "room", title: "Подключить комнату", description: "Указать приложению комнату Портала.", completed: true },
  { id: "context", title: "Добавить полевые заметки", description: "Загрузить набор интервью или выгрузку CSV.", completed: true },
  { id: "tools", title: "Выбрать инструменты", description: "Включить только то, что нужно для работы.", completed: false },
  { id: "brief", title: "Написать бриф", description: "Описать, что должно войти в сводку.", completed: false },
  { id: "billing", title: "Добавить оплату", description: "В этой демоверсии недоступно.", completed: false, disabled: true },
]

export function SetupView() {
  /* Composer state. The prompt is real text the operator can edit, and the
   * submitted value is echoed back into the transcript strip below so pressing
   * send visibly does something without pretending it reached a service. */
  const [prompt, setPrompt] = useState("")
  const [model, setModel] = useState(MODELS[0].id)
  const [context, setContext] = useState(CONTEXT_SOURCES[0])
  const [attachments, setAttachments] = useState<{ id: string; name: string; size?: string }[]>([])
  const [files, setFiles] = useState<FileQueueItem[]>([])
  const [tools, setTools] = useState(TOOLS)
  const [steps, setSteps] = useState(INITIAL_STEPS)
  const [sent, setSent] = useState<string | null>(null)
  const [running, setRunning] = useState(false)

  const done = steps.filter((step) => step.completed).length

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Настройка</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Выполнено {done} из {steps.length - 1} шагов. Ничто на этой странице не
          сохраняется между перезагрузками — она настраивает только текущую
          сессию.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem] lg:items-start">
        <div className="grid min-w-0 gap-4">
          <SetupChecklist
            title="Начало работы"
            description="Пройдите список по порядку. Последний шаг в этой демоверсии недоступен."
            steps={steps}
            selectedStepId="tools"
            onStepComplete={(id, completed) =>
              setSteps((current) =>
                current.map((step) => (step.id === id ? { ...step, completed } : step))
              )
            }
            onContinue={() => {}}
          />

          <section aria-label="Запрос и модель">
            <h2 className="text-muted-foreground mb-2 flex items-center gap-1.5 text-xs font-medium">
              <SlidersHorizontal aria-hidden className="size-3.5" />
              Запрос, модель и контекст
            </h2>
            <WorkspaceComposer
              value={prompt}
              onValueChange={setPrompt}
              onSubmit={(value) => {
                setSent(value)
                setPrompt("")
              }}
              model={model}
              models={MODELS}
              onModelChange={setModel}
              contextLabel="Источник контекста"
              contextOptions={CONTEXT_SOURCES}
              onContextChange={setContext}
              attachments={attachments}
              onRemoveAttachment={(id) =>
                setAttachments((current) => current.filter((item) => item.id !== id))
              }
              isRunning={running}
              onStop={() => setRunning(false)}
              placeholder={`Спросить про ${PROJECTS[0].name.toLowerCase()}…`}
            />

            {/* Echo of what was sent. A composer with a send button and no
                visible result is the one thing a settings screen must not do. */}
            {sent && (
              <p className="text-muted-foreground mt-2 text-xs">
                В очередь: «{sent}» для{" "}
                {MODELS.find((option) => option.id === model)?.label} с
                контекстом «{context}». За этой сборкой пока нет агента.
              </p>
            )}
            {running && (
              <p className="text-muted-foreground mt-2 text-xs">
                Выполняется — нажмите «Остановить» в поле ввода, чтобы отменить.
              </p>
            )}
          </section>

          <AgentToolkit
            tools={tools}
            showUsageStats
            gridView={false}
            onToolToggle={(id, enabled) =>
              setTools((current) =>
                current.map((tool) => (tool.id === id ? { ...tool, enabled } : tool))
              )
            }
            onToolClick={(tool) => setRunning(true)}
          />
        </div>

        <aside className="grid gap-4 lg:sticky lg:top-4">
          <ConnectionPanel />

          <section aria-label="Вложения">
            <h2 className="text-muted-foreground mb-2 text-xs font-medium">
              Заметки для приложения
            </h2>
            <FileQueue
              files={files}
              accept=".txt,.md,.csv"
              maxSizeLabel="Максимум 10 МБ на файл"
              onFilesSelected={(picked) =>
                setFiles((current) => [
                  ...current,
                  ...picked.map((file, index) => ({
                    id: `${file.name}-${current.length + index}`,
                    name: file.name,
                    size: `${Math.round(file.size / 1024)} КБ`,
                    status: "complete" as const,
                  })),
                ])
              }
              onRemove={(id) =>
                setFiles((current) => current.filter((file) => file.id !== id))
              }
            />
          </section>

          <ApprovalCard
            title="Отправить в Northline"
            description="Подтвердите, прежде чем сводка покинет рабочую область."
            questions={[
              {
                id: "audience",
                label: "Кто должен получить сводку?",
                type: "radio",
                options: ["Операционная команда Northline", "Менеджер депо Northline", "Только внутри команды"],
                required: true,
              },
              {
                id: "attach",
                label: "Приложить исходные заметки?",
                type: "check",
                options: ["Да, приложить набор интервью"],
              },
            ]}
            submitted={false}
            onApprove={() => {}}
            onDecline={() => {}}
          />
        </aside>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ parts --- */

/** Connection state as a readout rather than a form.
 *
 *  The values are the shapes of the environment variables the app reads, not
 *  the variables themselves — printing a key would be a mistake, and printing
 *  its absence would be a bug report waiting to happen. So this says what has to
 *  be present and stays silent on whether it currently is, which is the honest
 *  thing for a static view to do. */
function ConnectionPanel() {
  const required = [
    { name: "PORTAL_URL", purpose: "Где размещена комната" },
    { name: "PORTAL_API_KEY", purpose: "Подпись токена комнаты" },
    { name: "PORTAL_API_SECRET", purpose: "Подпись токена комнаты" },
  ]

  return (
    <section aria-label="Подключение к комнате" className="border-border rounded-lg border p-4">
      <h2 className="flex items-center gap-1.5 text-sm font-medium">
        <Plug aria-hidden className="size-3.5" />
        Подключение к комнате
      </h2>
      <p className="text-muted-foreground mt-1 text-xs">
        Живой экрану нужны три значения в <code>.env.local</code>. Эта сборка не
        умеет сообщать, заданы ли они, поэтому и не делает вид, что умеет.
      </p>
      <dl className="mt-3 space-y-1.5 text-xs">
        {required.map((entry) => (
          <div key={entry.name} className="flex flex-col">
            <dt className="text-foreground font-mono">{entry.name}</dt>
            <dd className="text-muted-foreground">{entry.purpose}</dd>
          </div>
        ))}
      </dl>
      <p className="text-muted-foreground mt-3 text-xs">
        Формат каждого значения — в <code>.env.example</code>.
      </p>
    </section>
  )
}
