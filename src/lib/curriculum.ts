import kana from '@/data/kana.json'
import { State, type CardStateRow } from './fsrs'

/**
 * The kana curriculum, and the shape of the sheet it is written on.
 *
 * The Kana Sheet is not a list rendered in a grid — the grid *is* the lesson. A
 * learner sees an empty box at row k, column a and has to derive か from its position
 * alone. So the layout has to know which cells exist (や行 has no i or e; わ行 has no
 * i, u or e; ん stands alone) and must never carry the answer into the cell.
 */

export type KanaItem = {
  id: string
  level: string
  type: string
  expression: string
  reading: string
  meanings: string[]
  seq: number
  data: {
    script: 'hiragana' | 'katakana'
    group: 'basic' | 'dakuten' | 'youon'
    row: string
    row_label: string
    col: string
    strokes_key: string
  }
}

export const KANA: KanaItem[] = kana as KanaItem[]

export type Script = 'hiragana' | 'katakana'
export type KanaGroup = 'basic' | 'dakuten' | 'youon'

export const VOWELS = ['a', 'i', 'u', 'e', 'o'] as const
export const YOUON_VOWELS = ['a', 'u', 'o'] as const

/** Row order on the sheet. `n-final` is last and occupies a single cell. */
const BASIC_ROWS = ['a', 'k', 's', 't', 'n', 'h', 'm', 'y', 'r', 'w', 'n-final']
const DAKUTEN_ROWS = ['g', 'z', 'd', 'b', 'p']

export type SheetCell =
  | { kind: 'empty' }
  | { kind: 'cell'; item: KanaItem }

export type SheetRow = {
  key: string
  /**
   * The left-edge axis label: a romaji consonant, never a character.
   *
   * This has to be derived rather than taken from `row_label`, because the ん row's
   * 行-style label *is* ん — printing it beside the one empty cell in that row hands
   * over the exact answer the sheet exists to withhold. Deriving the consonant from
   * the reading keeps every axis label glyph-free by construction.
   */
  axis: string
  /** The 行-style name, for the writing screen header where the row is already open. */
  label: string
  cells: SheetCell[]
}

/** `ka` → `k`, `kya` → `ky`, `a` → `—`, `n` → `n`. */
export function consonantOf(reading: string): string {
  const stripped = reading.replace(/[aiueo]$/, '')
  return stripped === '' ? '—' : stripped
}

function byScriptAndGroup(script: Script, group: KanaGroup) {
  return KANA.filter((i) => i.data.script === script && i.data.group === group)
}

/**
 * Builds a grid with a slot for every column, using `empty` where a cell does not
 * exist. Those gaps are drawn as nothing at all — not as an empty box — because a
 * box would imply there is a character to remember there.
 */
function grid(items: KanaItem[], rowOrder: string[], cols: readonly string[]): SheetRow[] {
  const rows: SheetRow[] = []

  for (const rowKey of rowOrder) {
    const inRow = items.filter((i) => i.data.row === rowKey)
    if (inRow.length === 0) continue

    rows.push({
      key: rowKey,
      axis: consonantOf(inRow[0]!.reading),
      label: inRow[0]!.data.row_label,
      cells: cols.map((col) => {
        const item = inRow.find((i) => i.data.col === col)
        return item ? { kind: 'cell' as const, item } : { kind: 'empty' as const }
      }),
    })
  }

  return rows
}

export function gojuon(script: Script): SheetRow[] {
  return grid(byScriptAndGroup(script, 'basic'), BASIC_ROWS, VOWELS)
}

export function dakuten(script: Script): SheetRow[] {
  return grid(byScriptAndGroup(script, 'dakuten'), DAKUTEN_ROWS, VOWELS)
}

/** Youon rows are keyed by their base kana (き, し, …) rather than a consonant. */
export function youon(script: Script): SheetRow[] {
  const items = byScriptAndGroup(script, 'youon')
  const order = [...new Set(items.map((i) => i.data.row))]
  return grid(items, order, YOUON_VOWELS)
}

