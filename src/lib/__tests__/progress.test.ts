import { describe, expect, it } from 'vitest'
import { newCardState, type CardStateRow } from '../fsrs'
import type { Quota } from '../goal-engine'
import {
  dayState,
  mergeProgress,
  overdueBefore,
  shouldStamp,
  weekTicks,
  type DailyProgressRow,
} from '../progress'

const USER = '11111111-1111-1111-1111-111111111111'
const TODAY = '2026-08-05'

function row(date: string, over: Partial<DailyProgressRow> = {}): DailyProgressRow {
  return {
    user_id: USER,
    date,
    new_done: 0,
    review_done: 0,
    minutes: 0,
    quota_target: 20,
    ms: 0,
    ...over,
  }
}

function quota(over: Partial<Quota> = {}): Quota {
  return {
    newPerDay: 10,
    totalToday: 10,
    dueToday: 0,
    daysLeft: 100,
    workingDays: 79,
    estimatedMinutes: 4,
    inBufferPhase: false,
    unrealistic: false,
    expired: false,
    ...over,
  }
}

describe('weekTicks', () => {
  it('fills a square for any work at all, not for meeting the quota', () => {
    // 40 of 62 is not a missed day. Filling on >= quota_target would turn the
    // strip into a verdict and punish exactly the days that keep a habit alive.
    const ticks = weekTicks([row(TODAY, { review_done: 40, quota_target: 62 })], TODAY)
    expect(ticks[6]).toBe(true)
  })

  it('leaves a day with no work unfilled, and says nothing about it', () => {
    const ticks = weekTicks([row(TODAY, { new_done: 0, review_done: 0 })], TODAY)
    expect(ticks[6]).toBe(false)
  })

  it('returns seven, oldest first, with today last', () => {
    const ticks = weekTicks([row('2026-07-30', { new_done: 1 }), row(TODAY, { new_done: 1 })], TODAY)
    expect(ticks).toEqual([true, false, false, false, false, false, true])
  })

  it('treats a missing row as a day with no work', () => {
    expect(weekTicks([], TODAY)).toEqual([false, false, false, false, false, false, false])
  })
})

describe('dayState', () => {
  it('is behind when work has rolled over from an earlier day', () => {
    expect(dayState({ dueRemaining: 12, overdue: 5, quota: quota() })).toBe('tertinggal')
  })

  it('is on track when today is merely unfinished', () => {
    // Someone opening the app at 7am has done nothing yet and is not behind.
    expect(dayState({ dueRemaining: 12, overdue: 0, quota: quota() })).toBe('onTrack')
  })

  it('is done when nothing is left due', () => {
    expect(dayState({ dueRemaining: 0, overdue: 0, quota: quota() })).toBe('selesai')
  })

  it('prefers behind over done when both could apply', () => {
    // Overdue cards outrank an empty due list: the debt is the more useful truth.
    expect(dayState({ dueRemaining: 0, overdue: 3, quota: quota() })).toBe('tertinggal')
  })
})

describe('overdueBefore', () => {
  function card(dueIso: string): CardStateRow {
    return { ...newCardState({ id: dueIso, userId: USER, itemId: 'x', mode: 'recognition' }), due: dueIso }
  }

  it('counts a card that came due yesterday, even if only hours ago', () => {
    // 23:00 Jakarta on the 4th is 16:00Z; nine hours before an 08:00 Jakarta
    // "now", but a different calendar day — and the calendar day is the question.
    expect(overdueBefore([card('2026-08-04T16:00:00Z')], TODAY, 'Asia/Jakarta')).toBe(1)
  })

  it('does not count a card due later today', () => {
    expect(overdueBefore([card('2026-08-05T10:00:00Z')], TODAY, 'Asia/Jakarta')).toBe(0)
  })
})

describe('shouldStamp', () => {
  it('stamps on a day never stamped before', () => {
    expect(shouldStamp(undefined, TODAY)).toBe(true)
    expect(shouldStamp('2026-08-04', TODAY)).toBe(true)
  })

  it('does not stamp twice on the same day', () => {
    expect(shouldStamp(TODAY, TODAY)).toBe(false)
  })

  it('does not replay when the clock moves backwards', () => {
    // Changing the device clock or flying west should not re-fire an animation
    // for a day already closed.
    expect(shouldStamp('2026-08-06', TODAY)).toBe(false)
  })
})

describe('mergeProgress', () => {
  it('lets the local row win, because it may hold counts not yet uploaded', () => {
    const merged = mergeProgress(
      [row(TODAY, { review_done: 3 })],
      [row(TODAY, { review_done: 9 })],
    )
    expect(merged).toHaveLength(1)
    expect(merged[0]!.review_done).toBe(9)
  })

  it('keeps server-only days and sorts by date', () => {
    const merged = mergeProgress([row('2026-08-01'), row('2026-08-03')], [row('2026-08-02')])
    expect(merged.map((r) => r.date)).toEqual(['2026-08-01', '2026-08-02', '2026-08-03'])
  })
})
