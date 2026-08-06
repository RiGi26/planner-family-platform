#!/usr/bin/env node
/**
 * Checks the unit curriculum against the rule the whole design rests on:
 * **nothing appears before it has been taught.**
 *
 * Every sentence and dialogue line in unit N may only use vocabulary and kanji
 * introduced in units ≤ N. That rule is what produces the "I can read this!"
 * moment, and it is exactly the rule a human author breaks without noticing —
 * I wrote these sentences, so the check exists to catch me rather than to
 * reassure me. Third-party data (JMdict, KANJIDIC2) is trusted; my own prose is
 * not, and this script draws that line mechanically.
 *
 * What it verifies:
 *   1. every vocab/kanji id named by a unit exists in the datasets
 *   2. no item is claimed by two units
 *   3. every kanji in a unit's sentences is introduced by unit ≤ N
 *   4. every sentence is fully covered by known vocabulary + particles +
 *      the copula, using longest-match segmentation
 *   5. dialogue and sentences carry an Indonesian translation
 *
 * Deliberately NOT a morphological parser. kuromoji would add a 15 MB dictionary
 * and a native-ish init for a corpus of a few hundred short N5 sentences whose
 * grammar is already fixed by the unit that owns them. Longest-match against the
 * known-word set catches the failure that actually matters — a word the learner
 * has never met — and says which one.
 *
 * Run: npm run verify:units
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const read = (p) => JSON.parse(readFileSync(p, 'utf8'))

const units = read(join(HERE, 'data', 'units-n5.json'))
const supplement = read(join(HERE, 'data', 'vocab-n5-supplement.json'))
const vocab = read(join(ROOT, 'src', 'data', 'vocab_n5.json'))
const kanji = read(join(ROOT, 'src', 'data', 'kanji_n5.json'))
const kana = read(join(ROOT, 'src', 'data', 'kana.json'))

/**
 * Grammar words that carry a sentence without being vocabulary items: particles,
 * the copula and its inflections, and the polite suffix. A learner meets these
 * as part of the unit's pattern, not as a card — listing them here is what keeps
 * the check honest instead of forcing every は into the word list.
 */
const GRAMMAR_TOKENS = [
  'じゃありません',
  'ですか',
  'です',
  'さん',
  'は',
  'が',
  'を',
  'に',
  'で',
  'と',
  'も',
  'の',
  'か',
  'ね',
  'よ',
  '、',
  '。',
  '？',
  '「',
  '」',
  ' ',
]

/** Names used in dialogue. Proper nouns are not vocabulary to be learned. */
const NAMES = ['アリ', 'さとう', 'たなか', 'やまだ']

const errors = []
const warn = []

// ---------------------------------------------------------------------------
// 1 & 2 — ids exist, and nothing is claimed twice
// ---------------------------------------------------------------------------

const vocabByExpr = new Map(vocab.map((v) => [v.expression, v]))
for (const s of supplement) vocabByExpr.set(s.expression, s)
const kanjiByExpr = new Map(kanji.map((k) => [k.expression, k]))
const kanaByExpr = new Map(kana.map((k) => [k.expression, k]))

const seenVocab = new Map()
const seenKanji = new Map()

for (const u of units) {
  for (const w of u.vocab ?? []) {
    // Unit 0 words are kana-reading practice, spelled straight in kana.
    const known = vocabByExpr.has(w) || (u.n === 0 && [...w].every((c) => kanaByExpr.has(c)))
    if (!known) errors.push(`unit ${u.n}: kosakata "${w}" tidak ada di dataset`)
    if (seenVocab.has(w)) errors.push(`kosakata "${w}" diklaim unit ${seenVocab.get(w)} dan ${u.n}`)
    else seenVocab.set(w, u.n)
  }
  for (const k of u.kanji ?? []) {
    if (!kanjiByExpr.has(k)) errors.push(`unit ${u.n}: kanji "${k}" tidak ada di dataset`)
    if (seenKanji.has(k)) errors.push(`kanji "${k}" diklaim unit ${seenKanji.get(k)} dan ${u.n}`)
    else seenKanji.set(k, u.n)
  }
}

