/**
 * Slash commands for the composer, and the one place they are recognised.
 *
 * Pure, like `match-samples`, and for the same reasons: the list, the ghost and
 * the send path all have to agree on what `/summ` means, and a rule that lives
 * in a component is a rule that gets re-implemented slightly differently the
 * next time the set changes.
 *
 * Every command here is something the agent's own instructions say it can do —
 * summarise the notes, propose changes from the observations, separate what was
 * observed from what was interpreted, name what the notes do not cover, and ask
 * the browser where the user is. A command the agent cannot fulfil would be a
 * menu of promises, and a menu of promises is worse than no menu.
 *
 * A command is a *prefix for a question*, not a question: it writes `/summary `
 * and leaves the sentence to the operator. `prompt` is what that bare token
 * stands for, used when they send it without finishing — see `expandCommand`.
 *
 * This list is now the fallback rather than the source. `AUTOCOMPLETE_API_URL`
 * decides what the menu says, and `sourcesWithFallback` hands these over whenever
 * that service is unset or unusable; both matchers below take the list as an
 * argument, so the bundled and the fetched set go through one implementation.
 */

export type Command = {
  /** The token, without its slash. Lowercase and hyphenated. */
  key: string
  /** One line: what picking this asks for. */
  hint: string
  /** What a bare `/key` means, expanded at send time. */
  prompt: string
}

export const COMMANDS: Command[] = [
  {
    key: "summary",
    hint: "Кратко пересказать заметки",
    prompt: "Кратко перескажите заметки по этому проекту.",
  },
  {
    key: "changes",
    hint: "Что наблюдения предлагают изменить",
    prompt: "Что заметки предлагают изменить?",
  },
  {
    key: "evidence",
    hint: "Процитировать, что именно говорят заметки",
    prompt: "Процитируйте, что именно говорят заметки, со ссылкой на заметку.",
  },
  {
    key: "compare",
    hint: "Сопоставить наблюдения между проектами",
    prompt: "Сопоставьте наблюдения между проектами и скажите, где они расходятся.",
  },
  {
    key: "gaps",
    hint: "Чего в заметках нет",
    prompt: "Чего в заметках не хватает? Не додумывайте — назовите пробелы.",
  },
  {
    key: "where",
    hint: "Спросить у браузера мои координаты",
    prompt: "Где я сейчас? Возьмите мои текущие координаты.",
  },
]

/** The command being typed, as the text after its slash. */
export type CommandToken = { query: string }

/**
 * The command token at the head of the draft, or null.
 *
 * Anchored at the start, and that is a deliberate narrowing of the pattern the
 * `PromptBar` reference uses (`/(^|\s)([@/])([\w-]*)$/`, which matches a slash
 * anywhere in the draft). That reference is a static demo, where a stray slash
 * can only open a menu. Here the draft is going to a model as a question, and
 * a slash mid-sentence is far more often part of something else — a date,
 * a ratio, a path, a URL. Only a slash the operator typed *first* is a command.
 *
 * The whole-draft match is also what makes a command unambiguous: `/summary` and
 * a sentence both reach the agent, and only the first is a menu.
 */
export function parseCommand(draft: string): CommandToken | null {
  const match = /^\/([\w-]*)$/u.exec(draft)
  return match ? { query: match[1] } : null
}

export type CommandMatch = {
  key: string
  hint: string
  prompt: string
  /** How much of the name the query accounts for, in characters. */
  typed: number
  /** The rest of the name — non-empty only while the name is unfinished, which
   *  is what makes a lone candidate worth drawing at the caret. */
  tail: string
}

/**
 * The commands a token could be, in the order they are listed.
 *
 * An empty query matches everything, so a bare `/` opens the menu — that is the
 * only way an operator discovers the set, and a menu nobody can find is not a
 * feature. Prefix matching only, rather than `includes`: with six commands a
 * substring match is a worse filter than no filter at all.
 *
 * `commands` is a parameter with a default rather than a reference to the
 * constant, and that is the seam the service comes through: the set is
 * deployment data now, so the same matcher has to rank a bundled list and a
 * fetched one without knowing which it was handed.
 */
export function matchCommands(
  token: CommandToken | null,
  commands: Command[] = COMMANDS
): CommandMatch[] {
  if (!token) return []
  const query = token.query.toLocaleLowerCase()
  return commands
    .filter((command) => !query || command.key.startsWith(query))
    .map((command) => ({
      key: command.key,
      hint: command.hint,
      prompt: command.prompt,
      typed: query.length,
      tail: command.key.slice(query.length),
    }))
}

/**
 * The draft with a command written into it.
 *
 * The query is dropped and the trailing space added, which is the whole design
 * in one line: the operator typed a prefix of a command, and what they get is
 * the command plus the space that says "now say what you mean". A command with
 * no space after it is one keystroke from becoming a word.
 */
export function applyCommand(_draft: string, match: CommandMatch): string {
  return `/${match.key} `
}

/**
 * A bare command's meaning, or the draft unchanged.
 *
 * Only the whole draft, and only when it *is* a bare command — anything with
 * arguments after it is a sentence the operator wrote, and expanding that would
 * throw their words away. Called from the send path, so `/summary` sent on its
 * own reaches the agent as a question rather than as a slash token.
 *
 * A command with no prompt is left alone rather than expanded to nothing. A
 * fetched command may arrive without one, and the send path treats an empty
 * question as nothing to send — so expanding one would make a command that looks
 * sendable silently do nothing.
 */
export function expandCommand(
  draft: string,
  commands: Command[] = COMMANDS
): string {
  const text = draft.trim()
  const command = commands.find(
    (candidate) => `/${candidate.key}` === text.toLocaleLowerCase()
  )
  return command?.prompt ? command.prompt : draft
}
