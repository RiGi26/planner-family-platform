import type { Item } from './items'
import type { CardMode, CardStateRow, UserRating } from './fsrs'

/**
 * The daily queue, and the machine that walks it.
 *
 * Everything here is pure — no Dexie, no React, no network. The screen fetches
 * the rows and applies the effects; this file decides only what comes next and
 * what that answer means. That split is what makes "what happens if someone quits
 * on card fourteen" a test rather than a guess.
 */

export type SessionCard = {
  card: CardStateRow
  item: Item
  /** Introduced today. Counted against the new-card quota, not the review count. */
  isNew: boolean
}

/**
 * Cards are split by what answering one *costs*, not by which mode it is.
 *
 * A recognition card is a tap. A writing card is a canvas, a stroke at a time,
 * thirty seconds. Mixing them breaks the four-minute session outright — but
 * dropping writing from the daily flow entirely is worse, because FSRS schedules
 * those cards like any other and they would pile up unseen until the schedule
 * stopped meaning anything. So they are separated here and handed off at the end.
 *
 * Sprint 2 adds `listening` to the fast side and kanji writing to the canvas
 * side. Nothing else in this file changes.
 */
const CANVAS_MODES: readonly CardMode[] = ['writing']

/** Ordering within one item, so recognition is always asked before recall. */
const MODE_RANK: Record<CardMode, number> = {
  recognition: 0,
  recall: 1,
  listening: 2,
  writing: 9,
}

export type BuildQueueInput = {
  /** Everything due from `dueCards()` — every mode, unsorted. */
  due: CardStateRow[]
  /** Cards `ensureCards()` just created for items being introduced today. */
  introduced: CardStateRow[]
  items: Map<string, Item>
}

export type BuiltQueue = {
  /** The fast lane, in playing order. */
  queue: SessionCard[]
  /** Canvas cards, handed to /menulis/ from the summary screen. */
  canvas: SessionCard[]
  /** Cards whose item is missing from the dataset — skipped, never thrown. */
  skipped: CardStateRow[]
}

function isCanvas(card: CardStateRow): boolean {
  return CANVAS_MODES.includes(card.mode)
}

/**
 * Builds the day's queue.
 *
 * Two orderings, and the difference between them is the whole design:
 *
 * **Reviews first**, oldest due first. A review is a debt; someone who stops
 * halfway should have paid it rather than met new material they will then forget.
 * This is also what makes "no debt pile" (PRD §6.1) true in behaviour and not
 * only in arithmetic.
 *
 * **New cards grouped by mode**, so every recognition in today's batch comes
 * before any of its recalls. Put recognition あ next to recall あ and the recall
 * is answered from the previous card rather than from memory — and recall stops
 * measuring anything at all.
 *
 * The comparators are total orders, tie-broken on id, so a shuffled input
 * produces an identical queue. That is what makes this testable without seeding
 * a random number generator.
 */
export function buildQueue(input: BuildQueueInput): BuiltQueue {
  const skipped: CardStateRow[] = []
  const introducedIds = new Set(input.introduced.map((c) => c.id))

  const attach = (card: CardStateRow): SessionCard | null => {
    const item = input.items.get(card.item_id)
    if (!item) {
      skipped.push(card)
      return null
    }
    return { card, item, isNew: introducedIds.has(card.id) }
  }

  // A card can be both due and freshly introduced; dedupe on id so it is asked once.
  const seen = new Set<string>()
  const all: SessionCard[] = []
  for (const card of [...input.due, ...input.introduced]) {
    if (seen.has(card.id)) continue
    seen.add(card.id)
    const sc = attach(card)
    if (sc) all.push(sc)
  }

  const reviews = all.filter((c) => !c.isNew && !isCanvas(c.card))
  const fresh = all.filter((c) => c.isNew && !isCanvas(c.card))
  const canvas = all.filter((c) => isCanvas(c.card))

  reviews.sort(
    (a, b) =>
      Date.parse(a.card.due) - Date.parse(b.card.due) ||
      a.item.seq - b.item.seq ||
      MODE_RANK[a.card.mode] - MODE_RANK[b.card.mode] ||
      (a.card.id < b.card.id ? -1 : 1),
  )

  fresh.sort(
    (a, b) =>
      MODE_RANK[a.card.mode] - MODE_RANK[b.card.mode] ||
      a.item.seq - b.item.seq ||
      (a.card.id < b.card.id ? -1 : 1),
  )

  canvas.sort(
    (a, b) => a.item.seq - b.item.seq || (a.card.id < b.card.id ? -1 : 1),
  )

  return { queue: [...reviews, ...fresh], canvas, skipped }
}

