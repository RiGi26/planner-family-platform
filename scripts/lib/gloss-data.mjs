/**
 * Everything `gloss:siapkan` and `gloss:terapkan` both need: the datasets, §3,
 * how items are grouped into batches, and the §4 checks.
 *
 * The two commands are halves of one operation — one asks the question, the
 * other records the answer — so their view of what counts as a batch, a peer
 * group, or a violation has to be identical. Two copies would let the prepared
 * file promise uniqueness in one grouping and the apply step reject it in
 * another.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ATURAN_BENTUK,
  MAKS_ELEMEN,
  berglosa,
  cekPenggolong,
  isCounter,
  norm,
  peerKey,
  sisiVt,
} from './gloss-rules.mjs'

export { sisiVt }

const HERE = dirname(fileURLToPath(import.meta.url))
export const ROOT = join(HERE, '..', '..')
export const DATA = join(ROOT, 'src', 'data')
export const BATCH = join(ROOT, 'scripts', 'data', 'gloss-batch.json')
export const AUDIT = join(ROOT, 'scripts', 'data', 'gloss-audit.json')
export const ARSIP = join(ROOT, 'scripts', 'data', 'riwayat-batch')
const BRIEF = join(ROOT, 'docs', 'BRIEF-01-glosa-id.md')

export const FILES = ['vocab_n5.json', 'kanji_n5.json', 'grammar_n5.json']
export const UKURAN_BATCH = 25

export function gagal(pesan) {
  console.error(`gloss: ${pesan}`)
  process.exit(1)
}

// ---------------------------------------------------------------------------
// arsip batch
// ---------------------------------------------------------------------------

const NAMA_ARSIP = /^(\d{3})\.json$/

/**
 * Menyalin `gloss-batch.json` ke `riwayat-batch/NNN.json` sebelum ia ditimpa.
 *
 * Berkas batch adalah rekaman PERTANYAAN — panduan §3 yang berlaku saat itu,
 * daftar §4 saat itu, pasangan vt/vi saat itu — dan `gloss:siapkan` menimpanya
 * setiap kali dipanggil. Tanpa arsip, satu-satunya salinan yang tersisa adalah
 * yang terakhir, dan pertanyaan "panduan versi mana yang menghasilkan glosa ini"
 * jadi tak terjawab justru untuk batch yang paling lama umurnya.
 *
 * Kalibrasi batch 1 membuktikan itu bukan kekhawatiran karangan: §3.5 berubah
 * SETELAH batch 1 diisi, jadi arsip 001 memuat tabel deiksis lama sementara batch
 * 2 dan seterusnya memuat yang baru. Riwayat git menyimpannya juga, tapi hanya
 * bagi orang yang sudah tahu commit mana yang harus dicari.
 *
 * Salinan yang byte-nya identik dengan arsip terakhir dilewati: menjalankan
 * `gloss:siapkan` dua kali tanpa mengisi apa pun tidak menghasilkan pertanyaan
 * baru, dan menomori ulang isi yang sama membuat arsipnya berbohong soal berapa
 * banyak batch yang pernah dikerjakan.
 */
export function arsipkanBatch() {
  if (!existsSync(BATCH)) return null

  const isi = readFileSync(BATCH, 'utf8')
  mkdirSync(ARSIP, { recursive: true })

  const nomorAda = readdirSync(ARSIP)
    .map((n) => n.match(NAMA_ARSIP))
    .filter(Boolean)
    .map((m) => Number(m[1]))
    .sort((a, b) => a - b)

  const terakhir = nomorAda.at(-1)
  if (terakhir !== undefined) {
    const berkasTerakhir = join(ARSIP, `${String(terakhir).padStart(3, '0')}.json`)
    if (readFileSync(berkasTerakhir, 'utf8') === isi) {
      return { nomor: terakhir, berkas: berkasTerakhir, dilewati: true }
    }
  }

  const nomor = (terakhir ?? 0) + 1
  const berkas = join(ARSIP, `${String(nomor).padStart(3, '0')}.json`)
  writeFileSync(berkas, isi, 'utf8')
  return { nomor, berkas, dilewati: false }
}

// ---------------------------------------------------------------------------
// dataset
// ---------------------------------------------------------------------------

export function muatDataset() {
  const baca = (nama) => JSON.parse(readFileSync(join(DATA, nama), 'utf8'))
  const berkas = new Map(FILES.map((nama) => [nama, baca(nama)]))
  const semua = [...berkas.values()].flat().filter((i) => i.type !== 'kana')
  const judulUnit = new Map(baca('units_n5.json').map((u) => [u.n, u.title]))
  return { berkas, semua, judulUnit }
}

// ---------------------------------------------------------------------------
// §3 — dibaca dari brief, diperiksa keras
// ---------------------------------------------------------------------------

