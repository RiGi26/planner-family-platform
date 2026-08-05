#!/usr/bin/env node
/**
 * Checks our bundled stroke data against KanjiVG.
 *
 * The data in src/data/strokes.json comes from @k1low/hanzi-writer-data-jp, which
 * derives from Make Me a Hanzi and animCJK — projects that decompose strokes from
 * Chinese font outlines. KanjiVG is compiled from Japanese handwriting convention,
 * which is what a learner is actually being taught.
 *
 * Where the two disagree on how many strokes a kana has, KanjiVG is right for our
 * purposes, and shipping the other number teaches something false.
 *
 * This does not fix anything. It tells you the size of the problem, by name.
 *
 * Run: npm run verify:strokes
 * Output: src/data/stroke-count-audit.json
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const DATA = join(HERE, '..', 'src', 'data')
const OUT = join(DATA, 'stroke-count-audit.json')

const KANJIVG = 'https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji'
const CONCURRENCY = 6

/** KanjiVG names files by zero-padded lowercase hex codepoint: あ → 03042.svg */
function kanjivgUrl(char) {
  return `${KANJIVG}/${char.codePointAt(0).toString(16).padStart(5, '0')}.svg`
}

/**
 * Counts real strokes, not every path element.
 *
 * KanjiVG marks each stroke with an id like `kvg:03042-s1`, and also carries
 * `<path>` elements inside stroke-number groups used for the numbering overlay.
 * Counting bare `<path>` would inflate the total.
 */
function countStrokes(svg) {
  const matches = svg.match(/id="kvg:[0-9a-f]+-s\d+"/g)
  return matches ? new Set(matches).size : 0
}

async function fetchCount(char) {
  const url = kanjivgUrl(char)
  try {
    const res = await fetch(url)
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` }
    const svg = await res.text()
    const count = countStrokes(svg)
    return count > 0 ? { ok: true, count } : { ok: false, reason: 'tidak ada goresan terbaca' }
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) }
  }
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length)
  let cursor = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const i = cursor++
        out[i] = await fn(items[i], i)
      }
    }),
  )
  return out
}

const strokesPath = join(DATA, 'strokes.json')
if (!existsSync(strokesPath)) {
  console.error('src/data/strokes.json belum ada — jalankan "npm run strokes" dulu.')
  process.exit(1)
}

const ours = JSON.parse(readFileSync(strokesPath, 'utf8'))
const characters = Object.keys(ours).sort()

console.log(`Membandingkan ${characters.length} karakter dengan KanjiVG...\n`)

const results = await mapLimit(characters, CONCURRENCY, async (char) => {
  const mine = ours[char].strokes.length
  const theirs = await fetchCount(char)
  return { char, ours: mine, ...theirs }
})

const agree = results.filter((r) => r.ok && r.count === r.ours)
const differ = results.filter((r) => r.ok && r.count !== r.ours)
const unchecked = results.filter((r) => !r.ok)

if (differ.length > 0) {
  console.log('BERBEDA — KanjiVG yang benar untuk pengajaran kana:\n')
  console.log('  char   kita   KanjiVG')
  for (const r of differ) {
    console.log(`  ${r.char}      ${String(r.ours).padStart(2)}      ${String(r.count).padStart(2)}`)
  }
  console.log()
}

if (unchecked.length > 0) {
  console.log(`TIDAK TERPERIKSA (${unchecked.length}):`)
  for (const r of unchecked) console.log(`  ${r.char} — ${r.reason}`)
  console.log()
}

console.log(`cocok        : ${agree.length}`)
console.log(`berbeda      : ${differ.length}`)
console.log(`tak terperiksa: ${unchecked.length}`)

writeFileSync(
  OUT,
  JSON.stringify(
    {
      diperiksa_pada: new Date().toISOString().slice(0, 10),
      sumber: 'KanjiVG (github.com/KanjiVG/kanjivg)',
      ringkasan: { cocok: agree.length, berbeda: differ.length, tak_terperiksa: unchecked.length },
      berbeda: differ.map((r) => ({ char: r.char, kita: r.ours, kanjivg: r.count })),
      tak_terperiksa: unchecked.map((r) => ({ char: r.char, alasan: r.reason })),
    },
    null,
    2,
  ) + '\n',
  'utf8',
)
console.log(`\nditulis: ${OUT}`)

// A difference is a finding, not a crash — the audit file is the deliverable.
process.exit(0)
