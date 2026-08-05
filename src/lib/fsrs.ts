import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  Rating,
  State,
  type Card,
  type Grade,
} from 'ts-fsrs'

/**
 * The scheduler. One engine for all four card modes.
 *
 * `card_states` column names mirror this library's `Card` interface exactly, so
 * there is nothing to translate between the two beyond Date <-> ISO string. Ratings
 * and states are stored as smallint because ts-fsrs uses numeric enums, and any
 * string mapping in between would be a layer that can drift.
 */

export type CardMode = 'recognition' | 'recall' | 'writing' | 'listening'

/** A row of public.card_states, as it comes back from Supabase or out of Dexie. */
export type CardStateRow = {
  id: string
  user_id: string
  item_id: string
  mode: CardMode
  due: string
  stability: number
  difficulty: number
  scheduled_days: number
  learning_steps: number
  reps: number
  lapses: number
  state: number
  last_review: string | null
  /** @deprecated Removed in ts-fsrs v6; drop the column at the same time. */
  elapsed_days: number
}

export type ReviewRow = {
  user_id: string
  card_state_id: string
  rating: number
  state_before: number
  reviewed_at: string
  duration_ms: number | null
  stroke_errors: number | null
  hints_used: number
  client_review_id: string
}

export const scheduler = fsrs(generatorParameters({ enable_fuzz: true }))

export { Rating, State }

/** Ratings a user (or the writing scorer) can give. `Manual` is not one of them. */
export type UserRating = Grade

export function toCard(row: CardStateRow): Card {
  return {
    due: new Date(row.due),
    stability: row.stability,
    difficulty: row.difficulty,
    elapsed_days: row.elapsed_days,
    scheduled_days: row.scheduled_days,
    learning_steps: row.learning_steps,
    reps: row.reps,
    lapses: row.lapses,
    state: row.state as State,
    ...(row.last_review ? { last_review: new Date(row.last_review) } : {}),
  }
}

function applyCard(row: CardStateRow, card: Card): CardStateRow {
  return {
    ...row,
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: card.last_review ? card.last_review.toISOString() : null,
  }
}

export function newCardState(
  params: { id: string; userId: string; itemId: string; mode: CardMode },
  now = new Date(),
): CardStateRow {
  const card = createEmptyCard(now)
  return applyCard(
    {
      id: params.id,
      user_id: params.userId,
      item_id: params.itemId,
      mode: params.mode,
      due: now.toISOString(),
      stability: 0,
      difficulty: 0,
      scheduled_days: 0,
      learning_steps: 0,
      reps: 0,
      lapses: 0,
      state: State.New,
      last_review: null,
      elapsed_days: 0,
    },
    card,
  )
}

export type ReviewOutcome = {
  card: CardStateRow
  review: ReviewRow
  /** Days until this card comes back — the number printed on the rating buttons. */
  intervalDays: number
}

/**
 * Applies a rating and returns both the new card state and the log row to queue.
 *
 * `clientReviewId` is minted by the caller *before* the network is involved. That
 * is the whole idempotency story: a retried sync writes the same key and the unique
 * constraint absorbs it, so a flaky connection can never duplicate or lose a review.
 */
export function applyReview(
  row: CardStateRow,
  rating: UserRating,
  opts: {
    clientReviewId: string
    now?: Date
    durationMs?: number
    strokeErrors?: number
    hintsUsed?: number
  },
): ReviewOutcome {
  const now = opts.now ?? new Date()
  const stateBefore = row.state
  const { card } = scheduler.next(toCard(row), now, rating)
  const next = applyCard(row, card)

  return {
    card: next,
    review: {
      user_id: row.user_id,
      card_state_id: row.id,
      rating,
      state_before: stateBefore,
      reviewed_at: now.toISOString(),
      duration_ms: opts.durationMs ?? null,
      stroke_errors: opts.strokeErrors ?? null,
      hints_used: opts.hintsUsed ?? 0,
      client_review_id: opts.clientReviewId,
    },
    intervalDays: card.scheduled_days,
  }
}

/**
 * What each of the four ratings would do, before the user commits to one.
 *
 * `scheduled_days` alone is not enough to label the buttons. A card in learning
 * steps comes back in minutes, and FSRS reports that as **zero days** — so on day
 * one, when almost every card is new, all four buttons would read "0 hr" and the
 * premise of an informed choice collapses. The due date carries the information
 * the day count throws away, so both are returned and the UI picks the unit.
 */
export function previewSchedule(
  row: CardStateRow,
  now = new Date(),
): Record<Grade, { days: number; due: Date }> {
  const preview = scheduler.repeat(toCard(row), now)
  const at = (rating: Grade) => ({
    days: preview[rating].card.scheduled_days,
    due: preview[rating].card.due,
  })
  return {
    [Rating.Again]: at(Rating.Again),
    [Rating.Hard]: at(Rating.Hard),
    [Rating.Good]: at(Rating.Good),
    [Rating.Easy]: at(Rating.Easy),
  }
}

/** Day counts only. Kept for callers that genuinely want days; see the caveat above. */
export function previewIntervals(row: CardStateRow, now = new Date()) {
  const preview = previewSchedule(row, now)
  return {
    [Rating.Again]: preview[Rating.Again].days,
    [Rating.Hard]: preview[Rating.Hard].days,
    [Rating.Good]: preview[Rating.Good].days,
    [Rating.Easy]: preview[Rating.Easy].days,
  } as Record<Grade, number>
}

/** A card counts as "strong" once FSRS has it in review with a real interval. */
export function isStrong(row: CardStateRow): boolean {
  return row.state === State.Review && row.scheduled_days >= 7
}
