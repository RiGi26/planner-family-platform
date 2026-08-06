'use client'

import { db, hydrateCards, recordKanaCell, recordReview, syncPending } from './db'
import { localDate } from './day'
import type { DailyProgressRow } from './progress'
import {
  applyReview,
  newCardState,
  type CardMode,
  type CardStateRow,
  type UserRating,
} from './fsrs'
import { modesForItem, type Item, type ModePrefs } from './items'
import type { Point } from './stroke-score'

/**
 * Where the pieces meet: curriculum decides *what*, FSRS decides *when*, Dexie holds
 * it while offline, and Supabase is where it ends up.
 *
 * Every write here goes to the local store first and is queued for upload. Nothing
 * in a study session waits on the network — that is the point of the offline layer,
 * and routing one write straight to Supabase would quietly undo it.
 */

function newId(): string {
  // Cards and reviews are created offline, so their ids cannot come from the server.
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

/**
 * Introduces an item: creates the card for each mode that does not have one yet.
 *
 * Cards are created at introduction rather than seeded up front. Seeding all 208 kana
 * as New and due now would make everything due on day one, which is exactly what the
 * daily quota exists to prevent.
 */
export async function ensureCards(
  userId: string,
  item: Item,
  prefs: ModePrefs,
  now = new Date(),
): Promise<CardStateRow[]> {
  const wanted = modesForItem(item, prefs)
  const existing = await db.cards.where('item_id').equals(item.id).toArray()
  const have = new Set(existing.filter((c) => c.user_id === userId).map((c) => c.mode))

  const created = wanted
    .filter((mode) => !have.has(mode))
    .map((mode) => newCardState({ id: newId(), userId, itemId: item.id, mode }, now))

  if (created.length > 0) {
    await hydrateCards(created)
    // New cards are pending upload just like reviewed ones.
    await db.pendingCards.bulkPut(
      created.map((c) => ({ id: c.id, queued_at: new Date().toISOString() })),
    )
  }

  return [...existing.filter((c) => c.user_id === userId), ...created]
}

export async function cardFor(
  userId: string,
  itemId: string,
  mode: CardMode,
): Promise<CardStateRow | undefined> {
  const all = await db.cards.where('item_id').equals(itemId).toArray()
  return all.find((c) => c.user_id === userId && c.mode === mode)
}

export type WritingOutcome = {
  strokes: Point[][]
  strokeErrors: number
  rating: UserRating
  durationMs?: number
}

/**
 * Records a finished writing attempt.
 *
 * Two different things are saved, because they answer different questions. The sheet
 * records *"have I written this?"* and keeps the handwriting; the card records
 * *"do I still remember it?"* and moves the schedule. They are deliberately separate
 * tables, and this is the one place both are written at once.
 *
 * The rating comes from stroke errors alone — never from the shape score, and never
 * from asking the learner. Writing is the one mode that cannot be fooled, and that
 * only holds while nobody is invited to grade themselves.
 */
export async function saveWriting(
  userId: string,
  item: Item,
  outcome: WritingOutcome,
  opts: { writingEnabled?: boolean; countsAsReview?: boolean; now?: Date } = {},
): Promise<{ reviewed: boolean }> {
  const now = opts.now ?? new Date()

  await recordKanaCell({
    user_id: userId,
    item_id: item.id,
    strokes: outcome.strokes,
    written_at: now.toISOString(),
  })

  // Reaching this function at all means writing is on for this item's type: it
  // only runs from a finished canvas.
  const writing = opts.writingEnabled ?? true
  await ensureCards(
    userId,
    item,
    { kanaWriting: writing, kanjiWriting: item.type === 'kanji' && writing, listening: false },
    now,
  )
  const card = await cardFor(userId, item.id, 'writing')
  if (!card) return { reviewed: false }

  // Writing a cell that is *not* due may happen any time — filling the sheet in,
  // or tidying a character up — but it must not touch the schedule. Otherwise the
  // sheet becomes a way to cram, and the scheduler stops meaning anything.
  const isDue = new Date(card.due) <= now
  if (!isDue && !opts.countsAsReview) return { reviewed: false }

  const { card: next, review } = applyReview(card, outcome.rating, {
    clientReviewId: newId(),
    now,
    durationMs: outcome.durationMs,
    strokeErrors: outcome.strokeErrors,
  })

  await recordReview(next, review)
  return { reviewed: true }
}

/** Records a self-rated review for recognition, recall or listening. */
export async function saveReview(
  userId: string,
  itemId: string,
  mode: Exclude<CardMode, 'writing'>,
  rating: UserRating,
  opts: { durationMs?: number; hintsUsed?: number; now?: Date } = {},
): Promise<boolean> {
  const card = await cardFor(userId, itemId, mode)
  if (!card) return false

  const { card: next, review } = applyReview(card, rating, {
    clientReviewId: newId(),
    now: opts.now ?? new Date(),
    durationMs: opts.durationMs,
    hintsUsed: opts.hintsUsed,
  })

  await recordReview(next, review)
  return true
}

/**
 * Adds today's work to the daily record.
 *
 * Bumped once per answered card locally, but pushed as one row per day: the
 * queue is keyed by date, so sixty-two answers collapse into a single upsert.
 * That beats both alternatives — "upsert at the end of the session" loses any
 * session someone walks away from, and "upsert per card" puts sixty-two network
 * writes inside a screen that is designed never to touch the network.
 *
 * Read-modify-write inside one transaction, because two answers a second apart
 * would otherwise both read `n` and both write `n + 1`.
 */
export async function bumpProgress(
  userId: string,
  delta: {
    new?: number
    review?: number
    ms?: number
    quotaTarget?: number
    /** Kana released today. Local-only; see DailyProgressRow.new_done_items. */
    newItems?: number
  },
  opts: { timezone: string; now?: Date },
): Promise<DailyProgressRow> {
  const now = opts.now ?? new Date()
  const date = localDate(now, opts.timezone)

  return db.transaction('rw', db.dailyProgress, db.pendingProgress, async () => {
    const existing = await db.dailyProgress.get(date)
    const ms = (existing?.ms ?? 0) + (delta.ms ?? 0)

    const row: DailyProgressRow = {
      user_id: userId,
      date,
      new_done: (existing?.new_done ?? 0) + (delta.new ?? 0),
      review_done: (existing?.review_done ?? 0) + (delta.review ?? 0),
      ms,
      new_done_items: (existing?.new_done_items ?? 0) + (delta.newItems ?? 0),
      minutes: Math.round(ms / 60_000),
      // The quota is a promise made once at the start of the day; new_done and
      // review_done are the delivery against it. Recomputing it at noon is how
      // "no debt pile" quietly turns into "the target follows you around".
      quota_target: existing?.quota_target ?? delta.quotaTarget ?? 0,
    }

    await db.dailyProgress.put(row)
    await db.pendingProgress.put({ id: date, queued_at: now.toISOString() })
    return row
  })
}

// ---------------------------------------------------------------------------
// moving data between here and the server
// ---------------------------------------------------------------------------

/**
 * The Supabase client is imported lazily, and only by the two functions that talk to
 * the network.
 *
 * Everything above this line is the study logic itself, and it has no business
 * depending on a configured client: it runs offline by design, and a top-level
 * import would make the whole module unusable — including in tests — without
 * environment variables it never uses.
 */
async function client() {
  const { supabase } = await import('./supabase-client')
  return supabase
}

/**
 * Pulls the user's cards into the local store.
 *
 * Everything, not just what is due today: the sheet colours 104 cells by state, and
 * fetching per-screen would put the network back in the middle of a session.
 */
export async function pullCards(userId: string): Promise<number> {
  const sb = await client()
  const { data, error } = await sb.from('card_states').select('*').eq('user_id', userId)
  if (error) throw error
  const rows = (data ?? []) as CardStateRow[]
  await hydrateCards(rows)
  return rows.length
}

/**
 * Pulls the daily record back down.
 *
 * The queue had a push side and no pull side, so the streak strip read zero on
 * any device that had not personally written the rows — a new phone showed a
 * week of empty squares over days the person had actually studied.
 *
 * Only the last few weeks: the strip shows seven days, and the whole history is
 * never the answer to a question about this week.
 */
export async function pullProgress(userId: string): Promise<number> {
  const sb = await client()
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)
  const { data, error } = await sb
    .from('daily_progress')
    .select('user_id, date, new_done, review_done, minutes, quota_target')
    .eq('user_id', userId)
    .gte('date', since)
  if (error) throw error

  const rows = (data ?? []) as Omit<DailyProgressRow, 'ms'>[]
  // Local rows may hold counts that have not been uploaded yet, so the server
  // never overwrites them — and `ms`, which is local-only, survives.
  const local = await db.dailyProgress.toArray()
  const byDate = new Map(local.map((r) => [r.date, r]))
  const merged = rows
    .filter((r) => !byDate.has(r.date))
    .map((r) => ({ ...r, ms: (r.minutes ?? 0) * 60_000 }))

  if (merged.length > 0) await db.dailyProgress.bulkPut(merged)
  return merged.length
}

export async function pushPending() {
  return syncPending((await client()) as never)
}

/** Local-first read for the sheet: falls back to nothing rather than to the network. */
export async function localCards(userId: string): Promise<CardStateRow[]> {
  return db.cards.where('user_id').equals(userId).toArray()
}
