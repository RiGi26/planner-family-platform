#!/usr/bin/env node
/**
 * Writes the Indonesian glosses, per Brief 01 §5.
 *
 * Reads vocab_n5.json / kanji_n5.json / grammar_n5.json, sends items to Claude
 * in batches of 25 together with the whole of §3 as guidance, and writes back
 * `meanings.id` plus `data.gloss_reviewed: false`. Also rebuilds
 * scripts/data/gloss-audit.json — en and id side by side, grouped by unit — which
 * is what a human reviewer reads (§7), not the raw dataset.
 *
 * IDEMPOTENT. Items whose `meanings.id` is already filled are skipped, so this
 * can be run unit by unit while review happens in parallel, and re-running never
 * overwrites a gloss a human has already looked at.
 *
 * §3 IS NOT COPIED HERE. The guidance is read out of docs/BRIEF-01-glosa-id.md at
 * run time and sent verbatim. A second copy in this file would drift from the
 * brief the first time either was edited, and the drift would be invisible —
 * the glosses would simply start following a version of the rules nobody
 * remembers writing.
 *
 * Run:
 *   node scripts/gloss-id.mjs --units 0-5     (Commit 4: calibrate on ~80 items)
 *   node scripts/gloss-id.mjs --units 6-25
 *   node scripts/gloss-id.mjs --units none    (the 304 items no unit claims)
 *   node scripts/gloss-id.mjs --dry-run --units 0-5   (print batch 1, call nothing)
 *
 * Needs ANTHROPIC_API_KEY, or an `ant auth login` profile.
 */

import Anthropic from '@anthropic-ai/sdk'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
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
} from './lib/gloss-rules.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const DATA = join(ROOT, 'src', 'data')
const AUDIT = join(HERE, 'data', 'gloss-audit.json')
const BRIEF = join(ROOT, 'docs', 'BRIEF-01-glosa-id.md')

const MODEL = 'claude-opus-5'
const UKURAN_BATCH = 25
/** One first attempt plus two repairs. A third repair on the same batch has never
 *  been the difference between a good gloss and a bad one — it is the sign that
 *  the constraint itself is wrong, which is a human's problem, not a retry's. */
const MAKS_PERCOBAAN = 3

const FILES = ['vocab_n5.json', 'kanji_n5.json', 'grammar_n5.json']

// ---------------------------------------------------------------------------
// argumen
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2)
const DRY_RUN = argv.includes('--dry-run')

/** `--units 0-5` · `--units 3,7,9` · `--units none` (item tanpa unit) · tanpa flag = semua. */
function parseUnits() {
  const i = argv.indexOf('--units')
  if (i === -1) return null
  const spec = argv[i + 1]
  if (!spec) gagal('--units butuh nilai, mis. "0-5" atau "none"')
  if (spec === 'none') return 'none'
  const set = new Set()
  for (const bagian of spec.split(',')) {
    const m = bagian.match(/^(\d+)(?:-(\d+))$/) ?? bagian.match(/^(\d+)$/)
    if (!m) gagal(`bagian "--units" tidak terbaca: ${bagian}`)
    const dari = Number(m[1])
    const sampai = m[2] === undefined ? dari : Number(m[2])
    for (let n = dari; n <= sampai; n++) set.add(n)
  }
  return set
}

function gagal(pesan) {
  console.error(`gloss-id: ${pesan}`)
  process.exit(1)
}

const UNITS = parseUnits()

// ---------------------------------------------------------------------------
// panduan — §3 dibaca dari brief, apa adanya
// ---------------------------------------------------------------------------

/**
 * Slices §3 out of the brief. Anchored on the headings rather than line numbers
 * so editing §1 or §2 doesn't silently shift the window and send the model half
 * a section.
 */
function bacaPanduan() {
  const teks = readFileSync(BRIEF, 'utf8')
  const mulai = teks.indexOf('\n## 3. ')
  const akhir = teks.indexOf('\n## 4. ')
  if (mulai === -1 || akhir === -1 || akhir < mulai) {
    gagal('tidak menemukan §3 di docs/BRIEF-01-glosa-id.md — judulnya berubah?')
  }
  return teks.slice(mulai, akhir).trim()
}

// ---------------------------------------------------------------------------
// data
// ---------------------------------------------------------------------------

const baca = (nama) => JSON.parse(readFileSync(join(DATA, nama), 'utf8'))
const berkas = new Map(FILES.map((nama) => [nama, baca(nama)]))
const semua = [...berkas.values()].flat().filter((i) => i.type !== 'kana')

