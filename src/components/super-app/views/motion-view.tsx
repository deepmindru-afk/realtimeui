"use client"

/**
 * Motion: every animated piece in the kit, running.
 *
 * This is the one surface whose whole job is to move, which makes it the one
 * surface where honouring `prefers-reduced-motion` is the feature rather than a
 * courtesy. Two things follow from that, and both are visible in the code below:
 *
 *   1. Components that expose an `active` switch are driven from it
 *      (`BorderBeam`, `ComposerLoader`), so the animation genuinely stops.
 *   2. Components with no such switch are not rendered at all when the
 *      preference is set — a still frame of the same information replaces them.
 *      Rendering an animation and merely hoping the component checks the
 *      preference is how a page like this ends up ignoring it.
 *
 * The second rule is why `Specimen` takes a `still` node. Every specimen
 * declares what it looks like when it is not moving, so the page stays
 * informative at both settings instead of becoming a grid of empty cards.
 */

import { type ReactNode } from "react"
import { Sparkles } from "lucide-react"
import { useReducedMotion } from "motion/react"

import { BorderBeam } from "@/components/effects/border-beam"
import { ThinkingShimmer } from "@/components/beui/components/agents/loading-states/thinking-shimmer"
import { TextScramble } from "@/components/beui/components/motion/text-scramble"
import { Shimmer } from "@/components/ai-elements/shimmer"
import { AgentThinking } from "@/components/boardui/application/agent-thinking/agent-thinking"
import { ComposerLoader } from "@/components/boardui/application/composer-loader/composer-loader"
import { Loader } from "@/components/prompt-kit/loader"
import { ThinkingBar } from "@/components/prompt-kit/thinking-bar"
import { cn } from "@/lib/utils"

const LOADER_VARIANTS = [
  "circular",
  "dots",
  "typing",
  "wave",
  "bars",
  "terminal",
  "pulse-dot",
  "text-shimmer",
] as const

const THINKING_VARIANTS = ["wave", "spin", "stars", "infinity"] as const

