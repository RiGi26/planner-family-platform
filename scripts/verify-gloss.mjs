#!/usr/bin/env node
/**
 * Checks the Indonesian glosses against Brief 01 §3, §4 and §6.
 *
 * Written BEFORE the generator, on purpose (§8). The other order produces 810
 * glosses and only then discovers that half of them collide inside their own
 * unit — and a collision is far cheaper to prevent than to repair, because
 * repairing one means re-picking a word that must still be right for the item
 * AND unlike every neighbour it shares a card pile with.
 *
 * Every check reports WHICH items failed, not how many. A count tells you there
 * is a problem; an id tells you where to go. Long lists are truncated for
 * readability — pass --all to print every id.
 *
 * kana is skipped entirely (§2.2): its "meanings" are romaji, not English, so
 * "gloss identical to source" would fail all 208 of them and mean nothing.
 *
 * CORRECTNESS, NOT COMPLETENESS. Every run asks "is what has been written right?"
 * and stays silent about what has not been written yet, which appears in the
 * summary as a number. The split is what keeps this usable on every push: an
 * unwritten gloss is the normal state for weeks while Brief 01 is worked through
 * unit by unit, and a check that fails for that reason is red every single day
 * for a reason nobody can act on. Red then stops meaning "something broke" — and
 * once a signal has cried wolf for a fortnight, the real breakage arrives to an
 * audience that has stopped looking.
 *
 * --lengkap adds completeness back as a failure. That is the release gate in §7,
 * asked once when the answer is supposed to be "all of them", not on every push.
 *
 * Run: npm run verify:gloss   ·   gerbang rilis: npm run verify:gloss -- --lengkap
 */

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import {
  ATURAN_BENTUK,
  MAKS_ELEMEN,
  berglosa as glossed,
  cekPenggolong,
  isCounter,
  norm,
  peerKey,
} from './lib/gloss-rules.mjs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const DATA = join(ROOT, 'src', 'data')
const SHOW_ALL = process.argv.includes('--all')
const CEK_LENGKAP = process.argv.includes('--lengkap')
const PREVIEW = SHOW_ALL ? Infinity : 8

const FILES = ['vocab_n5.json', 'kanji_n5.json', 'grammar_n5.json']
const read = (name) => JSON.parse(readFileSync(join(DATA, name), 'utf8'))

const items = FILES.flatMap(read).filter((i) => i.type !== 'kana')
const kanaCount = read('kana.json').length

// ---------------------------------------------------------------------------
// baseline — the previous commit, for the two "must not regress" rules
// ---------------------------------------------------------------------------

/**
 * The committed state of the datasets, keyed by item id.
 *
 * Two rules can only be checked against history: source data must not drift, and
 * a review status must not fall back to false. Both are about what CHANGED, and
 * the working tree alone cannot answer that.
 *
 * A missing baseline (fresh clone with no HEAD, file not committed yet) is not an
 * error — it is simply nothing to compare against, and the run says so rather
 * than passing quietly as though the rules had been checked.
 *
 * VERIFY_GLOSS_BASE points the comparison at another ref, and which ref is right
 * depends on when you are asking. On a laptop the change under review is still
 * uncommitted, so "the previous commit" is HEAD — the default. In CI that same
 * change has already become HEAD, so comparing against it compares the tree with
 * itself and both rules pass without checking anything.
 *
 * ci.yml therefore passes the point the work actually started from: the branch
 * tip before the push, or the PR's base. Not HEAD^ — a push carrying three
 * commits would only have its last one examined, so a regression introduced in
 * the first would sail through while the run stayed green.
 *
 * It also makes the rules testable at all: a rule about history cannot be
 * exercised against a history that has only ever held one value.
 */
const BASE_ENV = process.env.VERIFY_GLOSS_BASE

/**
 * An all-zero SHA is git's way of saying "there was nothing before this" — the
 * first push to a new branch. Nothing before means nothing to compare, not a
 * violation.
 */
const NO_BASE = BASE_ENV !== undefined && (BASE_ENV.trim() === '' || /^0{7,40}$/.test(BASE_ENV.trim()))
const BASE_REF = BASE_ENV?.trim() || 'HEAD'

