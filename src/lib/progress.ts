import type { CardStateRow } from './fsrs'
import type { Quota } from './goal-engine'
import { lastNDates, localDate } from './day'

/**
 * Reading the daily record: the streak strip, and which of the three faces
 * Hari Ini should wear.
 *
 * Pure on purpose — the screen supplies rows, this decides what they mean.
 */

export type DailyProgressRow = {
  user_id: string
  /** Local calendar date, `YYYY-MM-DD`. */
  date: string
  new_done: number
  review_done: number
  minutes: number
  quota_target: number
  /**
   * Local-only millisecond accumulator. Rounding each card to whole minutes
   * gives zero for every card, so the fraction is carried here and only
   * surfaces as `minutes`. Stripped before upload — the server has no column.
   */
  ms: number
  /**
   * Items introduced today, local-only, and deliberately not the same thing as
   * `new_done`: that counts answered cards, this counts kana released. One item
   * becomes two cards, and the session needs to know how much of the day's
   * allowance it has already handed out — a number that has to survive a reload,
   * which a component ref does not. Stripped before upload with `ms`.
   */
  new_done_items?: number
}

/**
 * Seven squares, oldest first, index 6 = today.
 *
 * A square fills when anything was done at all, not when the quota was met.
 * The `Ticks` component says it plainly: "a missed day is simply an unfilled
 * square, and it is never commented on" — and a day where someone did 40 of 62
 * is not a missed day. Filling on `> 0` makes the strip honest about *showing
 * up*, which is the success criterion the PRD actually states (≥5 days a week).
 *
 * The rejected alternative was `>= quota_target`: it turns the strip into a
 * verdict, and it would punish exactly the days that keep a habit alive.
 */
export function weekTicks(rows: DailyProgressRow[], today: string): boolean[] {
  const byDate = new Map(rows.map((r) => [r.date, r]))
  return lastNDates(today, 7).map((date) => {
    const row = byDate.get(date)
    return Boolean(row && row.new_done + row.review_done > 0)
  })
}

export type DayState = 'selesai' | 'onTrack' | 'tertinggal'

/**
 * Which face Hari Ini wears.
 *
 * `tertinggal` means work has rolled over from an earlier day — not merely that
 * today is unfinished. Someone opening the app at 7am has done nothing yet and
 * is not behind. The design rule follows from this: behind is drawn in oker,
 * never shu, so falling behind never reads as an error.
 *
 * `selesai` means the work that existed got finished — NOT that nothing happens
 * to be due this second. The distinction is the difference between a reward and
 * a lie: an account that has just onboarded has no cards yet, so "nothing due"
 * is true of it, and the first screen it ever showed stamped 済 over a day with
 * no work in it and hid the only button that could start one. New material that
 * has not been introduced yet is work, and `newPerDay` is where it lives.
 */
export function dayState(input: {
  dueRemaining: number
  overdue: number
  quota: Quota
  /** Cards answered today. Distinguishes "finished" from "never started". */
  doneToday: number
}): DayState {
  if (input.overdue > 0) return 'tertinggal'

  // Nothing due and nothing left to release: a genuinely empty day, which the
  // review buffer produces on purpose near the exam.
  if (input.dueRemaining === 0 && input.quota.newPerDay === 0) return 'selesai'

  // Cleared what was asked, having actually been asked something.
  if (input.dueRemaining === 0 && input.doneToday > 0) return 'selesai'

  return 'onTrack'
}

/**
 * Cards that came due on an earlier calendar day and are still waiting.
 *
 * Counted in calendar days rather than elapsed hours: a card due at 11pm
 * yesterday is a card from yesterday, even when it is only nine hours old.
 */
export function overdueBefore(cards: CardStateRow[], today: string, timeZone: string): number {
  return cards.filter((c) => localDate(new Date(c.due), timeZone) < today).length
}

/**
 * The day-closing stamp fires once per day, and only forwards.
 *
 * Without the second half, changing the device clock or crossing a timezone
 * backwards would replay the animation on a day already stamped.
 */
export function shouldStamp(lastStamped: string | undefined, today: string): boolean {
  if (!lastStamped) return true
  return lastStamped < today
}

/**
 * Local rows win.
 *
 * The local copy may hold counts that have not been uploaded yet, so treating
 * the server as authoritative would roll back work the person just did.
 */
export function mergeProgress(
  server: DailyProgressRow[],
  local: DailyProgressRow[],
): DailyProgressRow[] {
  const byDate = new Map(server.map((r) => [r.date, r]))
  for (const row of local) byDate.set(row.date, row)
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}
