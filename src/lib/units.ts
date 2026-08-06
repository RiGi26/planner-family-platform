import type { CardStateRow } from './fsrs'
import { State } from './fsrs'
import type { Item } from './items'

/**
 * The guided path: what to learn next, decided for the learner.
 *
 * A beginner cannot choose between "kana / vocabulary / grammar / kanji" —
 * choosing is the teacher's job, and having to do it is what made the app feel
 * directionless. A unit answers the only question they should face: what now.
 *
 * A unit is 1–2 grammar patterns, the 10–15 words that pattern actually uses, a
 * dialogue, and example sentences — every one of them restricted to material
 * from this unit or earlier (scripts/verify-units.mjs enforces it). The order in
 * which grammar arrives follows Minna no Nihongo, the sequence Indonesian
 * courses and LPK teach from, so someone who later joins a class lands mid-book
 * rather than nowhere.
 *
 * Everything here is pure. The screen loads the data and applies the effects.
 */

export type UnitLine = { speaker?: string; ja: string; id: string }

export type Unit = {
  n: number
  title: string
  cando: string
  /** False until a native speaker or teacher has read it. The app says so. */
  reviewed: boolean
  grammar: string[]
  vocab: string[]
  kanji: string[]
  /** Kana rows this unit practises, for Unit 0's whole-word reading. */
  kana_focus?: string[]
  note?: string
  dialog: UnitLine[]
  sentences: { ja: string; id: string }[]
}

/** A card counts as learned-enough for progressing the path. */
const STRONG_DAYS = 7

/**
 * Deliberately lower than the sheet's "strong": the path asks *have you met
 * this and can you hold it for a few days*, not *have you mastered it*. Holding
 * a unit shut until every card is week-strong would stall a learner behind
 * material they already half-know, which is how a guided path turns into a wall.
 */
const UNIT_PASS_RATIO = 0.8

export type ItemStatus = 'belum' | 'belajar' | 'kuat'

export function statusOf(cards: CardStateRow[], now = new Date()): ItemStatus {
  if (cards.length === 0) return 'belum'
  const allStrong = cards.every(
    (c) => c.state === State.Review && c.scheduled_days >= STRONG_DAYS,
  )
  return allStrong ? 'kuat' : 'belajar'
}

export type UnitProgress = {
  n: number
  /** Items this unit owns that exist as data. */
  total: number
  /** Items with at least one card — the person has met them. */
  started: number
  /** Items whose cards are all strong. */
  strong: number
  ratio: number
  /** Enough of it holds that the next unit may open. */
  passed: boolean
}

export function unitItemIds(unit: Unit, items: Map<string, Item>): string[] {
  const ids: string[] = []
  for (const w of unit.vocab) {
    const id = `vocab-n5-${w}`
    if (items.has(id)) ids.push(id)
  }
  for (const k of unit.kanji) {
    const id = `kanji-n5-${k}`
    if (items.has(id)) ids.push(id)
  }
  for (const g of unit.grammar) {
    // Grammar ids are derived from the pattern text and may not match a data
    // row one-for-one; a missing pattern is a note in the unit, not a card.
    const id = `grammar-n5-${g.replace(/\s+/g, '')}`
    if (items.has(id)) ids.push(id)
  }
  return ids
}

export function unitProgress(
  unit: Unit,
  items: Map<string, Item>,
  byItem: Map<string, CardStateRow[]>,
  now = new Date(),
): UnitProgress {
  const ids = unitItemIds(unit, items)
  let started = 0
  let strong = 0
  for (const id of ids) {
    const cards = byItem.get(id) ?? []
    const s = statusOf(cards, now)
    if (s !== 'belum') started++
    if (s === 'kuat') strong++
  }
  const total = ids.length
  const ratio = total === 0 ? 0 : strong / total
  return { n: unit.n, total, started, strong, ratio, passed: total > 0 && ratio >= UNIT_PASS_RATIO }
}

/**
 * The unit the learner is on: the first one not yet passed.
 *
 * Sequential by design — a path that lets you skip ahead is a menu again. A unit
 * with no items of its own (Unit 0, which is kana practice through the Kana
 * Sheet) passes as soon as its kana rows are strong, which is checked by the
 * caller that owns kana state.
 */
export function currentUnit(
  units: Unit[],
  items: Map<string, Item>,
  byItem: Map<string, CardStateRow[]>,
  now = new Date(),
): Unit {
  const ordered = [...units].sort((a, b) => a.n - b.n)
  for (const u of ordered) {
    if (!unitProgress(u, items, byItem, now).passed) return u
  }
  return ordered[ordered.length - 1]!
}

/**
 * What this unit still owes: items never introduced, in unit order.
 *
 * This replaces the proportional cross-track split. A unit is a small, finite
 * list; there is nothing to apportion, only an order to follow.
 */
export function unitRemaining(
  unit: Unit,
  items: Map<string, Item>,
  byItem: Map<string, CardStateRow[]>,
): Item[] {
  return unitItemIds(unit, items)
    .filter((id) => (byItem.get(id) ?? []).length === 0)
    .map((id) => items.get(id)!)
}

/** Units that have not been read by a native speaker yet — the app must say so. */
export function needsHumanReview(units: Unit[]): number[] {
  return units.filter((u) => !u.reviewed).map((u) => u.n)
}
