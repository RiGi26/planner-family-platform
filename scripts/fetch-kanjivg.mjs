#!/usr/bin/env node
/**
 * Builds src/data/kvg-strokes.json from KanjiVG.
 *
 * KanjiVG is compiled from Japanese handwriting convention; the package we used
 * before derives from Chinese font outlines and splits closed loops into two
 * strokes. That disagreement hit 21 of our 150 characters — see
 * `npm run verify:strokes` — including あ は ま な の る.
 *
 * The useful property here: KanjiVG paths are **centrelines**, drawn with
 * `fill:none; stroke-width:3`, not outlines. One path per stroke means the same data
 * renders the character, animates it, and serves as the reference skeleton the
 * scorer grades against. No separate median data, and nothing to keep in sync.
 *
 * Run: npm run kvg
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const DATA = join(HERE, '..', 'src', 'data')
const OUT = join(DATA, 'kvg-strokes.json')

const BASE = 'https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji'
const CONCURRENCY = 6

/** KanjiVG names files by zero-padded lowercase hex codepoint: あ → 03042.svg */
const urlFor = (char) => `${BASE}/${char.codePointAt(0).toString(16).padStart(5, '0')}.svg`

/**
 * Pulls one `d` attribute per stroke, in stroke order.
 *
 * Stroke elements carry `id="kvg:03042-s1"`. Plain `<path>` matching would also pick
 * up the stroke-number overlay glyphs and silently inflate the count.
 */
function extractStrokes(svg) {
  const out = []
  const re = /<path[^>]*id="kvg:[0-9a-f]+-s(\d+)"[^>]*\sd="([^"]+)"/g
  let m
  while ((m = re.exec(svg)) !== null) {
    out.push({ n: Number(m[1]), d: m[2] })
  }
  return out.sort((a, b) => a.n - b.n).map((s) => s.d)
}

function viewBoxOf(svg) {
  const m = svg.match(/viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/)
  return m ? Number(m[1]) : 109
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length)
  let cursor = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const i = cursor++
        out[i] = await fn(items[i])
      }
    }),
  )
  return out
}

const kanaPath = join(DATA, 'kana.json')
if (!existsSync(kanaPath)) {
  console.error('src/data/kana.json belum ada — jalankan "npm run kana" dulu.')
  process.exit(1)
}

// Same character set as the old extractor: single-glyph kana plus the small kana
// that youon are composed from. Kanji joins when kanji_n5.json lands.
const SMALL_KANA = ['ゃ', 'ゅ', 'ょ', 'っ', 'ャ', 'ュ', 'ョ', 'ッ']
const wanted = new Set(SMALL_KANA)
for (const item of JSON.parse(readFileSync(kanaPath, 'utf8'))) {
  if ([...item.expression].length === 1) wanted.add(item.expression)
}
const kanjiPath = join(DATA, 'kanji_n5.json')
if (existsSync(kanjiPath)) {
  for (const item of JSON.parse(readFileSync(kanjiPath, 'utf8'))) {
    const ch = item.expression ?? item.character
    if (ch) wanted.add(ch)
  }
} else {
  console.warn('note: kanji_n5.json belum ada — mengambil kana saja.')
}

const characters = [...wanted].sort()
console.log(`Mengambil ${characters.length} karakter dari KanjiVG...`)

const results = await mapLimit(characters, CONCURRENCY, async (char) => {
  try {
    const res = await fetch(urlFor(char))
    if (!res.ok) return { char, error: `HTTP ${res.status}` }
    const svg = await res.text()
    const strokes = extractStrokes(svg)
    if (strokes.length === 0) return { char, error: 'tidak ada goresan terbaca' }
    return { char, strokes, size: viewBoxOf(svg) }
  } catch (e) {
    return { char, error: e instanceof Error ? e.message : String(e) }
  }
})

const failed = results.filter((r) => r.error)
if (failed.length > 0) {
  console.error(`\nGAGAL untuk ${failed.length} karakter:`)
  for (const f of failed) console.error(`  ${f.char} — ${f.error}`)
  console.error('\nTidak menulis berkas: data separuh lebih buruk daripada tidak ada data.')
  process.exit(1)
}

const out = {}
for (const r of results) {
  out[r.char] = { strokes: r.strokes, size: r.size }
}

writeFileSync(OUT, JSON.stringify(out) + '\n', 'utf8')

const bytes = Buffer.byteLength(JSON.stringify(out), 'utf8')
const sizes = new Set(results.map((r) => r.size))
console.log(`\nditulis  : ${OUT}`)
console.log(`karakter : ${Object.keys(out).length}`)
console.log(`ukuran   : ${(bytes / 1024).toFixed(0)} KB`)
console.log(`viewBox  : ${[...sizes].join(', ')}`)
