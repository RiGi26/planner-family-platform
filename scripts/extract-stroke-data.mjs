#!/usr/bin/env node
/**
 * Extracts stroke data for only the characters this app actually draws.
 *
 * @k1low/hanzi-writer-data-jp ships 6,710 files / ~19.7 MB. Phase 0 needs 229 of
 * them. Bundling the package whole would be 65x larger than necessary and would
 * make "available offline" a much worse trade than it has to be.
 *
 * The character set:
 *   142  kana — hiragana + katakana, basic and dakuten/handakuten (single glyphs)
 *     8  small kana (ゃゅょっ and katakana equivalents) used to compose youon
 *    79  N5 kanji, once kanji_n5.json exists
 *
 * Youon like きゃ need no entry of their own; they are written as their two parts.
 *
 * Output: src/data/strokes.json — { "あ": { strokes: [...], medians: [...] }, ... }
 *
 * Idempotent, and safe to run when the source package is absent as long as the
 * output is already committed. That is what keeps Vercel builds from depending on
 * the full 19.7 MB package.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const DATA = join(ROOT, 'src', 'data')
const OUT = join(DATA, 'strokes.json')
const PACKAGE_DIR = join(ROOT, 'node_modules', '@k1low', 'hanzi-writer-data-jp')

// Small kana are composed into youon rather than stored as their own items, so they
// never appear in kana.json and have to be listed explicitly.
const SMALL_KANA = ['ゃ', 'ゅ', 'ょ', 'っ', 'ャ', 'ュ', 'ョ', 'ッ']

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function collectCharacters() {
  const wanted = new Set()

  const kanaPath = join(DATA, 'kana.json')
  if (!existsSync(kanaPath)) {
    console.error(`missing ${kanaPath} — run "npm run kana" first`)
    process.exit(1)
  }
  for (const item of readJson(kanaPath)) {
    // Single-glyph kana only. Youon entries are two characters long.
    if ([...item.expression].length === 1) wanted.add(item.expression)
  }
  for (const ch of SMALL_KANA) wanted.add(ch)

  const kanjiPath = join(DATA, 'kanji_n5.json')
  if (existsSync(kanjiPath)) {
    for (const item of readJson(kanjiPath)) {
      const ch = item.expression ?? item.character
      if (ch) wanted.add(ch)
    }
  } else {
    console.warn('note: kanji_n5.json not present yet — extracting kana only.')
  }

  return [...wanted]
}

function loadFromPackage(char) {
  // One file per character, at the package root: あ.json, 川.json, ...
  const file = join(PACKAGE_DIR, `${char}.json`)
  if (!existsSync(file)) return null
  const raw = readJson(file)
  // Keep strokes and medians only. The package also carries radical and character
  // metadata we never render, and it roughly doubles the file size.
  return { strokes: raw.strokes, medians: raw.medians }
}

const chars = collectCharacters()
const existing = existsSync(OUT) ? readJson(OUT) : {}
const packageAvailable = existsSync(PACKAGE_DIR)

if (!packageAvailable) {
  const covered = chars.filter((c) => existing[c]).length
  if (covered === chars.length && chars.length > 0) {
    console.log(`@k1low/hanzi-writer-data-jp absent; committed strokes.json already covers all ${chars.length} characters.`)
    process.exit(0)
  }
  console.error(
    `@k1low/hanzi-writer-data-jp is not installed and strokes.json covers only ${covered}/${chars.length} characters.`,
  )
  process.exit(1)
}

const out = {}
const missing = []
for (const char of chars.sort()) {
  const data = loadFromPackage(char) ?? existing[char] ?? null
  if (!data) {
    missing.push(char)
    continue
  }
  out[char] = data
}

mkdirSync(DATA, { recursive: true })
writeFileSync(OUT, JSON.stringify(out) + '\n', 'utf8')

const bytes = Buffer.byteLength(JSON.stringify(out), 'utf8')
console.log(`wrote ${OUT}`)
console.log(`  characters : ${Object.keys(out).length} / ${chars.length}`)
console.log(`  size       : ${(bytes / 1024).toFixed(0)} KB`)

if (missing.length) {
  console.error(`\nMISSING stroke data for ${missing.length}: ${missing.join(' ')}`)
  process.exit(1)
}
