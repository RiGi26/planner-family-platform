import strokeData from '@/data/strokes.json'
import type { Point } from './stroke-score'

/**
 * Stroke data for the 150 characters this app draws, extracted from the 19.7 MB
 * package down to 164 KB and bundled so the writing module works offline.
 */

export type CharacterJson = {
  /** SVG path strings, in hanzi-writer's 1024-unit space. */
  strokes: string[]
  /** Skeleton of each stroke as [x, y] pairs. */
  medians: number[][][]
}

const DATA = strokeData as Record<string, CharacterJson>

export function hasStrokes(character: string): boolean {
  return character in DATA
}

export function characterJson(character: string): CharacterJson | null {
  return DATA[character] ?? null
}

/**
 * hanzi-writer stores medians as `[x, y]` tuples; the scorer works in `{x, y}`.
 * Converting here keeps the tuple form from leaking into geometry code, where a
 * silently swapped index would be very hard to see.
 */
export function mediansAsPoints(character: string): Point[][] {
  const json = DATA[character]
  if (!json) return []
  return json.medians.map((stroke) =>
    stroke.map(([x, y]) => ({ x: x ?? 0, y: y ?? 0 })),
  )
}

export function strokeCount(character: string): number {
  return DATA[character]?.strokes.length ?? 0
}

/**
 * Feeds hanzi-writer from the bundle instead of letting it fetch.
 *
 * Its default loader hits a CDN, which would put a network request in the middle of
 * a writing session — the one place in this app that is meant to work on a train.
 */
export function charDataLoader(character: string): CharacterJson {
  const json = DATA[character]
  // Throw rather than return nothing. A loader that resolves to nothing leaves
  // hanzi-writer waiting forever, and a canvas that never appears is far harder to
  // diagnose than an error naming the character it could not find.
  if (!json) throw new Error(`Data goresan tidak ada untuk "${character}"`)
  return json
}
