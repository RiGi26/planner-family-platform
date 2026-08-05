#!/usr/bin/env node
/**
 * Generates src/data/kana.json — all 208 kana.
 *
 * Only hiragana is written out by hand. Katakana is derived by codepoint offset
 * (U+3041–U+3096 maps to U+30A1–U+30F6 by +0x60), which removes an entire class
 * of transcription typos: if あ/ア is right, every other pair is right too.
 *
 * Run: npm run kana
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, '..', 'src', 'data', 'kana.json')

const KATAKANA_OFFSET = 0x60
const HIRAGANA_START = 0x3041
const HIRAGANA_END = 0x3096

/**
 * Shifts hiragana to katakana and leaves everything else alone. The "leaves
 * everything else alone" half matters: row labels contain kanji (し拗音) and the
 * 行 marker, and shifting those by 0x60 produces silent mojibake.
 */
const toKatakana = (s) =>
  [...s]
    .map((ch) => {
      const cp = ch.codePointAt(0)
      return cp >= HIRAGANA_START && cp <= HIRAGANA_END
        ? String.fromCodePoint(cp + KATAKANA_OFFSET)
        : ch
    })
    .join('')

const COLUMNS = ['a', 'i', 'u', 'e', 'o']

// The gojūon grid. `null` marks a cell that does not exist — those are drawn as
// gaps on the Kana Sheet, not as empty boxes.
const GOJUON = [
  { row: 'a', label: 'あ行', cells: ['あ', 'い', 'う', 'え', 'お'], readings: ['a', 'i', 'u', 'e', 'o'] },
  { row: 'k', label: 'か行', cells: ['か', 'き', 'く', 'け', 'こ'], readings: ['ka', 'ki', 'ku', 'ke', 'ko'] },
  { row: 's', label: 'さ行', cells: ['さ', 'し', 'す', 'せ', 'そ'], readings: ['sa', 'shi', 'su', 'se', 'so'] },
  { row: 't', label: 'た行', cells: ['た', 'ち', 'つ', 'て', 'と'], readings: ['ta', 'chi', 'tsu', 'te', 'to'] },
  { row: 'n', label: 'な行', cells: ['な', 'に', 'ぬ', 'ね', 'の'], readings: ['na', 'ni', 'nu', 'ne', 'no'] },
  { row: 'h', label: 'は行', cells: ['は', 'ひ', 'ふ', 'へ', 'ほ'], readings: ['ha', 'hi', 'fu', 'he', 'ho'] },
  { row: 'm', label: 'ま行', cells: ['ま', 'み', 'む', 'め', 'も'], readings: ['ma', 'mi', 'mu', 'me', 'mo'] },
  { row: 'y', label: 'や行', cells: ['や', null, 'ゆ', null, 'よ'], readings: ['ya', null, 'yu', null, 'yo'] },
  { row: 'r', label: 'ら行', cells: ['ら', 'り', 'る', 'れ', 'ろ'], readings: ['ra', 'ri', 'ru', 're', 'ro'] },
  { row: 'w', label: 'わ行', cells: ['わ', null, null, null, 'を'], readings: ['wa', null, null, null, 'wo'] },
  { row: 'n-final', label: 'ん', cells: ['ん', null, null, null, null], readings: ['n', null, null, null, null] },
]

const DAKUTEN = [
  { row: 'g', label: 'が行', cells: ['が', 'ぎ', 'ぐ', 'げ', 'ご'], readings: ['ga', 'gi', 'gu', 'ge', 'go'] },
  { row: 'z', label: 'ざ行', cells: ['ざ', 'じ', 'ず', 'ぜ', 'ぞ'], readings: ['za', 'ji', 'zu', 'ze', 'zo'] },
  { row: 'd', label: 'だ行', cells: ['だ', 'ぢ', 'づ', 'で', 'ど'], readings: ['da', 'ji', 'zu', 'de', 'do'] },
  { row: 'b', label: 'ば行', cells: ['ば', 'び', 'ぶ', 'べ', 'ぼ'], readings: ['ba', 'bi', 'bu', 'be', 'bo'] },
  { row: 'p', label: 'ぱ行', cells: ['ぱ', 'ぴ', 'ぷ', 'ぺ', 'ぽ'], readings: ['pa', 'pi', 'pu', 'pe', 'po'] },
]

// ぢ and づ are romanised ji/zu exactly like じ/ず. Without a disambiguator the
// recall card would have two correct answers and no way to tell which was meant.
const READING_NOTES = { ぢ: 'di', づ: 'du' }

