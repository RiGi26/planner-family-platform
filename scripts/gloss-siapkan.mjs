#!/usr/bin/env node
/**
 * Menyiapkan SATU batch glosa untuk diisi — tanpa jaringan, tanpa API berbayar.
 *
 * Writes scripts/data/gloss-batch.json: §3 verbatim from the brief, up to 25
 * items that have no Indonesian gloss yet, the §4.1 and §4.2 lists computed from
 * the dataset at this moment, and any vt/vi partner already glossed. The file is
 * then filled in inside a Claude Code session and handed to `gloss:terapkan`.
 *
 * No API key, no per-token bill, and the filling step is a place where a human
 * can read what is being written before it lands — which is what Commit 4 of §8
 * is for anyway.
 *
 * ONE BATCH AT A TIME, on purpose. The §4 lists are computed when this runs, so
 * batch N automatically sees everything batch N−1 wrote. Emitting all 33 batches
 * up front would freeze those lists at their startup state, and §4 would be dead
 * inside the run and alive only between runs — the collisions surfacing only
 * after all 810 items had been written.
 *
 * Run:
 *   npm run gloss:siapkan -- --lingkup 0-5     (Commit 4: kalibrasi)
 *   npm run gloss:siapkan -- --lingkup 6-25
 *   npm run gloss:siapkan -- --lingkup none    (item yang tak diklaim unit mana pun)
 *   npm run gloss:siapkan -- --lingkup semua   (seluruh 810 — harus diketik)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { MAKS_CATATAN, MAKS_ELEMEN, berglosa, isCounter, peerKey } from './lib/gloss-rules.mjs'
import {
  AUDIT,
  BATCH,
  UKURAN_BATCH,
  arsipkanBatch,
  bacaPanduan,
  gagal,
  konteksKeunikan,
  muatDataset,
  pasanganSudahBerglosa,
  susunBatch,
} from './lib/gloss-data.mjs'

const argv = process.argv.slice(2)

/**
 * `--lingkup` WAJIB, tanpa nilai bawaan. A default of "everything" turns one
 * mistyped command into a run over all 810 items — and fills in the very items
 * Commit 4 exists to leave alone until ~70 have been read by a human.
 */
function parseLingkup() {
  const i = argv.indexOf('--lingkup')
  if (i === -1) {
    gagal(
      '--lingkup wajib. Contoh: --lingkup 0-5 · --lingkup 6-25 · --lingkup none ' +
        '(item tanpa unit) · --lingkup semua (seluruh 810 item).',
    )
  }
  const spec = argv[i + 1]
  if (!spec || spec.startsWith('--')) gagal('--lingkup butuh nilai, mis. "0-5" atau "none"')
  if (spec === 'semua') return { set: null, label: 'semua' }
  if (spec === 'none') return { set: 'none', label: 'tanpa unit' }
  const set = new Set()
  for (const bagian of spec.split(',')) {
    const m = bagian.match(/^(\d+)(?:-(\d+))$/) ?? bagian.match(/^(\d+)$/)
    if (!m) gagal(`bagian "--lingkup" tidak terbaca: ${bagian}`)
    const dari = Number(m[1])
    const sampai = m[2] === undefined ? dari : Number(m[2])
    for (let n = dari; n <= sampai; n++) set.add(n)
  }
  if (!set.size) gagal('--lingkup tidak menghasilkan satu unit pun')
  return { set, label: spec }
}

const { set: UNITS, label: LINGKUP } = parseLingkup()
const { semua, judulUnit } = muatDataset()
const PANDUAN = bacaPanduan()

function dalamLingkup(item) {
  if (UNITS === null) return true
  if (UNITS === 'none') return item.data.unit == null
  return item.data.unit != null && UNITS.has(item.data.unit)
}

/** §5: idempoten — item yang glosanya sudah ada tidak pernah masuk antrean. */
const antrean = semua.filter((i) => dalamLingkup(i) && !berglosa(i))
const batches = susunBatch(antrean)

console.log(`lingkup   : ${LINGKUP}`)
console.log(`antre     : ${antrean.length} item belum berglosa`)
console.log(`batch     : ${batches.length} tersisa (±${UKURAN_BATCH} item per batch)`)

if (!batches.length) {
  console.log('\ntidak ada yang perlu disiapkan — semua item di lingkup ini sudah berglosa.')
  process.exit(0)
}

/**
 * What was already tried on these items, and why it was refused.
 *
 * An item comes back into the queue precisely because `gloss:terapkan` rejected
 * it, and without its history the next person to fill the batch is blind: they
 * see an empty `meanings_id` with no hint that "kamu" has already been proposed
 * and refused, and can propose it again indefinitely. When the API call was in
 * the loop, the retry carried its own rejection reasons back to the model; that
 * feedback left with the API, and this is what replaces it.
 */
function riwayatPenolakan() {
  if (!existsSync(AUDIT)) return new Map()
  let audit
  try {
    audit = JSON.parse(readFileSync(AUDIT, 'utf8'))
  } catch {
    return new Map()
  }
  const peta = new Map()
  for (const t of Array.isArray(audit.ditolak) ? audit.ditolak : []) {
    if (!t?.id || !t.alasan) continue
    if (!peta.has(t.id)) peta.set(t.id, [])
    peta.get(t.id).push({ usulan: t.kandidat ?? [], alasan: t.alasan })
  }
  return peta
}

