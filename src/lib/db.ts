'use client'

import Dexie, { type EntityTable } from 'dexie'
import type { CardStateRow, ReviewRow } from './fsrs'

/**
 * The offline layer.
 *
 * Reviewing on a train with bad signal is the main use case, not an edge case, and
 * "no review is ever lost to being offline" is one of the four success criteria. So
 * the session never talks to the network: it reads from IndexedDB and writes to a
 * local queue, and syncing is something that happens later, in the background, or
 * not at all today.
 *
 * The queues are keyed by client-minted ids. A retried push writes the same key and
 * the unique constraint absorbs it, so a flaky connection can duplicate nothing.
 */

export type KanaSheetEntry = {
  item_id: string
  user_id: string
  /** Stroke points from the Recall stage. Never from Trace — the sheet holds writing from memory. */
  strokes: unknown
  written_at: string
}

/** Card rows queued for upload, tracked separately from the cards themselves. */
type PendingCard = { id: string; queued_at: string }

type Meta = { key: string; value: string }

class MasumeDB extends Dexie {
  cards!: EntityTable<CardStateRow, 'id'>
  reviewQueue!: EntityTable<ReviewRow, 'client_review_id'>
  pendingCards!: EntityTable<PendingCard, 'id'>
  kanaSheet!: EntityTable<KanaSheetEntry, 'item_id'>
  pendingKana!: EntityTable<PendingCard, 'id'>
  meta!: EntityTable<Meta, 'key'>

  constructor() {
    // Renaming this orphans every existing local database, so it can only be done
    // while no one has data yet. That is true today and will not be again.
    super('masume')
    this.version(1).stores({
      cards: 'id, user_id, item_id, due, mode, [user_id+due]',
      reviewQueue: 'client_review_id, user_id, reviewed_at',
      pendingCards: 'id, queued_at',
      kanaSheet: 'item_id, user_id, written_at',
      pendingKana: 'id, queued_at',
      meta: 'key',
    })
  }
}

export const db = new MasumeDB()

// ---------------------------------------------------------------------------
// reads — everything the session needs, all local
// ---------------------------------------------------------------------------

export async function dueCards(userId: string, at = new Date(), limit = 500) {
  const iso = at.toISOString()
  return db.cards
    .where('[user_id+due]')
    .between([userId, Dexie.minKey], [userId, iso])
    .limit(limit)
    .toArray()
}

export async function countDue(userId: string, at = new Date()) {
  return db.cards
    .where('[user_id+due]')
    .between([userId, Dexie.minKey], [userId, at.toISOString()])
    .count()
}

export async function pendingCount() {
  const [reviews, cards, kana] = await Promise.all([
    db.reviewQueue.count(),
    db.pendingCards.count(),
    db.pendingKana.count(),
  ])
  return { reviews, cards, kana, total: reviews + cards + kana }
}

// ---------------------------------------------------------------------------
// writes — local first, always
// ---------------------------------------------------------------------------

/**
 * Records a review. The card state and the log row are written in one transaction
 * so the queue can never contain a review whose card never moved, or vice versa.
 */
export async function recordReview(card: CardStateRow, review: ReviewRow) {
  await db.transaction('rw', db.cards, db.reviewQueue, db.pendingCards, async () => {
    await db.cards.put(card)
    await db.reviewQueue.put(review)
    await db.pendingCards.put({ id: card.id, queued_at: new Date().toISOString() })
  })
}

export async function recordKanaCell(entry: KanaSheetEntry) {
  await db.transaction('rw', db.kanaSheet, db.pendingKana, async () => {
    await db.kanaSheet.put(entry)
    await db.pendingKana.put({ id: entry.item_id, queued_at: new Date().toISOString() })
  })
}

/** Replaces the local card set after a pull. Pending local work is left untouched. */
export async function hydrateCards(cards: CardStateRow[]) {
  await db.cards.bulkPut(cards)
}

export async function clearAll() {
  await db.delete()
}

// ---------------------------------------------------------------------------
// sync
// ---------------------------------------------------------------------------

export type SyncResult = {
  pushedReviews: number
  pushedCards: number
  pushedKana: number
  ok: boolean
  error?: string
}

type SupabaseLike = {
  from: (table: string) => {
    upsert: (
      values: unknown[],
      options?: { onConflict?: string; ignoreDuplicates?: boolean },
    ) => PromiseLike<{ error: { message: string } | null }>
  }
}

/**
 * Pushes everything queued, then clears only what actually landed.
 *
 * Order matters: reviews reference card_states, so cards go first. If the push
 * fails halfway the queue keeps whatever did not make it and the next attempt
 * re-sends it — which is safe precisely because every row carries a client-minted
 * key the database will deduplicate on.
 */
export async function syncPending(client: SupabaseLike): Promise<SyncResult> {
  const result: SyncResult = { pushedReviews: 0, pushedCards: 0, pushedKana: 0, ok: true }

  try {
    const pendingCardIds = (await db.pendingCards.toArray()).map((p) => p.id)
    if (pendingCardIds.length > 0) {
      const cards = (await db.cards.bulkGet(pendingCardIds)).filter(Boolean) as CardStateRow[]
      if (cards.length > 0) {
        const { error } = await client.from('card_states').upsert(cards, {
          onConflict: 'user_id,item_id,mode',
        })
        if (error) throw new Error(error.message)
        await db.pendingCards.bulkDelete(pendingCardIds)
        result.pushedCards = cards.length
      }
    }

    const reviews = await db.reviewQueue.toArray()
    if (reviews.length > 0) {
      // ignoreDuplicates makes a re-send a no-op rather than an error, which is what
      // turns "retry until it works" into a safe strategy.
      const { error } = await client.from('reviews').upsert(reviews, {
        onConflict: 'user_id,client_review_id',
        ignoreDuplicates: true,
      })
      if (error) throw new Error(error.message)
      await db.reviewQueue.bulkDelete(reviews.map((r) => r.client_review_id))
      result.pushedReviews = reviews.length
    }

    const pendingKanaIds = (await db.pendingKana.toArray()).map((p) => p.id)
    if (pendingKanaIds.length > 0) {
      const entries = (await db.kanaSheet.bulkGet(pendingKanaIds)).filter(
        Boolean,
      ) as KanaSheetEntry[]
      if (entries.length > 0) {
        const { error } = await client.from('kana_sheet').upsert(entries, {
          onConflict: 'user_id,item_id',
        })
        if (error) throw new Error(error.message)
        await db.pendingKana.bulkDelete(pendingKanaIds)
        result.pushedKana = entries.length
      }
    }

    await db.meta.put({ key: 'last_sync', value: new Date().toISOString() })
  } catch (e) {
    result.ok = false
    result.error = e instanceof Error ? e.message : String(e)
  }

  return result
}

/**
 * Syncs when the connection comes back and when the app returns to the foreground.
 *
 * Not a polling interval: there is nothing to poll for. The only two moments that
 * change the answer are regaining connectivity and the user coming back.
 */
export function watchForSync(run: () => void) {
  if (typeof window === 'undefined') return () => {}

  const onOnline = () => run()
  const onVisible = () => {
    if (document.visibilityState === 'visible' && navigator.onLine) run()
  }

  window.addEventListener('online', onOnline)
  document.addEventListener('visibilitychange', onVisible)

  return () => {
    window.removeEventListener('online', onOnline)
    document.removeEventListener('visibilitychange', onVisible)
  }
}
