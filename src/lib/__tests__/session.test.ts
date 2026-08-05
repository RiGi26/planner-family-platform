import { describe, expect, it } from 'vitest'
import { KANA, type KanaItem } from '../curriculum'
import { newCardState, type CardMode, type CardStateRow } from '../fsrs'
import {
  buildQueue,
  currentCard,
  formatInterval,
  hintBudget,
  initSession,
  MAX_CARD_MS,
  reduceSession,
  tally,
  type SessionCard,
  type SessionState,
} from '../session'

const USER = '11111111-1111-1111-1111-111111111111'
const now = new Date('2026-08-05T09:00:00Z')
const nowMs = now.getTime()

const items = new Map<string, KanaItem>(KANA.map((i) => [i.id, i]))
const a = KANA[0]! // あ, seq 1
const i = KANA[1]! // い, seq 2

function card(item: KanaItem, mode: CardMode, dueIso = now.toISOString()): CardStateRow {
  return {
    ...newCardState({ id: `${item.id}-${mode}`, userId: USER, itemId: item.id, mode }, now),
    due: dueIso,
  }
}

function build(due: CardStateRow[], introduced: CardStateRow[] = []) {
  return buildQueue({ due, introduced, items })
}

describe('buildQueue', () => {
  it('puts reviews before new cards, because a review is a debt', () => {
    const review = card(i, 'recognition', '2026-08-04T09:00:00Z')
    const fresh = card(a, 'recognition')
    const built = build([review], [fresh])
    expect(built.queue.map((c) => c.card.id)).toEqual([review.id, fresh.id])
  })

  it('orders reviews by how long they have been waiting', () => {
    const older = card(a, 'recognition', '2026-08-01T09:00:00Z')
    const newer = card(i, 'recognition', '2026-08-04T09:00:00Z')
    expect(build([newer, older]).queue.map((c) => c.card.id)).toEqual([older.id, newer.id])
  })

  it('asks every new recognition before any new recall', () => {
    // Side by side, recall あ would be answered from the card just before it
    // rather than from memory — and then recall measures nothing.
    const fresh = [
      card(a, 'recognition'),
      card(a, 'recall'),
      card(i, 'recognition'),
      card(i, 'recall'),
    ]
    const modes = build([], fresh).queue.map((c) => c.card.mode)
    expect(modes).toEqual(['recognition', 'recognition', 'recall', 'recall'])
  })

  it('keeps writing out of the fast lane but does not lose it', () => {
    const built = build([card(a, 'writing'), card(a, 'recognition')])
    expect(built.queue.map((c) => c.card.mode)).toEqual(['recognition'])
    expect(built.canvas.map((c) => c.card.mode)).toEqual(['writing'])
  })

  it('produces the same queue whatever order the input arrives in', () => {
    const rows = [
      card(a, 'recognition', '2026-08-01T09:00:00Z'),
      card(i, 'recall', '2026-08-02T09:00:00Z'),
      card(i, 'recognition', '2026-08-02T09:00:00Z'),
      card(a, 'recall', '2026-08-01T09:00:00Z'),
    ]
    const forward = build(rows).queue.map((c) => c.card.id)
    const backward = build([...rows].reverse()).queue.map((c) => c.card.id)
    expect(backward).toEqual(forward)
  })

  it('skips a card whose item is gone instead of throwing', () => {
    const orphan = { ...card(a, 'recognition'), item_id: 'kana-does-not-exist' }
    const built = build([orphan])
    expect(built.queue).toHaveLength(0)
    expect(built.skipped).toHaveLength(1)
  })

  it('asks a card once even when it is both due and just introduced', () => {
    const both = card(a, 'recognition')
    expect(build([both], [both]).queue).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------

function session(...cards: SessionCard[]): SessionState {
  return initSession(cards, nowMs)
}
const sc = (item: KanaItem, mode: CardMode, isNew = false): SessionCard => ({
  card: card(item, mode),
  item,
  isNew,
})

describe('reduceSession', () => {
  it('ignores a rating given before the answer was revealed', () => {
    // Rating without looking is a mis-tap, not an answer.
    const s = session(sc(a, 'recognition'))
    const { state, effect } = reduceSession(s, { kind: 'rate', rating: 3, at: nowMs + 1000 })
    expect(effect).toBeUndefined()
    expect(state.index).toBe(0)
  })

  it('records how long the card was open', () => {
    let s = session(sc(a, 'recognition'))
    s = reduceSession(s, { kind: 'reveal', at: nowMs + 2000 }).state
    const { effect } = reduceSession(s, { kind: 'rate', rating: 3, at: nowMs + 5000 })
    expect(effect?.durationMs).toBe(5000)
  })

  it('caps a card someone walked away from', () => {
    // An hour did not go into remembering あ, and letting that number through
    // would poison the estimate the planner makes from observed durations.
    let s = session(sc(a, 'recognition'))
    s = reduceSession(s, { kind: 'reveal', at: nowMs }).state
    const { effect } = reduceSession(s, { kind: 'rate', rating: 3, at: nowMs + 3_600_000 })
    expect(effect?.durationMs).toBe(MAX_CARD_MS)
  })

  it('gives a forgotten card one more turn, and only one', () => {
    let s = session(sc(a, 'recognition'))
    s = reduceSession(s, { kind: 'reveal', at: nowMs }).state
    s = reduceSession(s, { kind: 'rate', rating: 1, at: nowMs + 1000 }).state
    expect(s.queue).toHaveLength(2)
    expect(s.phase).toBe('card')

    // Forgotten again — a bad night still has to end.
    s = reduceSession(s, { kind: 'reveal', at: nowMs }).state
    s = reduceSession(s, { kind: 'rate', rating: 1, at: nowMs + 1000 }).state
    expect(s.queue).toHaveLength(2)
    expect(s.phase).toBe('done')
  })

  it('keeps every answer given before someone quit halfway', () => {
    let s = session(sc(a, 'recognition'), sc(i, 'recognition'), sc(a, 'recall'))
    s = reduceSession(s, { kind: 'reveal', at: nowMs }).state
    s = reduceSession(s, { kind: 'rate', rating: 3, at: nowMs + 1000 }).state
    s = reduceSession(s, { kind: 'reveal', at: nowMs }).state
    s = reduceSession(s, { kind: 'rate', rating: 2, at: nowMs + 1000 }).state

    expect(s.answered).toHaveLength(2)
    expect(s.phase).toBe('card')
    expect(currentCard(s)?.item.id).toBe(a.id)
  })

  it('resets the hint count between cards', () => {
    const youon = KANA.find((k) => [...k.expression].length === 2)!
    let s = session(sc(youon, 'recall'), sc(a, 'recall'))
    s = reduceSession(s, { kind: 'hint' }).state
    expect(s.hintsUsed).toBe(1)
    s = reduceSession(s, { kind: 'reveal', at: nowMs }).state
    s = reduceSession(s, { kind: 'rate', rating: 3, at: nowMs + 1000 }).state
    expect(s.hintsUsed).toBe(0)
  })

  it('carries hints used into the saved answer', () => {
    const youon = KANA.find((k) => [...k.expression].length === 2)!
    let s = session(sc(youon, 'recall'))
    s = reduceSession(s, { kind: 'hint' }).state
    s = reduceSession(s, { kind: 'reveal', at: nowMs }).state
    const { effect } = reduceSession(s, { kind: 'rate', rating: 3, at: nowMs + 1000 })
    expect(effect?.hintsUsed).toBe(1)
  })

  it('finishes when the queue runs out', () => {
    let s = session(sc(a, 'recognition'))
    s = reduceSession(s, { kind: 'reveal', at: nowMs }).state
    s = reduceSession(s, { kind: 'rate', rating: 3, at: nowMs + 1000 }).state
    expect(s.phase).toBe('done')
    expect(currentCard(s)).toBeNull()
  })

  it('starts finished when there is nothing due', () => {
    expect(session().phase).toBe('done')
  })
})

describe('hintBudget', () => {
  it('offers nothing for a single character, because one hint would be the answer', () => {
    expect(hintBudget('あ')).toBe(0)
  })

  it('offers one for youon, where two cells already say it is youon', () => {
    expect(hintBudget('きゃ')).toBe(1)
  })

  it('scales to the multi-character answers Sprint 2 brings', () => {
    expect(hintBudget('たべもの')).toBe(3)
  })
})

describe('formatInterval', () => {
  it('says minutes for a card still in learning steps', () => {
    // This is the case previewIntervals reports as zero days, and the reason the
    // buttons read the due date instead.
    expect(formatInterval(nowMs + 10 * 60_000, nowMs)).toEqual({ n: 10, unit: 'mnt' })
  })

  it('never says zero', () => {
    expect(formatInterval(nowMs, nowMs)).toEqual({ n: 1, unit: 'mnt' })
  })

  it('climbs through hours, days, months and years', () => {
    expect(formatInterval(nowMs + 3 * 3_600_000, nowMs)).toEqual({ n: 3, unit: 'jam' })
    expect(formatInterval(nowMs + 5 * 86_400_000, nowMs)).toEqual({ n: 5, unit: 'hr' })
    expect(formatInterval(nowMs + 90 * 86_400_000, nowMs)).toEqual({ n: 3, unit: 'bln' })
    expect(formatInterval(nowMs + 800 * 86_400_000, nowMs)).toEqual({ n: 2, unit: 'thn' })
  })
})

describe('tally', () => {
  it('separates new from review and counts what was forgotten', () => {
    const counts = tally([
      { itemId: 'x', mode: 'recognition', rating: 3, durationMs: 1000, hintsUsed: 0, wasNew: true },
      { itemId: 'y', mode: 'recall', rating: 1, durationMs: 2000, hintsUsed: 0, wasNew: false },
      { itemId: 'z', mode: 'recall', rating: 4, durationMs: 3000, hintsUsed: 0, wasNew: false },
    ])
    expect(counts).toEqual({ total: 3, baru: 1, ulangan: 2, lupa: 1, ms: 6000 })
  })
})
