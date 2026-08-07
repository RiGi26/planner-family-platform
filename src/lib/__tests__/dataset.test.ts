import { describe, expect, it } from 'vitest'
import grammar from '../../data/grammar_n5.json'
import kana from '../../data/kana.json'
import kanji from '../../data/kanji_n5.json'
import vocab from '../../data/vocab_n5.json'
import { glossOf, type Item } from '../items'
import { cardFaces, lessonFace } from '../session'
import { modesForItem } from '../items'

/**
 * The shipped datasets, swept through the code that renders them.
 *
 * Every other test in this folder runs on fixtures, which is the right way to
 * test logic and the wrong way to catch a dataset that has quietly lost a field.
 * The regeneration scripts rewrite these files wholesale from upstream, and the
 * failure mode they invite is silent: a card whose face is an empty string still
 * renders, still schedules, still counts as answered. It just says nothing.
 *
 * So this file asserts the one thing fixtures cannot — that all 1,018 real items
 * still produce readable cards. See §2.5 of docs/BRIEF-01-glosa-id.md.
 */

const SETS: Array<{ name: string; items: Item[]; kana: boolean }> = [
  { name: 'vocab_n5', items: vocab as Item[], kana: false },
  { name: 'kanji_n5', items: kanji as Item[], kana: false },
  { name: 'grammar_n5', items: grammar as Item[], kana: false },
  { name: 'kana', items: kana as Item[], kana: true },
]

/** Reports which items broke, not just how many — a count alone is a scavenger hunt. */
const report = (name: string, bad: Item[]) =>
  `${name}: ${bad.length}${bad.length ? ` (${bad.slice(0, 5).map((i) => i.id).join(', ')})` : ''}`

const ALL_PREFS = { kanaWriting: true, kanjiWriting: true, listening: true }

describe('dataset yang dikirim', () => {
  it('setiap item punya glosa untuk ditampilkan', () => {
    for (const { name, items } of SETS) {
      expect(items.length).toBeGreaterThan(0)
      expect(report(name, items.filter((i) => glossOf(i).length === 0))).toBe(`${name}: 0`)
    }
  })

  it('meanings.en tidak pernah kosong — itu data sumber, bukan kolom yang boleh sepi', () => {
    for (const { name, items } of SETS) {
      expect(report(name, items.filter((i) => i.meanings.en.length === 0))).toBe(`${name}: 0`)
    }
  })

  it('tidak ada muka kartu yang berteks kosong, di semua mode yang bisa dibuat item itu', () => {
    for (const { name, items } of SETS) {
      const bad = items.filter((item) => {
        if (!lessonFace(item).meaning) return true
        return modesForItem(item, ALL_PREFS).some((mode) => {
          const f = cardFaces(item, mode)
          return !f.prompt || !f.answerMain
        })
      })
      expect(report(name, bad)).toBe(`${name}: 0`)
    }
  })

  /**
   * Guards §2.5: fetch-jlpt.mjs rebuilds these files and must carry the review
   * bookkeeping across. If that preservation is ever dropped, the fields vanish
   * from the rebuilt file and this fails — which is the only automatic warning
   * there is, since nothing downstream writes `gloss_reviewed` back.
   *
   * Kana is exempt on purpose (§2.2): romaji is not a translation, so there is
   * nothing for a native speaker to approve.
   */
  it('status review glosa ada di tiap item non-kana, dan tidak ada di kana', () => {
    for (const { name, items, kana: isKana } of SETS) {
      const bad = items.filter((i) => ('gloss_reviewed' in i.data) === isKana)
      expect(report(name, bad)).toBe(`${name}: 0`)
    }
  })

  it('gloss_note_id berupa teks atau null, tidak pernah undefined diam-diam', () => {
    for (const { name, items, kana: isKana } of SETS) {
      if (isKana) continue
      const bad = items.filter((i) => {
        const note = i.data.gloss_note_id
        return note !== null && typeof note !== 'string'
      })
      expect(report(name, bad)).toBe(`${name}: 0`)
    }
  })
})
