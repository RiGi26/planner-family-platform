#!/usr/bin/env node
/**
 * Menerapkan batch yang sudah diisi ke dataset — tanpa jaringan.
 *
 * Reads scripts/data/gloss-batch.json, validates every filled gloss against the
 * §3/§4 rules in scripts/lib/gloss-rules.mjs, writes the ones that pass into
 * vocab_n5.json / kanji_n5.json / grammar_n5.json with `gloss_reviewed: false`,
 * and rebuilds scripts/data/gloss-audit.json — the document a reviewer reads (§7).
 *
 * REJECTED ENTRIES ARE LEFT WITHOUT A GLOSS, with the reason recorded. An item
 * whose `meanings.id` is empty is picked up again by the next `gloss:siapkan`
 * (idempotency) and is still counted missing by `verify:gloss --lengkap`. Writing
 * a known-bad gloss does the opposite: it marks the item done, hides it from
 * both, and leaves a violation only a human re-reading §6 would ever find.
 *
 * Run: npm run gloss:terapkan
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { MAKS_CATATAN, berglosa } from './lib/gloss-rules.mjs'
import { AUDIT, BATCH, DATA, gagal, muatDataset, periksa } from './lib/gloss-data.mjs'

if (!existsSync(BATCH)) {
  gagal(`tidak ada ${BATCH} — jalankan \`npm run gloss:siapkan -- --lingkup <spec>\` dulu.`)
}

let berkasBatch
try {
  berkasBatch = JSON.parse(readFileSync(BATCH, 'utf8'))
} catch (e) {
  gagal(`${BATCH} bukan JSON yang sah: ${e.message}`)
}

const barisBatch = Array.isArray(berkasBatch.item) ? berkasBatch.item : null
if (!barisBatch?.length) gagal(`${BATCH} tidak punya senarai "item" yang berisi`)

const { berkas, semua, judulUnit } = muatDataset()
const indeks = new Map(semua.map((i) => [i.id, i]))

// ---------------------------------------------------------------------------
// gerbang: berkas yang belum diisi ditolak sebelum apa pun disentuh
// ---------------------------------------------------------------------------

const terisi = barisBatch.filter((b) => Array.isArray(b.meanings_id) && b.meanings_id.length > 0)

if (!terisi.length) {
  gagal(
    `${BATCH} masih kosong — tidak ada satu pun "meanings_id" yang terisi.\n` +
      '       Isi dulu glosanya, baru jalankan perintah ini. Menerapkan berkas kosong\n' +
      '       tidak akan menulis apa-apa tapi tetap membangun ulang audit, dan itu\n' +
      '       terbaca seolah batch-nya sudah dikerjakan.',
  )
}

// ---------------------------------------------------------------------------
// validasi
// ---------------------------------------------------------------------------

/** id → meanings.id. Kept separate from the notes map because `periksa` walks
 *  this one expecting every value to be a gloss array. */
const diterima = new Map()
/** id → gloss_note_id. */
const catatanDiterima = new Map()
const ditolak = []
/**
 * Baris yang memang tidak diisi — bukan usulan yang ditolak.
 *
 * Dipisah karena keduanya berarti hal yang berbeda bagi pembaca berikutnya. Satu
 * berkata "ini sudah dicoba dan begini salahnya"; satunya cuma berkata "belum
 * dikerjakan". Mencampurnya membuat ringkasan berbunyi 13 ditolak padahal yang
 * benar-benar ditolak satu, dan membanjiri riwayat penolakan dengan entri yang
 * tidak memberi tahu apa-apa.
 */
const belumDiisi = []
const catatanDibuang = []

for (const baris of barisBatch) {
  const item = indeks.get(baris.id)
  if (!item) {
    ditolak.push({ id: baris.id, kandidat: baris.meanings_id ?? [], alasan: 'id tidak ada di dataset' })
    continue
  }
  if (berglosa(item)) {
    // Idempotency cuts both ways: a batch applied twice must not overwrite a
    // gloss that a human may already have corrected in the dataset.
    ditolak.push({ id: baris.id, kandidat: baris.meanings_id ?? [], alasan: 'item sudah berglosa, dilewati' })
    continue
  }
  if (!Array.isArray(baris.meanings_id) || baris.meanings_id.length === 0) {
    belumDiisi.push({ id: baris.id })
    continue
  }

  const sebab = periksa(item, baris.meanings_id, semua, diterima)
  if (sebab) {
    ditolak.push({ id: baris.id, kandidat: baris.meanings_id, alasan: sebab })
    continue
  }

  diterima.set(baris.id, baris.meanings_id)

  if (typeof baris.gloss_note_id === 'string' && baris.gloss_note_id.trim()) {
    const catatan = baris.gloss_note_id.trim()
    if (catatan.length > MAKS_CATATAN) {
      // An over-long note is a §6 *warning*, not a failure — not worth throwing
      // away a good gloss over. Keep the gloss, drop the note, and record it
      // separately so it never inflates the rejection count.
      catatanDibuang.push({
        id: baris.id,
        panjang: catatan.length,
        alasan: `lebih dari ${MAKS_CATATAN} karakter — catatan dibuang, glosa tetap dipakai`,
      })
    } else {
      catatanDiterima.set(baris.id, catatan)
    }
  }
}