const units = baca('units_n5.json')
const judulUnit = new Map(units.map((u) => [u.n, u.title]))

function dalamLingkup(item) {
  if (UNITS === null) return true
  if (UNITS === 'none') return item.data.unit == null
  return item.data.unit != null && UNITS.has(item.data.unit)
}

/** §5: idempoten — item yang glosanya sudah ada tidak disentuh sama sekali. */
const antrean = semua.filter((i) => dalamLingkup(i) && !berglosa(i))

// ---------------------------------------------------------------------------
// batch
// ---------------------------------------------------------------------------

/**
 * A transitive/intransitive pair must be glossed together, or §3.3 cannot be
 * satisfied at all: 入る (unit 17) and 入れる (unit 14) are never in the same unit,
 * so in a naive unit-ordered batching they land in different requests and each
 * model call — seeing only its own half — quite reasonably writes "masuk" for
 * both. The distinction §3.3 exists to teach is destroyed before any validator
 * gets to look at it.
 *
 * Grouping by leading kanji root is the same heuristic verify-gloss.mjs uses for
 * its vt/vi warning, so what the generator keeps together is exactly what the
 * validator later compares.
 */
const akarKanji = (s) => (s.match(/^[一-鿿]+/) ?? [''])[0]

function kunciPasangan(item) {
  const pos = Array.isArray(item.data.pos) ? item.data.pos : []
  if (!pos.includes('vt') && !pos.includes('vi')) return null
  const akar = akarKanji(item.expression)
  return akar ? `vtvi:${akar}` : null
}

/** Items ordered by unit, with vt/vi root-mates pulled into one indivisible group. */
function susunBatch(daftar) {
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
 * The glosses a batch must not collide with.
 *
 * §5 as written only asks for the glosses already used IN THAT UNIT, which
 * satisfies §4.1 and nothing else. But §4.2 demands uniqueness among items of
 * the same type and word class, and that set is CROSS-UNIT: 入る (unit 17) and
 * 入れる (unit 14) are never in the same unit, so nothing in a unit-scoped list
 * would stop both being born as "masuk". The clash would surface only after all
 * 810 items existed — precisely the failure §8 orders the commits to prevent.
 *
 * So each batch also carries the glosses already used by same-type, same-class
 * items from the WHOLE dataset, narrowed to the classes actually present in the
 * batch so the list stays proportionate to the request.
 *
 * `dipakai` accumulates across batches in this run, not just what was on disk at
 * startup — otherwise batch 2 cannot see what batch 1 just wrote.
 */
function konteksKeunikan(batch, dipakai) {
  const unitBatch = new Set(batch.map((i) => i.data.unit).filter((u) => u != null))
  const kelasBatch = new Set(batch.map(peerKey))

  const perUnit = new Map()
  const perKelas = new Map()

  for (const item of semua) {
    const glosa = dipakai.get(item.id) ?? (berglosa(item) ? item.meanings.id : null)
    if (!glosa?.length) continue

    if (item.data.unit != null && unitBatch.has(item.data.unit)) {
      if (!perUnit.has(item.data.unit)) perUnit.set(item.data.unit, [])
      perUnit.get(item.data.unit).push(glosa[0])
    }
    const kelas = peerKey(item)
    if (kelasBatch.has(kelas)) {
      if (!perKelas.has(kelas)) perKelas.set(kelas, [])
      perKelas.get(kelas).push(glosa[0])
    }
  }
  return { perUnit, perKelas }
}

// ---------------------------------------------------------------------------
// prompt
// ---------------------------------------------------------------------------

const PANDUAN = bacaPanduan()

/**
 * Stable across every batch, so it caches. The volatile part — the items and the
 * used-gloss lists — lives in the user turn, after the breakpoint. Putting a
 * batch number or a timestamp anywhere in here would silently cost the cache on
 * all 33 requests.
 */
const SYSTEM = [
  {
    type: 'text',
    text: [
      'Kamu menulis glosa bahasa Indonesia untuk aplikasi belajar bahasa Jepang JLPT N5.',
      '',
      'Glosa ini yang dibaca pemelajar di kartu hafalan, jadi ia harus benar sebagai',
      'terjemahan DAN berbeda dari glosa item lain yang muncul di tumpukan kartu yang',
      'sama — dua pilihan yang sama-sama benar membuat soal pilihan ganda mustahil.',
      '',
      'Panduan gaya di bawah ini adalah §3 dari dokumen rancangan, dikutip apa adanya.',
      'Ikuti seluruhnya.',
      '',
      PANDUAN,
    ].join('\n'),
    // §3 is thousands of tokens and identical on every request. Cache it.
    cache_control: { type: 'ephemeral' },
  },
]

const SKEMA = {
  type: 'object',
  properties: {
    glosa: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'id item, disalin persis dari permintaan' },
          arti: {
            type: 'array',
            items: { type: 'string' },
            description: `glosa Indonesia, maksimal ${MAKS_ELEMEN} elemen, elemen pertama = arti yang dipakai di unit item itu`,
          },
        },
        required: ['id', 'arti'],
        additionalProperties: false,
      },
    },
  },
  required: ['glosa'],
  additionalProperties: false,
}

