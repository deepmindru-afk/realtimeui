"use client"

import { SystemMessage } from "@/components/prompt-kit/system-message"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { ArrowRight, TriangleAlert } from "lucide-react"
import { motion } from "motion/react"
import { useId, type ReactNode } from "react"

/**
 * The four things a room needs before anyone can speak in it.
 *
 * Every field is optional, and an empty one has to stay optional all the way to
 * the token route: its fallbacks are `??`, so they fire on a missing key only.
 * A box is therefore handed over exactly as it stands, blank included, and the
 * transport leaves blanks out of the query rather than sending `name=` — which
 * would replace a generated `user-4f2a91c0` with nothing. Each field says what
 * an empty one buys you, because that is the part a link cannot show.
 */
export type ConnectValues = {
  /** Room to join — the one string every participant of a session shares. */
  room: string
  /** LiveKit participant identity: the stable id, not the display name. */
  identity: string
  /** Display name, which is what the room shows next to the participant. */
  name: string
  /** Registered worker name the room dispatches into itself. */
  agent: string
}

type ConnectField = {
  key: keyof ConnectValues
  label: string
  /** What this field is, and what an empty one falls back to. */
  note: string
  /** The *shape* of a value, not a value: a filled-in placeholder reads as a
   *  value and gets submitted. The one exception is the worker's registered
   *  name, which is the string the operator has to get exactly right and would
   *  otherwise be guessing at. */
  placeholder: string
  /** Identifiers read better in the mono face than in the UI sans, and this app
   *  already prints rooms and participant names in mono elsewhere. */
  mono?: boolean
  /** A longer line under the box, for a trap that has to be stated. */
  caution?: ReactNode
}

const FIELDS: ConnectField[] = [
  {
    key: "room",
    label: "Комната",
    note: "не обязательно",
    placeholder: "va_room_…",
    mono: true,
  },
  {
    key: "identity",
    label: "Идентификатор",
    note: "не обязательно",
    placeholder: "user-4f2a91c0",
    mono: true,
  },
  {
    key: "name",
    label: "Ваше имя",
    note: "не обязательно",
    placeholder: "Катя",
  },
  {
    key: "agent",
    label: "Агент",
    note: "не обязательно",
    placeholder: "portal",
    mono: true,
    caution: (
      <>
        caution
      </>
    ),
  },
]

const EASE: [number, number, number, number] = [0.2, 0, 0, 1]

/** The same 6px rise and easing the empty state uses, one block at a time, so
 *  the two states of this screen move identically. */
function riseIn(delay: number, reduce: boolean) {
  return {
    initial: reduce ? false : { opacity: 0, y: 6 },
    animate: { opacity: 1, y: 0 },
    transition: {
      duration: reduce ? 0 : 0.3,
      delay: reduce ? 0 : delay,
      ease: EASE,
    },
  }
}

/**
 * The pre-connection screen: the same column, eyebrow and voice as the empty
 * state it hands over to, with a form in place of the starter questions.
 *
 * The two are states of one screen rather than two screens, which is why the
 * eyebrow, the type scale and the `pt-10` opening are shared with
 * `EmptyState` — after a join, nothing has moved except the middle block.
 *
 * Nothing here reads the URL or knows what will happen on connect. It is handed
 * the values and hands them back, which is what keeps the page-URL resolution in
 * one place and this file testable as a plain form.
 */
