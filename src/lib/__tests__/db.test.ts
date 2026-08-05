import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearAll,
  countDue,
  dueCards,
  hydrateCards,
  pendingCount,
  recordKanaCell,
  recordReview,
  syncPending,
  db,
} from '../db'
import { applyReview, newCardState, Rating, type CardStateRow } from '../fsrs'

const USER = '11111111-1111-1111-1111-111111111111'
const now = new Date('2026-08-05T09:00:00Z')

function card(id: string, itemId: string, due = now): CardStateRow {
  return { ...newCardState({ id, userId: USER, itemId, mode: 'recognition' }, now), due: due.toISOString() }
}

/**
 * Stands in for the Supabase client. Records every upsert so the test can assert on
 * what actually crossed the wire, and can be told to fail on demand.
 */
function fakeClient() {
  const calls: { table: string; rows: unknown[]; options?: Record<string, unknown> }[] = []
  let failWith: string | null = null

  return {
    calls,
    failNext: (message: string) => {
      failWith = message
    },
    client: {
      from: (table: string) => ({
        upsert: (rows: unknown[], options?: Record<string, unknown>) => {
          if (failWith) {
            const message = failWith
            failWith = null
            return Promise.resolve({ error: { message } })
          }
          calls.push({ table, rows, options })
          return Promise.resolve({ error: null })
        },
      }),
    },
  }
}

beforeEach(async () => {
  await clearAll()
  await db.open()
})

describe('local reads', () => {
  it('returns only cards that are actually due, for the right user', async () => {
    await hydrateCards([
      card('a', 'kana-1', new Date('2026-08-04T00:00:00Z')),
      card('b', 'kana-2', new Date('2026-08-05T08:00:00Z')),
      card('c', 'kana-3', new Date('2026-08-06T00:00:00Z')),
      { ...card('d', 'kana-4', new Date('2026-08-01T00:00:00Z')), user_id: 'someone-else' },
    ])

    const due = await dueCards(USER, now)
    expect(due.map((c) => c.id).sort()).toEqual(['a', 'b'])
    expect(await countDue(USER, now)).toBe(2)
  })
})

describe('recordReview', () => {
  it('moves the card and queues the log together', async () => {
    await hydrateCards([card('a', 'kana-1')])
    const stored = (await db.cards.get('a'))!
    const { card: next, review } = applyReview(stored, Rating.Good, {
      clientReviewId: 'rev-1',
      now,
    })

    await recordReview(next, review)

    const after = (await db.cards.get('a'))!
    expect(after.reps).toBe(1)
    expect(new Date(after.due).getTime()).toBeGreaterThan(now.getTime())
    expect(await pendingCount()).toMatchObject({ reviews: 1, cards: 1, total: 2 })
  })

  it('leaves the card due-free for the rest of the session', async () => {
    await hydrateCards([card('a', 'kana-1')])
    const stored = (await db.cards.get('a'))!
    const { card: next, review } = applyReview(stored, Rating.Good, { clientReviewId: 'r', now })
    await recordReview(next, review)

    expect(await countDue(USER, now)).toBe(0)
  })
})

describe('syncPending', () => {
  it('pushes cards before reviews, since reviews reference them', async () => {
    await hydrateCards([card('a', 'kana-1')])
    const stored = (await db.cards.get('a'))!
    const { card: next, review } = applyReview(stored, Rating.Good, { clientReviewId: 'r1', now })
    await recordReview(next, review)

    const { client, calls } = fakeClient()
    const result = await syncPending(client)

    expect(result.ok).toBe(true)
    expect(calls.map((c) => c.table)).toEqual(['card_states', 'reviews'])
    expect(result).toMatchObject({ pushedCards: 1, pushedReviews: 1 })
    expect(await pendingCount()).toMatchObject({ total: 0 })
  })

  it('deduplicates on the client-minted key rather than trusting the network', async () => {
    await hydrateCards([card('a', 'kana-1')])
    const stored = (await db.cards.get('a'))!
    const { card: next, review } = applyReview(stored, Rating.Good, { clientReviewId: 'r1', now })
    await recordReview(next, review)

    const { client, calls } = fakeClient()
    await syncPending(client)

    const reviewCall = calls.find((c) => c.table === 'reviews')!
    expect(reviewCall.options).toMatchObject({
      onConflict: 'user_id,client_review_id',
      ignoreDuplicates: true,
    })
  })

  it('keeps the queue when the push fails, so nothing is lost', async () => {
    await hydrateCards([card('a', 'kana-1')])
    const stored = (await db.cards.get('a'))!
    const { card: next, review } = applyReview(stored, Rating.Good, { clientReviewId: 'r1', now })
    await recordReview(next, review)

    const fake = fakeClient()
    fake.failNext('Server tidak terjangkau')

    const failed = await syncPending(fake.client)
    expect(failed.ok).toBe(false)
    expect(failed.error).toContain('Server tidak terjangkau')
    // The work is still queued — this is the whole point.
    expect(await pendingCount()).toMatchObject({ total: 2 })

    // And a later retry lands it, with no duplication and no loss.
    const retried = await syncPending(fake.client)
    expect(retried.ok).toBe(true)
    expect(retried).toMatchObject({ pushedCards: 1, pushedReviews: 1 })
    expect(await pendingCount()).toMatchObject({ total: 0 })
  })

  it('is a no-op when nothing is queued, rather than an empty write', async () => {
    const { client, calls } = fakeClient()
    const result = await syncPending(client)
    expect(result.ok).toBe(true)
    expect(calls).toHaveLength(0)
  })

  it('does not re-send work that already landed', async () => {
    await hydrateCards([card('a', 'kana-1')])
    const stored = (await db.cards.get('a'))!
    const { card: next, review } = applyReview(stored, Rating.Good, { clientReviewId: 'r1', now })
    await recordReview(next, review)

    const { client, calls } = fakeClient()
    await syncPending(client)
    await syncPending(client)

    expect(calls.filter((c) => c.table === 'reviews')).toHaveLength(1)
  })

  it('survives an offline session of many reviews and pushes them all at once', async () => {
    const cards = Array.from({ length: 20 }, (_, i) => card(`c${i}`, `kana-${i}`))
    await hydrateCards(cards)

    for (let i = 0; i < 20; i++) {
      const stored = (await db.cards.get(`c${i}`))!
      const { card: next, review } = applyReview(stored, Rating.Good, {
        clientReviewId: `rev-${i}`,
        now,
      })
      await recordReview(next, review)
    }

    expect(await pendingCount()).toMatchObject({ reviews: 20, cards: 20 })

    const { client, calls } = fakeClient()
    const result = await syncPending(client)

    expect(result).toMatchObject({ pushedReviews: 20, pushedCards: 20, ok: true })
    const sentReviews = calls.find((c) => c.table === 'reviews')!.rows as { client_review_id: string }[]
    expect(new Set(sentReviews.map((r) => r.client_review_id)).size).toBe(20)
    expect(await pendingCount()).toMatchObject({ total: 0 })
  })

  it('queues handwriting alongside reviews', async () => {
    await recordKanaCell({
      item_id: 'kana-hira-basic-a-3042',
      user_id: USER,
      strokes: [[{ x: 1, y: 2 }]],
      written_at: now.toISOString(),
    })
    expect(await pendingCount()).toMatchObject({ kana: 1 })

    const { client, calls } = fakeClient()
    const result = await syncPending(client)
    expect(result.pushedKana).toBe(1)
    expect(calls.find((c) => c.table === 'kana_sheet')?.options).toMatchObject({
      onConflict: 'user_id,item_id',
    })
  })
})
