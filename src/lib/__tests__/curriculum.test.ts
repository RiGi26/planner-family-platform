import { describe, expect, it } from 'vitest'
import {
  KANA,
  cellStatus,
  countIn,
  dakuten,
  gojuon,
  groupByItem,
  kanaGate,
  modesFor,
  nextToIntroduce,
  remainingNew,
  sheetProgress,
  youon,
} from '../curriculum'
import { State, newCardState, type CardStateRow } from '../fsrs'

const now = new Date('2026-08-05T09:00:00Z')

function stateFor(itemId: string, over: Partial<CardStateRow> = {}): CardStateRow {
  return {
    ...newCardState({ id: `c-${itemId}-${over.mode ?? 'recognition'}`, userId: 'u', itemId, mode: 'recognition' }, now),
    ...over,
  }
}

const strong = (itemId: string) =>
  stateFor(itemId, {
    state: State.Review,
    scheduled_days: 14,
    due: new Date('2026-08-19T09:00:00Z').toISOString(),
  })

describe('sheet layout', () => {
  it('lays out gojūon with the gaps that really exist', () => {
    const rows = gojuon('hiragana')
    expect(rows).toHaveLength(11)

    const byKey = Object.fromEntries(rows.map((r) => [r.key, r]))

    // や行 has a, u, o only.
    expect(byKey['y']!.cells.map((c) => c.kind)).toEqual(['cell', 'empty', 'cell', 'empty', 'cell'])
    // わ行 has a and o.
    expect(byKey['w']!.cells.map((c) => c.kind)).toEqual(['cell', 'empty', 'empty', 'empty', 'cell'])
    // ん stands alone.
    expect(byKey['n-final']!.cells.filter((c) => c.kind === 'cell')).toHaveLength(1)
  })

  it('puts every basic kana on the sheet exactly once', () => {
    const drawn = gojuon('hiragana')
      .flatMap((r) => r.cells)
      .filter((c) => c.kind === 'cell')
    expect(drawn).toHaveLength(46)
    expect(new Set(drawn.map((c) => (c.kind === 'cell' ? c.item.id : ''))).size).toBe(46)
  })

  it('never prints a Japanese character on the axis', () => {
    // The rule the whole screen rests on: position is the question, so nothing on
    // screen may carry the answer. The ん row is the one that catches this — its
    // 行-style name is literally ん, sitting beside the single cell it labels.
    const JP = /[ぁ-ゖァ-ヺ一-龯]/
    for (const script of ['hiragana', 'katakana'] as const) {
      for (const rows of [gojuon(script), dakuten(script), youon(script)]) {
        for (const row of rows) {
          expect(row.axis, `axis for row ${row.key}`).not.toMatch(JP)
          for (const cell of row.cells) {
            if (cell.kind !== 'cell') continue
            expect(row.axis).not.toBe(cell.item.expression)
          }
        }
      }
    }
  })

  it('derives the axis from the reading, so it works for every row shape', () => {
    const byKey = Object.fromEntries(gojuon('hiragana').map((r) => [r.key, r.axis]))
    expect(byKey['a']).toBe('—')
    expect(byKey['k']).toBe('k')
    expect(byKey['n-final']).toBe('n')
    expect(Object.fromEntries(dakuten('hiragana').map((r) => [r.key, r.axis]))['p']).toBe('p')
    // Youon rows are keyed by their base kana but must still show a consonant.
    expect(youon('hiragana').map((r) => r.axis)).toContain('ky')
    expect(youon('hiragana').map((r) => r.axis)).toContain('sh')
  })

  it('keeps katakana on its own sheet with katakana labels', () => {
    const rows = gojuon('katakana')
    expect(rows.every((r) => !/[ぁ-ゖ]/.test(r.label))).toBe(true)
    const first = rows[0]?.cells[0]
    expect(first?.kind === 'cell' ? first.item.expression : null).toBe('ア')
  })

  it('sizes the secondary grids as the dataset says', () => {
    expect(dakuten('hiragana').flatMap((r) => r.cells).filter((c) => c.kind === 'cell')).toHaveLength(25)
    expect(youon('hiragana').flatMap((r) => r.cells).filter((c) => c.kind === 'cell')).toHaveLength(33)
    expect(countIn('katakana', 'basic')).toBe(46)
  })
})

