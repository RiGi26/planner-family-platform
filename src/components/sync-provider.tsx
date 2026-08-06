'use client'

import { useEffect } from 'react'
import { useSession } from '@/components/auth-provider'
import { clearAll, db, watchForSync } from '@/lib/db'
import { pullCards, pullProgress, pushPending } from '@/lib/study'

/**
 * Owns the lifecycle of the local database: wipe it when the account changes,
 * fill it from the server, and drain it back when the connection allows.
 *
 * Until this existed, `pullCards` had no caller anywhere in the app — Dexie was
 * only ever populated by work done on that same device. The consequence was
 * quiet and total: sign in on a second device and the review queue is empty,
 * because the cards are real but they live on the first phone. Everything the
 * study screens read is local by design, so "local is never filled" means "the
 * app is empty" for anyone who switches device or clears their browser.
 *
 * The three steps are one sequence on purpose. They used to be two independent
 * effects — the account guard here, the pull elsewhere — and React runs child
 * effects before parent effects, so the guard could wipe cards a pull had just
 * written. Ordering by luck is not ordering.
 */

/**
 * The local database is per-origin, not per-user. If account B signs in on a
 * device where account A studied, A's cards, queue and handwriting are all still
 * sitting in IndexedDB — and the sync layer would happily push them under B's
 * session to be rejected row by row by RLS. Wiping on a detected switch keeps one
 * device usable by more than one person, which "general app" now requires.
 */
async function guardLocalData(userId: string) {
  try {
    const last = await db.meta.get('last_user_id')
    if (last && last.value !== userId) {
      await clearAll()
      // delete() closes the connection; reopen so the app keeps working without a
      // reload when the switch happens mid-session.
      await db.open()
    }
    await db.meta.put({ key: 'last_user_id', value: userId })
  } catch {
    // IndexedDB unavailable (private mode, storage pressure) — nothing to guard.
  }
}

/**
 * Push before pull, always.
 *
 * `pullCards` hydrates with `bulkPut`, so a pull that runs first overwrites local
 * card states that have not been uploaded yet — silently discarding reviews the
 * user has already answered. Draining the queue first makes the server the newer
 * copy before we accept it back.
 */
async function syncBoth(userId: string) {
  await pushPending()
  await pullCards(userId)
  await pullProgress(userId)
}

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { user } = useSession()
  const userId = user?.id

  useEffect(() => {
    if (!userId) return
    let cancelled = false

    void (async () => {
      await guardLocalData(userId)
      if (cancelled) return
      try {
        await syncBoth(userId)
      } catch {
        // Offline at startup is the normal case, not a failure: the whole point
        // of the local store is that the session runs without us.
      }
    })()

    return () => {
      cancelled = true
    }
  }, [userId])

  useEffect(() => {
    if (!userId) return
    // Fires on regaining connectivity and on returning to the foreground — the
    // only two moments that change the answer. Not a polling interval.
    return watchForSync(() => {
      void syncBoth(userId).catch(() => {})
    })
  }, [userId])

  return <>{children}</>
}
