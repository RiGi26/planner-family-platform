import kana from '@/data/kana.json'
import type { CardMode } from './fsrs'

/**
 * The generic item — the one shape every dataset file shares.
 *
 * kana.json has carried this shape since Sprint 1, and the N5 files are built to
 * it by scripts/fetch-jlpt.mjs. Whatever is specific to a type (a kana's row and
 * column, a kanji's readings, a grammar point's formation) lives under `data`, so
 * the engine — queue, scheduler, sync — never needs to know which file an item
 * came from. Adding N4 is adding rows, not code.
 */

export type ItemType = 'kana' | 'vocab' | 'kanji' | 'grammar'

/**
 * Glosses, one array per language.
 *
 * `en` is source data from OpenJLPT (CC BY-SA 4.0) and is never edited by hand:
 * it is what keeps provenance traceable and an upstream refresh possible. `id` is
 * what the app actually shows.
 *
 * Nested rather than a flat `meanings_id` field because an item already has its
 * own `id` — `meanings_id` sitting beside it reads as "the id of meanings".
 * `item.meanings.id` versus `item.id` cannot be misread.
 */
export type Meanings = {
  en: string[]
  id: string[]
}

/**
 * Gloss bookkeeping, the only part of `data` that is typed.
 *
 * The rest of `data` is deliberately open — a kana's row, a kanji's readings, a
 * grammar point's formation — because the engine never reads it. These two it
 * does: `gloss_reviewed` decides whether a screen still shows the honest "not yet
 * checked by a native speaker" label, and the store release gate is every unit
 * reading `true`.
 *
 * Optional rather than required, and read with a presence check rather than a
 * truthiness one: `false` is both the default and a meaningful value, so
 * `if (!item.data.gloss_reviewed)` cannot tell "reviewed and rejected" from
 * "never looked at". Same trap as Unit 0 being a real unit whose number is 0.
 */
export type GlossMeta = {
  /** Default false. True only once a human who reads both languages has signed off. */
  gloss_reviewed?: boolean
  /** Default null. A short note that belongs beside the gloss, not inside it. */
  gloss_note_id?: string | null
}

export type Item = {
  id: string
  /** 'KANA' | 'N5' | 'N4' … */
  level: string
  type: ItemType
  expression: string
  reading: string
  meanings: Meanings
  /** Curriculum order within its file. */
  seq: number
  data: Record<string, unknown> & GlossMeta
}

/**
 * The one place that decides which language a screen shows.
 *
 * Falls back to `en` while `id` is still empty, so the app keeps working through
 * the whole of Brief 01 instead of going blank between the schema change and the
 * last translated batch. Every display site goes through here — a fallback that
 * some components implement and others forget is how half a screen ends up in a
 * different language.
 */
export function glossOf(item: Item, locale: 'id' | 'en' = 'id'): string[] {
  const m = item.meanings
  return m[locale]?.length ? m[locale] : m.en
}

export type Example = { ja: string; en: string }

/**
 * Which cards an item gets when it is introduced.
 *
 * Split by item type, not hardcoded per screen, because this is the one rule the
 * whole mode system hangs on:
 *
 * - kana: writing is on by default — motor memory is the point of the kana phase
 * - vocab: recognition and recall; listening joins here once the session can
 *   play it (a card must never be created that a device might not be able to ask)
 * - kanji: writing only by explicit toggle — JLPT is entirely multiple choice,
 *   and writing practice must not eat the hours the exam actually tests
 * - grammar: recognition only, until the dataset is rich enough for cloze
 */
export type ModePrefs = {
  kanaWriting: boolean
  kanjiWriting: boolean
  listening: boolean
}

export function modesForItem(item: Item, prefs: ModePrefs): CardMode[] {
  switch (item.type) {
    case 'kana':
      return prefs.kanaWriting ? ['recognition', 'recall', 'writing'] : ['recognition', 'recall']
    case 'vocab':
      return prefs.listening ? ['recognition', 'recall', 'listening'] : ['recognition', 'recall']
    case 'kanji':
      // Behind its own toggle, default off: JLPT is entirely multiple choice,
      // and writing practice must not eat the hours the exam actually tests.
      // /menulis/ can open a kanji since Sprint 3, so the pref is honoured.
      return prefs.kanjiWriting ? ['recognition', 'recall', 'writing'] : ['recognition', 'recall']
    case 'grammar':
      return ['recognition']
  }
}

// ---------------------------------------------------------------------------
// loading
// ---------------------------------------------------------------------------

/**
 * Kana ships in the main bundle — it is small and every screen may need it. The
 * N5 files are dynamic imports, loaded only when a card actually references
 * them: ~240 KB of vocabulary has no business in the first paint of /masuk/.
 */
export const KANA_ITEMS: Item[] = kana as Item[]

type Loader = () => Promise<Item[]>

const LOADERS: Array<{ prefix: string; load: Loader }> = [
  {
    prefix: 'vocab-n5-',
    load: () => import('@/data/vocab_n5.json').then((m) => m.default as Item[]),
  },
  {
    prefix: 'kanji-n5-',
    load: () => import('@/data/kanji_n5.json').then((m) => m.default as Item[]),
  },
  {
    prefix: 'grammar-n5-',
    load: () => import('@/data/grammar_n5.json').then((m) => m.default as Item[]),
  },
]

/**
 * An id → item map covering the given card item_ids.
 *
 * Datasets load lazily, keyed off the id prefixes actually present — a person
 * still in the kana phase never downloads a byte of N5. Unknown prefixes load
 * nothing; buildQueue treats their cards as `skipped` rather than throwing,
 * which is the contract for "the data moved on but an old card remains".
 */
export async function itemMapFor(itemIds: Iterable<string>): Promise<Map<string, Item>> {
  const map = new Map<string, Item>()
  for (const item of KANA_ITEMS) map.set(item.id, item)

  const needed = new Set<Loader>()
  for (const id of itemIds) {
    const hit = LOADERS.find((l) => id.startsWith(l.prefix))
    if (hit) needed.add(hit.load)
  }

  const loaded = await Promise.all([...needed].map((load) => load()))
  for (const items of loaded) {
    for (const item of items) map.set(item.id, item)
  }
  return map
}

/** The unit curriculum. Loaded on demand — the path screen and the session. */
export async function loadUnits() {
  const m = await import('@/data/units_n5.json')
  return m.default as unknown as import('./units').Unit[]
}

/**
 * Everything a unit can name, keyed by id.
 *
 * Kana is included: Unit 0 teaches it through whole words, so its item ids
 * resolve to kana characters. Without them the first unit resolves to nothing
 * and a total beginner is handed an empty session.
 */
export async function loadN5Items(): Promise<Map<string, Item>> {
  const [vocab, kanji, grammar] = await Promise.all([
    loadTrack('N5', 'vocab'),
    loadTrack('N5', 'kanji'),
    loadTrack('N5', 'grammar'),
  ])
  const map = new Map<string, Item>()
  for (const item of [...KANA_ITEMS, ...vocab, ...kanji, ...grammar]) map.set(item.id, item)
  return map
}

/** One full track of a level, in curriculum order — for the path screen. */
export async function loadTrack(
  level: 'N5',
  type: Exclude<ItemType, 'kana'>,
): Promise<Item[]> {
  const prefix = `${type}-${level.toLowerCase()}-`
  const loader = LOADERS.find((l) => l.prefix === prefix)
  if (!loader) throw new Error(`tidak ada loader untuk ${type} ${level}`)
  return loader.load()
}
