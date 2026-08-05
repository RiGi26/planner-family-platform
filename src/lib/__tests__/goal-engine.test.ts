import { describe, expect, it } from 'vitest'
import { addDays } from 'date-fns'
import { REVIEW_BUFFER_DAYS, catchUpOptions, computeQuota, planTracks } from '../goal-engine'

const today = new Date('2026-08-05T00:00:00Z')

describe('computeQuota', () => {
  it('divides remaining material across the days before the buffer', () => {
    // 100 days out, 21 reserved for review, so 79 working days for 790 new cards.
    const q = computeQuota({
      remainingNew: 790,
      dueToday: 0,
      targetExamDate: addDays(today, 100),
      today,
    })
    expect(q.workingDays).toBe(79)
    expect(q.newPerDay).toBe(10)
    expect(q.daysLeft).toBe(100)
  })

  it('rounds up, so the last partial day is still covered', () => {
    const q = computeQuota({
      remainingNew: 791,
      dueToday: 0,
      targetExamDate: addDays(today, 100),
      today,
    })
    expect(q.newPerDay).toBe(11)
  })

  it('stops releasing new cards once inside the review buffer', () => {
    const q = computeQuota({
      remainingNew: 300,
      dueToday: 40,
      targetExamDate: addDays(today, REVIEW_BUFFER_DAYS - 1),
      today,
    })
    expect(q.inBufferPhase).toBe(true)
    expect(q.newPerDay).toBe(0)
    expect(q.totalToday).toBe(40)
  })

  it('treats the buffer boundary itself as buffer phase', () => {
    const q = computeQuota({
      remainingNew: 300,
      dueToday: 0,
      targetExamDate: addDays(today, REVIEW_BUFFER_DAYS),
      today,
    })
    expect(q.inBufferPhase).toBe(true)
    expect(q.newPerDay).toBe(0)
  })

  it('flags an expired exam date instead of producing a negative quota', () => {
    const q = computeQuota({
      remainingNew: 300,
      dueToday: 10,
      targetExamDate: addDays(today, -3),
      today,
    })
    expect(q.expired).toBe(true)
    expect(q.newPerDay).toBe(0)
    expect(q.estimatedMinutes).toBeGreaterThanOrEqual(0)
  })

  it('re-balances upward after missed days, without inventing a backlog debt', () => {
    const examDate = addDays(today, 100)
    const onTrack = computeQuota({ remainingNew: 790, dueToday: 0, targetExamDate: examDate, today })
    // A week later, nothing done: same material, fewer days.
    const behind = computeQuota({
      remainingNew: 790,
      dueToday: 0,
      targetExamDate: examDate,
      today: addDays(today, 7),
    })
    expect(behind.newPerDay).toBeGreaterThan(onTrack.newPerDay)
  })

  it('calls the target unrealistic once the pace doubles', () => {
    const q = computeQuota({
      remainingNew: 790,
      dueToday: 0,
      targetExamDate: addDays(today, 40),
      today,
      baselineNewPerDay: 10,
    })
    // 19 working days for 790 cards is 42/day against a baseline of 10.
    expect(q.newPerDay).toBe(42)
    expect(q.unrealistic).toBe(true)
  })

  it('stays realistic while the pace is merely slipping', () => {
    const q = computeQuota({
      remainingNew: 790,
      dueToday: 0,
      targetExamDate: addDays(today, 90),
      today,
      baselineNewPerDay: 10,
    })
    expect(q.unrealistic).toBe(false)
  })

  it('charges writing cards more minutes than plain reviews', () => {
    const base = { remainingNew: 0, targetExamDate: addDays(today, 100), today }
    const plain = computeQuota({ ...base, dueToday: 20, dueWriting: 0 })
    const writing = computeQuota({ ...base, dueToday: 20, dueWriting: 20 })
    expect(writing.estimatedMinutes).toBeGreaterThan(plain.estimatedMinutes)
  })

  it('asks for nothing when there is nothing left', () => {
    const q = computeQuota({
      remainingNew: 0,
      dueToday: 0,
      targetExamDate: addDays(today, 100),
      today,
    })
    expect(q.newPerDay).toBe(0)
    expect(q.totalToday).toBe(0)
    expect(q.estimatedMinutes).toBe(0)
  })
})

describe('catchUpOptions', () => {
  it('offers keeping the date and moving it as separate, comparable choices', () => {
    const options = catchUpOptions({
      remainingNew: 700,
      overdue: 96,
      targetExamDate: addDays(today, 115),
      today,
      alternativeExamDates: [addDays(today, 334)],
    })
    expect(options.map((o) => o.kind)).toEqual(['spread', 'moveExam'])

    const spread = options[0]!
    const moved = options[1]!
    expect(spread.kind).toBe('spread')
    expect(moved.kind).toBe('moveExam')
    // Moving the exam has to actually lighten the load, or offering it is dishonest.
    expect(moved.newPerDay).toBeLessThan(spread.newPerDay)
  })

  it('ignores alternative dates that are not later than the current one', () => {
    const options = catchUpOptions({
      remainingNew: 700,
      overdue: 96,
      targetExamDate: addDays(today, 115),
      today,
      alternativeExamDates: [addDays(today, 60), addDays(today, 115)],
    })
    expect(options.filter((o) => o.kind === 'moveExam')).toHaveLength(0)
  })
})

describe('planTracks', () => {
  it('reports per-track days and totals', () => {
    const { plans, totalItems, totalDays } = planTracks(
      [
        { track: 'kana', items: 208 },
        { track: 'kosakata', items: 662 },
        { track: 'kanji', items: 79 },
        { track: 'tata bahasa', items: 49 },
      ],
      21,
    )
    expect(totalItems).toBe(998)
    expect(plans[0]).toEqual({ track: 'kana', items: 208, days: 10 })
    expect(totalDays).toBe(plans.reduce((s, p) => s + p.days, 0))
  })
})
