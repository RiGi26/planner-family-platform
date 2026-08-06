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
import { gunzipSync } from 'node:zlib'
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

/**
 * jmdict-simplified, "common" edition (~1 MB compressed): the part-of-speech
 * tags OpenJLPT drops on the way through.
 *
 * Needed because ます形 is derivable from the dictionary form plus the verb
 * group, but not the other way round — かえります could come from かえる (godan)
 * or かえりる (ichidan), and nothing in the surface form says which. So the
 * dictionary form is the only safe key, and the group has to be stored beside
 * it. The display can then show ます形 as the primary label at N5 and flip later
 * without a migration.
 */
const JMDICT_RELEASE = '3.6.2+20260803141815'
const JMDICT_URL =
  `https://github.com/scriptin/jmdict-simplified/releases/download/` +
  `${encodeURIComponent(JMDICT_RELEASE)}/jmdict-eng-common-${JMDICT_RELEASE}.json.tgz`

/**
 * The .tgz holds exactly one file, so gunzip plus a 512-byte tar header is the
 * whole extraction — cheaper than a dependency for one archive a year.
 */
function untarSingle(tgz) {
  const tar = gunzipSync(tgz)
  const size = parseInt(tar.subarray(124, 136).toString('ascii').replace(/\0.*$/, '').trim(), 8)
  return tar.subarray(512, 512 + size).toString('utf8')
}

/** JMdict part-of-speech tag → the group a learner needs to conjugate. */
function verbGroup(pos) {
  if (pos.some((p) => p === 'vs-i' || p === 'vk' || p === 'vs-s')) return 'irregular'
  if (pos.includes('v1') || pos.includes('v1-s')) return 'ichidan'
  if (pos.some((p) => /^v5/.test(p))) return 'godan'
  return null
}

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
/** Beginner essentials the Waller list files separately and OpenJLPT therefore
 *  never carried: greetings, 日本語, and わたし as the reading actually taught. */
const supplement = JSON.parse(
  readFileSync(join(HERE, 'data', 'vocab-n5-supplement.json'), 'utf8'),
)
/** The curriculum spine. Items it names get a `unit`; the rest get null. */
const units = JSON.parse(readFileSync(join(HERE, 'data', 'units-n5.json'), 'utf8'))

console.log('Mengambil JMdict (common) untuk kelas kata...')
const jmRes = await fetch(JMDICT_URL)
if (!jmRes.ok) fail(`JMdict: HTTP ${jmRes.status}`)
const jmdict = JSON.parse(untarSingle(Buffer.from(await jmRes.arrayBuffer())))

/** expression → part-of-speech tags, keyed by both kanji and kana spellings. */
const posByWord = new Map()
for (const w of jmdict.words) {
  const pos = w.sense?.[0]?.partOfSpeech ?? []
  if (pos.length === 0) continue
  for (const k of w.kanji ?? []) if (!posByWord.has(k.text)) posByWord.set(k.text, pos)
  for (const k of w.kana ?? []) if (!posByWord.has(k.text)) posByWord.set(k.text, pos)
}

const unitOf = new Map()
for (const u of units) for (const w of u.vocab ?? []) unitOf.set(w, u.n)
const kanjiUnitOf = new Map()
for (const u of units) for (const k of u.kanji ?? []) kanjiUnitOf.set(k, u.n)

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

// The supplement both ADDS and CORRECTS: 私 already exists in the source under
// わたくし (the humble reading JMdict lists first), while every beginner course
// teaches わたし. Same word, so it overrides in place rather than arriving as a
// second entry — keeping the id stable and the list free of near-duplicates.
const vocabByWord = new Map(vocabSrc.map((v) => [v.word, { ...v, source: 'openjlpt' }]))
let corrected = 0
for (const s of supplement) {
  if (vocabByWord.has(s.word ?? s.expression)) corrected++
  vocabByWord.set(s.expression, {
    word: s.expression,
    reading: s.reading,
    meanings: s.meanings,
    examples: vocabByWord.get(s.expression)?.examples ?? [],
    source: 'compiled',
  })
}
const vocabRows = [...vocabByWord.values()]

const vocab = vocabRows.map((v, i) => {
  const pos = posByWord.get(v.word) ?? posByWord.get(v.reading) ?? []
  const group = verbGroup(pos)
  return {
    id: `vocab-n5-${v.word}`,
    level: 'N5',
    type: 'vocab',
    expression: v.word,
    reading: v.reading || v.word,
    meanings: v.meanings,
    seq: i + 1,
    data: {
      examples: (v.examples ?? []).slice(0, MAX_EXAMPLES),
      // Curriculum position. null = not yet placed in a unit; those items are
      // still learnable, they just have no place in the guided path yet.
      unit: unitOf.get(v.word) ?? null,
      pos,
      ...(group ? { verb_group: group } : {}),
      source: v.source,
    },
  }
})

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
      unit: kanjiUnitOf.get(k.character) ?? null,
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

// Every word a unit names must have become an item, or the guided path points
// at material that does not exist.
const built = new Set(vocab.map((v) => v.expression))
for (const u of units) {
  if (u.n === 0) continue // Unit 0 spells kana words straight; verify-units checks those.
  for (const w of u.vocab ?? []) {
    if (!built.has(w)) fail(`unit ${u.n} menyebut "${w}" yang tidak ada di dataset`)
  }
}
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
