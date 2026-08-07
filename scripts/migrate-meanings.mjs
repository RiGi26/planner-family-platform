#!/usr/bin/env node
/**
 * One-off: wraps `meanings: [...]` into `meanings: { en: [...], id: [...] }` and
 * seeds the gloss bookkeeping in `data`.
 *
 * Brief 01 §2.1. The English array is source data from OpenJLPT (CC BY-SA 4.0)
 * and moves across untouched — this script only changes the container, never a
 * character inside it. The Indonesian array starts empty; `glossOf()` falls back
 * to `en` until the generator fills it, which is why the app keeps working from
 * the moment this runs.
 *
 * `data.gloss_reviewed` and `data.gloss_note_id` are seeded here rather than left
 * to the generator, because fetch-jlpt.mjs has to preserve `gloss_reviewed` across
 * a refetch (§2.6) and cannot preserve a field that does not exist yet. The
 * generator skips items whose gloss is already written, so for those it would
 * never write the status back either.
 *
 * Kana is the exception (§2.2): its "meanings" are romaji, not English, so there
 * is nothing to translate and the value is copied into both arrays.
 *
 * Idempotent — a row already in the new shape is left exactly as it is, so this
 * can be run twice without wiping glosses written in between.
 *
 * After this, the generators write the new shape directly (fetch-jlpt.mjs,
 * generate-kana.mjs), so this file exists for the record and for anyone holding
 * an old checkout. It is deliberately not wired into an npm script.
 *
 * Run: node scripts/migrate-meanings.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const DATA = join(HERE, '..', 'src', 'data')

// kana.json is pretty-printed (generate-kana.mjs), the N5 files are not
// (fetch-jlpt.mjs). Matching each file's own generator keeps the diff to the
// meanings field instead of reformatting 682 rows.
const FILES = [
  { name: 'kana.json', kana: true, indent: 2 },
  { name: 'vocab_n5.json', kana: false, indent: 0 },
  { name: 'kanji_n5.json', kana: false, indent: 0 },
  { name: 'grammar_n5.json', kana: false, indent: 0 },
]

let failed = false

for (const { name, kana, indent } of FILES) {
  const path = join(DATA, name)
  const rows = JSON.parse(readFileSync(path, 'utf8'))

  let wrapped = 0
  let already = 0
  let seeded = 0

  for (const row of rows) {
    const m = row.meanings

    // Seeded regardless of which shape `meanings` is in, so a half-migrated file
    // ends up whole rather than half-seeded.
    //
    // Kana is left out on purpose. §2.2 excludes it from every gloss rule because
    // romaji is not a translation, so there is nothing for a native speaker to
    // approve — and a `gloss_reviewed: false` that can never honestly become true
    // would put 208 permanent failures in front of the release gate in §7.
    if (!kana) {
      if (!('gloss_reviewed' in row.data)) {
        row.data.gloss_reviewed = false
        seeded++
      }
      if (!('gloss_note_id' in row.data)) row.data.gloss_note_id = null
    }

    if (Array.isArray(m)) {
      row.meanings = { en: m, id: kana ? [...m] : [] }
      wrapped++
      continue
    }

    if (m && Array.isArray(m.en) && Array.isArray(m.id)) {
      already++
      continue
    }

    // Neither shape. Stopping is the right answer: guessing here would write a
    // dataset that typechecks and is quietly wrong.
    console.error(`FAIL ${name}: ${row.id} punya meanings yang tidak dikenali`)
    failed = true
  }

  if (failed) break

  writeFileSync(path, JSON.stringify(rows, null, indent || undefined) + '\n', 'utf8')
  console.log(
    `${name.padEnd(16)} ${rows.length} item — dibungkus ${wrapped}, ` +
      `sudah baru ${already}, status glosa disemai ${seeded}`,
  )
}

if (failed) process.exit(1)
console.log('\nSelesai. meanings.id masih kosong; glossOf() jatuh ke meanings.en sampai diisi.')
