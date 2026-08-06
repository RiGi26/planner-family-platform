import type { CardStateRow } from './fsrs'
import type { Item } from './items'
import { kanaGate, groupByItem, type ItemStates } from './curriculum'

/**
 * The Curriculum Path — which tracks are open, and how today's new-card quota
 * is divided between them.
 *
 * The ladder is sequential between levels and parallel within one: kana first,
 * and once its gate opens the three N5 tracks run side by side, the way every
 * textbook interleaves them. Finishing all vocabulary before the first grammar
 * point would mean months of words with nothing to hang them on.
 */

export type TrackKey = 'kana' | 'vocab' | 'kanji' | 'grammar'

export type Track = {
  key: TrackKey
  /** Every item in the track, curriculum order. */
  items: Item[]
}

export type TrackAllotment = { key: TrackKey; count: number; fresh: Item[] }

/**
 * Splits the day's new-item quota across open tracks.
 *
 * Two rules, in order:
 *
 * **Kana finishes first.** By the time the gate opens at 95%, at most a handful
 * of kana remain — they take priority until the foundation is actually complete,
 * because N5 is written in them.
 *
 * **The rest splits proportionally to what remains, but no open track starves.**
 * Proportional alone gives 662-vocab : 79-kanji : 49-grammar ≈ 7:1:0 on a
 * quota of eight — grammar would sit untouched for weeks and then arrive in a
 * lump. So every non-empty track is guaranteed one slot whenever the quota can
 * afford it, and the remainder goes by largest share.
 */
export function splitQuota(
  quota: number,
  remaining: Array<{ key: TrackKey; remaining: number }>,
): Map<TrackKey, number> {
  const out = new Map<TrackKey, number>()
  for (const t of remaining) out.set(t.key, 0)
  if (quota <= 0) return out

  let left = quota

  // Kana first, to completion.
  const kana = remaining.find((t) => t.key === 'kana')
  if (kana && kana.remaining > 0) {
    const take = Math.min(kana.remaining, left)
    out.set('kana', take)
    left -= take
  }

  const rest = remaining.filter((t) => t.key !== 'kana' && t.remaining > 0)
  if (left <= 0 || rest.length === 0) return out

  // Guaranteed slot per track, when the quota can afford one each.
  const guaranteed = left >= rest.length ? 1 : 0
  if (guaranteed) {
    for (const t of rest) {
      out.set(t.key, 1)
      left -= 1
    }
  }

  // Largest-remainder proportional split of what is left.
  const totalRemaining = rest.reduce((s, t) => s + Math.max(0, t.remaining - guaranteed), 0)
  if (left > 0 && totalRemaining > 0) {
    const shares = rest.map((t) => {
      const want = Math.max(0, t.remaining - guaranteed)
      const exact = (want / totalRemaining) * left
      return { key: t.key, want, floor: Math.floor(exact), frac: exact - Math.floor(exact) }
    })
    let used = 0
    for (const s of shares) {
      const grant = Math.min(s.floor, s.want)
      out.set(s.key, (out.get(s.key) ?? 0) + grant)
      used += grant
    }
    let spare = left - used
    for (const s of shares.sort((a, b) => b.frac - a.frac)) {
      if (spare <= 0) break
      const has = out.get(s.key) ?? 0
      const room = s.want - (has - guaranteed)
      if (room > 0) {
        out.set(s.key, has + 1)
        spare -= 1
      }
    }
  }

  // Never hand out more than the caller asked for.
  const granted = [...out.values()].reduce((s, n) => s + n, 0)
  if (granted > quota) {
    // Trim from the largest allocation down — defensive; the arithmetic above
    // should never reach this.
    for (const [key, n] of [...out.entries()].sort((a, b) => b[1] - a[1])) {
      if ([...out.values()].reduce((s, x) => s + x, 0) <= quota) break
      out.set(key, n - 1)
    }
  }

  return out
}

/**
 * The day's introductions: for each open track, the next unstarted items in
 * curriculum order, up to its allotment.
 */
export function introduceAcross(
  tracks: Track[],
  states: ItemStates,
  allotments: Map<TrackKey, number>,
): TrackAllotment[] {
  return tracks.map((track) => {
    const count = allotments.get(track.key) ?? 0
    const fresh =
      count <= 0
        ? []
        : track.items
            .filter((i) => !states.has(i.id))
            .sort((a, b) => a.seq - b.seq)
            .slice(0, count)
    return { key: track.key, count, fresh }
  })
}

export type PathState = {
  /** The kana gate, verbatim — the UI reads ratio and open from here. */
  gate: ReturnType<typeof kanaGate>
  /** Tracks whose items may be introduced today. */
  openTracks: Array<{ key: TrackKey; remaining: number }>
  /** Total unintroduced items across open tracks — what the quota divides. */
  remainingNew: number
}

/**
 * Where the ladder stands, given every card the person has.
 *
 * N5 tracks count toward `remainingNew` only once the gate is open: quota is a
 * promise about work that can actually be assigned today, and counting locked
 * items would quietly inflate the daily pace months early.
 */
export function pathState(
  cards: CardStateRow[],
  n5: { vocab: Item[]; kanji: Item[]; grammar: Item[] } | null,
  now = new Date(),
): PathState {
  const states = groupByItem(cards)
  const gate = kanaGate(states, now)

  const kanaRemaining = gate.remaining.filter((i) => !states.has(i.id)).length
  const openTracks: PathState['openTracks'] = [{ key: 'kana', remaining: kanaRemaining }]

  if (gate.open && n5) {
    for (const key of ['vocab', 'kanji', 'grammar'] as const) {
      openTracks.push({
        key,
        remaining: n5[key].filter((i) => !states.has(i.id)).length,
      })
    }
  }

  return {
    gate,
    openTracks,
    remainingNew: openTracks.reduce((s, t) => s + t.remaining, 0),
  }
}