export function countIn(script: Script, group: KanaGroup): number {
  return byScriptAndGroup(script, group).length
}

// ---------------------------------------------------------------------------
// progress
// ---------------------------------------------------------------------------

/**
 * How a cell should be drawn.
 *
 * `due` deliberately does not imply anything visible inside the cell. A cell that
 * needs review gets a ring around it; revealing the character to say "review this"
 * would hand over the answer the sheet exists to withhold.
 */
export type CellStatus = 'belum' | 'belajar' | 'due' | 'kuat'

/** A card counts as strong once FSRS has it in review with a week-long interval. */
const STRONG_INTERVAL_DAYS = 7

export function cellStatus(states: CardStateRow[], now = new Date()): CellStatus {
  if (states.length === 0) return 'belum'

  const overdue = states.some((s) => new Date(s.due) <= now)
  if (overdue) return 'due'

  const allStrong = states.every(
    (s) => s.state === State.Review && s.scheduled_days >= STRONG_INTERVAL_DAYS,
  )
  return allStrong ? 'kuat' : 'belajar'
}

export type ItemStates = Map<string, CardStateRow[]>

export function groupByItem(states: CardStateRow[]): ItemStates {
  const map: ItemStates = new Map()
  for (const s of states) {
    const list = map.get(s.item_id)
    if (list) list.push(s)
    else map.set(s.item_id, [s])
  }
  return map
}

export type SheetProgress = {
  total: number
  strong: number
  /** Anything with at least one card, strong or not. */
  started: number
}

export function sheetProgress(
  script: Script,
  group: KanaGroup,
  states: ItemStates,
  now = new Date(),
): SheetProgress {
  const items = byScriptAndGroup(script, group)
  let strong = 0
  let started = 0

  for (const item of items) {
    const s = states.get(item.id)
    if (!s || s.length === 0) continue
    started++
    if (cellStatus(s, now) === 'kuat') strong++
  }

  return { total: items.length, strong, started }
}

// ---------------------------------------------------------------------------
// introducing new material
// ---------------------------------------------------------------------------

/**
 * The next items to introduce, in curriculum order.
 *
 * Cards are created when they are introduced rather than seeded up front. Seeding
 * all 208 as `New` and due now would make everything due on day one, which is
 * precisely what the daily quota exists to prevent.
 */
export function nextToIntroduce(states: ItemStates, count: number, level = 'KANA'): KanaItem[] {
  if (count <= 0) return []
  return KANA.filter((i) => i.level === level && !states.has(i.id))
    .sort((a, b) => a.seq - b.seq)
    .slice(0, count)
}

export function remainingNew(states: ItemStates, level = 'KANA'): number {
  return KANA.filter((i) => i.level === level && !states.has(i.id)).length
}

/**
 * The gate onto N5.
 *
 * Kana has to be solid before N5 vocabulary starts, because N5 words are written in
 * kana — opening it early means memorising two things at once, which is where people
 * give up in week three.
 */
export const KANA_GATE_RATIO = 0.95

export type Gate = {
  strong: number
  total: number
  ratio: number
  open: boolean
  /** Items still short of strong, in curriculum order — shown as cells, not counted at. */
  remaining: KanaItem[]
}

export function kanaGate(states: ItemStates, now = new Date()): Gate {
  const items = KANA.filter((i) => i.level === 'KANA')
  const remaining: KanaItem[] = []
  let strong = 0

  for (const item of items) {
    const s = states.get(item.id)
    if (s && s.length > 0 && cellStatus(s, now) === 'kuat') strong++
    else remaining.push(item)
  }

  const ratio = items.length === 0 ? 0 : strong / items.length
  return { strong, total: items.length, ratio, open: ratio >= KANA_GATE_RATIO, remaining }
}

/** Which card modes a kana item should have, given the user's writing preference. */
export function modesFor(writingEnabled: boolean): CardStateRow['mode'][] {
  // Listening is Sprint 2 — it needs the vocabulary dataset and a voice check.
  return writingEnabled ? ['recognition', 'recall', 'writing'] : ['recognition', 'recall']
}