function ringkasItem(item) {
  const pos = Array.isArray(item.data.pos) ? item.data.pos : []
  return {
    id: item.id,
    ekspresi: item.expression,
    bacaan: item.reading || undefined,
    jenis: item.type,
    kelas_kata: peerKey(item),
    inggris: item.meanings.en,
    pos: pos.length ? pos : undefined,
    verb_group: typeof item.data.verb_group === 'string' ? item.data.verb_group : undefined,
    unit: item.data.unit ?? null,
    judul_unit: item.data.unit != null ? (judulUnit.get(item.data.unit) ?? null) : null,
    penggolong: isCounter(item) || undefined,
  }
}

function pesanPengguna(batch, konteks, tolakan) {
  const bagian = []

  bagian.push(
    `Tulis glosa Indonesia untuk ${batch.length} item berikut. Kembalikan satu entri per item, id disalin persis.`,
  )
  bagian.push('', '## Item', '```json', JSON.stringify(batch.map(ringkasItem), null, 1), '```')

  if (konteks.perUnit.size) {
    bagian.push('', '## Glosa yang SUDAH dipakai di unit yang sama (§4.1 — jangan kembar)')
    for (const [unit, daftar] of [...konteks.perUnit].sort((a, b) => a[0] - b[0])) {
      bagian.push(`- unit ${unit} — ${judulUnit.get(unit) ?? 'tanpa judul'}: ${daftar.join(' · ')}`)
    }
  }

  if (konteks.perKelas.size) {
    bagian.push(
      '',
      '## Glosa yang SUDAH dipakai item sejenis & sekelas kata, dari SELURUH dataset (§4.2 — jangan kembar)',
      'Aturan ini lintas-unit: dua item bisa jadi pengecoh satu sama lain walau unitnya berjauhan.',
    )
    for (const [kelas, daftar] of konteks.perKelas) {
      bagian.push(`- ${kelas}: ${daftar.join(' · ')}`)
    }
  }

  if (tolakan?.length) {
    bagian.push(
      '',
      '## Perbaiki — usulan berikut melanggar aturan',
      'Tulis ulang HANYA item di bawah ini. Item lain sudah diterima.',
    )
    for (const t of tolakan) {
      bagian.push(`- ${t.id} — usulan "${t.kandidat.join('; ')}" ditolak: ${t.alasan}`)
    }
  }

  return bagian.join('\n')
}

// ---------------------------------------------------------------------------
// pemeriksaan cepat sebelum ditulis
// ---------------------------------------------------------------------------

/**
 * A fast filter, NOT a second implementation of §6.
 *
 * It catches what a batch can be judged on in isolation — shape rules and the
 * uniqueness sets the request itself carried — so an obviously spoiled batch is
 * repaired while the context is still in hand, instead of surfacing hours later
 * as a validator failure with no way back to the reasoning that produced it.
 * `npm run verify:gloss` stays the authority; run it after this script.
 */