const PANDUAN_PENANDA = ['### 3.1', '### 3.6', '### 3.7', '### 3.10']
/** §3 is ~6,500 characters today. Anything under this is not §3. */
const PANDUAN_MIN_KARAKTER = 3000

/**
 * Slices §3 out of the brief, and proves it got the real thing.
 *
 * A missing heading is the easy failure — it throws. The dangerous one is a
 * heading that still matches while the section behind it is empty, truncated, or
 * renumbered: the prepared batch would carry an empty guidance field, whoever
 * fills it in works from memory instead of the spec, and nothing anywhere
 * reports a problem. Guidance that silently isn't there is worse than guidance
 * that's missing loudly.
 */
export function bacaPanduan() {
  const teks = readFileSync(BRIEF, 'utf8')
  const mulai = teks.indexOf('\n## 3. ')
  const akhir = teks.indexOf('\n## 4. ')

  if (mulai === -1) gagal(`tidak menemukan judul "## 3. " di ${BRIEF} — §3 dihapus atau diganti nama?`)
  if (akhir === -1) gagal(`tidak menemukan judul "## 4. " di ${BRIEF} — batas akhir §3 tak diketahui`)
  if (akhir < mulai) gagal(`§4 muncul sebelum §3 di ${BRIEF} — urutan bagian kacau`)

  const panduan = teks.slice(mulai, akhir).trim()

  if (panduan.length < PANDUAN_MIN_KARAKTER) {
    gagal(
      `§3 cuma ${panduan.length} karakter, di bawah ambang ${PANDUAN_MIN_KARAKTER}. ` +
        'Judulnya masih ada tapi isinya kosong atau terpotong — batch tanpa panduan ' +
        'menghasilkan glosa asal dari alur yang terlihat normal.',
    )
  }

  const hilang = PANDUAN_PENANDA.filter((p) => !panduan.includes(p))
  if (hilang.length) {
    gagal(
      `§3 tidak memuat subbagian ${hilang.join(', ')} — yang terambil bukan §3 yang utuh. ` +
        'Kalau subbagiannya memang dinomori ulang, perbarui PANDUAN_PENANDA di gloss-data.mjs.',
    )
  }

  return panduan
}

// ---------------------------------------------------------------------------
// batch
// ---------------------------------------------------------------------------

const akarKanji = (s) => (s.match(/^[一-鿿]+/) ?? [''])[0]

export function kunciPasangan(item) {
  if (!sisiVt(item)) return null
  const akar = akarKanji(item.expression)
  return akar ? `vtvi:${akar}` : null
}

/**
 * Items ordered by unit, with vt/vi root-mates pulled into one indivisible group.
 *
 * A transitive/intransitive pair must be glossed together or §3.3 cannot be
 * satisfied at all: 入る (unit 17) and 入れる (no unit) are never in the same unit,
 * so unit-ordered batching lands them in different batches and each — seeing only
 * its own half — quite reasonably gets "masuk". The distinction §3.3 exists to
 * teach is destroyed before any validator looks at it.
 */
export function susunBatch(daftar) {
  const urut = [...daftar].sort(
    (a, b) => (a.data.unit ?? 999) - (b.data.unit ?? 999) || a.seq - b.seq,
  )

  const grup = []
  const indeksGrup = new Map()
  for (const item of urut) {
    const kunci = kunciPasangan(item)
    if (kunci && indeksGrup.has(kunci)) {
      grup[indeksGrup.get(kunci)].push(item)
      continue
    }
    if (kunci) indeksGrup.set(kunci, grup.length)
    grup.push([item])
  }

  // Groups are never split, so a batch may run a little over UKURAN_BATCH — a
  // pair kept together is worth more than an exact count.
  const batch = []
  let sekarang = []
  for (const g of grup) {
    if (sekarang.length && sekarang.length + g.length > UKURAN_BATCH) {
      batch.push(sekarang)
      sekarang = []
    }
    sekarang.push(...g)
  }
  if (sekarang.length) batch.push(sekarang)
  return batch
}

// ---------------------------------------------------------------------------
// konteks keunikan (§4)
// ---------------------------------------------------------------------------

/**
 * The glosses a batch must not collide with, computed from the dataset AS IT IS
 * RIGHT NOW.
 *
 * §5 as written only asks for the glosses already used IN THAT UNIT, which
 * satisfies §4.1 and nothing else. §4.2 demands uniqueness among items of the
 * same type and word class, and that set is CROSS-UNIT: 入る and 入れる are never
 * in the same unit, so nothing in a unit-scoped list would stop both being born
 * as "masuk".
 *
 * Because this reads the dataset on every `gloss:siapkan`, batch N automatically
 * sees everything batch N−1 wrote — there is no cached list to go stale.
 */
