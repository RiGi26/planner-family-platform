import { describe, expect, it } from 'vitest'
import { dayPlan } from '../day-plan'
import { State, newCardState, type CardStateRow } from '../fsrs'
import type { Item } from '../items'
import type { DailyProgressRow } from '../progress'
import type { Unit } from '../units'

/**
 * The regression this file exists for: Jalur promised "Lanjut Unit 0" on a day
 * whose new-material allowance had already been spent, and the session it opened
 * contained nothing from Unit 0. The button and the session now read the same
 * plan — these tests are that agreement, written down.
 */

const now = new Date('2026-08-06T09:00:00Z')
const today = '2026-08-06'
const goal = { target_exam_date: '2026-12-06', baseline_new_per_day: 5 }

function item(id: string): Item {
  return { id, level: 'N5', type: 'vocab', expression: id, reading: id, meanings: { en: ['x'], id: [] }, seq: 1, data: {} }
}

const WORDS = ['a', 'b', 'c', 'd', 'e', 'f']
const items = new Map<string, Item>(WORDS.map((w) => [`vocab-n5-${w}`, item(`vocab-n5-${w}`)]))

function unit(n: number, vocab: string[]): Unit {
  return {
    n,
    title: `Unit ${n}`,
    cando: '…',
    reviewed: false,
    grammar: [],
    vocab,
    kanji: [],
    dialog: [],
    sentences: [],
  }
}

// A unit names its words by spelling; unitItemIds turns each into `vocab-n5-<word>`.
const units = [unit(0, ['a', 'b', 'c']), unit(1, ['d'])]

function due(itemId: string, mode: CardStateRow['mode'] = 'recognition'): CardStateRow {
  return {
    ...newCardState({ id: `${itemId}-${mode}`, userId: 'u', itemId, mode }, now),
    state: State.Review,
    scheduled_days: 3,
    due: new Date('2026-08-05T09:00:00Z').toISOString(),
  }
}

function progress(over: Partial<DailyProgressRow> = {}): DailyProgressRow[] {
  return [
    {
      date: today,
      user_id: 'u',
      new_done: 0,
      review_done: 0,
      minutes: 0,
      ms: 0,
      quota_target: 0,
      ...over,
    },
  ]
}

describe('dayPlan', () => {
  it('gives a total beginner the unit and no reviews', () => {
    const plan = dayPlan({ cards: [], progressRows: [], goal, units, items, today, now })

    expect(plan.unit?.n).toBe(0)
    expect(plan.reviewsDue).toBe(0)
    expect(plan.newToday).toBeGreaterThan(0)
    expect(plan.unitRemaining).toBe(3)
  })

  it('reports zero new material once the day’s allowance is spent — the button must not promise a unit', () => {
    const spent = dayPlan({
      cards: [due('vocab-n5-a')],
      // new_done_items is the count that outlives the component; a big number
      // here is the "already had today's new cards" case.
      progressRows: progress({ new_done_items: 99 }),
      goal,
      units,
      items,
      today,
      now,
    })

    expect(spent.newToday).toBe(0)
    // The unit still owes material — it just does not move TODAY. That
    // distinction is what the CTA copy hangs on.
    expect(spent.unitRemaining).toBeGreaterThan(0)
    expect(spent.reviewsDue).toBe(1)
  })

  it('counts writing separately from the fast lane', () => {
    const plan = dayPlan({
      cards: [due('vocab-n5-a'), due('vocab-n5-b', 'writing')],
      progressRows: progress(),
      goal,
      units,
      items,
      today,
      now,
    })

    expect(plan.reviewsDue).toBe(1)
    expect(plan.writingDue).toBe(1)
  })

  it('never hands out more new items than the unit still owes', () => {
    const plan = dayPlan({ cards: [], progressRows: [], goal, units, items, today, now })
    expect(plan.newToday).toBeLessThanOrEqual(plan.unitRemaining)
  })
})
