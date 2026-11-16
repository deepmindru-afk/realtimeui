"use client"

import { Button } from "@/components/boardui/base/buttons/button"
import { cx } from "@/components/boardui/utils/cx"
import { AlertCircle, Check, Copy, RefreshCw } from "lucide-react"
import { useState } from "react"

export type GrammarIssueType =
  | "grammar"
  | "spelling"
  | "style"
  | "clarity"
  | "punctuation"
export interface GrammarIssue {
  id: string
  type: GrammarIssueType
  message: string
  suggestion: string
  position: { start: number; end: number }
  severity: "error" | "warning" | "info"
}
export interface GrammarStats {
  wordsCount: number
  readabilityScore: number
  issuesFixed: number
  totalIssues: number
}
export interface AgentGrammarCheckerProps {
  text?: string
  originalText?: string
  issues?: GrammarIssue[]
  stats?: GrammarStats
  isAnalyzing?: boolean
  onTextChange?: (text: string) => void
  onAcceptSuggestion?: (issueId: string) => void
  onRejectSuggestion?: (issueId: string) => void
  onCopy?: () => void
  onReanalyze?: () => void
  onRegenerateResponse?: () => void
  className?: string
  timestamp?: string
}
/** The issue type and severity are enums — values that get compared, not prose.
 *  Printing them raw puts `punctuation` and `warning` in front of a Russian
 *  reader, so each render site goes through one of these tables. */
const ISSUE_TYPE_LABEL: Record<GrammarIssueType, string> = {
  grammar: "Грамматика",
  spelling: "Орфография",
  style: "Стиль",
  clarity: "Ясность",
  punctuation: "Пунктуация",
}

const SEVERITY_LABEL: Record<GrammarIssue["severity"], string> = {
  error: "Ошибка",
  warning: "Предупреждение",
  info: "Замечание",
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="text-text-secondary">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  )
}
export function AgentGrammarChecker({
  text = "",
  originalText = "",
  issues = [],
  stats,
  isAnalyzing = false,
  onTextChange,
  onAcceptSuggestion,
  onRejectSuggestion,
  onCopy,
  onReanalyze,
  onRegenerateResponse,
  className,
  timestamp = "только что",
}: AgentGrammarCheckerProps) {
  const [selected, setSelected] = useState<string | null>(issues[0]?.id ?? null)
  return (
    <section
      className={cx(
        "border-separator-border bg-background-primary-default overflow-hidden rounded-2xl border",
        className
      )}
    >
      <header className="border-separator-border flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div>
          <h3 className="text-headline-semibold">Разбор текста</h3>
          <p className="text-caption-1-regular text-text-secondary">
            {isAnalyzing
              ? "Анализируем текст"
              : `Предложений: ${issues.length}  |  ${timestamp}`}
          </p>
        </div>
        <Button
          size="small"
          variant="secondary"
          leadingIcon={RefreshCw}
          onClick={onReanalyze}
          disabled={isAnalyzing}
        >
          Разобрать заново
        </Button>
      </header>
      {stats && (
        <dl className="border-separator-border text-caption-1-regular flex flex-wrap gap-x-5 gap-y-2 border-b px-4 py-2.5">
          <Stat label="Слов" value={stats.wordsCount} />
          <Stat label="Читаемость" value={`${stats.readabilityScore}/100`} />
          <Stat label="Исправлено" value={stats.issuesFixed} />
          <Stat label="Осталось" value={stats.totalIssues} />
        </dl>
      )}
      <div className="grid md:grid-cols-[minmax(0,1fr)_300px]">
        <div className="p-4">
          <label className="block">
            <span className="text-caption-1-medium text-text-secondary mb-2 block">
              Отредактированный текст
            </span>
            <textarea
              value={text}
              onChange={(event) => onTextChange?.(event.target.value)}
              rows={10}
              className="bg-background-tertiary-default text-body-regular focus:ring-border-button-active w-full resize-y rounded-lg px-3 py-2.5 leading-6 ring-2 ring-transparent outline-none"
              placeholder="Здесь появится проверенный текст"
            />
          </label>
          {originalText && originalText !== text && (
            <details className="bg-background-secondary-default mt-3 rounded-lg px-3 py-2">
              <summary className="text-caption-1-medium text-text-secondary cursor-pointer">
                Исходный текст
              </summary>
              <p className="text-body-2-regular text-text-secondary mt-2 leading-5 whitespace-pre-wrap">
                {originalText}
              </p>
            </details>
          )}
        </div>
        <aside className="border-separator-border border-t md:border-t-0 md:border-l">
          <header className="border-separator-border flex min-h-10 items-center gap-2 border-b px-3">
            <AlertCircle className="text-text-secondary size-4" />
            <span className="text-caption-1-medium">Предложения</span>
          </header>
          <div className="max-h-[420px] overflow-y-auto">
            {issues.map((issue) => (
              <article
                key={issue.id}
                className={cx(
                  "border-separator-border border-b p-3",
                  selected === issue.id && "bg-background-secondary-default"
                )}
              >
                <button
                  type="button"
                  onClick={() => setSelected(issue.id)}
                  className="w-full text-left"
                >
                  <div className="flex justify-between gap-2">
                    <span className="text-caption-1-medium">
                      {ISSUE_TYPE_LABEL[issue.type]}
                    </span>
                    <span
                      className={cx(
                        "text-caption-1-regular",
                        issue.severity === "error"
                          ? "text-text-error-placeholder"
                          : "text-text-secondary"
                      )}
                    >
                      {SEVERITY_LABEL[issue.severity]}
                    </span>
                  </div>
                  <p className="text-body-2-regular text-text-secondary mt-1 leading-5">
                    {issue.message}
                  </p>
                  <p className="text-body-medium mt-2">{issue.suggestion}</p>
                </button>
                <div className="mt-3 flex gap-2">
                  <Button
                    size="small"
                    leadingIcon={Check}
                    onClick={() => {
                      onAcceptSuggestion?.(issue.id)
                      setSelected(null)
                    }}
                  >
                    Принять
                  </Button>
                  <Button
                    size="small"
                    variant="ghost"
                    onClick={() => {
                      onRejectSuggestion?.(issue.id)
                      setSelected(null)
                    }}
                  >
                    Пропустить
                  </Button>
                </div>
              </article>
            ))}
            {issues.length === 0 && (
              <p className="text-body-2-regular text-text-secondary p-6 text-center">
                Предложений не найдено.
              </p>
            )}
          </div>
        </aside>
      </div>
      {(onCopy || onRegenerateResponse) && (
        <footer className="border-separator-border flex gap-1 border-t px-3 py-2">
          {onCopy && (
            <Button
              size="small"
              variant="ghost"
              leadingIcon={Copy}
              onClick={onCopy}
            >
              Копировать
            </Button>
          )}
          {onRegenerateResponse && (
            <Button
              size="small"
              variant="ghost"
              leadingIcon={RefreshCw}
              onClick={onRegenerateResponse}
            >
              Сгенерировать заново
            </Button>
          )}
        </footer>
      )}
    </section>
  )
}
