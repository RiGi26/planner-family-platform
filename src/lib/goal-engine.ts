import { differenceInCalendarDays } from 'date-fns'

/**
 * Goal Engine — counts backwards from the exam date to a daily quota.
 *
 * This is the part that makes the app a planner rather than another flashcard
 * deck: it answers "what do I have to do today so that I pass on date X", and it
 * answers honestly. When the numbers stop working it says so instead of quietly
 * inflating the quota.
 */

/** New cards stop being released this many days before the exam, leaving pure review. */
export const REVIEW_BUFFER_DAYS = 21

/**
 * Rough per-card costs, used only to turn a card count into "±N minutes".
 *
 * These are seed values. Once `reviews.duration_ms` has real data behind it,
 * recalibrate with `estimateFromObserved` — a quota that claims 20 minutes and
 * takes 40 is exactly the kind of dishonesty this engine exists to avoid.
 */
export const SECONDS_PER_NEW_CARD = 20
export const SECONDS_PER_REVIEW = 15
export const SECONDS_PER_WRITING = 30

/** Above this multiple of the original pace, the target stops being reachable. */
const UNREALISTIC_MULTIPLE = 2

export type QuotaInput = {
  /** Cards in the level that have never been introduced. */
  remainingNew: number
  /** Cards already scheduled and due today. */
  dueToday: number
  /** Of those due, how many are writing-mode cards (they cost more). */
  dueWriting?: number
  targetExamDate: Date
  today: Date
  /** The quota the user first agreed to, if there was one. Enables the honesty check. */
  baselineNewPerDay?: number
}

export type Quota = {
  /** New cards to release today. */
  newPerDay: number
  /** New + due, i.e. the whole session. */
  totalToday: number
  dueToday: number
  /** Calendar days until the exam. */
  daysLeft: number
  /** Days still available for introducing new material (daysLeft minus the buffer). */
  workingDays: number
  estimatedMinutes: number
  /** True once new cards stop and only review remains. */
  inBufferPhase: boolean
  /** True when the pace needed has drifted far past what the user signed up for. */
  unrealistic: boolean
  /** Set when the exam date has already passed. */
  expired: boolean
}

export function computeQuota(input: QuotaInput): Quota {
  const {
    remainingNew,
    dueToday,
    dueWriting = 0,
    targetExamDate,
    today,
    baselineNewPerDay,
  } = input

  const daysLeft = differenceInCalendarDays(targetExamDate, today)
  const workingDays = daysLeft - REVIEW_BUFFER_DAYS
  const expired = daysLeft < 0
  const inBufferPhase = !expired && workingDays <= 0

  // In the buffer phase — or once the exam is behind us — no new material is
  // released at all. Whatever is left simply does not fit, and pretending
  // otherwise would bury the last weeks of review under fresh cards.
  const newPerDay =
    inBufferPhase || expired || remainingNew <= 0
      ? 0
      : Math.ceil(remainingNew / workingDays)

  const totalToday = newPerDay + dueToday
  const plainDue = Math.max(0, dueToday - dueWriting)

  const seconds =
    newPerDay * SECONDS_PER_NEW_CARD +
    plainDue * SECONDS_PER_REVIEW +
    dueWriting * SECONDS_PER_WRITING

  return {
    newPerDay,
    totalToday,
    dueToday,
    daysLeft,
    workingDays: Math.max(0, workingDays),
    estimatedMinutes: Math.max(0, Math.round(seconds / 60)),
    inBufferPhase,
    unrealistic:
      baselineNewPerDay !== undefined &&
      baselineNewPerDay > 0 &&
      newPerDay > baselineNewPerDay * UNREALISTIC_MULTIPLE,
    expired,
  }
}

/**
 * What the user is offered after missing days. Both options are presented as
 * equally reasonable — moving the exam is not a defeat, and the UI must not
 * frame it as one.
 */
export type CatchUpOption =
  | { kind: 'spread'; overDays: number; newPerDay: number; examDate: Date }
  | { kind: 'moveExam'; examDate: Date; newPerDay: number; daysLeft: number }

export type BacklogInput = {
  remainingNew: number
  /** Cards past their due date, accumulated while the app went unused. */
  overdue: number
  targetExamDate: Date
  today: Date
  /** Later JLPT sittings to offer. First Sunday of July and December. */
  alternativeExamDates?: Date[]
}

export function catchUpOptions(input: BacklogInput): CatchUpOption[] {
  const { remainingNew, overdue, targetExamDate, today, alternativeExamDates = [] } = input
  const options: CatchUpOption[] = []

  // Option 1 — keep the date, absorb the backlog over the coming week rather than
  // dumping all of it into today.
  const spreadDays = 7
  const workingDays = Math.max(1, differenceInCalendarDays(targetExamDate, today) - REVIEW_BUFFER_DAYS)
  options.push({
    kind: 'spread',
    overDays: spreadDays,
    newPerDay: Math.ceil(remainingNew / workingDays) + Math.ceil(overdue / spreadDays),
    examDate: targetExamDate,
  })

  // Option 2 — move the exam, and show what the pace becomes if you do.
  for (const date of alternativeExamDates) {
    if (differenceInCalendarDays(date, targetExamDate) <= 0) continue
    const days = differenceInCalendarDays(date, today)
    const working = Math.max(1, days - REVIEW_BUFFER_DAYS)
    options.push({
      kind: 'moveExam',
      examDate: date,
      newPerDay: Math.ceil(remainingNew / working),
      daysLeft: days,
    })
  }

  return options
}

/**
 * The onboarding breakdown: how many days each track needs at the computed pace,
 * and how much slack is left over. Shown with the arithmetic open, because the
 * number only means something if you can see where it came from.
 */
export type TrackPlan = {
  track: string
  items: number
  days: number
}

export function planTracks(
  tracks: { track: string; items: number }[],
  newPerDay: number,
): { plans: TrackPlan[]; totalItems: number; totalDays: number } {
  const perDay = Math.max(1, newPerDay)
  const plans = tracks.map((t) => ({
    track: t.track,
    items: t.items,
    days: Math.ceil(t.items / perDay),
  }))
  return {
    plans,
    totalItems: tracks.reduce((s, t) => s + t.items, 0),
    totalDays: plans.reduce((s, p) => s + p.days, 0),
  }
}

/** Recalibrates the per-card seconds from observed review durations. */
export function estimateFromObserved(durationsMs: number[]): number {
  if (durationsMs.length === 0) return SECONDS_PER_REVIEW
  const sorted = [...durationsMs].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const median =
    sorted.length % 2 === 0 ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2 : (sorted[mid] ?? 0)
  return median / 1000
}