// ---------------------------------------------------------------------------
// walking the queue
// ---------------------------------------------------------------------------

/**
 * A card left open this long stops counting as an answer.
 *
 * Someone who puts the phone down mid-card and comes back an hour later did not
 * take an hour to remember あ, and letting that number into `duration_ms` would
 * poison the per-card estimate the planner uses to predict how long a day takes.
 */
export const MAX_CARD_MS = 120_000

export type AnsweredCard = {
  itemId: string
  mode: Exclude<CardMode, 'writing'>
  rating: UserRating
  durationMs: number
  hintsUsed: number
  wasNew: boolean
}

export type SessionState = {
  queue: SessionCard[]
  index: number
  revealed: boolean
  hintsUsed: number
  /** When the current card was first shown, for `duration_ms`. */
  shownAt: number
  answered: AnsweredCard[]
  /**
   * Cards rated Again get one more turn at the end — one, not a loop. A bad
   * night has to be able to end.
   */
  replayed: Set<string>
  phase: 'card' | 'done'
}

export type SessionEvent =
  | { kind: 'reveal'; at: number }
  | { kind: 'hint' }
  | { kind: 'rate'; rating: UserRating; at: number }

/** What the screen must persist. Returned rather than performed, to stay pure. */
export type SaveEffect = AnsweredCard

export function initSession(queue: SessionCard[], at: number): SessionState {
  return {
    queue,
    index: 0,
    revealed: false,
    hintsUsed: 0,
    shownAt: at,
    answered: [],
    replayed: new Set(),
    phase: queue.length === 0 ? 'done' : 'card',
  }
}

export function currentCard(state: SessionState): SessionCard | null {
  return state.queue[state.index] ?? null
}

/**
 * How many hints a prompt can give without giving itself away.
 *
 * Never the last hidden cell: a hint that completes the answer is a reveal in
 * disguise, and it quietly inflates the rating the user then gives themselves.
 * For a one-character kana that leaves zero, so the button is not offered at all
 * — the answer-length cells still show, because "one character" is information
 * the learner already has from the prompt. Youon gets one. Sprint 2 vocabulary
 * gets several, with no change here.
 */
export function hintBudget(answer: string): number {
  return Math.max(0, [...answer].length - 1)
}

export function reduceSession(
  state: SessionState,
  event: SessionEvent,
): { state: SessionState; effect?: SaveEffect } {
  if (state.phase === 'done') return { state }
  const card = currentCard(state)
  if (!card) return { state }

  switch (event.kind) {
    case 'reveal':
      if (state.revealed) return { state }
      return { state: { ...state, revealed: true } }

    case 'hint': {
      const budget = hintBudget(card.item.expression)
      if (state.hintsUsed >= budget) return { state }
      return { state: { ...state, hintsUsed: state.hintsUsed + 1 } }
    }

    case 'rate': {
      // Rating without looking is not an answer, it is a mis-tap.
      if (!state.revealed) return { state }

      const mode = card.card.mode as Exclude<CardMode, 'writing'>
      const effect: SaveEffect = {
        itemId: card.card.item_id,
        mode,
        rating: event.rating,
        durationMs: Math.min(Math.max(0, event.at - state.shownAt), MAX_CARD_MS),
        hintsUsed: state.hintsUsed,
        wasNew: card.isNew,
      }

      // Again → one more turn at the tail, unless it has already had one.
      const replayed = new Set(state.replayed)
      let queue = state.queue
      if (event.rating === 1 && !replayed.has(card.card.id)) {
        replayed.add(card.card.id)
        queue = [...queue, card]
      }

      const index = state.index + 1
      return {
        state: {
          ...state,
          queue,
          index,
          replayed,
          revealed: false,
          hintsUsed: 0,
          shownAt: event.at,
          answered: [...state.answered, effect],
          phase: index >= queue.length ? 'done' : 'card',
        },
        effect,
      }
    }
  }
}

// ---------------------------------------------------------------------------
// card faces
// ---------------------------------------------------------------------------

/**
 * What a card shows before and after reveal, per item type and mode.
 *
 * Kept pure and away from the screen because these are curriculum decisions,
 * not layout ones: a vocabulary recall prompts with the MEANING and answers
 * with the word — prompting with the reading would just be transcription. A
 * grammar answer carries its formation line. A kanji answer carries both
 * readings. The screen only chooses font sizes.
 */
