export interface ResearchNote {
  id: string
  title: string
  text: string
  attached?: boolean
}
export const researchProjects = [
  {
    id: "field-notes",
    title: "Интервью на западном доку",
    subtitle: "Полевые исследования · 5 интервью",
    question: "Что замедляет передачу смены?",
    notes: [
      {
        id: "interview",
        title: "Интервью с операторами",
        text: "Четверо из пяти операторов вводят один и тот же идентификатор отгрузки дважды: сначала на бумаге, затем на общем планшете. Планшет часто приходит позже бумажного листа.",
      },
      {
        id: "shift",
        title: "Наблюдение на передаче смены",
        text: "На обеих наблюдавшихся передачах смены операторы проверяли планшет и общий блокнот, прежде чем подтвердить, какая запись об отгрузке актуальна.",
      },
      {
        id: "map",
        title: "Карта процесса",
        text: "Бумажный, голосовой и планшетный шаги каждый раз копируют идентификатор отгрузки. Ни один шаг не отвечает за эталонную запись. Команда предложила подтверждать одну запись при приёмке и показывать статус синхронизации.",
      },
    ],
  },
  {
    id: "accessibility",
    title: "Аудит навигации",
    subtitle: "Прибытие на станции · 2 наблюдения",
    question: "Что должно измениться на указателях станции?",
    notes: [
      {
        id: "arrival",
        title: "Обход при прибытии",
        text: "Трое посетителей остановились перед поворотом на платформу. Указатели пересадки конкурируют с рекламой в точке принятия решения, а название направления меняется от таблички к табличке.",
      },
      {
        id: "signs",
        title: "Разбор указателей",
        text: "Повторяйте одно и то же название направления на уровне глаз перед каждым поворотом. Держите стрелки рядом с названием и проверяйте маршрут с посетителями, которые проходят его впервые.",
      },
    ],
  },
  {
    id: "handoff",
    title: "Передача исследования",
    subtitle: "Продуктовая команда · бриф на проверку",
    question: "Что должно войти в передачу?",
    notes: [
      {
        id: "review",
        title: "Командная проверка",
        text: "Продуктовой команде нужно развести наблюдаемое поведение, интерпретации и открытые вопросы. Каждая находка должна содержать ссылку на полевую заметку и назначенного ответственного за проверку.",
      },
      {
        id: "next",
        title: "Следующий раунд исследования",
        text: "Проверьте подтверждение при приёмке с двумя операторами в течение одной смены. Сравните частоту повторного ввода и попросите каждого оператора назвать текущую запись об отгрузке.",
      },
    ],
  },
]

/** Extractive local demo: return the selected notes, never invented research.
 *
 *  The term matcher is Unicode-aware because the corpus is Russian. The original
 *  was `/[a-z]{4,}/g`, which is fine for English and silently useless here: it
 *  matches nothing, `terms` comes back empty, and every note scores zero — so
 *  the ranking quietly degrades to "return the notes in their original order"
 *  and nothing announces that it happened. `\p{L}` covers both scripts, so the
 *  function keeps working if a note is ever added in either language.
 *
 *  The stopword list has to move with the corpus for the same reason. It is a
 *  matching filter, not prose: leaving English words in it would filter nothing
 *  and let "что" or "нужно" dominate a query's ranking.
 */
export function researchAnswer(
  question: string,
  notes: ResearchNote[],
  concise = false
) {
  if (!notes.length)
    return "В этом разговоре пока нет исходных заметок. Приложите текстовую заметку или откройте один из исследовательских проектов, чтобы спросить о его данных."
  const terms =
    question
      .toLowerCase()
      .match(/[\p{L}]{4,}/gu)
      ?.filter(
        (word) =>
          ![
            "что",
            "как",
            "этот",
            "эта",
            "эти",
            "должен",
            "должна",
            "нужно",
            "может",
            "пожалуйста",
            "если",
            "также",
            "когда",
            "где",
            "затем",
          ].includes(word)
      ) ?? []
  const ranked = notes
    .map((note, index) => ({
      note,
      index,
      score: terms.filter((term) =>
        `${note.title} ${note.text}`.toLowerCase().includes(term)
      ).length,
    }))
    .sort((a, b) => b.score - a.score)
  const relevant =
    ranked[0].score > 0 ? ranked.filter((item) => item.score > 0) : ranked
  const chosen = relevant.slice(0, concise ? 1 : 3)
  return `Из ${chosen.length === 1 ? "выбранной заметки" : "выбранных заметок"}:\n\n${chosen.map(({ note, index }) => `${note.text.slice(0, concise ? 220 : 480)}${note.text.length > (concise ? 220 : 480) ? "…" : ""} [${index + 1}]`).join("\n\n")}`
}

export function researchReport(
  title: string,
  notes: ResearchNote[],
  answer: string
) {
  return `${title}\n\nИССЛЕДОВАТЕЛЬСКИЙ БРИФ\n\n${answer}\n\nИСХОДНЫЕ ЗАМЕТКИ\n${notes.map((note, index) => `${index + 1}. ${note.title}\n${note.text}`).join("\n\n")}\n\nПроверьте эти наблюдения с командой проекта, прежде чем предпринимать что-либо.`
}
