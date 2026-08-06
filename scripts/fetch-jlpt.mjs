#!/usr/bin/env node
/**
 * Builds src/data/{vocab,kanji,grammar}_n5.json from OpenJLPT.
 *
 * Source: evanclan/OpenJLPT (CC BY-SA 4.0) — itself compiled from JMdict,
 * KANJIDIC2, the Waller lists and Tatoeba. Grammar is the thin part everywhere:
 * OpenJLPT has 20 N5 patterns, so 29 more standard-syllabus patterns live in
 * scripts/data/grammar-n5-compiled.json, written by hand for this app.
 *
 * The output is the app's generic item shape — the same shape kana.json uses —
 * so the engine never needs to know which file an item came from. Type-specific
 * fields go under `data`, exactly like kana's row/col/strokes_key do.
 *
 * Ids are derived from content (the word / character / pattern), never from array
 * position: card_states reference item ids, and an upstream re-ordering must not
 * orphan anyone's review history.
 *
 * The outputs are COMMITTED, not fetched at build time. The line drawn in Sprint 1
 * holds: derived-from-repo data may go in prebuild; third-party downloads go in
 * git, so a host outage cannot block a deploy that has nothing to do with it.
 *
 * Run: npm run jlpt
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const DATA = join(HERE, '..', 'src', 'data')

const BASE = 'https://raw.githubusercontent.com/evanclan/OpenJLPT/main/data/json'
const LEVEL = 'n5'

/** Update these on purpose when upstream grows — a silent count change is a bug. */
const EXPECTED = { vocab: 662, kanji: 79, grammarSource: 20, grammarCompiled: 29 }

/** Bundle discipline: at most two example sentences ride along per item. */
const MAX_EXAMPLES = 2

async function fetchJson(kind) {
  const url = `${BASE}/${kind}/${LEVEL}.json`
  const res = await fetch(url)
  if (!res.ok) {
    console.error(`GAGAL mengambil ${url} — HTTP ${res.status}`)
    process.exit(1)
  }
  return res.json()
}

const fail = (msg) => {
  console.error(`GAGAL: ${msg}`)
  process.exit(1)
}

/** "〜が（but）" → "〜が" — the gloss disambiguates in the id, but printed on a
 *  card it would hand the learner the answer inside the prompt. */
const stripGloss = (pattern) => pattern.replace(/（[^）]*）/g, '').trim()

/** Ids keep the full source pattern (gloss included) for uniqueness. */
const grammarId = (pattern) => `grammar-n5-${pattern.replace(/\s+/g, '').replace(/\//g, '・')}`

console.log('Mengambil dataset N5 dari OpenJLPT...')
const [vocabSrc, kanjiSrc, grammarSrc] = await Promise.all([
  fetchJson('vocab'),
  fetchJson('kanji'),
  fetchJson('grammar'),
])
const grammarCompiled = JSON.parse(
  readFileSync(join(HERE, 'data', 'grammar-n5-compiled.json'), 'utf8'),
)

if (vocabSrc.length !== EXPECTED.vocab)
  fail(`vocab: ${vocabSrc.length} entri, diharapkan ${EXPECTED.vocab}`)
if (kanjiSrc.length !== EXPECTED.kanji)
  fail(`kanji: ${kanjiSrc.length} entri, diharapkan ${EXPECTED.kanji}`)
if (grammarSrc.length !== EXPECTED.grammarSource)
  fail(`grammar sumber: ${grammarSrc.length} entri, diharapkan ${EXPECTED.grammarSource}`)
if (grammarCompiled.length !== EXPECTED.grammarCompiled)
  fail(`grammar susunan: ${grammarCompiled.length} entri, diharapkan ${EXPECTED.grammarCompiled}`)

// ---------------------------------------------------------------------------
// vocab — kana-only words read as themselves; the source leaves those blank
// ---------------------------------------------------------------------------

const vocab = vocabSrc.map((v, i) => ({
  id: `vocab-n5-${v.word}`,
  level: 'N5',
  type: 'vocab',
  expression: v.word,
  reading: v.reading || v.word,
  meanings: v.meanings,
  seq: i + 1,
  data: {
    examples: (v.examples ?? []).slice(0, MAX_EXAMPLES),
    source: 'openjlpt',
  },
}))

// ---------------------------------------------------------------------------
// kanji — reading = first kun-yomi (suffix-only readings skipped), else on-yomi.
// strokes_key feeds fetch-kanjivg, which already knows to pick this file up.
// ---------------------------------------------------------------------------

const kanji = kanjiSrc.map((k, i) => {
  const kun = (k.kunyomi ?? []).find((r) => !r.startsWith('-'))
  const on = (k.onyomi ?? [])[0]
  return {
    id: `kanji-n5-${k.character}`,
    level: 'N5',
    type: 'kanji',
    expression: k.character,
    reading: kun ?? on ?? '',
    meanings: k.meanings,
    seq: i + 1,
    data: {
      onyomi: k.onyomi ?? [],
      kunyomi: k.kunyomi ?? [],
      stroke_count: k.strokes,
      grade: k.grade ?? null,
      freq: k.freq ?? null,
      strokes_key: k.character,
      source: 'openjlpt',
    },
  }
})

// ---------------------------------------------------------------------------
// grammar — source first, then the hand-written patterns, one running seq
// ---------------------------------------------------------------------------

const grammar = [
  ...grammarSrc.map((g) => ({ ...g, source: 'openjlpt' })),
  ...grammarCompiled.map((g) => ({ ...g, source: 'compiled' })),
].map((g, i) => ({
  id: grammarId(g.pattern),
  level: 'N5',
  type: 'grammar',
  expression: stripGloss(g.pattern),
  reading: '',
  meanings: [g.meaning],
  seq: i + 1,
  data: {
    formation: g.formation,
    examples: (g.examples ?? []).slice(0, MAX_EXAMPLES),
    tags: g.tags ?? [],
    source: g.source,
  },
}))

// ---------------------------------------------------------------------------
// assertions — half-good data is worse than no data
// ---------------------------------------------------------------------------

const all = [...vocab, ...kanji, ...grammar]
const ids = new Set()
for (const item of all) {
  if (ids.has(item.id)) fail(`id ganda: ${item.id}`)
  ids.add(item.id)
  if (!item.expression) fail(`expression kosong: ${item.id}`)
  if (!item.meanings || item.meanings.length === 0) fail(`meanings kosong: ${item.id}`)
}
for (const v of vocab) if (!v.reading) fail(`reading kosong: ${v.id}`)
const grammarShown = new Set()
for (const g of grammar) {
  if (grammarShown.has(g.expression))
    fail(`prompt grammar ganda setelah gloss dibuang: ${g.expression}`)
  grammarShown.add(g.expression)
}

// ---------------------------------------------------------------------------
// write
// ---------------------------------------------------------------------------

const files = [
  ['vocab_n5.json', vocab],
  ['kanji_n5.json', kanji],
  ['grammar_n5.json', grammar],
]
for (const [name, rows] of files) {
  const path = join(DATA, name)
  writeFileSync(path, JSON.stringify(rows) + '\n', 'utf8')
  const kb = (Buffer.byteLength(JSON.stringify(rows), 'utf8') / 1024).toFixed(0)
  console.log(`ditulis : ${name} — ${rows.length} item, ${kb} KB`)
}
console.log('\nSelesai. Jalankan "npm run kvg" supaya goresan kanji ikut terunduh.')
