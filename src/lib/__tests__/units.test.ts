import { describe, expect, it } from 'vitest'
import { State, newCardState, type CardStateRow } from '../fsrs'
import type { Item } from '../items'
import { currentUnit, needsHumanReview, statusOf, unitProgress, unitRemaining, type Unit } from '../units'

const now = new Date('2026-08-06T09:00:00Z')

function item(id: string, type: Item['type'] = 'vocab'): Item {
  return {
    id,
    level: 'N5',
    type,
    expression: id,
    reading: id,
    meanings: ['x'],
    seq: 1,
    data: {},
  }
}

function cards(itemId: string, over: Partial<CardStateRow> = {}): CardStateRow[] {
  return [
    {
      ...newCardState({ id: `${itemId}-r`, userId: 'u', itemId, mode: 'recognition' }, now),
      ...over,
    },
  ]
}

const strong = (itemId: string) =>
  cards(itemId, {
    state: State.Review,
    scheduled_days: 14,
    due: new Date('2026-08-20T09:00:00Z').toISOString(),
  })

function unit(n: number, vocab: string[], reviewed = false): Unit {
  return {
    n,
    title: `Unit ${n}`,
    cando: '…',
    reviewed,
    grammar: [],
    vocab,
    kanji: [],
    dialog: [],
    sentences: [],
  }
}

const items = new Map<string, Item>(
  ['a', 'b', 'c', 'd', 'e'].map((w) => [`vocab-n5-${w}`, item(`vocab-n5-${w}`)]),
)

describe('statusOf', () => {
  it('separates never-met from met-but-weak from strong', () => {
    expect(statusOf([], now)).toBe('belum')
    expect(statusOf(cards('vocab-n5-a'), now)).toBe('belajar')
    expect(statusOf(strong('vocab-n5-a'), now)).toBe('kuat')
  })
})

describe('unitProgress', () => {
  it('counts only the items that exist as data', () => {
    // A unit may name a word the dataset does not carry; the path must not
    // report progress against material nobody can study.
    const u = unit(1, ['a', 'b', 'ghost'])
    const p = unitProgress(u, items, new Map(), now)
    expect(p.total).toBe(2)
  })

  it('passes at 80 percent rather than demanding mastery', () => {
    // Holding a unit shut until every card is week-strong parks a learner
    // behind material they already half-know — a guided path turning into a wall.
    const u = unit(1, ['a', 'b', 'c', 'd', 'e'])
    const byItem = new Map(
      ['a', 'b', 'c', 'd'].map((w) => [`vocab-n5-${w}`, strong(`vocab-n5-${w}`)]),
    )
    const p = unitProgress(u, items, byItem, now)
    expect(p.strong).toBe(4)
    expect(p.passed).toBe(true)
  })

  it('does not pass an empty unit, so the path cannot skip ahead on nothing', () => {
    expect(unitProgress(unit(9, []), items, new Map(), now).passed).toBe(false)
  })
})

describe('currentUnit', () => {
  const units = [unit(1, ['a', 'b']), unit(2, ['c', 'd'])]

  it('starts at the first unit for someone with no cards', () => {
    expect(currentUnit(units, items, new Map(), now).n).toBe(1)
  })

  it('moves on only once the unit before it holds', () => {
    const byItem = new Map([
      ['vocab-n5-a', strong('vocab-n5-a')],
      ['vocab-n5-b', strong('vocab-n5-b')],
    ])
    expect(currentUnit(units, items, byItem, now).n).toBe(2)
  })

  it('is sequential — a later unit finished early does not skip the path', () => {
    const byItem = new Map([
      ['vocab-n5-c', strong('vocab-n5-c')],
      ['vocab-n5-d', strong('vocab-n5-d')],
    ])
    expect(currentUnit(units, items, byItem, now).n).toBe(1)
  })
})

describe('unitRemaining', () => {
  it('returns what has never been introduced, in unit order', () => {
    const u = unit(1, ['a', 'b', 'c'])
    const byItem = new Map([['vocab-n5-b', cards('vocab-n5-b')]])
    expect(unitRemaining(u, items, byItem).map((i) => i.id)).toEqual([
      'vocab-n5-a',
      'vocab-n5-c',
    ])
  })
})

describe('needsHumanReview', () => {
  it('names every unit no native speaker has read', () => {
    expect(needsHumanReview([unit(1, ['a'], true), unit(2, ['b'])])).toEqual([2])
  })
})
