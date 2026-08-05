#!/usr/bin/env node
/**
 * Checks that every glyph the app can render is inside the subset fonts.
 *
 * The subset is the thing that makes a missing glyph invisible instead of loud:
 * the browser simply falls through to the next family in the stack, so a new
 * kanji added to a heading looks *almost* right — a different face, on one word,
 * that nobody notices until a screenshot goes out.
 *
 * Deliberately NOT wired into `prebuild`, for the same reason `verify:strokes`
 * is not: a deploy must not fail because someone added a character to a string.
 * It reports; a human decides whether to re-run `npm run fonts`.
 *
 * Run: npm run verify:fonts
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const SRC = join(ROOT, 'src')
const MANIFEST = join(ROOT, 'public', 'fonts', 'glyphs.json')

// Kept identical to subset-fonts.mjs on purpose: if the two ever disagree about
// what counts as a glyph, this check passes while the fonts are wrong.
const ASCII = Array.from({ length: 0x7e - 0x20 + 1 }, (_, i) => String.fromCharCode(0x20 + i)).join('')
const TYPOGRAPHIC = '—–…·×÷±→←✓°“”‘’′″©'
const JAPANESE = /[　-ヿ㐀-䶿一-鿿＀-￯]/gu
const TEXT_EXT = new Set(['.ts', '.tsx', '.json', '.css'])

function walk(dir, found = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, found)
    else if (TEXT_EXT.has(extname(entry))) found.push(full)
  }
  return found
}

function collectGlyphs() {
  const set = new Set([...ASCII, ...TYPOGRAPHIC])
  for (const file of walk(SRC)) {
    for (const m of readFileSync(file, 'utf8').matchAll(JAPANESE)) set.add(m[0])
  }
  return [...set].sort()
}

if (!existsSync(MANIFEST)) {
  console.error('public/fonts/glyphs.json belum ada — jalankan "npm run fonts" dulu.')
  process.exit(1)
}

const shipped = new Set([...JSON.parse(readFileSync(MANIFEST, 'utf8')).glyphs])
const wanted = collectGlyphs()
const missing = wanted.filter((c) => !shipped.has(c))

console.log(`terpasang : ${shipped.size} glyph`)
console.log(`dibutuhkan: ${wanted.length} glyph`)

if (missing.length > 0) {
  console.error(`\n${missing.length} glyph BELUM tercakup subset:`)
  console.error(`  ${missing.join(' ')}`)
  console.error('\nJalankan "npm run fonts" lalu commit ulang berkas di public/fonts/.')
  process.exit(1)
}

// A shrinking set is not an error — copy gets deleted — but it is worth saying,
// because it is free bytes sitting in every install.
const unused = [...shipped].filter((c) => !wanted.includes(c))
if (unused.length > 0) {
  console.log(`catatan   : ${unused.length} glyph terpasang tapi tak dipakai lagi`)
}

console.log('\nsemua glyph tercakup.')