function periksa(item, arti, dipakai, dalamBatch) {
  if (!Array.isArray(arti) || arti.length === 0) return 'glosa kosong'
  if (arti.length > MAKS_ELEMEN) return `${arti.length} elemen, maksimal ${MAKS_ELEMEN} (§3.1)`

  for (const g of arti) {
    for (const { cek } of ATURAN_BENTUK) {
      const sebab = cek(g)
      if (sebab) return `"${g}": ${sebab}`
    }
  }

  if (norm(arti.join('|')) === norm(item.meanings.en.join('|'))) {
    return 'identik dengan sumber Inggris — belum diterjemahkan (§6)'
  }

  if (isCounter(item)) {
    const sebab = cekPenggolong(arti)
    if (sebab) return sebab
  }

  const pertama = norm(arti[0])

  for (const lain of semua) {
    if (lain.id === item.id) continue
    const glosaLain = dipakai.get(lain.id) ?? (berglosa(lain) ? lain.meanings.id : null)
    if (!glosaLain?.length || norm(glosaLain[0]) !== pertama) continue
    if (item.data.unit != null && lain.data.unit === item.data.unit) {
      return `"${arti[0]}" sudah dipakai ${lain.id} di unit ${item.data.unit} (§4.1)`
    }
    if (peerKey(lain) === peerKey(item)) {
      return `"${arti[0]}" sudah dipakai ${lain.id}, sama-sama ${peerKey(item)} (§4.2)`
    }
  }

  // Items inside the same batch are not on disk yet and not in `dipakai` until
  // the batch is accepted, so they are checked against each other here.
  for (const [idLain, artiLain] of dalamBatch) {
    if (idLain === item.id || norm(artiLain[0]) !== pertama) continue
    const lain = semua.find((x) => x.id === idLain)
    if (!lain) continue
    if (item.data.unit != null && lain.data.unit === item.data.unit) {
      return `"${arti[0]}" bentrok dengan ${idLain} di batch ini, unit sama (§4.1)`
    }
    if (peerKey(lain) === peerKey(item)) {
      return `"${arti[0]}" bentrok dengan ${idLain} di batch ini, sama-sama ${peerKey(item)} (§4.2)`
    }
  }

  return null
}

// ---------------------------------------------------------------------------
// pemanggilan model
// ---------------------------------------------------------------------------

const client = new Anthropic()

async function mintaGlosa(batch, konteks, tolakan) {
  const stream = client.messages.stream({
    model: MODEL,
    // Roomy on purpose: adaptive thinking is on by default on this model and
    // shares the budget with the answer, so a tight cap truncates mid-batch.
    max_tokens: 32000,
    system: SYSTEM,
    output_config: {
      effort: 'high',
      format: { type: 'json_schema', schema: SKEMA },
    },
    messages: [{ role: 'user', content: pesanPengguna(batch, konteks, tolakan) }],
  })

  const pesan = await stream.finalMessage()

  if (pesan.stop_reason === 'refusal') {
    throw new Error(`model menolak permintaan (${pesan.stop_details?.category ?? 'tanpa kategori'})`)
  }
  if (pesan.stop_reason === 'max_tokens') {
    throw new Error('jawaban terpotong di max_tokens — kecilkan UKURAN_BATCH atau naikkan max_tokens')
  }

  const teks = pesan.content.find((b) => b.type === 'text')?.text
  if (!teks) throw new Error('jawaban tanpa blok teks')

  const hasil = new Map()
  for (const baris of JSON.parse(teks).glosa) {
    hasil.set(baris.id, baris.arti)
  }
  return { hasil, usage: pesan.usage }
}

/** One batch, with repairs. Returns accepted glosses and whatever stayed broken. */
async function kerjakanBatch(batch, dipakai, nomor, total) {
  const diterima = new Map()
  let sisa = batch
  let tolakan = null
  const gagalAkhir = []

  for (let percobaan = 1; percobaan <= MAKS_PERCOBAAN && sisa.length; percobaan++) {
    const label = percobaan === 1 ? '' : ` (perbaikan ${percobaan - 1})`
    process.stdout.write(`batch ${nomor}/${total}: ${sisa.length} item${label} … `)

    const konteks = konteksKeunikan(sisa, dipakai)
    const { hasil, usage } = await mintaGlosa(sisa, konteks, tolakan)

    const berikutnya = []
    tolakan = []
    for (const item of sisa) {
      const arti = hasil.get(item.id)
      if (!arti) {
        berikutnya.push(item)
        tolakan.push({ id: item.id, kandidat: [], alasan: 'tidak ada di jawaban' })
        continue
      }
      const sebab = periksa(item, arti, dipakai, diterima)
      if (sebab) {
        berikutnya.push(item)
        tolakan.push({ id: item.id, kandidat: arti, alasan: sebab })
        continue
      }
      diterima.set(item.id, arti)
    }

    const cache = usage.cache_read_input_tokens ?? 0
    console.log(
      `${diterima.size} diterima, ${berikutnya.length} ditolak` +
        ` · ${usage.output_tokens} token keluar, ${cache} dibaca dari cache`,
    )
    sisa = berikutnya
  }

  // Whatever is still broken is left WITHOUT a gloss on purpose: an item with an
  // empty meanings.id is picked up again by the next run (idempotency) and is
  // still counted missing by `verify:gloss --lengkap`. Writing a known-bad gloss
  // would do the opposite — it would mark the item done, hide it from both, and
  // leave a violation in the dataset that only a human re-reading §6 would find.
  for (const t of tolakan ?? []) gagalAkhir.push(t)
  return { diterima, gagalAkhir }
}

