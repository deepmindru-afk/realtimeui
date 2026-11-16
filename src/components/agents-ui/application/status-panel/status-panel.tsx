"use client"

import { Button } from "@/components/boardui/base/buttons/button"
import { cn } from "@/lib/utils"
import { Power, RefreshCw, Settings } from "lucide-react"
import * as React from "react"

export type ConnectionStatus =
  | "connected"
  | "connecting"
  | "disconnected"
  | "error"
export type ModelCapability =
  | "chat"
  | "code"
  | "vision"
  | "function-calling"
  | "embedding"
export interface ModelInfo {
  name: string
  provider: string
  contextLength: number
  capabilities: ModelCapability[]
  costPer1kTokens?: { input: number; output: number }
}
export interface SystemResources {
  cpu: number
  memory: number
  latency: number
  uptime: string
}
export interface AgentStatusPanelProps {
  connectionStatus?: ConnectionStatus
  modelInfo?: ModelInfo
  systemResources?: SystemResources
  version?: string
  onReconnect?: () => void
  onRefresh?: () => void
  onSettings?: () => void
  className?: string
  compact?: boolean
}
const statusText: Record<ConnectionStatus, string> = {
  connected: "Подключено",
  connecting: "Подключение",
  disconnected: "Нет подключения",
  error: "Ошибка подключения",
}
const statusTone: Record<ConnectionStatus, string> = {
  connected: "text-green-600",
  connecting: "text-accent-600",
  disconnected: "text-text-secondary",
  error: "text-red-600",
}
const capabilityText: Record<ModelCapability, string> = {
  chat: "Чат",
  code: "Код",
  vision: "Зрение",
  "function-calling": "Инструменты",
  embedding: "Эмбеддинги",
}
export function StatusPanel({
  connectionStatus = "connected",
  modelInfo,
  systemResources,
  version = "1.0.0",
  onReconnect,
  onRefresh,
  onSettings,
  className,
  compact = false,
}: AgentStatusPanelProps) {
  const [refreshing, setRefreshing] = React.useState(false)
  const refresh = () => {
    setRefreshing(true)
    onRefresh?.()
    window.setTimeout(() => setRefreshing(false), 1000)
  }
  if (compact)
    return (
      <section
        className={cn(
          "border-separator-border bg-background-primary-default rounded-xl border p-3",
          className
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <span
            className={cn("text-sm font-medium", statusTone[connectionStatus])}
          >
            {statusText[connectionStatus]}
          </span>
          <div className="flex gap-1">
            {connectionStatus === "disconnected" && onReconnect && (
              <Button
                size="xs"
                variant="ghost"
                iconOnly
                leadingIcon={Power}
                aria-label="Переподключиться"
                onClick={onReconnect}
              />
            )}
            <Button
              size="xs"
              variant="ghost"
              iconOnly
              leadingIcon={RefreshCw}
              aria-label="Обновить состояние"
              onClick={refresh}
            />
            {onSettings && (
              <Button
                size="xs"
                variant="ghost"
                iconOnly
                leadingIcon={Settings}
                aria-label="Открыть настройки"
                onClick={onSettings}
              />
            )}
          </div>
        </div>
        {modelInfo && (
          <p className="text-text-secondary mt-2 text-xs">
            {modelInfo.name} · {modelInfo.provider}
          </p>
        )}
      </section>
    )
  return (
    <section
      className={cn(
        "border-separator-border bg-background-primary-default overflow-hidden rounded-xl border",
        className
      )}
    >
      <header className="border-separator-border flex items-start justify-between gap-3 border-b p-4">
        <div>
          <p className="text-text-secondary text-xs font-medium">
            Состояние среды выполнения
          </p>
          <h2 className="text-text-primary mt-1 text-lg font-semibold">
            Подключение агента
          </h2>
          <p className="text-text-secondary mt-1 text-xs">Версия {version}</p>
        </div>
        <div className="flex gap-1">
          <Button
            size="small"
            variant="ghost"
            iconOnly
            leadingIcon={RefreshCw}
            aria-label={
              refreshing ? "Обновляем состояние" : "Обновить состояние"
            }
            onClick={refresh}
          />
          {onSettings && (
            <Button
              size="small"
              variant="ghost"
              iconOnly
              leadingIcon={Settings}
              aria-label="Открыть настройки"
              onClick={onSettings}
            />
          )}
        </div>
      </header>
      <div className="border-separator-border flex items-center justify-between border-b px-4 py-3">
        <span
          className={cn("text-sm font-medium", statusTone[connectionStatus])}
        >
          {statusText[connectionStatus]}
        </span>
        {(connectionStatus === "disconnected" ||
          connectionStatus === "error") &&
          onReconnect && (
            <Button
              size="xs"
              variant="secondary"
              leadingIcon={Power}
              onClick={onReconnect}
            >
              Переподключиться
            </Button>
          )}
      </div>
      {modelInfo && (
        <div className="border-separator-border border-b p-4">
          <h3 className="text-text-primary text-sm font-medium">
            {modelInfo.name}
          </h3>
          <p className="text-text-secondary mt-1 text-xs">
            {modelInfo.provider} · {modelInfo.contextLength.toLocaleString()}{" "}
            токенов в контексте
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {modelInfo.capabilities.map((item) => (
              <span
                key={item}
                className="bg-background-secondary-default text-text-secondary rounded-md px-2 py-1 text-xs"
              >
                {capabilityText[item]}
              </span>
            ))}
          </div>
          {modelInfo.costPer1kTokens && (
            <p className="text-text-secondary mt-3 text-xs">
              Ввод ${modelInfo.costPer1kTokens.input}/1K · Вывод $
              {modelInfo.costPer1kTokens.output}/1K
            </p>
          )}
        </div>
      )}
      {systemResources && (
        <div className="p-4">
          <p className="text-text-primary text-sm font-medium">Ресурсы</p>
          <div className="mt-3 space-y-3">
            {[
              ["Процессор", systemResources.cpu, "%"],
              ["Память", systemResources.memory, "%"],
              ["Задержка", systemResources.latency, " мс"],
            ].map(([label, value, unit]) => (
              <div
                key={label as string}
                className="grid grid-cols-[5rem_1fr_auto] items-center gap-3 text-xs"
              >
                <span className="text-text-secondary">{label}</span>
                <div className="bg-background-secondary-default h-1.5 overflow-hidden rounded-full">
                  <span
                    className="bg-accent-500 block h-full"
                    style={{ width: `${Math.min(Number(value), 100)}%` }}
                  />
                </div>
                <span className="text-text-primary tabular-nums">
                  {value}
                  {unit}
                </span>
              </div>
            ))}
          </div>
          <p className="border-separator-border text-text-secondary mt-3 border-t pt-3 text-xs">
            Время работы {systemResources.uptime}
          </p>
        </div>
      )}
    </section>
  )
}
