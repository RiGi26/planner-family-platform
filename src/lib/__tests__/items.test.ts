import { describe, expect, it } from 'vitest'
import { glossOf, type Item } from '../items'

/**
 * The fallback in `glossOf()` is the load-bearing part: it is what lets the app
 * keep working through Brief 01, while `meanings.id` is filled unit by unit and
 * most items still have nothing but English. A fallback that silently stops
 * falling back would blank out every untranslated card, and no type error would
 * say so — hence these.
 */

const mk = (meanings: Item['meanings'], type: Item['type'] = 'vocab'): Item => ({
  id: 'x',
  level: 'N5',
  type,
  expression: 'x',
  reading: 'x',
  meanings,
  seq: 1,
  data: {},
})

describe('glossOf', () => {
  it('shows Indonesian once it exists', () => {
    expect(glossOf(mk({ en: ['day after tomorrow'], id: ['lusa'] }))).toEqual(['lusa'])
  })

  it('falls back to English while Indonesian is empty', () => {
    expect(glossOf(mk({ en: ['day after tomorrow'], id: [] }))).toEqual(['day after tomorrow'])
  })

  it('returns every element, not just the first', () => {
    expect(glossOf(mk({ en: ['a'], id: ['tinggi', 'mahal'] }))).toEqual(['tinggi', 'mahal'])
  })

  it('can be asked for English on purpose', () => {
    expect(glossOf(mk({ en: ['teacher'], id: ['guru'] }), 'en')).toEqual(['teacher'])
  })

  // The fallback runs one way only, and on purpose: `en` is the source data and
  // fetch-jlpt.mjs refuses to write an item without it, so there is nothing to
  // fall back TO. Asked for English on an item that has none, you get nothing —
  // written down here so a future reader does not mistake it for an oversight.
  it('does not fall back from English to Indonesian', () => {
    expect(glossOf(mk({ en: [], id: ['guru'] }), 'en')).toEqual([])
  })

  it('kana carries the same romaji in both, so the locale makes no difference', () => {
    const a = mk({ en: ['a'], id: ['a'] }, 'kana')
    expect(glossOf(a)).toEqual(glossOf(a, 'en'))
  })
})