function loadBaseline() {
  if (NO_BASE) return null
  const map = new Map()
  for (const name of FILES) {
    let raw
    try {
      raw = execFileSync('git', ['show', `${BASE_REF}:src/data/${name}`], {
        cwd: ROOT,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'ignore'],
      })
    } catch {
      return null
    }
    for (const row of JSON.parse(raw)) map.set(row.id, row)
  }
  return map
}

const baseline = loadBaseline()

/** Pre-migration rows carried a bare array; both shapes answer "what was the English". */
const englishOf = (row) => (Array.isArray(row.meanings) ? row.meanings : (row.meanings?.en ?? []))

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// rules
//
// Classification (wordClass, peerKey, isCounter) and the per-gloss shape rules
// live in scripts/lib/gloss-rules.mjs, because the generator has to satisfy the
// very same rules before it writes anything. Two copies would let the generator
// group items one way and this validator check another — a disagreement that
// only surfaces after 810 glosses exist.
// ---------------------------------------------------------------------------

const failures = []
const warnings = []

/** `hits` is a list of {id, detail}; an empty list records the rule as passed. */
const rule = (bucket, title, hits) => bucket.push({ title, hits })

// --- Kelengkapan — hanya GAGAL kalau diminta ---------------------------------

/**
 * The one rule that is about how much work is left rather than whether the work
 * is right. It is a number in the summary by default and a failure under
 * --lengkap; §6 and §7 explain why the two questions are asked separately.
 */
const belum = items.filter((i) => !glossed(i))
if (CEK_LENGKAP) {
  rule(failures, 'meanings.id kosong (§6, gerbang kelengkapan)', belum.map((i) => ({ id: i.id })))
}

// --- Gagal — kebenaran, hanya atas item yang SUDAH punya glosa ---------------

/**
 * Every rule below reads a gloss, so every rule below is scoped to items that
 * have one. An item with no gloss cannot have a bad one, and reporting it as
 * though it did would be re-stating the completeness count in ten disguises.
 *
 * The two history rules at the end are deliberately NOT scoped this way. They
 * ask what changed between two commits, never what a gloss says, so an empty
 * `meanings.id` cannot make them fire — and narrowing them to glossed items
 * would drop the CC BY-SA source-data guard for exactly the 810 items that have
 * no gloss yet, which is all of them today.
 */
const berglosa = items.filter(glossed)

const byUnit = new Map()
for (const i of berglosa) {
  if (i.data.unit == null) continue
  const key = i.data.unit
  if (!byUnit.has(key)) byUnit.set(key, [])
  byUnit.get(key).push(i)
}
rule(failures, 'glosa pertama kembar di dalam satu unit (§4.1)', collisions(byUnit, (u) => `unit ${u}`))

const byClass = new Map()
for (const i of berglosa) {
  const key = peerKey(i)
  if (!byClass.has(key)) byClass.set(key, [])
  byClass.get(key).push(i)
}
rule(failures, 'glosa pertama kembar antar item sejenis (§4.2)', collisions(byClass, (k) => k))

rule(
  failures,
  'glosa identik dengan sumber Inggris — tandanya belum diterjemahkan',
  berglosa
    .filter((i) => norm(i.meanings.id.join('|')) === norm(i.meanings.en.join('|')))
    .map((i) => ({ id: i.id, detail: i.meanings.id.join('; ') })),
)

// Delegated to scripts/lib/gloss-rules.mjs so the generator can pre-check the
// exact same rules before it spends a batch (§3.10, §3.1).
for (const { nama, cek } of ATURAN_BENTUK) {
  rule(failures, `bentuk glosa: ${nama}`, flagGloss(berglosa, (g) => cek(g) !== null))
}

rule(
  failures,
  'penggolong harus satu elemen, satu kata, tanpa kurung (§3.6)',
  berglosa
    .filter(isCounter)
    .map((i) => ({ item: i, sebab: cekPenggolong(i.meanings.id) }))
    .filter((x) => x.sebab)
    .map((x) => ({ id: x.item.id, detail: x.sebab })),
)

rule(
  failures,
  `lebih dari ${MAKS_ELEMEN} elemen (§3.1)`,
  berglosa
    .filter((i) => i.meanings.id.length > MAKS_ELEMEN)
    .map((i) => ({ id: i.id, detail: `${i.meanings.id.length} elemen` })),
)