// ---------------------------------------------------------------------------
// 3 & 4 — coverage, cumulatively
// ---------------------------------------------------------------------------

const KANJI_RE = /[一-龯]/u

/** Longest-match segmentation against everything known so far. */
function uncovered(text, known) {
  const missing = []
  let i = 0
  outer: while (i < text.length) {
    for (let len = Math.min(12, text.length - i); len > 0; len--) {
      const slice = text.slice(i, i + len)
      if (known.has(slice)) {
        i += len
        continue outer
      }
    }
    // Unknown character: report the run it starts, then skip one char.
    const ch = text[i]
    missing.push(ch)
    i += 1
  }
  return [...new Set(missing)]
}

const known = new Set([...GRAMMAR_TOKENS, ...NAMES])
let sentenceCount = 0

for (const u of [...units].sort((a, b) => a.n - b.n)) {
  // Everything this unit introduces becomes usable from here on.
  for (const w of u.vocab ?? []) {
    known.add(w)
    const entry = vocabByExpr.get(w)
    // The reading counts too: a word written in kanji may appear in kana.
    if (entry?.reading) known.add(entry.reading)
  }
  for (const k of u.kanji ?? []) known.add(k)

  const lines = [
    ...(u.dialog ?? []).map((d) => ({ ja: d.ja, id: d.id, kind: 'dialog' })),
    ...(u.sentences ?? []).map((s) => ({ ja: s.ja, id: s.id, kind: 'kalimat' })),
  ]

  for (const line of lines) {
    sentenceCount++
    if (!line.id || !line.id.trim()) {
      errors.push(`unit ${u.n}: ${line.kind} "${line.ja}" tanpa terjemahan`)
    }

    const missing = uncovered(line.ja, known)
    if (missing.length > 0) {
      errors.push(
        `unit ${u.n}: ${line.kind} "${line.ja}" memakai yang belum diajarkan → ${missing.join(' ')}`,
      )
    }

    // Kanji gets its own check: a kanji may be *readable* as part of a known
    // word while never having been taught as a character.
    for (const ch of line.ja) {
      if (!KANJI_RE.test(ch)) continue
      const taughtAsKanji = seenKanji.has(ch) && seenKanji.get(ch) <= u.n
      const insideKnownWord = [...known].some((w) => w.includes(ch) && KANJI_RE.test(w))
      if (!taughtAsKanji && !insideKnownWord) {
        errors.push(`unit ${u.n}: kanji "${ch}" di "${line.ja}" belum diperkenalkan`)
      }
    }
  }

  const vn = (u.vocab ?? []).length
  if (u.n > 0 && (vn < 8 || vn > 16)) {
    warn.push(`unit ${u.n}: ${vn} kosakata — target 10–15 per unit`)
  }
}

// ---------------------------------------------------------------------------
// report
// ---------------------------------------------------------------------------

const reviewed = units.filter((u) => u.reviewed).length
console.log(`unit      : ${units.length} (Unit ${units[0].n}–${units[units.length - 1].n})`)
console.log(`kalimat   : ${sentenceCount} (dialog + contoh)`)
console.log(`kosakata  : ${seenVocab.size} terpetakan · suplemen ${supplement.length}`)
console.log(`direview  : ${reviewed}/${units.length} oleh penutur asli`)

for (const w of warn) console.log(`catatan   : ${w}`)

if (errors.length > 0) {
  console.error(`\n${errors.length} MASALAH:`)
  for (const e of errors) console.error(`  - ${e}`)
  process.exit(1)
}

console.log('\nsemua kalimat hanya memakai materi yang sudah diajarkan.')
if (reviewed < units.length) {
  console.log(
    'INGAT: unit yang belum direview penutur asli WAJIB memakai label jujur di aplikasi.',
  )
}
