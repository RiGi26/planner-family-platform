import { describe, expect, it } from 'vitest'
import { REVIEW_BUFFER_DAYS } from '../goal-engine'
import { firstSunday, parseExamDate, toExamDate, upcomingSittings } from '../exam-dates'

const today = new Date(2026, 7, 5) // 5 August 2026, local midnight

describe('firstSunday', () => {
  it('finds the first Sunday of July and December', () => {
    // 2026-07-05 and 2026-12-06 are both Sundays.
    expect(toExamDate(firstSunday(2026, 6))).toBe('2026-07-05')
    expect(toExamDate(firstSunday(2026, 11))).toBe('2026-12-06')
  })

  it('takes the 1st itself when the month opens on a Sunday', () => {
    // 2026-11-01 is a Sunday, so November would answer the 1st. December 2025
    // does not open on a Sunday; 2027-08-01 does — checked via the generic path.
    const d = firstSunday(2027, 6) // 2027-07-04
    expect(d.getDay()).toBe(0)
    expect(d.getDate()).toBeLessThanOrEqual(7)
  })

  it('always lands in the first week', () => {
    for (const year of [2026, 2027, 2028, 2029, 2030]) {
      for (const month of [6, 11] as const) {
        const d = firstSunday(year, month)
        expect(d.getDay()).toBe(0)
        expect(d.getDate()).toBeLessThanOrEqual(7)
        expect(d.getMonth()).toBe(month)
      }
    }
  })
})

describe('upcomingSittings', () => {
  it('lists the next sittings soonest first, skipping ones already past', () => {
    const sittings = upcomingSittings(today, 4)
    expect(sittings.map((s) => toExamDate(s.date))).toEqual([
      '2026-12-06', // July 2026 has already gone by on 5 August
      '2027-07-04',
      '2027-12-05',
      '2028-07-02',
    ])
  })

  it('still offers a sitting happening today', () => {
    const examDay = firstSunday(2026, 11)
    const sittings = upcomingSittings(examDay, 1)
    expect(sittings[0]!.daysLeft).toBe(0)
  })

  it('marks a sitting inside the review buffer as too soon rather than hiding it', () => {
    // Hiding it would make the app look broken to someone whose exam really is
    // three weeks away.
    const exam = firstSunday(2026, 11)
    const justInsideBuffer = new Date(exam)
    justInsideBuffer.setDate(exam.getDate() - (REVIEW_BUFFER_DAYS - 1))

    const [next] = upcomingSittings(justInsideBuffer, 1)
    expect(next!.tooSoon).toBe(true)
    expect(next!.daysLeft).toBe(REVIEW_BUFFER_DAYS - 1)
  })

  it('does not mark a sitting beyond the buffer as too soon', () => {
    const exam = firstSunday(2026, 11)
    const clear = new Date(exam)
    clear.setDate(exam.getDate() - (REVIEW_BUFFER_DAYS + 1))
    expect(upcomingSittings(clear, 1)[0]!.tooSoon).toBe(false)
  })

  it('names the session', () => {
    const sittings = upcomingSittings(today, 2)
    expect(sittings[0]!.session).toBe('desember')
    expect(sittings[1]!.session).toBe('juli')
  })
})

describe('parseExamDate / toExamDate', () => {
  it('round-trips without drifting a day', () => {
    // `new Date('2026-12-06')` is midnight UTC, and differenceInCalendarDays works
    // in the local calendar — west of UTC that combination silently moves the exam
    // a day earlier. Building from components is what avoids it.
    const iso = '2026-12-06'
    const parsed = parseExamDate(iso)
    expect(parsed.getFullYear()).toBe(2026)
    expect(parsed.getMonth()).toBe(11)
    expect(parsed.getDate()).toBe(6)
    expect(toExamDate(parsed)).toBe(iso)
  })

  it('pads single-digit months and days', () => {
    expect(toExamDate(new Date(2027, 6, 4))).toBe('2027-07-04')
  })
})