if (baseline) {
  rule(
    failures,
    'meanings.en berubah dari commit sebelumnya — data sumber CC BY-SA',
    items
      .filter((i) => baseline.has(i.id))
      .filter((i) => JSON.stringify(englishOf(baseline.get(i.id))) !== JSON.stringify(i.meanings.en))
      .map((i) => ({
        id: i.id,
        detail: `${JSON.stringify(englishOf(baseline.get(i.id)))} → ${JSON.stringify(i.meanings.en)}`,
      })),
  )

  /**
   * The mirror of the rule above, and the only thing that catches a partly broken
   * preservation in fetch-jlpt.mjs (§2.6). dataset.test.ts notices a field that
   * VANISHED; it cannot notice `true` quietly becoming `false`, because both are
   * valid booleans and the gloss on screen still reads correctly. Nothing writes
   * the flag back either — gloss:siapkan skips items that already have a gloss —
   * so a reset is permanent and silent unless it is caught here.
   */
  rule(
    failures,
    'gloss_reviewed mundur dari true ke false (§2.6)',
    items
      .filter((i) => baseline.get(i.id)?.data?.gloss_reviewed === true)
      .filter((i) => i.data.gloss_reviewed !== true)
      .map((i) => ({ id: i.id, detail: `sebelumnya sudah direview` })),
  )
}

// --- Peringatan -------------------------------------------------------------

/**
 * Leftovers, not vocabulary. Every entry here is a phrase that only appears in a
 * gloss because the English was carried across instead of translated — matched
 * as whole words so Indonesian never trips over a substring.
 */
const SISA_INGGRIS = [
  'counter for', 'to be', 'to do', 'to go', 'to have', 'to make',
  'the', 'and', 'with', 'from', 'that', 'this', 'thing', 'person',
  'something', 'someone', 'used', 'polite', 'honorific', 'suffix', 'prefix',
]
const SISA_RE = new RegExp(`\\b(${SISA_INGGRIS.join('|')})\\b`, 'i')

rule(warnings, 'glosa masih memuat kata Inggris', flagGloss(berglosa, (g) => SISA_RE.test(g)))

const AWALAN_TRANSITIF = /^(me|mem|men|meng|meny|memper)/i
const akarKanji = (s) => (s.match(/^[一-鿿]+/) ?? [''])[0]
const byRoot = new Map()
for (const i of items) {
  const pos = Array.isArray(i.data.pos) ? i.data.pos : []
  const jenis = pos.includes('vt') ? 'vt' : pos.includes('vi') ? 'vi' : null
  const akar = akarKanji(i.expression)
  if (!jenis || !akar) continue
  if (!byRoot.has(akar)) byRoot.set(akar, [])
  byRoot.get(akar).push({ item: i, jenis })
}
const vtviHits = []
for (const [akar, anggota] of byRoot) {
  const vt = anggota.filter((a) => a.jenis === 'vt')
  const vi = anggota.filter((a) => a.jenis === 'vi')
  if (!vt.length || !vi.length) continue
  for (const t of vt) {
    for (const n of vi) {
      if (!glossed(t.item) || !glossed(n.item)) continue
      const gt = t.item.meanings.id[0]
      const gn = n.item.meanings.id[0]
      // §3.3: transitive takes me-/mem-/meng-, intransitive stays bare or ter-/ber-.
      if (AWALAN_TRANSITIF.test(gt) && !AWALAN_TRANSITIF.test(gn)) continue
      vtviHits.push({
        id: `${t.item.id} ↔ ${n.item.id}`,
        detail: `akar ${akar}: "${gt}" (vt) vs "${gn}" (vi)`,
      })
    }
  }
}
rule(warnings, 'pasangan vt/vi seakar yang glosanya tidak dibedakan awalan (§3.3)', vtviHits)

const global = new Map()
for (const i of items) {
  if (!glossed(i)) continue
  const key = norm(i.meanings.id[0])
  if (!global.has(key)) global.set(key, [])
  global.get(key).push(i)
}
rule(
  warnings,
  'glosa pertama kembar secara global (§4.3)',
  [...global.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([gloss, group]) => ({ id: group.map((i) => i.id).join(' · '), detail: `"${gloss}"` })),
)

