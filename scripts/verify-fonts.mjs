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

// Kept identical to subset-fonts.mjs on purpose: when the two disagree about what
// counts as a glyph, this check passes while the fonts are wrong — which is
// exactly how `ū` in `gojūon` shipped as a system-font fallback.
const ASCII = Array.from({ length: 0x7e - 0x20 + 1 }, (_, i) => String.fromCharCode(0x20 + i)).join('')
const NON_ASCII = /[^\x00-\x7F]/gu
const TEXT_EXT = new Set(['.ts', '.tsx', '.json', '.css'])
const DATASET = /_n5\.json$/

function walk(dir, found = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, found)
    else if (TEXT_EXT.has(extname(entry))) found.push(full)
  }
  return found
}

function collectGlyphs(includeDatasets) {
  const set = new Set(ASCII)
  for (const file of walk(SRC)) {
    if (!includeDatasets && DATASET.test(file)) continue
    for (const m of readFileSync(file, 'utf8').matchAll(NON_ASCII)) set.add(m[0])
  }
  // text-transform: uppercase draws glyphs that appear nowhere in the source.
  for (const ch of [...set]) {
    set.add(ch.toLocaleUpperCase('id'))
    set.add(ch.toLocaleLowerCase('id'))
  }
  return [...set].filter((c) => [...c].length === 1).sort()
}

if (!existsSync(MANIFEST)) {
  console.error('public/fonts/glyphs.json belum ada — jalankan "npm run fonts" dulu.')
  process.exit(1)
}

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'))

// Two sets, mirroring the builder: the gothic body face carries everything
// including the datasets; mincho and mono carry only the UI sweep. Each is
// checked against its own manifest, because a UI glyph missing from the small
// set would fall back silently in exactly the way this script exists to catch.
let failed = false
for (const [label, shippedText, wanted] of [
  ['full (gothic)', manifest.glyphs, collectGlyphs(true)],
  ['ui (mincho/mono)', manifest.uiGlyphs ?? '', collectGlyphs(false)],
]) {
  const shipped = new Set([...shippedText])
  const missing = wanted.filter((c) => !shipped.has(c))
  console.log(`${label}: terpasang ${shipped.size} · dibutuhkan ${wanted.length}`)
  if (missing.length > 0) {
    failed = true
    console.error(`  ${missing.length} glyph BELUM tercakup: ${missing.slice(0, 40).join(' ')}`)
  }
  const unused = [...shipped].filter((c) => !wanted.includes(c))
  if (unused.length > 0) {
    console.log(`  catatan: ${unused.length} glyph terpasang tapi tak dipakai lagi`)
  }
}

if (failed) {
  console.error('\nJalankan "npm run fonts" lalu commit ulang berkas di public/fonts/.')
  process.exit(1)
}

console.log('\nsemua glyph tercakup.')
