import { describe, expect, it } from 'vitest'
import {
  applyReview,
  isStrong,
  newCardState,
  previewIntervals,
  Rating,
  State,
  toCard,
  type CardStateRow,
} from '../fsrs'
import { ratingFromStrokeErrors } from '../stroke-score'

const now = new Date('2026-08-05T09:00:00Z')

const fresh = (mode: CardStateRow['mode'] = 'recognition') =>
  newCardState({ id: 'card-1', userId: 'user-1', itemId: 'kana-hira-basic-a-3042', mode }, now)

describe('newCardState', () => {
  it('starts a card in the New state, due immediately', () => {
    const row = fresh()
    expect(row.state).toBe(State.New)
    expect(row.reps).toBe(0)
    expect(row.lapses).toBe(0)
    expect(new Date(row.due).getTime()).toBeLessThanOrEqual(now.getTime())
    expect(row.last_review).toBeNull()
  })
})

describe('toCard', () => {
  it('round-trips through the database shape without losing anything', () => {
    const row = fresh()
    const reviewed = applyReview(row, Rating.Good, { clientReviewId: 'c1', now }).card
    const card = toCard(reviewed)

    expect(card.due.toISOString()).toBe(reviewed.due)
    expect(card.stability).toBe(reviewed.stability)
    expect(card.difficulty).toBe(reviewed.difficulty)
    expect(card.reps).toBe(reviewed.reps)
    expect(card.state).toBe(reviewed.state)
    expect(card.last_review?.toISOString()).toBe(reviewed.last_review)
  })

  it('omits last_review rather than passing null, which the library rejects', () => {
    expect('last_review' in toCard(fresh())).toBe(false)
  })
})

describe('applyReview', () => {
  it('advances a new card and schedules it forward', () => {
    const { card, review } = applyReview(fresh(), Rating.Good, { clientReviewId: 'c1', now })

    expect(card.reps).toBe(1)
    expect(card.state).not.toBe(State.New)
    expect(new Date(card.due).getTime()).toBeGreaterThan(now.getTime())
    expect(review.state_before).toBe(State.New)
    expect(review.rating).toBe(Rating.Good)
    expect(review.reviewed_at).toBe(now.toISOString())
  })

  it('carries the client-minted id through unchanged — the idempotency key', () => {
    const { review } = applyReview(fresh(), Rating.Good, { clientReviewId: 'abc-123', now })
    expect(review.client_review_id).toBe('abc-123')
  })

  it('records stroke errors for writing cards and leaves them null elsewhere', () => {
    const writing = applyReview(fresh('writing'), Rating.Hard, {
      clientReviewId: 'c2',
      now,
      strokeErrors: 2,
      durationMs: 8400,
    })
    expect(writing.review.stroke_errors).toBe(2)
    expect(writing.review.duration_ms).toBe(8400)

    const recognition = applyReview(fresh(), Rating.Good, { clientReviewId: 'c3', now })
    expect(recognition.review.stroke_errors).toBeNull()
  })

  it('records hints used in recall, defaulting to none', () => {
    expect(applyReview(fresh('recall'), Rating.Good, { clientReviewId: 'c4', now, hintsUsed: 1 }).review.hints_used).toBe(1)
    expect(applyReview(fresh('recall'), Rating.Good, { clientReviewId: 'c5', now }).review.hints_used).toBe(0)
  })

  it('counts a lapse when a learned card is failed', () => {
    let row = fresh()
    // Push the card into Review with a few good answers spread over time.
    for (let i = 0; i < 4; i++) {
      const at = new Date(new Date(row.due).getTime() + 60_000)
      row = applyReview(row, Rating.Good, { clientReviewId: `g${i}`, now: at }).card
    }
    expect(row.state).toBe(State.Review)

    const failedAt = new Date(new Date(row.due).getTime() + 60_000)
    const failed = applyReview(row, Rating.Again, { clientReviewId: 'again', now: failedAt })
    expect(failed.card.lapses).toBe(1)
    expect(failed.card.state).toBe(State.Relearning)
    expect(failed.review.state_before).toBe(State.Review)
  })

  it('does not mutate the row it was given', () => {
    const row = fresh()
    const snapshot = JSON.stringify(row)
    applyReview(row, Rating.Easy, { clientReviewId: 'c6', now })
    expect(JSON.stringify(row)).toBe(snapshot)
  })
})

describe('previewIntervals', () => {
  it('returns all four intervals so the buttons can show them before committing', () => {
    const intervals = previewIntervals(fresh(), now)
    expect(Object.keys(intervals)).toHaveLength(4)
    expect(intervals[Rating.Again]).toBeLessThanOrEqual(intervals[Rating.Good])
    expect(intervals[Rating.Good]).toBeLessThanOrEqual(intervals[Rating.Easy])
  })

  it('previews without advancing the card', () => {
    const row = fresh()
    const snapshot = JSON.stringify(row)
    previewIntervals(row, now)
    expect(JSON.stringify(row)).toBe(snapshot)
  })
})

describe('writing mode rating', () => {
  it('schedules straight from stroke errors, with no self-assessment step', () => {
    const clean = applyReview(fresh('writing'), ratingFromStrokeErrors(0), {
      clientReviewId: 'w1',
      now,
      strokeErrors: 0,
    })
    const messy = applyReview(fresh('writing'), ratingFromStrokeErrors(3), {
      clientReviewId: 'w2',
      now,
      strokeErrors: 3,
    })
    // A clean write must earn a longer interval than a failed one, or the automatic
    // rating is not doing anything.
    expect(new Date(clean.card.due).getTime()).toBeGreaterThan(new Date(messy.card.due).getTime())
  })
})

describe('isStrong', () => {
  it('is false for a card that has only just been introduced', () => {
    expect(isStrong(fresh())).toBe(false)
    expect(isStrong(applyReview(fresh(), Rating.Good, { clientReviewId: 'c7', now }).card)).toBe(false)
  })

  it('is true once the card is in review with a week-long interval', () => {
    expect(isStrong({ ...fresh(), state: State.Review, scheduled_days: 9 })).toBe(true)
    expect(isStrong({ ...fresh(), state: State.Review, scheduled_days: 3 })).toBe(false)
  })
})