// ---------------------------------------------------------------------------
// tulis dataset
// ---------------------------------------------------------------------------

let ditulis = 0
for (const [nama, baris] of berkas) {
  let disentuh = 0
  for (const row of baris) {
    const arti = diterima.get(row.id)
    if (!arti) continue
    row.meanings.id = arti
    // §7: nothing is reviewed until a human who reads both languages says so.
    row.data.gloss_reviewed = false
    const catatan = catatanDiterima.get(row.id)
    // Only written when one was actually supplied; the seeded null stays
    // otherwise, so an empty note never overwrites one a human added.
    if (catatan) row.data.gloss_note_id = catatan
    disentuh++
  }
  if (!disentuh) continue
  writeFileSync(join(DATA, nama), JSON.stringify(baris) + '\n', 'utf8')
  console.log(`ditulis   : ${nama} — ${disentuh} glosa`)
  ditulis += disentuh
}

// ---------------------------------------------------------------------------
// audit (§7)
// ---------------------------------------------------------------------------

/**
 * Rejections carried over from earlier runs, for items that are STILL without a
 * gloss and were not decided again this run.
 *
 * The audit is rebuilt from scratch each time, so without this the `ditolak`
 * list would only ever hold the most recent run's rejections. An item rejected
 * in run 1 and simply not attempted in run 2 would lose its history — and
 * `gloss:siapkan` reads exactly that list to tell the next person what was
 * already tried and why. Forgetting it puts them back where they started.
 */
function penolakanLama() {
  if (!existsSync(AUDIT)) return []
  let lama
  try {
    lama = JSON.parse(readFileSync(AUDIT, 'utf8'))
  } catch {
    return []
  }
  if (!Array.isArray(lama.ditolak)) return []
  const diputuskanKini = new Set([
    ...diterima.keys(),
    ...ditolak.map((t) => t.id),
    ...belumDiisi.map((t) => t.id),
  ])
  return lama.ditolak.filter((t) => {
    if (diputuskanKini.has(t.id)) return false
    const item = indeks.get(t.id)
    return item ? !berglosa(item) : false
  })
}

/**
 * Rebuilt from the dataset every run rather than appended to, so it always
 * describes what is actually in the files. A stale audit is worse than none,
 * because it is read as though it were current.
 */
function tulisAudit(ditolakGabungan) {
  const perUnit = new Map()
  for (const item of semua) {
    if (!berglosa(item)) continue
    const kunci = item.data.unit ?? 'tanpa-unit'
    if (!perUnit.has(kunci)) perUnit.set(kunci, [])
    perUnit.get(kunci).push({
      id: item.id,
      ekspresi: item.expression,
      bacaan: item.reading || null,
      jenis: item.type,
      en: item.meanings.en,
      id_glosa: item.meanings.id,
      catatan: item.data.gloss_note_id ?? null,
      direview: item.data.gloss_reviewed === true,
    })
  }

  const urut = [...perUnit.keys()].sort((a, b) => {
    if (a === 'tanpa-unit') return 1
    if (b === 'tanpa-unit') return -1
    return a - b
  })

  const isi = {
    catatan:
      'Dibaca reviewer penutur asli (§7). en = data sumber OpenJLPT (CC BY-SA), ' +
      'jangan diubah. id_glosa = glosa yang dinilai. direview:false artinya belum ' +
      'ada manusia yang membacanya.',
    ringkasan: {
      berglosa: semua.filter(berglosa).length,
      belum: semua.filter((i) => !berglosa(i)).length,
      direview: semua.filter((i) => i.data.gloss_reviewed === true).length,
    },
    unit: urut.map((n) => ({
      n,
      judul: typeof n === 'number' ? (judulUnit.get(n) ?? null) : null,
      item: perUnit.get(n),
    })),
    ditolak: ditolakGabungan,
    belum_diisi: belumDiisi,
    catatan_dibuang: catatanDibuang,
  }

  mkdirSync(dirname(AUDIT), { recursive: true })
  writeFileSync(AUDIT, JSON.stringify(isi, null, 2) + '\n', 'utf8')
  console.log(`ditulis   : ${AUDIT}`)
}

const ditolakGabungan = [...ditolak, ...penolakanLama()]
tulisAudit(ditolakGabungan)

console.log('')
console.log(
  `selesai   : ${ditulis} glosa diterapkan, ${ditolak.length} ditolak, ` +
    `${belumDiisi.length} belum diisi`,
)
for (const t of ditolak.slice(0, 10)) console.log(`            ${t.id} — ${t.alasan}`)
if (ditolak.length > 10) console.log(`            … dan ${ditolak.length - 10} lagi (lihat gloss-audit.json)`)
console.log('')
console.log('BERIKUTNYA: npm run verify:gloss  ← itu yang berwenang, bukan pemeriksaan di skrip ini')
if (ditolak.length) {
  console.log('            item yang ditolak tetap TANPA glosa — `gloss:siapkan` berikutnya mengambilnya lagi')
}
