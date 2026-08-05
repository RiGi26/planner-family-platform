import kvg from '@/data/kvg-strokes.json'
import type { Point } from './stroke-score'

/**
 * Stroke data from KanjiVG, compiled from Japanese handwriting convention.
 *
 * Replaced @k1low/hanzi-writer-data-jp, which derives from Chinese font outlines and
 * splits closed loops into two strokes — wrong for 21 of our 150 characters,
 * including あ は ま な の る. `npm run verify:strokes` is the receipt.
 *
 * Each stroke is one centreline path, so the same data draws the character, animates
 * it, and provides the skeleton the scorer grades against. Nothing to keep in sync.
 */

export type KvgCharacter = {
  /** One SVG path per stroke, in writing order. */
  strokes: string[]
  /** Square viewBox edge. KanjiVG uses 109 throughout. */
  size: number
}

const DATA = kvg as Record<string, KvgCharacter>

/** KanjiVG's coordinate space. Ordinary SVG orientation: y grows downwards. */
export const KVG_SIZE = 109

export function kvgCharacter(character: string): KvgCharacter | null {
  return DATA[character] ?? null
}

export function strokeCount(character: string): number {
  return DATA[character]?.strokes.length ?? 0
}

export function hasStrokes(character: string): boolean {
  return character in DATA
}

/**
 * Samples a path into evenly spaced points, using the browser's own SVG geometry.
 *
 * KanjiVG paths mix absolute and relative cubic commands, and reimplementing a
 * path parser to walk them would be a second source of truth for something the
 * platform already computes exactly. This only runs where scoring runs, which is
 * the browser.
 */
export function samplePath(d: string, samples = 24): Point[] {
  if (typeof document === 'undefined') return []

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  path.setAttribute('d', d)
  svg.appendChild(path)

  const total = path.getTotalLength()
  if (!Number.isFinite(total) || total === 0) return []

  const out: Point[] = []
  for (let i = 0; i < samples; i++) {
    const p = path.getPointAtLength((total * i) / (samples - 1))
    out.push({ x: p.x, y: p.y })
  }
  return out
}

/**
 * Sampling runs on the main thread, and the stage switch in the writing screen is a
 * tap the learner is waiting on — so each character is sampled once and remembered.
 * Only browser results are cached: during prerender `samplePath` returns nothing,
 * and caching that would poison every later call.
 */
const medianCache = new Map<string, Point[][]>()

/** The reference skeleton for every stroke, in KanjiVG space. */
export function medians(character: string, samples = 24): Point[][] {
  const char = DATA[character]
  if (!char) return []

  const key = `${character}:${samples}`
  const cached = medianCache.get(key)
  if (cached) return cached

  const out = char.strokes.map((d) => samplePath(d, samples))
  if (typeof document !== 'undefined') medianCache.set(key, out)
  return out
}

/** Path length in KanjiVG units, for pacing the draw-on animation. */
export function pathLength(d: string): number {
  if (typeof document === 'undefined') return 0
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  path.setAttribute('d', d)
  return path.getTotalLength()
}
