#!/usr/bin/env node
/**
 * Builds public/fonts/*.woff2 containing only the glyphs this app can display.
 *
 * History, because the mechanism changed once and the reason matters. The first
 * version asked the Google Fonts CSS API for a subset via `text=` — no new
 * dependency, ~290 glyphs, worked. The day the N5 datasets landed the glyph set
 * grew past a thousand, the URL grew past what the API accepts, and Google
 * silently ignored `text=` and answered the full 121-block sliced family. The
 * assertion built for exactly that failure fired, which is the only reason it
 * was not shipped. The ceiling is structural — every JLPT level adds glyphs —
 * so the subsetting moved local: full TTFs from the google/fonts repo (OFL),
 * cut by HarfBuzz (`subset-font`, wasm — no native binary, which matters in
 * this sandbox).
 *
 * Two glyph sets, deliberately:
 * - **full** — everything swept from src/ including the datasets. Only the
 *   gothic body face carries it; dataset text renders in gothic and nowhere
 *   else.
 * - **ui** — the sweep minus dataset files. Mincho draws a handful of
 *   decorative kanji (升, 始, 済) and mono draws digits; shipping them a
 *   thousand CJK glyphs each would triple the payload to draw nothing.
 *
 * The sweep stays deliberately greedy within its scope (every non-ASCII char in
 * every source file, both letter cases) — per-field selection is exactly the
 * blind spot that once shipped `ū` in a system font.
 *
 * Run: npm run fonts
 * Output: public/fonts/<slug>-<weight>.woff2 + glyphs.json
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import subsetFont from 'subset-font'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const SRC = join(ROOT, 'src')
const OUT_DIR = join(ROOT, 'public', 'fonts')

const GF = 'https://raw.githubusercontent.com/google/fonts/main/ofl'

/**
 * Weights are the ones the code actually asks for, not the ones that exist.
 * Zen Kaku has no 600, so `font-semibold` already resolves to 700 today.
 */
const FAMILIES = [
  {
    slug: 'zen-kaku',
    set: 'full',
    files: [
      { weight: 400, url: `${GF}/zenkakugothicnew/ZenKakuGothicNew-Regular.ttf` },
      { weight: 500, url: `${GF}/zenkakugothicnew/ZenKakuGothicNew-Medium.ttf` },
      { weight: 700, url: `${GF}/zenkakugothicnew/ZenKakuGothicNew-Bold.ttf` },
    ],
  },
  {
    slug: 'zen-mincho',
    set: 'ui',
    files: [{ weight: 400, url: `${GF}/zenoldmincho/ZenOldMincho-Regular.ttf` }],
  },
  {
    slug: 'plex-mono',
    set: 'ui',
    files: [
      { weight: 400, url: `${GF}/ibmplexmono/IBMPlexMono-Regular.ttf` },
      { weight: 500, url: `${GF}/ibmplexmono/IBMPlexMono-Medium.ttf` },
    ],
  },
]

/** Everything the app can render outside Japanese: Latin, digits, punctuation. */
const ASCII = Array.from({ length: 0x7e - 0x20 + 1 }, (_, i) => String.fromCharCode(0x20 + i)).join('')

/**
 * Sweep every non-ASCII character, not just the Japanese ranges — the heading
 * `五十音 · gojūon` once slipped through a ranges-only sweep on its `ū`.
 */
const NON_ASCII = /[^\x00-\x7F]/gu
const TEXT_EXT = new Set(['.ts', '.tsx', '.json', '.css'])

/** The dataset files, whose glyphs only the gothic body face needs. */
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
  // `text-transform: uppercase` renders glyphs that appear nowhere in the
  // source: `gojūon` is drawn `GOJŪON`. Folding both cases in covers every
  // uppercase class without having to know which strings wear one.
  for (const ch of [...set]) {
    set.add(ch.toLocaleUpperCase('id'))
    set.add(ch.toLocaleLowerCase('id'))
  }
  // Case folding can produce multi-character results (ß → SS); those are
  // covered by their parts.
  return [...set].filter((c) => [...c].length === 1).sort()
}

async function fetchTtf(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

const sets = {
  full: collectGlyphs(true).join(''),
  ui: collectGlyphs(false).join(''),
}
console.log(`Glyph: full ${[...sets.full].length} · ui ${[...sets.ui].length}`)

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })

const written = []
for (const { slug, set, files } of FAMILIES) {
  for (const { weight, url } of files) {
    const ttf = await fetchTtf(url)
    const bytes = await subsetFont(ttf, sets[set], { targetFormat: 'woff2' })

    // wOF2 — four bytes that catch every wrong-format case.
    if (bytes.subarray(0, 4).toString('latin1') !== 'wOF2') {
      throw new Error(`${slug} ${weight}: bukan woff2 (magic ${bytes.subarray(0, 4).toString('hex')})`)
    }

    const name = `${slug}-${weight}.woff2`
    writeFileSync(join(OUT_DIR, name), bytes)
    written.push({ name, bytes: bytes.length })
    console.log(`  ${name.padEnd(22)} ${(bytes.length / 1024).toFixed(1).padStart(6)} KB (${set})`)
  }
}

const total = written.reduce((sum, f) => sum + f.bytes, 0)

// The budget that made this worth doing. Revised consciously when the N5
// datasets joined the sweep — a thousand glyphs across three body weights is
// real weight — but failing loudly still beats quietly drifting back towards
// the thirteen megabytes this replaced.
const BUDGET = 600 * 1024
if (total > BUDGET) {
  console.error(`\nTotal ${(total / 1024).toFixed(0)} KB melewati anggaran ${BUDGET / 1024} KB.`)
  process.exit(1)
}

writeFileSync(
  join(OUT_DIR, 'glyphs.json'),
  JSON.stringify({
    count: [...sets.full].length,
    glyphs: sets.full,
    uiCount: [...sets.ui].length,
    uiGlyphs: sets.ui,
  }) + '\n',
  'utf8',
)

console.log(`\nberkas   : ${written.length}`)
console.log(`total    : ${(total / 1024).toFixed(0)} KB (anggaran ${BUDGET / 1024} KB)`)
console.log(`ditulis  : ${OUT_DIR}`)
