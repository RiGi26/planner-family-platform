import { describe, expect, it } from 'vitest'
import { addDays, daysBetween, lastNDates, localDate, startOfLocalDay } from '../day'

/**
 * The whole reason this module exists is that the obvious implementation is
 * wrong in a window nobody tests in. These cases are that window.
 */
describe('localDate', () => {
  it('keeps a late-evening session on the day it happened, not tomorrow', () => {
    // 21:00 in Jakarta on 5 August is 14:00 UTC the same day — but at 00:30
    // Jakarta time the UTC date is still the 5th, and toISOString would file it
    // under yesterday. Both directions are checked below.
    const evening = new Date('2026-08-05T14:00:00Z')
    expect(localDate(evening, 'Asia/Jakarta')).toBe('2026-08-05')
  })

  it('rolls the day over at local midnight, not at 07:00', () => {
    // 17:30 UTC = 00:30 next day in Jakarta. toISOString().slice(0,10) would
    // answer 2026-08-05; the learner is looking at the 6th.
    const justAfterMidnight = new Date('2026-08-05T17:30:00Z')
    expect(justAfterMidnight.toISOString().slice(0, 10)).toBe('2026-08-05')
    expect(localDate(justAfterMidnight, 'Asia/Jakarta')).toBe('2026-08-06')
  })

  it('gives different days to the same instant in different zones', () => {
    const at = new Date('2026-08-05T17:30:00Z')
    expect(localDate(at, 'Asia/Tokyo')).toBe('2026-08-06')
    expect(localDate(at, 'America/New_York')).toBe('2026-08-05')
  })

  it('falls back rather than throwing on a timezone this runtime does not know', () => {
    // A profile can hold a stale zone. Taking down the session screen over a
    // settings value is not an acceptable failure.
    expect(localDate(new Date('2026-08-05T14:00:00Z'), 'Mars/Olympus')).toBe('2026-08-05')
  })
})

describe('startOfLocalDay', () => {
  it('lands on midnight of the local day', () => {
    const start = startOfLocalDay(new Date('2026-08-05T17:30:00Z'), 'Asia/Jakarta')
    expect(start.getHours()).toBe(0)
    expect(start.getMinutes()).toBe(0)
    expect(start.getDate()).toBe(6)
  })
})

describe('addDays', () => {
  it('walks forward and backward across a month boundary', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01')
    expect(addDays('2026-09-01', -1)).toBe('2026-08-31')
  })

  it('handles a leap day', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2028-02-29', 1)).toBe('2028-03-01')
  })

  it('does not skip or repeat a day across a DST change', () => {
    // 2026-03-08 is a US spring-forward date. Date arithmetic in date-string
    // space has no offsets to trip over — that is the point of doing it there.
    expect(addDays('2026-03-07', 1)).toBe('2026-03-08')
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09')
  })
})

describe('lastNDates', () => {
  it('returns seven days oldest first, ending today', () => {
    const week = lastNDates('2026-08-05', 7)
    expect(week).toHaveLength(7)
    expect(week[0]).toBe('2026-07-30')
    expect(week[6]).toBe('2026-08-05')
  })
})

describe('daysBetween', () => {
  it('counts calendar days, signed', () => {
    expect(daysBetween('2026-08-05', '2026-08-12')).toBe(7)
    expect(daysBetween('2026-08-12', '2026-08-05')).toBe(-7)
    expect(daysBetween('2026-08-05', '2026-08-05')).toBe(0)
  })
})