// ---------------------------------------------------------------------------
// tulis balik
// ---------------------------------------------------------------------------

function tulisDataset(dipakai) {
  for (const [nama, baris] of berkas) {
    let disentuh = 0
    for (const row of baris) {
      const arti = dipakai.get(row.id)
      if (!arti) continue
      row.meanings.id = arti
      // §7: nothing is reviewed until a human who reads both languages says so.
      row.data.gloss_reviewed = false
      disentuh++
    }
    if (!disentuh) continue
    writeFileSync(join(DATA, nama), JSON.stringify(baris) + '\n', 'utf8')
    console.log(`ditulis : ${nama} — ${disentuh} glosa`)
  }
}

/**
 * The reviewer's document (§7). Rebuilt from the dataset every run rather than
 * appended to, so it always describes what is actually in the files — a stale
 * audit is worse than none, because it is read as though it were current.
 */
function tulisAudit(gagal) {
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
      direview: item.data.gloss_reviewed === true,
    })
  }

  const urutUnit = [...perUnit.keys()].sort((a, b) => {
    if (a === 'tanpa-unit') return 1
    if (b === 'tanpa-unit') return -1
    return a - b
  })

  const isi = {
    catatan:
      'Dibaca reviewer penutur asli (§7). en = data sumber OpenJLPT (CC BY-SA), ' +
      'jangan diubah. id = glosa yang dinilai. direview:false artinya belum ada ' +
      'manusia yang membacanya.',
    model: MODEL,
    ringkasan: {
      berglosa: semua.filter(berglosa).length,
      belum: semua.filter((i) => !berglosa(i)).length,
      direview: semua.filter((i) => i.data.gloss_reviewed === true).length,
    },
    unit: urutUnit.map((n) => ({
      n,
      judul: typeof n === 'number' ? (judulUnit.get(n) ?? null) : null,
      item: perUnit.get(n),
    })),
    ditolak: gagal,
  }

  mkdirSync(dirname(AUDIT), { recursive: true })
  writeFileSync(AUDIT, JSON.stringify(isi, null, 2) + '\n', 'utf8')
  console.log(`ditulis : ${AUDIT}`)
}

// ---------------------------------------------------------------------------
// jalan
// ---------------------------------------------------------------------------

const batches = susunBatch(antrean)

console.log(`lingkup   : ${UNITS === null ? 'semua unit' : UNITS === 'none' ? 'tanpa unit' : [...UNITS].join(',')}`)
console.log(`antre     : ${antrean.length} item belum berglosa (${semua.length - antrean.length} dilewati)`)
console.log(`batch     : ${batches.length} × ±${UKURAN_BATCH} item`)

if (!antrean.length) {
  console.log('\ntidak ada yang perlu dikerjakan.')
  process.exit(0)
}

if (DRY_RUN) {
  const konteks = konteksKeunikan(batches[0], new Map())
  console.log('\n--- system (dipotong) ---\n' + SYSTEM[0].text.slice(0, 600) + '\n…')
  console.log('\n--- user, batch 1 ---\n' + pesanPengguna(batches[0], konteks, null))
  console.log('\n(--dry-run: tidak ada permintaan yang dikirim)')
  process.exit(0)
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.log('catatan   : ANTHROPIC_API_KEY tidak diset — SDK akan mencoba profil `ant auth login`')
}

const dipakai = new Map()
const gagalSemua = []

for (const [i, batch] of batches.entries()) {
  const { diterima, gagalAkhir } = await kerjakanBatch(batch, dipakai, i + 1, batches.length)
  for (const [id, arti] of diterima) dipakai.set(id, arti)
  gagalSemua.push(...gagalAkhir)
}

console.log('')
tulisDataset(dipakai)
tulisAudit(gagalSemua)

console.log('')
console.log(`selesai   : ${dipakai.size} glosa ditulis, ${gagalSemua.length} dibiarkan kosong`)
if (gagalSemua.length) {
  console.log(`            item yang gagal tetap tanpa glosa — jalankan lagi untuk mencobanya ulang:`)
  for (const t of gagalSemua.slice(0, 10)) console.log(`            ${t.id} — ${t.alasan}`)
  if (gagalSemua.length > 10) console.log(`            … dan ${gagalSemua.length - 10} lagi (lihat gloss-audit.json)`)
}
console.log('BERIKUTNYA: npm run verify:gloss  ← itu yang berwenang, bukan pemeriksaan di skrip ini')