const batch = batches[0]
const konteks = konteksKeunikan(batch, semua)
const pasangan = pasanganSudahBerglosa(batch, semua)
const riwayat = riwayatPenolakan()
const batchBerRiwayat = batch.filter((i) => riwayat.has(i.id)).length

const isi = {
  petunjuk: [
    'Isi "meanings_id" tiap item dengan glosa bahasa Indonesia, mengikuti panduan_3 di bawah.',
    `Maksimal ${MAKS_ELEMEN} elemen; elemen pertama = arti yang dipakai di unit item itu.`,
    'Jangan mengubah field lain, dan jangan menyentuh "inggris" — itu data sumber CC BY-SA.',
    'Setelah terisi, jalankan: npm run gloss:terapkan',
  ],
  aturan_catatan: [
    'Isi "gloss_note_id" HANYA dalam dua keadaan:',
    '1. ungkapan tetap §3.7 — catat fungsinya atau adat pemakaiannya',
    '   (mis. いただきます → harfiah: "saya menerima")',
    '2. item dengan jebakan pemakaian NYATA, yaitu ketika glosanya sendiri akan',
    '   menyesatkan kalau dipakai apa adanya (mis. あなた: jarang dipakai kepada',
    '   orang yang namanya sudah diketahui — pakai namanya)',
    `Selain itu null. Maksimal ${MAKS_CATATAN} karakter.`,
    'Catatan yang diisi untuk tiap item menjadi kebisingan dan reviewer berhenti',
    'membacanya — termasuk dua catatan yang benar-benar penting.',
  ],
  lingkup: LINGKUP,
  batch_tersisa: batches.length,
  panduan_3: PANDUAN,
  glosa_terpakai: {
    catatan:
      'Elemen pertama yang SUDAH dipakai — glosa baru tidak boleh kembar dengannya. ' +
      'per_unit = §4.1. per_kelas = §4.2, dan itu LINTAS-UNIT: dua item bisa jadi ' +
      'pengecoh satu sama lain walau unitnya berjauhan.',
    per_unit: konteks.perUnit,
    per_kelas: konteks.perKelas,
  },
  pasangan_vt_vi: {
    catatan:
      'Pasangan 他動詞/自動詞 seakar yang sisi lainnya sudah berglosa (§3.3). Kalau ' +
      'sisinya berbeda (vt lawan vi), awalan glosanya WAJIB berbeda: transitif pakai ' +
      'me-/mem-/meng-, intransitif pakai bentuk dasar atau ter-/ber-. Berbeda saja ' +
      'tidak cukup. Item bertanda vt/vi ambitransitif: tetap bedakan dari pasangannya.',
    daftar: pasangan,
  },
  item: batch.map((item) => {
    const pos = Array.isArray(item.data.pos) ? item.data.pos : []
    return {
      id: item.id,
      ekspresi: item.expression,
      bacaan: item.reading || null,
      jenis: item.type,
      kelas_kata: peerKey(item),
      inggris: item.meanings.en,
      pos: pos.length ? pos : null,
      verb_group: typeof item.data.verb_group === 'string' ? item.data.verb_group : null,
      unit: item.data.unit ?? null,
      judul_unit: item.data.unit != null ? (judulUnit.get(item.data.unit) ?? null) : null,
      penggolong: isCounter(item),
      // Ada hanya kalau item ini pernah ditolak — usulan lalu beserta alasannya,
      // supaya pengisi berikutnya tidak mengusulkan hal yang sama lagi.
      riwayat_penolakan: riwayat.get(item.id) ?? null,
      meanings_id: [],
      gloss_note_id: null,
    }
  }),
}

// Berkas lama diarsipkan DULU: begitu writeFileSync di bawah berjalan, isi
// sebelumnya — termasuk versi §3 yang berlaku waktu itu — hilang untuk selamanya.
const arsip = arsipkanBatch()

mkdirSync(dirname(BATCH), { recursive: true })
writeFileSync(BATCH, JSON.stringify(isi, null, 2) + '\n', 'utf8')

console.log('')
if (arsip) {
  const nomor = String(arsip.nomor).padStart(3, '0')
  console.log(
    arsip.dilewati
      ? `arsip     : batch lama sama persis dengan ${nomor}.json — tidak dinomori ulang`
      : `arsip     : batch lama disalin ke riwayat-batch/${nomor}.json`,
  )
}
console.log(`ditulis   : ${BATCH}`)
console.log(`isi       : ${batch.length} item, unit ${[...new Set(batch.map((i) => i.data.unit ?? 'tanpa'))].join(', ')}`)
console.log(`§4.1      : ${Object.keys(konteks.perUnit).length} unit dengan glosa terpakai`)
console.log(`§4.2      : ${Object.keys(konteks.perKelas).length} kelas kata dengan glosa terpakai`)
console.log(`§3.3      : ${pasangan.length} pasangan vt/vi yang sisi lainnya sudah berglosa`)
console.log(`riwayat   : ${batchBerRiwayat} item pernah ditolak, usulan lalunya ikut dibawa`)
console.log('')
console.log('BERIKUTNYA: isi "meanings_id" tiap item, lalu `npm run gloss:terapkan`')