export function MotionView() {
  const reduce = useReducedMotion()
  const live = !reduce

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Анимация</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {live
            ? "Всё ниже запущено. На каждой карточке указано, какой это компонент."
            : "Включено уменьшение анимации, поэтому каждый образец показан в неподвижном виде. Компоненты те же."}
        </p>
      </header>

      {/* Hero. The beam is the one effect on this page worth giving room to,
          because it is the one that reads at a glance from across a room. */}
      <section aria-label="Бегущая рамка" className="mb-6">
        <Specimen
          name="BorderBeam"
          source="effects/border-beam"
          className="overflow-hidden"
        >
          <BorderBeam
            size="md"
            colorVariant="ocean"
            theme="auto"
            duration={3.2}
            active={live}
            className="rounded-xl"
          >
            <div className="rounded-xl border p-6">
              <p className="text-sm font-medium">Портал работает</p>
              <p className="text-muted-foreground mt-1 text-sm">
                {live
                  ? "Пока задача выполняется, по рамке идёт бегущий свет."
                  : "Свет остановлен, потому что включено уменьшение анимации."}
              </p>
              <div className="mt-4 flex items-center gap-2">
                {live ? (
                  <AgentThinking
                    variant="wave"
                    label="Читает журнал отгрузок"
                    tone="primary"
                  />
                ) : (
                  <span className="text-muted-foreground text-sm">
                    Читает журнал отгрузок…
                  </span>
                )}
              </div>
            </div>
          </BorderBeam>
        </Specimen>
      </section>

      <Group title="Думает" source="boardui/agent-thinking">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {THINKING_VARIANTS.map((variant) => (
            <Specimen
              key={variant}
              name={`AgentThinking · ${variant}`}
              source="boardui"
            >
              {live ? (
                <AgentThinking
                  variant={variant}
                  label={variant === "infinity" ? "Ещё работает" : "Думает"}
                  showTimer={variant === "wave"}
                />
              ) : (
                <span className="text-muted-foreground text-sm">
                  {variant === "infinity" ? "Ещё работает…" : "Думает…"}
                </span>
              )}
            </Specimen>
          ))}
        </div>
      </Group>

      <Group title="Индикаторы" source="prompt-kit/loader">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {LOADER_VARIANTS.map((variant) => (
            <Specimen key={variant} name={variant} source="prompt-kit">
              {live ? (
                <Loader variant={variant} size="md" />
              ) : (
                <span className="text-muted-foreground text-sm">загрузка…</span>
              )}
            </Specimen>
          ))}
        </div>
      </Group>

      <Group title="Текст" source="ai-elements, beui, prompt-kit">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Specimen name="Shimmer" source="ai-elements">
            <Shimmer className="text-base" duration={2.4}>
              Сверяем идентификаторы отгрузок
            </Shimmer>
          </Specimen>

          <Specimen name="ThinkingShimmer" source="beui">
            {live ? (
              <ThinkingShimmer duration={2}>Группируем темы интервью…</ThinkingShimmer>
            ) : (
              <span className="text-muted-foreground text-sm">
                Группируем темы интервью…
              </span>
            )}
          </Specimen>

          <Specimen name="TextScramble" source="beui">
            {live ? (
              <TextScramble
                text="сводка готова"
                duration={1400}
                className="text-base"
              />
            ) : (
              <span className="text-base">сводка готова</span>
            )}
          </Specimen>

          <Specimen name="ThinkingBar" source="prompt-kit" className="sm:col-span-2 lg:col-span-3">
            <ThinkingBar
              text={live ? "Читает заметки западного доку" : "Анимация уменьшена — без движения"}
              stopLabel="Ответить сейчас"
              onClick={() => {}}
            />
          </Specimen>
        </div>
      </Group>

      <Group title="Поверхности" source="boardui/composer-loader">
        <div className="grid gap-4 sm:grid-cols-2">
          <Specimen name="ComposerLoader" source="boardui">
            <ComposerLoader active={live} speed={2.4} className="rounded-full">
              <span
                className={cn(
                  "inline-block rounded-full px-4 py-2 text-sm transition-colors",
                  live ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"
                )}
              >
                {live ? "Ждём ответа агента…" : "Анимация уменьшена — неподвижно"}
              </span>
            </ComposerLoader>
          </Specimen>

          <Specimen name="Неподвижный кадр" source="—">
            <p className="text-muted-foreground text-sm">
              Каждая карточка на этой странице сохраняет подпись и смысл, даже
              когда анимация уменьшена. Уходит только движение.
            </p>
          </Specimen>
        </div>
      </Group>
    </div>
  )
}

/* ------------------------------------------------------------------ parts --- */

function Group({
  title,
  source,
  children,
}: {
  title: string
  source: string
  children: ReactNode
}) {
  return (
    <section aria-label={title} className="mb-6">
      <h2 className="text-muted-foreground mb-2 flex items-baseline gap-2 text-xs font-medium">
        <Sparkles aria-hidden className="size-3.5" />
        {title}
        <span className="font-mono text-[11px]">{source}</span>
      </h2>
      {children}
    </section>
  )
}

/** One labelled specimen on a bounded stage.
 *
 *  The stage is a fixed height rather than `100vh` or a percentage: a specimen
 *  that sizes itself from its parent cannot be given a stage at all, and a
 *  grid of parent-sized cells is a grid of clipped canvases. */
function Specimen({
  name,
  source,
  children,
  className,
}: {
  name: string
  source: string
  children: ReactNode
  className?: string
}) {
  return (
    <figure
      className={cn(
        "bg-card flex min-h-28 flex-col justify-between gap-4 rounded-lg border p-4",
        className
      )}
    >
      <div className="flex min-h-12 items-center">{children}</div>
      <figcaption className="text-muted-foreground flex items-baseline gap-1.5 text-[11px]">
        <span className="text-foreground font-mono">{name}</span>
        <span className="truncate font-mono">{source}</span>
      </figcaption>
    </figure>
  )
}
