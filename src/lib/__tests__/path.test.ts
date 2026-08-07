import { describe, expect, it } from 'vitest'
import { KANA } from '../curriculum'
import { newCardState } from '../fsrs'
import type { Item } from '../items'
import { introduceAcross, pathState, splitQuota, type TrackKey } from '../path'

const now = new Date('2026-08-06T09:00:00Z')

const rem = (key: TrackKey, remaining: number) => ({ key, remaining })

function fakeItems(type: Item['type'], n: number): Item[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `${type}-n5-x${i}`,
    level: 'N5',
    type,
    expression: `x${i}`,
    reading: `x${i}`,
    meanings: { en: ['x'], id: [] },
    seq: i + 1,
    data: {},
  }))
}

describe('splitQuota', () => {
  it('gives kana absolute priority until it is finished', () => {
    const split = splitQuota(6, [rem('kana', 4), rem('vocab', 600), rem('grammar', 40)])
    expect(split.get('kana')).toBe(4)
    // Only what kana left over reaches N5.
    expect((split.get('vocab') ?? 0) + (split.get('grammar') ?? 0)).toBe(2)
  })

  it('never starves a small open track on a real-shaped day', () => {
    // The real N5 proportions: 662 : 79 : 49 on a quota of 8. Pure proportion
    // gives grammar zero for weeks; the guaranteed slot is the whole point.
    const split = splitQuota(8, [
      rem('kana', 0),
      rem('vocab', 662),
      rem('kanji', 79),
      rem('grammar', 49),
    ])
    expect(split.get('vocab')).toBeGreaterThanOrEqual(1)
    expect(split.get('kanji')).toBeGreaterThanOrEqual(1)
    expect(split.get('grammar')).toBeGreaterThanOrEqual(1)
    expect([...split.values()].reduce((s, n) => s + n, 0)).toBe(8)
    // And vocabulary, with 84% of the remaining items, still gets the bulk.
    expect(split.get('vocab')!).toBeGreaterThanOrEqual(5)
  })

  it('hands out exactly the quota, never more, even when tracks nearly empty', () => {
    const split = splitQuota(10, [rem('kana', 0), rem('vocab', 3), rem('kanji', 2)])
    const total = [...split.values()].reduce((s, n) => s + n, 0)
    expect(total).toBeLessThanOrEqual(10)
    expect(split.get('vocab')).toBe(3)
    expect(split.get('kanji')).toBe(2)
  })

  it('splits below the guaranteed threshold without inventing slots', () => {
    // Quota 2, three open tracks: no guarantee possible; two largest shares win.
    const split = splitQuota(2, [rem('vocab', 662), rem('kanji', 79), rem('grammar', 49)])
    expect([...split.values()].reduce((s, n) => s + n, 0)).toBe(2)
  })

  it('returns zeroes for a zero quota', () => {
    const split = splitQuota(0, [rem('kana', 5), rem('vocab', 662)])
    expect([...split.values()].every((n) => n === 0)).toBe(true)
  })
})

describe('introduceAcross', () => {
  it('takes each track in its own curriculum order, skipping started items', () => {
    const vocab = fakeItems('vocab', 10)
    const states = new Map([[vocab[0]!.id, []], [vocab[2]!.id, []]]) as never
    const out = introduceAcross(
      [{ key: 'vocab', items: vocab }],
      states,
      new Map([['vocab', 3]]),
    )
    expect(out[0]!.fresh.map((i) => i.seq)).toEqual([2, 4, 5])
  })
})

describe('pathState', () => {
  const strongCard = (itemId: string) => ({
    ...newCardState({ id: `c-${itemId}`, userId: 'u', itemId, mode: 'recognition' as const }, now),
    state: 2,
    scheduled_days: 14,
    due: new Date('2026-08-20T09:00:00Z').toISOString(),
  })

  it('keeps N5 out of remainingNew while the gate is shut', () => {
    const p = pathState([], null, now)
    expect(p.gate.open).toBe(false)
    expect(p.openTracks.map((t) => t.key)).toEqual(['kana'])
    expect(p.remainingNew).toBe(208)
  })

  it('opens the N5 tracks the moment the gate does', () => {
    const cards = KANA.map((i) => strongCard(i.id))
    const n5 = {
      vocab: fakeItems('vocab', 662),
      kanji: fakeItems('kanji', 79),
      grammar: fakeItems('grammar', 49),
    }
    const p = pathState(cards, n5, now)
    expect(p.gate.open).toBe(true)
    expect(p.openTracks.map((t) => t.key)).toEqual(['kana', 'vocab', 'kanji', 'grammar'])
    expect(p.remainingNew).toBe(662 + 79 + 49)
  })
})