rule(
  warnings,
  'gloss_note_id lebih dari 80 karakter (§6)',
  items
    .filter((i) => typeof i.data.gloss_note_id === 'string' && i.data.gloss_note_id.length > 80)
    .map((i) => ({ id: i.id, detail: `${i.data.gloss_note_id.length} karakter` })),
)

// ---------------------------------------------------------------------------
// helpers used above
// ---------------------------------------------------------------------------

/** Items sharing a first gloss inside the same bucket, reported per clash. */
function collisions(groups, label) {
  const hits = []
  for (const [key, group] of groups) {
    const seen = new Map()
    for (const i of group) {
      const g = norm(i.meanings.id[0])
      if (!seen.has(g)) seen.set(g, [])
      seen.get(g).push(i)
    }
    for (const [gloss, clash] of seen) {
      if (clash.length < 2) continue
      hits.push({ id: clash.map((i) => i.id).join(' · '), detail: `${label(key)}: "${gloss}"` })
    }
  }
  return hits
}

/** Items with at least one gloss element matching `bad`, reported with the offender. */
function flagGloss(list, bad) {
  return list
    .filter((i) => i.meanings.id.some(bad))
    .map((i) => ({ id: i.id, detail: i.meanings.id.filter(bad).map((g) => `"${g}"`).join(', ') }))
}

// ---------------------------------------------------------------------------
// report
// ---------------------------------------------------------------------------

function print(bucket, heading) {
  const active = bucket.filter((r) => r.hits.length > 0)
  if (!active.length) return 0
  console.log(`\n${heading}`)
  for (const { title, hits } of active) {
    console.log(`\n  ${title} — ${hits.length} item`)
    for (const h of hits.slice(0, PREVIEW)) {
      console.log(`    ${h.id}${h.detail ? `  ${h.detail}` : ''}`)
    }
    if (hits.length > PREVIEW) {
      console.log(`    … dan ${hits.length - PREVIEW} lagi (jalankan dengan --all untuk semua)`)
    }
  }
  return active.reduce((n, r) => n + r.hits.length, 0)
}

const reviewed = items.filter((i) => i.data.gloss_reviewed === true).length
console.log(`item non-kana  : ${items.length} (kana ${kanaCount} dilewati seluruhnya, §2.2)`)
console.log(`sudah berglosa : ${berglosa.length} — inilah yang diperiksa aturan kebenaran`)
console.log(
  `belum berglosa : ${belum.length}` +
    (belum.length && !CEK_LENGKAP ? ' (bukan kegagalan di sini — pakai --lengkap untuk gerbang §7)' : ''),
)
console.log(`direview       : ${reviewed}/${items.length} oleh penutur asli`)
if (!baseline) {
  const sebab = NO_BASE ? 'tidak ada commit sebelumnya' : `"${BASE_REF}" tidak bisa dibaca`
  console.log(`catatan        : ${sebab} — aturan "meanings.en tidak berubah"`)
  console.log('                 dan "gloss_reviewed tidak mundur" DILEWATI, bukan lulus')
} else {
  console.log(`pembanding     : ${BASE_REF}`)
}
if (!items.some(isCounter)) {
  console.log('catatan        : belum ada entri penggolong (助数詞) di dataset — aturan §3.6 tak kena apa pun')
}

const nWarn = print(warnings, 'PERINGATAN — boleh lolos, dicatat')
const nFail = print(failures, 'GAGAL — harus diperbaiki sebelum commit')

console.log('')
if (nFail > 0) {
  console.error(`${nFail} pelanggaran di ${failures.filter((r) => r.hits.length).length} aturan.`)
  process.exit(1)
}
if (!berglosa.length) {
  console.log('belum ada glosa Indonesia untuk diperiksa — tidak ada aturan kebenaran yang dilanggar.')
} else {
  console.log(`${berglosa.length} glosa lolos semua aturan kebenaran §6.`)
}
if (nWarn) console.log(`${nWarn} peringatan dicatat di atas.`)
if (belum.length && !CEK_LENGKAP) {
  console.log(`${belum.length} item masih menunggu glosa — kelengkapan diuji terpisah (--lengkap).`)
}