export type Faces = {
  prompt: string
  /** glyph → rendered huge in Japanese; text → a meaning, rendered as prose. */
  promptKind: 'glyph' | 'text'
  /**
   * Disambiguating chip under the prompt. Kana recall shows the script —
   * without it "a" could be あ or ア. Other types name themselves, because a
   * bare English word could be asking for vocabulary or a kanji.
   */
  badge: 'hiragana' | 'katakana' | 'vocab' | 'kanji' | 'grammar' | null
  answerMain: string
  answerSub: string[]
  /** What hint cells count against; '' disables hints for this card. */
  hintTarget: string
}

const asList = (v: unknown): string[] => (Array.isArray(v) ? (v as string[]) : [])

export function cardFaces(item: Item, mode: CardMode): Faces {
  const meanings = item.meanings.join('; ')

  if (item.type === 'kana') {
    const script = (item.data.script as string) === 'katakana' ? 'katakana' : 'hiragana'
    return mode === 'recognition'
      ? {
          prompt: item.expression,
          promptKind: 'glyph',
          badge: null,
          answerMain: item.reading,
          answerSub: [],
          hintTarget: '',
        }
      : {
          prompt: item.reading,
          promptKind: 'glyph',
          badge: script,
          answerMain: item.expression,
          answerSub: [],
          hintTarget: item.expression,
        }
  }

  if (item.type === 'kanji') {
    const kun = asList(item.data.kunyomi).join('・')
    const on = asList(item.data.onyomi).join('・')
    const readings = [kun && `訓 ${kun}`, on && `音 ${on}`].filter(Boolean) as string[]
    return mode === 'recognition'
      ? {
          prompt: item.expression,
          promptKind: 'glyph',
          badge: 'kanji',
          answerMain: meanings,
          answerSub: readings,
          hintTarget: '',
        }
      : {
          prompt: item.meanings[0] ?? '',
          promptKind: 'text',
          badge: 'kanji',
          answerMain: item.expression,
          answerSub: readings,
          hintTarget: item.expression,
        }
  }

  if (item.type === 'grammar') {
    const formation = typeof item.data.formation === 'string' ? item.data.formation : ''
    return {
      prompt: item.expression,
      promptKind: 'glyph',
      badge: 'grammar',
      answerMain: item.meanings[0] ?? '',
      answerSub: formation ? [formation] : [],
      hintTarget: '',
    }
  }

  // vocab
  // A kana-only word reads as itself, so showing the reading as the answer
  // repeats the prompt back — the meaning IS the answer for those.
  return mode === 'recognition'
    ? item.reading !== item.expression
      ? {
          prompt: item.expression,
          promptKind: 'glyph',
          badge: 'vocab',
          answerMain: item.reading,
          answerSub: [meanings],
          hintTarget: '',
        }
      : {
          prompt: item.expression,
          promptKind: 'glyph',
          badge: 'vocab',
          answerMain: meanings,
          answerSub: [],
          hintTarget: '',
        }
    : {
        prompt: item.meanings[0] ?? '',
        promptKind: 'text',
        badge: 'vocab',
        answerMain: item.expression,
        // The reading repeats the word for kana-only vocabulary; saying it twice
        // reads like an error.
        answerSub: item.reading !== item.expression ? [item.reading] : [],
        hintTarget: item.expression,
      }
}

// ---------------------------------------------------------------------------
// labels
// ---------------------------------------------------------------------------

export type Interval = { n: number; unit: 'mnt' | 'jam' | 'hr' | 'bln' | 'thn' }

/**
 * The interval printed under a rating button.
 *
 * Driven by the due date rather than `scheduled_days`, because a card in
 * learning steps has a due time minutes away and a day count of zero — and "0
 * hr" under all four buttons is the failure this exists to avoid.
 */
export function formatInterval(dueMs: number, nowMs: number): Interval {
  const minutes = Math.max(1, Math.round((dueMs - nowMs) / 60_000))
  if (minutes < 60) return { n: minutes, unit: 'mnt' }

  const hours = Math.round(minutes / 60)
  if (hours < 24) return { n: hours, unit: 'jam' }

  const days = Math.round(hours / 24)
  if (days < 30) return { n: days, unit: 'hr' }

  const months = Math.round(days / 30)
  if (months < 12) return { n: months, unit: 'bln' }

  return { n: Math.round(days / 365), unit: 'thn' }
}

/** Counts for the summary screen. */
export function tally(answered: AnsweredCard[]) {
  return {
    total: answered.length,
    baru: answered.filter((a) => a.wasNew).length,
    ulangan: answered.filter((a) => !a.wasNew).length,
    lupa: answered.filter((a) => a.rating === 1).length,
    ms: answered.reduce((sum, a) => sum + a.durationMs, 0),
  }
}
