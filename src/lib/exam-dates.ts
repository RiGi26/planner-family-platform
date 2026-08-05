import { differenceInCalendarDays } from 'date-fns'
import { REVIEW_BUFFER_DAYS } from './goal-engine'

/**
 * The JLPT calendar.
 *
 * The exam is not a date the learner picks — it is held on the first Sunday of
 * July and December (PRD §6.1). A free date input would let someone plan towards
 * a day on which no exam exists, and every number the planner prints after that
 * would be a lie told confidently.
 *
 * `catchUpOptions()` already requires this list to exist: it can only offer to
 * move an exam if it knows which later sittings there are. Building it once
 * serves both screens.
 */

export type Session = 'juli' | 'desember'

export type Sitting = {
  date: Date
  year: number
  session: Session
  daysLeft: number
  /**
   * True when the sitting falls inside the 21-day review buffer, so there is no
   * room left to introduce new material before it. Shown, but not selectable.
   */
  tooSoon: boolean
}

/** July is month index 6, December is 11. */
const JULY = 6
const DECEMBER = 11

/**
 * The first Sunday of the given month, in local time.
 *
 * Built from local components rather than parsed from a string: `new Date(y, m, d)`
 * is midnight *here*, which is what every calendar comparison in the app assumes.
 */
export function firstSunday(year: number, month: 6 | 11): Date {
  const first = new Date(year, month, 1)
  // getDay(): 0 = Sunday. Days to add to reach the first Sunday of the month.
  const offset = (7 - first.getDay()) % 7
  return new Date(year, month, 1 + offset)
}

/**
 * The next `count` sittings from today, soonest first.
 *
 * A sitting that is today still counts — someone opening the app on exam morning
 * has not missed it.
 */
export function upcomingSittings(today: Date, count = 4): Sitting[] {
  const out: Sitting[] = []
  const startYear = today.getFullYear()

  for (let year = startYear; out.length < count; year++) {
    for (const month of [JULY, DECEMBER] as const) {
      if (out.length >= count) break
      const date = firstSunday(year, month)
      const daysLeft = differenceInCalendarDays(date, today)
      if (daysLeft < 0) continue
      out.push({
        date,
        year,
        session: month === JULY ? 'juli' : 'desember',
        daysLeft,
        tooSoon: daysLeft <= REVIEW_BUFFER_DAYS,
      })
    }
  }

  return out
}

/**
 * Reads a `date` column into a local Date.
 *
 * `new Date('2026-12-06')` is parsed as midnight **UTC**, while
 * `differenceInCalendarDays` works in the local calendar. Anywhere west of UTC
 * that combination quietly moves the exam a day earlier, and the error is
 * invisible to anyone testing east of Greenwich.
 */
export function parseExamDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y!, m! - 1, d!)
}

/** The inverse: a `YYYY-MM-DD` string built from local components, never from toISOString(). */
export function toExamDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
