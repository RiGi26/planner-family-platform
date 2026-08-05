#!/usr/bin/env node
/**
 * Builds public/fonts/*.woff2 containing only the glyphs this app can display.
 *
 * `next/font/google` downloads a Japanese family the way Google slices it: 121
 * unicode-range blocks per weight, 865 files, 13.2 MB. Serwist then precaches all
 * of it, so installing the PWA meant fetching thirteen megabytes before the first
 * screen worked offline — and none of it was ever rendered, because globals.css
 * asked for the literal family name while next/font registered a hashed one.
 *
 * Google's CSS API takes a `text=` parameter and returns one @font-face holding
 * exactly those glyphs. That is the whole mechanism: no new dependency, and the
 * same build-time fetch shape as fetch-kanjivg.mjs.
 *
 * The glyph set is computed from the repo rather than typed out, so a new kana or
 * a new kanji in the UI cannot be forgotten. `npm run verify:fonts` re-derives it
 * and fails if anything on screen would now fall back to a system font.
 *
 * Run: npm run fonts
 * Output: public/fonts/<slug>-<weight>.woff2 + glyphs.json
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const SRC = join(ROOT, 'src')
const OUT_DIR = join(ROOT, 'public', 'fonts')

/**
 * Weights are the ones the code actually asks for, not the ones that exist.
 *
 * Zen Kaku has no 600 — Google answers HTTP 400 for it — so `font-semibold`
 * already resolves to 700 today and shipping 400/500/700 changes nothing on
 * screen. Mincho is only ever used at one size for 升 and 始, and the mono face
 * only carries `.tnum` digits.
 */
const FAMILIES = [
  { family: 'Zen Kaku Gothic New', slug: 'zen-kaku', weights: [400, 500, 700] },
  { family: 'Zen Old Mincho', slug: 'zen-mincho', weights: [400] },
  { family: 'IBM Plex Mono', slug: 'plex-mono', weights: [400, 500] },
]

/** Google answers TTF to an unknown client; only a browser-class UA gets woff2. */
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

/** Everything the app can render outside Japanese: Latin, digits, punctuation. */
const ASCII = Array.from({ length: 0x7e - 0x20 + 1 }, (_, i) => String.fromCharCode(0x20 + i)).join('')

/**
 * Sweep every non-ASCII character, not just the Japanese ranges.
 *
 * The first version of this looked only for kana and ideographs, and the heading
 * `五十音 · gojūon` slipped straight through it: the `ū` is Latin Extended-A, so
 * it fell back to a system font mid-word. It *looked* fine, which is the whole
 * problem — a wrong face on one letter is not something anyone notices, and the
 * check that was supposed to catch drift had the same blind spot as the builder.
 *
 * Deliberately greedy: it also sweeps code comments, so a few glyphs that exist
 * only in prose get included. Tens of bytes against a silently wrong glyph is not
 * a close call.
 */
const NON_ASCII = /[^\x00-\x7F]/gu

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
  const set = new Set(ASCII)
  for (const file of walk(SRC)) {
    for (const m of readFileSync(file, 'utf8').matchAll(NON_ASCII)) set.add(m[0])
  }

  // `text-transform: uppercase` renders a glyph that appears nowhere in the
  // source: the heading is written `gojūon` and drawn `GOJŪON`. Folding both
  // cases in covers every uppercase class without having to know which strings
  // wear one.
  for (const ch of [...set]) {
    set.add(ch.toLocaleUpperCase('id'))
    set.add(ch.toLocaleLowerCase('id'))
  }

  // Case folding can produce multi-character results (ß → SS); those are already
  // covered by their parts, and a two-character "glyph" would confuse the count.
  return [...set].filter((c) => [...c].length === 1).sort()
}

async function subset(family, weight, text) {
  const url =
    `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}` +
    `:wght@${weight}&text=${encodeURIComponent(text)}`

  const cssRes = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!cssRes.ok) throw new Error(`CSS ${family} ${weight}: HTTP ${cssRes.status}`)
  const css = await cssRes.text()

  // The failure that costs the most is the silent one: when `text=` is ignored,
  // Google answers with the full sliced family — 121 @font-face blocks for a
  // Japanese font — and everything downstream still "works" while shipping
  // megabytes. Counting the blocks catches exactly that.
  const blocks = (css.match(/@font-face/g) ?? []).length
  if (blocks !== 1) {
    throw new Error(`${family} ${weight}: ${blocks} @font-face — parameter text= diabaikan`)
  }
  if (!css.includes("format('woff2')")) {
    throw new Error(`${family} ${weight}: bukan woff2 — User-Agent tidak dikenali sebagai browser`)
  }

  const match = css.match(/url\((https:\/\/[^)]+)\)/)
  if (!match) throw new Error(`${family} ${weight}: tidak ada url() di CSS`)

  const fontRes = await fetch(match[1], { headers: { 'User-Agent': UA } })
  if (!fontRes.ok) throw new Error(`font ${family} ${weight}: HTTP ${fontRes.status}`)
  const bytes = Buffer.from(await fontRes.arrayBuffer())

  // wOF2. Four bytes that catch every "we were served the wrong format" case.
  if (bytes.subarray(0, 4).toString('latin1') !== 'wOF2') {
    throw new Error(`${family} ${weight}: berkas bukan woff2 (magic ${bytes.subarray(0, 4).toString('hex')})`)
  }

  return bytes
}

const glyphs = collectGlyphs()
const text = glyphs.join('')
const nonAscii = glyphs.filter((c) => c.codePointAt(0) > 0x7f).length

console.log(`Glyph terkumpul: ${glyphs.length} (${nonAscii} non-ASCII, ${glyphs.length - nonAscii} ASCII)`)

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })

const written = []
// Six requests in all; sequential keeps the failure message attached to the
// family that failed, which matters more here than a second of wall clock.
for (const { family, slug, weights } of FAMILIES) {
  for (const weight of weights) {
    const bytes = await subset(family, weight, text)
    const name = `${slug}-${weight}.woff2`
    writeFileSync(join(OUT_DIR, name), bytes)
    written.push({ name, bytes: bytes.length })
    console.log(`  ${name.padEnd(22)} ${(bytes.length / 1024).toFixed(1).padStart(6)} KB`)
  }
}

const total = written.reduce((sum, f) => sum + f.bytes, 0)

// The budget that made this worth doing. Failing loudly beats quietly shipping a
// regression back towards thirteen megabytes.
const BUDGET = 500 * 1024
if (total > BUDGET) {
  console.error(`\nTotal ${(total / 1024).toFixed(0)} KB melewati anggaran 500 KB.`)
  process.exit(1)
}

writeFileSync(
  join(OUT_DIR, 'glyphs.json'),
  JSON.stringify({ count: glyphs.length, glyphs: text }) + '\n',
  'utf8',
)

console.log(`\nberkas   : ${written.length}`)
console.log(`total    : ${(total / 1024).toFixed(0)} KB (anggaran 500 KB)`)
console.log(`ditulis  : ${OUT_DIR}`)
