/**
 * The gloss rules of Brief 01 §3 and §4, in one place.
 *
 * Both the generator and the validator need these, and they need to agree. If
 * the generator groups items into different §4.2 peer sets than the validator
 * checks, it will satisfy uniqueness in one grouping and fail it in the other —
 * a class of bug that only shows up after 810 glosses have been written, which
 * is exactly the outcome §8 orders the two commits to avoid.
 *
 * Only the machine-checkable rules live here. Everything about *choosing a good
 * word* stays in §3 of docs/BRIEF-01-glosa-id.md and is sent to the model as
 * written, so the prose guidance has exactly one home too.
 */

export const MAKS_ELEMEN = 3
export const MAKS_KARAKTER = 40

export const norm = (s) => s.trim().toLowerCase()
export const berglosa = (item) => item.meanings.id.length > 0

/**
 * The coarse word class two items must share before they can be each other's
 * decoy (§4.2). A noun and a verb never appear as alternatives in the same
 * multiple-choice question, so holding them to a shared uniqueness rule would
 * reject glosses that could not possibly be confused.
 */
export function wordClass(item) {
  if (item.type !== 'vocab') return item.type
  const pos = Array.isArray(item.data.pos) ? item.data.pos : []
  if (pos.some((p) => p.startsWith('v'))) return 'verba'
  if (pos.some((p) => p.startsWith('adj'))) return 'adjektiva'
  if (pos.includes('adv')) return 'adverbia'
  if (pos.includes('pn')) return 'pronomina'
  if (pos.includes('num')) return 'numeralia'
  if (pos.includes('n')) return 'nomina'
  return 'lain'
}

/** The §4.2 bucket: same type AND same word class. */
export const peerKey = (item) => `${item.type}/${wordClass(item)}`

/**
 * 助数詞 in the sense §3.6 means: an item whose whole job is to count things.
 *
 * Deliberately NOT `pos.includes('ctr')`. JMdict tags 山, 風, 頭 and ページ as
 * `ctr` because those words CAN serve as counters, but the item in this dataset
 * is the noun — 山 is "mountain", and demanding a single bare word for it would
 * be enforcing §3.6 against entries it was never about. Worse, `suf`/`n-suf`
 * would drag in よく ("often", "well"), whose two distinct meanings §3.4 says
 * belong in two elements.
 *
 * So the test is what the entry IS, not what its headword could be used for.
 */
export function isCounter(item) {
  if (item.type !== 'vocab') return false
  if (item.expression.startsWith('〜') || item.expression.startsWith('~')) return true
  return item.meanings.en.some((m) => /\bcounter for\b/i.test(m))
}

/**
 * Per-gloss shape rules — the ones that can be judged from a single string.
 * Each returns a reason when the gloss breaks it, or null when it passes, so
 * the generator can hand the reason straight back to the model.
 */
export const ATURAN_BENTUK = [
  {
    nama: 'awalan-untuk',
    cek: (g) => (/^untuk\s/i.test(g.trim()) ? 'diawali "untuk " (§3.10)' : null),
  },
  {
    nama: 'terlalu-panjang',
    cek: (g) =>
      g.length > MAKS_KARAKTER ? `${g.length} karakter, maksimal ${MAKS_KARAKTER} (§3.10)` : null,
  },
  {
    nama: 'titik-akhir',
    cek: (g) => (g.trim().endsWith('.') ? 'diakhiri titik (§3.1)' : null),
  },
  {
    nama: 'kosong',
    cek: (g) => (g.trim() === '' ? 'elemen kosong' : null),
  },
]

/** §3.6: a counter's gloss must be one element, one word, no parentheses. */
export function cekPenggolong(gloss) {
  const [pertama, ...sisa] = gloss
  if (sisa.length > 0) return `penggolong harus satu elemen, ada ${gloss.length} (§3.6)`
  if (/[\s,]/.test(pertama.trim())) return 'penggolong harus satu kata (§3.6)'
  if (/[()]/.test(pertama)) return 'penggolong tidak boleh pakai kurung (§3.6)'
  return null
}
