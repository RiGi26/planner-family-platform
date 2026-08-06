import type { CardStateRow } from './fsrs'
import type { Item } from './items'
import type { DailyProgressRow } from './progress'
import { groupByItem } from './curriculum'
import { computeQuota } from './goal-engine'
import { parseExamDate } from './exam-dates'
import { pathState } from './path'
import { currentUnit, unitRemaining, type Unit } from './units'

/**
 * What today actually consists of — computed once, read by every screen.
 *
 * Hari Ini, Jalur and the session each used to derive this for themselves, and
 * they drifted: the Jalur button promised "Lanjut Unit 0" on a day whose entire
 * new-card allowance had already been spent, so the session it opened contained
 * no Unit 0 material at all. A button that names a unit has to be reading the
 * same numbers the session will act on.
 *
 * Pure: the caller supplies the rows, this decides what they mean.
 */

export type DayPlan = {
  /** The unit the learner is on. Null only while the spine is still loading. */
  unit: Unit | null
  /** Due cards that will be asked in the fast lane (writing has its own screen). */
  reviewsDue: number
  /** Due writing cards, handed to /menulis/ at the end. */
  writingDue: number
  /**
   * New items this session will actually introduce: whatever the unit still
   * owes, capped by what is left of today's allowance. Zero means "the unit
   * does not move today" — and that is what the buttons must say.
   */
  newToday: number
  /** Items the current unit still owes in total, ignoring today's cap. */
  unitRemaining: number
}

export type DayPlanInput = {
  cards: CardStateRow[]
  progressRows: DailyProgressRow[]
  goal: { target_exam_date: string; baseline_new_per_day?: number | null }
  units: Unit[]
  items: Map<string, Item>
  /** Local calendar date, from `localDate()` — the key progress rows use. */
  today: string
  now: Date
}

export function dayPlan(input: DayPlanInput): DayPlan {
  const { cards, progressRows, goal, units, items, today, now } = input

  const states = groupByItem(cards)
  const due = cards.filter((c) => new Date(c.due) <= now)
  const writingDue = due.filter((c) => c.mode === 'writing').length
  const reviewsDue = due.length - writingDue

  const unit = units.length > 0 ? currentUnit(units, items, states, now) : null
  const owed = unit ? unitRemaining(unit, items, states).length : 0

  // Kana still counts towards the pace even where it arrives through the sheet:
  // it is real work, and a quota that ignores it under-promises the day.
  const kanaLeft = pathState(cards, null, now).remainingNew

  const quota = computeQuota({
    remainingNew: kanaLeft + owed,
    dueToday: due.length,
    dueWriting: writingDue,
    targetExamDate: parseExamDate(goal.target_exam_date),
    today: now,
    ...(goal.baseline_new_per_day ? { baselineNewPerDay: goal.baseline_new_per_day } : {}),
  })

  // How much of today's allowance is already spent. Lives in the daily row
  // rather than in component state, so a reload or a second tab cannot hand out
  // the allowance twice.
  const introducedToday = progressRows.find((r) => r.date === today)?.new_done_items ?? 0
  const allowance = Math.max(0, quota.newPerDay - introducedToday)

  return {
    unit,
    reviewsDue,
    writingDue,
    newToday: Math.min(allowance, owed),
    unitRemaining: owed,
  }
}