export function konteksKeunikan(batch, semua) {
  // Kunci per_unit memuat tipe, karena §4.1 sadar-tipe: glosa kanji di unit 9 tidak
  // membatasi kosakata di unit 9. Menggabungkannya akan membuat pengisi batch
  // menghindari bentrok yang tidak ada.
  const unitBatch = new Set(
    batch.filter((i) => i.data.unit != null).map((i) => `${i.data.unit}/${i.type}`),
  )
  const kelasBatch = new Set(batch.map(peerKey))

  const perUnit = {}
  const perKelas = {}

  for (const item of semua) {
    if (!berglosa(item)) continue
    const glosa = item.meanings.id[0]

    const kunciUnit = item.data.unit != null ? `${item.data.unit}/${item.type}` : null
    if (kunciUnit && unitBatch.has(kunciUnit)) {
      ;(perUnit[kunciUnit] ??= []).push(glosa)
    }
    const kelas = peerKey(item)
    if (kelasBatch.has(kelas)) {
      ;(perKelas[kelas] ??= []).push(glosa)
    }
  }
  return { perUnit, perKelas }
}

/**
 * Partners that batching cannot help with: the other side of a vt/vi pair that
 * was already glossed, so it is not in the queue and cannot be pulled in.
 *
 * §4.2 alone does not save these — it only demands the two be *different*, while
 * §3.3 demands they be different *in a specific way* (transitive takes
 * me-/mem-/meng-, intransitive stays bare or takes ter-/ber-). "masuk" and
 * "kemasukan" satisfy §4.2 and still destroy the distinction.
 */
export function pasanganSudahBerglosa(batch, semua) {
  const idBatch = new Set(batch.map((i) => i.id))
  const hasil = []
  for (const item of batch) {
    const kunci = kunciPasangan(item)
    if (!kunci) continue
    for (const lain of semua) {
      if (lain.id === item.id || idBatch.has(lain.id)) continue
      if (kunciPasangan(lain) !== kunci || !berglosa(lain)) continue
      hasil.push({
        id: item.id,
        sisi: sisiVt(item),
        pasangan: lain.expression,
        sisi_pasangan: sisiVt(lain),
        glosa_pasangan: lain.meanings.id[0],
      })
    }
  }
  return hasil
}

// ---------------------------------------------------------------------------
// pemeriksaan
// ---------------------------------------------------------------------------

/**
 * A fast filter, NOT a second implementation of §6.
 *
 * It catches what one batch can be judged on in isolation — shape rules and the
 * uniqueness sets the batch itself carried — so an obviously spoiled entry never
 * reaches the dataset. `npm run verify:gloss` stays the authority; run it after
 * every apply.
 */
export function periksa(item, arti, semua, dalamBatch) {
  if (!Array.isArray(arti) || arti.length === 0) return 'glosa kosong'
  if (arti.length > MAKS_ELEMEN) return `${arti.length} elemen, maksimal ${MAKS_ELEMEN} (§3.1)`

  for (const g of arti) {
    if (typeof g !== 'string') return 'elemen bukan teks'
    for (const { cek } of ATURAN_BENTUK) {
      const sebab = cek(g)
      if (sebab) return `"${g}": ${sebab}`
    }
  }

  // Glosa yang identik dengan sumber Inggris TIDAK ditolak di sini. §6 menurunkannya
  // jadi peringatan karena kesamaan string bukan tanda "belum dikerjakan" — 銀行
  // memang "bank". Menolaknya di saringan ini akan menegakkan aturan yang sudah
  // dicabut dari validatornya, dan saringan ini bukan implementasi kedua dari §6.

  if (isCounter(item)) {
    const sebab = cekPenggolong(arti)
    if (sebab) return sebab
  }

  const pertama = norm(arti[0])

  for (const lain of semua) {
    if (lain.id === item.id || !berglosa(lain)) continue
    if (norm(lain.meanings.id[0]) !== pertama) continue
    // §4.1 sadar-tipe: kanji dan kosakata tidak pernah jadi pengecoh satu sama lain.
    if (item.data.unit != null && lain.data.unit === item.data.unit && lain.type === item.type) {
      return `"${arti[0]}" sudah dipakai ${lain.id} di unit ${item.data.unit} (§4.1)`
    }
    if (peerKey(lain) === peerKey(item)) {
      return `"${arti[0]}" sudah dipakai ${lain.id}, sama-sama ${peerKey(item)} (§4.2)`
    }
  }

  // Entries accepted earlier in this same file are not in the dataset yet.
  for (const [idLain, artiLain] of dalamBatch) {
    if (idLain === item.id || norm(artiLain[0]) !== pertama) continue
    const lain = semua.find((x) => x.id === idLain)
    if (!lain) continue
    if (item.data.unit != null && lain.data.unit === item.data.unit && lain.type === item.type) {
      return `"${arti[0]}" bentrok dengan ${idLain} di berkas ini, unit sama (§4.1)`
    }
    if (peerKey(lain) === peerKey(item)) {
      return `"${arti[0]}" bentrok dengan ${idLain} di berkas ini, sama-sama ${peerKey(item)} (§4.2)`
    }
  }

  return null
}
