/**
 * Calendar days in the learner's own timezone.
 *
 * `daily_progress.date` is a LOCAL date. `toISOString().slice(0, 10)` is the
 * obvious answer and the wrong one: in Asia/Jakarta it rolls over at 07:00, so a
 * session at 9pm lands on TOMORROW's row and the streak shows a gap on a day the
 * person actually studied. The bug is only visible between midnight and 7am WIB —
 * which is to say, never during the hours anyone would test it.
 *
 * Everything here is pure and takes the timezone explicitly, so the failure mode
 * above is a test case rather than a surprise.
 */

const FALLBACK_TIMEZONE = 'Asia/Jakarta'

/**
 * The local calendar day a moment falls on, as `YYYY-MM-DD`.
 *
 * `en-CA` is the shortcut here: it is the one common locale whose numeric date
 * format is already ISO order, so the parts come out correct without walking
 * `formatToParts`.
 */
export function localDate(at: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(at)
  } catch {
    // A profile can hold a timezone this runtime does not know. Throwing here
    // would take down the session screen over a settings value.
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: FALLBACK_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(at)
  }
}

/**
 * Midnight of the local day a moment falls on, as an absolute instant.
 *
 * Used to ask "is this card overdue from a previous day?" — a question about
 * calendar days, not about 24-hour windows.
 */
export function startOfLocalDay(at: Date, timeZone: string): Date {
  const [y, m, d] = localDate(at, timeZone).split('-').map(Number)
  // Build in local runtime time; the caller compares instants, and the runtime's
  // own offset is what the rest of the app already reasons in.
  return new Date(y!, m! - 1, d!, 0, 0, 0, 0)
}

/**
 * Date arithmetic in date-string space.
 *
 * Once a moment has been resolved to a calendar day, stepping through days must
 * not go back through a timezone — that is how a day gets skipped or repeated
 * across a DST boundary. UTC here is not a timezone choice, it is just a
 * calendar with no offsets in it.
 */
export function addDays(isoDate: string, n: number): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  const shifted = new Date(Date.UTC(y!, m! - 1, d! + n))
  return shifted.toISOString().slice(0, 10)
}

/** The last `n` calendar days ending at `today`, oldest first. */
export function lastNDates(today: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => addDays(today, i - (n - 1)))
}

/** Whole days between two calendar dates, `to - from`. */
export function daysBetween(from: string, to: string): number {
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)
  return Math.round(ms / 86_400_000)
}
