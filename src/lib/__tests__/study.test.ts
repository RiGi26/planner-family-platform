import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { clearAll, db, pendingCount } from '../db'
import { KANA } from '../curriculum'
import { State } from '../fsrs'
import { cardFor, ensureCards, saveReview, saveWriting } from '../study'

const USER = '11111111-1111-1111-1111-111111111111'
const now = new Date('2026-08-05T09:00:00Z')
const item = KANA[0]!

const strokes = [
  [
    { x: 25, y: 22 },
    { x: 21, y: 70 },
  ],
]

beforeEach(async () => {
  await clearAll()
  await db.open()
})

describe('ensureCards', () => {
  it('creates one card per mode, and queues them for upload', async () => {
    const cards = await ensureCards(USER, item, true, now)
    expect(cards.map((c) => c.mode).sort()).toEqual(['recall', 'recognition', 'writing'])
    expect(cards.every((c) => c.state === State.New)).toBe(true)
    expect(await pendingCount()).toMatchObject({ cards: 3 })
  })

  it('leaves the writing card out when writing is switched off', async () => {
    const cards = await ensureCards(USER, item, false, now)
    expect(cards.map((c) => c.mode).sort()).toEqual(['recall', 'recognition'])
  })

  it('is idempotent — calling twice does not duplicate a card', async () => {
    await ensureCards(USER, item, true, now)
    const again = await ensureCards(USER, item, true, now)
    expect(again).toHaveLength(3)
    expect(await db.cards.count()).toBe(3)
  })

  it('adds only the missing mode when writing is switched on later', async () => {
    await ensureCards(USER, item, false, now)
    const after = await ensureCards(USER, item, true, now)
    expect(after).toHaveLength(3)
    expect(await db.cards.count()).toBe(3)
  })

  it('keeps one user’s cards out of another’s', async () => {
    await ensureCards(USER, item, true, now)
    await ensureCards('someone-else', item, true, now)
    expect(await db.cards.count()).toBe(6)
    expect((await cardFor(USER, item.id, 'writing'))?.user_id).toBe(USER)
  })
})

describe('saveWriting', () => {
  it('stores the handwriting and moves the schedule when the card is due', async () => {
    const result = await saveWriting(
      USER,
      item,
      { strokes, strokeErrors: 0, rating: 3 },
      { now },
    )

    expect(result.reviewed).toBe(true)
    expect(await db.kanaSheet.get(item.id)).toMatchObject({ user_id: USER })

    const card = (await cardFor(USER, item.id, 'writing'))!
    expect(card.reps).toBe(1)
    expect(new Date(card.due).getTime()).toBeGreaterThan(now.getTime())
  })

  it('records the sheet but leaves the schedule alone when the card is not due', async () => {
    await saveWriting(USER, item, { strokes, strokeErrors: 0, rating: 3 }, { now })
    const after = (await cardFor(USER, item.id, 'writing'))!

    // Anchored to the card's real due time rather than a guessed interval: a new
    // card answered Good goes into learning and comes back in minutes, not days.
    const beforeDue = new Date(new Date(after.due).getTime() - 60_000)
    const second = await saveWriting(
      USER,
      item,
      { strokes, strokeErrors: 0, rating: 3 },
      { now: beforeDue },
    )

    // This is what stops the sheet becoming a way to cram.
    expect(second.reviewed).toBe(false)
    const unchanged = (await cardFor(USER, item.id, 'writing'))!
    expect(unchanged.due).toBe(after.due)
    expect(unchanged.reps).toBe(after.reps)

    // The handwriting is still updated — the sheet always accepts a rewrite.
    expect((await db.kanaSheet.get(item.id))?.written_at).toBe(beforeDue.toISOString())
  })

  it('does count the rewrite once the card has actually come round', async () => {
    await saveWriting(USER, item, { strokes, strokeErrors: 0, rating: 3 }, { now })
    const after = (await cardFor(USER, item.id, 'writing'))!

    const afterDue = new Date(new Date(after.due).getTime() + 60_000)
    const second = await saveWriting(
      USER,
      item,
      { strokes, strokeErrors: 0, rating: 3 },
      { now: afterDue },
    )

    expect(second.reviewed).toBe(true)
    expect((await cardFor(USER, item.id, 'writing'))!.reps).toBe(after.reps + 1)
  })

  it('carries stroke errors into the review log', async () => {
    await saveWriting(USER, item, { strokes, strokeErrors: 2, rating: 2 }, { now })
    const queued = await db.reviewQueue.toArray()
    expect(queued).toHaveLength(1)
    expect(queued[0]).toMatchObject({ stroke_errors: 2, rating: 2 })
  })

  it('schedules a clean write further out than a failed one', async () => {
    await saveWriting(USER, item, { strokes, strokeErrors: 0, rating: 3 }, { now })
    const clean = (await cardFor(USER, item.id, 'writing'))!

    const other = KANA[1]!
    await saveWriting(USER, other, { strokes, strokeErrors: 3, rating: 1 }, { now })
    const messy = (await cardFor(USER, other.id, 'writing'))!

    expect(new Date(clean.due).getTime()).toBeGreaterThan(new Date(messy.due).getTime())
  })

  it('queues the card and the log together, so sync cannot split them', async () => {
    await saveWriting(USER, item, { strokes, strokeErrors: 0, rating: 3 }, { now })
    const pending = await pendingCount()
    expect(pending.reviews).toBe(1)
    expect(pending.kana).toBe(1)
    expect(pending.cards).toBeGreaterThanOrEqual(1)
  })
})

describe('saveReview', () => {
  it('does nothing when the item has never been introduced', async () => {
    expect(await saveReview(USER, item.id, 'recognition', 3, { now })).toBe(false)
    expect(await db.reviewQueue.count()).toBe(0)
  })

  it('moves only the mode it was given', async () => {
    await ensureCards(USER, item, true, now)
    await saveReview(USER, item.id, 'recognition', 3, { now })

    expect((await cardFor(USER, item.id, 'recognition'))!.reps).toBe(1)
    expect((await cardFor(USER, item.id, 'recall'))!.reps).toBe(0)
    expect((await cardFor(USER, item.id, 'writing'))!.reps).toBe(0)
  })

  it('records hints used in recall', async () => {
    await ensureCards(USER, item, true, now)
    await saveReview(USER, item.id, 'recall', 3, { now, hintsUsed: 2 })
    expect((await db.reviewQueue.toArray())[0]).toMatchObject({ hints_used: 2 })
  })
})