describe('cellStatus', () => {
  it('is empty when nothing has been introduced', () => {
    expect(cellStatus([], now)).toBe('belum')
  })

  it('is due the moment any one mode is due, not only when all are', () => {
    const item = KANA[0]!.id
    const states = [
      strong(item),
      stateFor(item, { mode: 'recall', due: new Date('2026-08-04T09:00:00Z').toISOString() }),
    ]
    expect(cellStatus(states, now)).toBe('due')
  })

  it('only calls a cell strong when every mode is', () => {
    const item = KANA[0]!.id
    const mixed = [
      strong(item),
      stateFor(item, {
        mode: 'writing',
        state: State.Review,
        scheduled_days: 2,
        due: new Date('2026-08-07T09:00:00Z').toISOString(),
      }),
    ]
    expect(cellStatus(mixed, now)).toBe('belajar')
    expect(cellStatus([strong(item)], now)).toBe('kuat')
  })
})

describe('nextToIntroduce', () => {
  it('follows curriculum order and skips what is already started', () => {
    const states = groupByItem([stateFor(KANA[0]!.id), stateFor(KANA[1]!.id)])
    const next = nextToIntroduce(states, 3)
    expect(next.map((i) => i.seq)).toEqual([3, 4, 5])
  })

  it('finishes hiragana before starting katakana', () => {
    const next = nextToIntroduce(new Map(), 104)
    expect(next.every((i) => i.data.script === 'hiragana')).toBe(true)
    expect(nextToIntroduce(new Map(), 105)[104]!.data.script).toBe('katakana')
  })

  it('asks for nothing when the quota is zero', () => {
    expect(nextToIntroduce(new Map(), 0)).toEqual([])
  })

  it('counts every unstarted item as remaining', () => {
    expect(remainingNew(new Map())).toBe(208)
    expect(remainingNew(groupByItem([stateFor(KANA[0]!.id)]))).toBe(207)
  })
})

describe('kanaGate', () => {
  it('stays shut while anything is still weak, and reports what is left', () => {
    const states = groupByItem(KANA.slice(0, 100).map((i) => strong(i.id)))
    const gate = kanaGate(states, now)
    expect(gate.strong).toBe(100)
    expect(gate.total).toBe(208)
    expect(gate.open).toBe(false)
    expect(gate.remaining).toHaveLength(108)
    // It counts rather than refuses: the remaining cells are nameable.
    expect(gate.remaining[0]!.seq).toBe(101)
  })

  it('opens at 95 percent, not at 100', () => {
    const states = groupByItem(KANA.slice(0, 198).map((i) => strong(i.id)))
    const gate = kanaGate(states, now)
    expect(gate.ratio).toBeGreaterThanOrEqual(0.95)
    expect(gate.open).toBe(true)
  })

  it('does not count a started-but-weak card toward the gate', () => {
    const states = groupByItem(KANA.slice(0, 200).map((i) => stateFor(i.id)))
    expect(kanaGate(states, now).open).toBe(false)
  })
})

describe('sheetProgress', () => {
  it('separates started from strong', () => {
    const states = groupByItem([
      ...KANA.filter((i) => i.data.script === 'hiragana' && i.data.group === 'basic')
        .slice(0, 10)
        .map((i) => strong(i.id)),
      ...KANA.filter((i) => i.data.script === 'hiragana' && i.data.group === 'basic')
        .slice(10, 15)
        .map((i) => stateFor(i.id)),
    ])
    const p = sheetProgress('hiragana', 'basic', states, now)
    expect(p).toEqual({ total: 46, strong: 10, started: 15 })
  })
})

describe('modesFor', () => {
  it('adds a writing card only when writing is switched on', () => {
    expect(modesFor(true)).toEqual(['recognition', 'recall', 'writing'])
    expect(modesFor(false)).toEqual(['recognition', 'recall'])
  })
})