const YOUON_BASE = [
  { base: 'き', prefix: 'ky' },
  { base: 'し', prefix: 'sh', irregular: { a: 'sha', u: 'shu', o: 'sho' } },
  { base: 'ち', prefix: 'ch', irregular: { a: 'cha', u: 'chu', o: 'cho' } },
  { base: 'に', prefix: 'ny' },
  { base: 'ひ', prefix: 'hy' },
  { base: 'み', prefix: 'my' },
  { base: 'り', prefix: 'ry' },
  { base: 'ぎ', prefix: 'gy' },
  { base: 'じ', prefix: 'j', irregular: { a: 'ja', u: 'ju', o: 'jo' } },
  { base: 'び', prefix: 'by' },
  { base: 'ぴ', prefix: 'py' },
]
const SMALL = { a: 'ゃ', u: 'ゅ', o: 'ょ' }

/** Stable, human-readable ids so re-running the generator never churns the dataset. */
const idFor = (script, group, reading, expression) =>
  `kana-${script === 'hiragana' ? 'hira' : 'kata'}-${group}-${reading}-${[...expression]
    .map((c) => c.codePointAt(0).toString(16))
    .join('')}`

function buildScript(script, seqStart) {
  const items = []
  let seq = seqStart

  // `source` is always the hiragana form, so lookups keyed on it work for both scripts.
  const push = (expression, source, reading, group, row, rowLabel, col) => {
    const meanings = [reading]
    const note = READING_NOTES[source]
    if (note) meanings.push(note)
    items.push({
      id: idFor(script, group, reading, expression),
      level: 'KANA',
      type: 'kana',
      expression,
      reading,
      meanings,
      seq: seq++,
      data: {
        script,
        group,
        row,
        row_label: script === 'katakana' ? toKatakana(rowLabel) : rowLabel,
        col,
        strokes_key: expression,
      },
    })
  }

  const grid = (table, group) => {
    for (const { row, label, cells, readings } of table) {
      cells.forEach((cell, i) => {
        if (!cell) return
        const glyph = script === 'katakana' ? toKatakana(cell) : cell
        push(glyph, cell, readings[i], group, row, label, COLUMNS[i])
      })
    }
  }

  grid(GOJUON, 'basic')
  grid(DAKUTEN, 'dakuten')

  for (const { base, prefix, irregular } of YOUON_BASE) {
    for (const col of ['a', 'u', 'o']) {
      const hira = base + SMALL[col]
      const glyph = script === 'katakana' ? toKatakana(hira) : hira
      const reading = irregular?.[col] ?? prefix + col
      push(glyph, hira, reading, 'youon', base, `${base}拗音`, col)
    }
  }

  return items
}

// Hiragana is finished before katakana starts — the sheet is filled one script at
// a time, and the second sheet is a separate screen.
const hiragana = buildScript('hiragana', 1)
const katakana = buildScript('katakana', hiragana.length + 1)
const all = [...hiragana, ...katakana]

const counts = (items, group) => items.filter((i) => i.data.group === group).length
const expect = (label, actual, wanted) => {
  if (actual !== wanted) {
    console.error(`FAIL ${label}: got ${actual}, expected ${wanted}`)
    process.exitCode = 1
  } else {
    console.log(`ok   ${label}: ${actual}`)
  }
}

expect('hiragana basic', counts(hiragana, 'basic'), 46)
expect('hiragana dakuten', counts(hiragana, 'dakuten'), 25)
expect('hiragana youon', counts(hiragana, 'youon'), 33)
expect('katakana basic', counts(katakana, 'basic'), 46)
expect('katakana dakuten', counts(katakana, 'dakuten'), 25)
expect('katakana youon', counts(katakana, 'youon'), 33)
expect('total', all.length, 208)
expect('unique ids', new Set(all.map((i) => i.id)).size, 208)
expect('unique glyphs', new Set(all.map((i) => i.expression)).size, 208)

// Guards against the mojibake class of bug: shifting a label by 0x60 turns 拗音
// into garbage, and nothing downstream would ever complain about it.
const HIRAGANA_RE = /[ぁ-ゖ]/
expect(
  'katakana labels free of hiragana',
  katakana.filter((i) => HIRAGANA_RE.test(i.data.row_label)).length,
  0,
)
expect(
  'katakana glyphs free of hiragana',
  katakana.filter((i) => HIRAGANA_RE.test(i.expression)).length,
  0,
)
// ぢ/づ and ヂ/ヅ share a romanisation with じ/ず, so all four carry a disambiguator.
for (const glyph of ['ぢ', 'づ', 'ヂ', 'ヅ']) {
  const item = all.find((i) => i.expression === glyph)
  expect(`${glyph} disambiguated`, item?.meanings.length ?? 0, 2)
}

if (process.exitCode) process.exit(1)

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, JSON.stringify(all, null, 2) + '\n', 'utf8')
console.log(`\nwrote ${OUT} (${all.length} items)`)