export function ConnectPanel({
  values,
  onChange,
  onConnect,
  connecting,
  error,
  notice,
  reduce,
  className,
}: {
  values: ConnectValues
  /** One box, by name. Not the whole record: the parent layers what the operator
   *  typed over what the link asked for, and a whole-record setter would freeze
   *  the link's values into that layer the first time anything was touched. */
  onChange: (key: keyof ConnectValues, value: string) => void
  onConnect: (values: ConnectValues) => void
  /** True while the transport is joining. False until the operator asks it to:
   *  nothing is in flight on a page that has not pressed the button yet. */
  connecting: boolean
  error: string | null
  notice: string | null
  reduce: boolean
  className?: string
}) {
  const base = useId()
  const titleId = `${base}-title`
  /* The transport's own two sentences rather than a third wording of them: the
   * form is the screen the operator is looking at while the join runs, so the
   * words should be the ones the status strip will say next. */
  const banner = error ?? notice
  const submit = () => onConnect(values)

  return (
    <div className={cn("pt-10 pb-6", className)}>
      <div className="md:grid md:grid-cols-[13rem_minmax(0,1fr)] md:gap-8">
        <motion.div {...riseIn(0, reduce)}>
          <p className="text-muted-foreground text-[11px] tracking-[0.08em] uppercase">
            Агент Портала
          </p>
          <h1
            id={titleId}
            className="mt-2 text-2xl leading-8 font-medium tracking-tight text-balance"
          >
            Подключение к Порталу
          </h1>
          <p className="text-muted-foreground mt-2 text-sm leading-6 text-balance">
            Комната, кто вы и какого агента позвать. Любое поле можно оставить
            пустым.
          </p>
          {/* The four keys the link is about to carry, named on the screen where
              the address bar is about to change. Technical annotation, so it
              takes the technical face and steps out of the way on a phone. */}
          <p className="text-muted-foreground mt-6 hidden font-mono text-[11px] leading-5 md:block">
            room · identity · name · agent
          </p>
        </motion.div>

        <motion.form
          {...riseIn(0.1, reduce)}
          data-connect-panel
          aria-labelledby={titleId}
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
          className="bg-card border-border mt-6 w-full max-w-md rounded-xl border p-4 sm:p-5 md:mt-0"
        >
          <div className="grid gap-3.5">
            {FIELDS.map((field, index) => {
              const id = `${base}-${field.key}`
              const noteId = `${id}-note`
              const cautionId = `${id}-caution`
              return (
                <motion.div key={field.key} {...riseIn(0.14 + index * 0.04, reduce)}>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                    <Label htmlFor={id} className="text-xs font-medium">
                      {field.label}
                    </Label>
                    <span
                      id={noteId}
                      className="text-muted-foreground text-[11px] leading-4"
                    >
                      {field.note}
                    </span>
                  </div>
                  <Input
                    id={id}
                    name={field.key}
                    data-connect-field={field.key}
                    value={values[field.key]}
                    onChange={(event) =>
                      onChange(field.key, event.target.value)
                    }
                    placeholder={field.placeholder}
                    aria-describedby={
                      field.caution ? `${noteId} ${cautionId}` : noteId
                    }
                    /* Room, identity and agent are machine names. Case
                       correction and spellcheck only ever damage them. */
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    className={cn(
                      "mt-1.5",
                      field.mono && "font-mono text-[13px] md:text-[13px]"
                    )}
                  />
                  {field.caution && (
                    <p
                      id={cautionId}
                      className="text-muted-foreground mt-1.5 flex gap-1.5 text-[11px] leading-4"
                    >
                      <TriangleAlert aria-hidden className="mt-px size-3 shrink-0" />
                      <span>{field.caution}</span>
                    </p>
                  )}
                </motion.div>
              )
            })}
          </div>

          {/* Announcements before the action: while a join runs, and when it
              failed. The conversation shows both in the same words and the same
              components, and this screen is the conversation's first state. No
              live region around them — both children carry their own, and a
              nested one would say the same sentence twice. */}
          <div className="mt-4 grid gap-3 empty:hidden">
            {connecting && (
              <p
                role="status"
                className="text-muted-foreground flex items-center gap-2 text-[11px]"
              >
                <span
                  aria-hidden
                  className="bg-primary size-1.5 shrink-0 animate-pulse rounded-full"
                />
                Подключение к Порталу — открываем аудиоканал и ждём агента.
              </p>
            )}
            {/* The banner carries no call to action, where the transcript's does.
                This one sits inside the form, and a `Button` with no `type` is a
                submit button: pressing it there would run its own handler *and*
                the form's, joining twice. Here the button below already is the
                retry — same values, same room — so a second one would be noise
                as well as a hazard. */}
            {banner && (
              <SystemMessage
                variant={error ? "error" : "warning"}
                fill
                role={error ? "alert" : "status"}
              >
                {banner}
              </SystemMessage>
            )}
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <motion.div {...riseIn(0.3, reduce)} className="sm:shrink-0">
              <Button
                type="submit"
                size="lg"
                disabled={connecting}
                className="w-full sm:w-auto"
              >
                {/* A failed attempt leaves the boxes exactly where they were, so
                    the same press is the retry — and saying so is what tells the
                    operator the screen is waiting for another one. */}
                {connecting
                  ? "Подключение…"
                  : error
                    ? "Повторить"
                    : "Подключиться"}
                <ArrowRight aria-hidden />
              </Button>
            </motion.div>
            <motion.p
              {...riseIn(0.34, reduce)}
              className="text-muted-foreground text-[11px] leading-4 sm:max-w-[15rem] sm:text-right"
            >
              Значения попадут в ссылку — её можно переслать.
            </motion.p>
          </div>
        </motion.form>
      </div>
    </div>
  )
}
