import { describe, expect, it } from 'vitest'
import {
  CHARACTER_SIZE,
  canvasToCharacter,
  characterToCanvas,
  describe as describeStroke,
  ratingFromStrokeErrors,
  resample,
  scoreCharacter,
  scoreStroke,
  type Point,
} from '../stroke-score'

/**
 * Three roughly vertical strokes, like 川, in KanjiVG's 109-unit square.
 * Ordinary SVG orientation: a downward stroke has y increasing.
 */
const KAWA: Point[][] = [
  [
    { x: 25, y: 22 },
    { x: 21, y: 70 },
  ],
  [
    { x: 53, y: 18 },
    { x: 53, y: 80 },
  ],
  [
    { x: 83, y: 15 },
    { x: 83, y: 90 },
  ],
]

const jitter = (stroke: Point[], dx: number, dy: number): Point[] =>
  stroke.map((p) => ({ x: p.x + dx, y: p.y + dy }))

describe('resample', () => {
  it('returns exactly n points and keeps both endpoints', () => {
    const out = resample(KAWA[2]!, 10)
    expect(out).toHaveLength(10)
    expect(out[0]).toEqual({ x: 83, y: 15 })
    expect(out[9]).toEqual({ x: 83, y: 90 })
  })

  it('spaces points evenly regardless of how the raw samples clustered', () => {
    // Same straight line, but sampled densely at one end.
    const clustered: Point[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 100, y: 0 },
    ]
    const out = resample(clustered, 5)
    expect(out.map((p) => Math.round(p.x))).toEqual([0, 25, 50, 75, 100])
  })

  it('survives degenerate input', () => {
    expect(resample([], 5)).toEqual([])
    expect(resample([{ x: 3, y: 4 }], 3)).toHaveLength(3)
  })
})

describe('scoreCharacter', () => {
  it('scores an exact copy at 100 and says nothing', () => {
    const result = scoreCharacter(KAWA, KAWA)
    expect(result.percent).toBe(100)
    expect(result.worst).toBeNull()
    expect(result.note).toBeNull()
  })

  it('stays quiet about writing that is merely a little shaky', () => {
    // Half a unit on a 109 square — roughly a 1.5px wobble on a 300px canvas.
    const shaky = KAWA.map((s) => jitter(s, 0.5, -0.35))
    const result = scoreCharacter(shaky, KAWA)
    expect(result.percent).toBeGreaterThanOrEqual(95)
    expect(result.note).toBeNull()
  })

  it('marks a visibly wobbly write down without calling it wrong', () => {
    // Five px of wobble on a 300px canvas: still recognisable, no longer perfect.
    const wobbly = KAWA.map((s) => jitter(s, 1.8, -1.2))
    const result = scoreCharacter(wobbly, KAWA)
    expect(result.percent).toBeGreaterThan(85)
    expect(result.percent).toBeLessThan(95)
  })

  it('detects a stroke drawn in the wrong direction', () => {
    const backwards = [[...KAWA[0]!].reverse(), KAWA[1]!, KAWA[2]!]
    const result = scoreCharacter(backwards, KAWA)

    expect(result.strokes[0]!.reversed).toBe(true)
    expect(result.note).toMatch(/arah yang berlawanan/)
    expect(result.note).toMatch(/pertama/)
    // The shape is still right, so this must not read as a ruined character — but it
    // has to cost something the user can see against a clean write.
    expect(result.percent).toBeLessThan(scoreCharacter(KAWA, KAWA).percent - 10)
    expect(result.percent).toBeGreaterThan(50)
    // The clean strokes must not be dragged down with it.
    expect(result.strokes[1]!.reversed).toBe(false)
    expect(result.strokes[2]!.score).toBeGreaterThan(0.95)
  })

  it('names the tilted stroke, not one of the clean ones', () => {
    // Stroke 2 leans hard to the right; the other two are untouched.
    const tilted = [KAWA[0]!, [{ x: 53, y: 18 }, { x: 70, y: 80 }], KAWA[2]!]
    const result = scoreCharacter(tilted, KAWA)
    expect(result.worst?.index).toBe(1)
    expect(result.note).toMatch(/kedua/)
    expect(Math.abs(result.worst!.angleDelta)).toBeGreaterThan(10)
  })

  it('flags a stroke that stops short', () => {
    const short = [KAWA[0]!, KAWA[1]!, [{ x: 83, y: 15 }, { x: 83, y: 37 }]]
    const result = scoreCharacter(short, KAWA)
    expect(result.worst?.index).toBe(2)
    expect(result.worst!.lengthRatio).toBeLessThan(0.5)
    expect(result.note).toMatch(/ketiga/)
  })

  it('penalises a half-written character rather than scoring it on what is there', () => {
    const partial = [KAWA[0]!, KAWA[1]!]
    const result = scoreCharacter(partial, KAWA)
    // Two of three strokes drawn perfectly is at most two thirds of the character.
    expect(result.percent).toBeLessThanOrEqual(67)
  })

  it('handles an empty attempt without throwing', () => {
    const result = scoreCharacter([], KAWA)
    expect(result.percent).toBe(0)
    expect(result.strokes).toHaveLength(0)
    expect(result.note).toBeNull()
  })
})

describe('scoreStroke', () => {
  it('reports the offset direction of a displaced stroke', () => {
    const moved = jitter(KAWA[1]!, 10, 0)
    const s = scoreStroke(moved, KAWA[1]!, 1)
    expect(s.offset.x).toBeCloseTo(10, 0)
    expect(s.offset.y).toBeCloseTo(0, 0)
    expect(s.reversed).toBe(false)
  })

  it('names the offset direction in screen terms, with y growing downwards', () => {
    const lower = scoreStroke(jitter(KAWA[1]!, 0, 9), KAWA[1]!, 1)
    expect(describeStroke(lower)).toMatch(/ke bawah/)
    const higher = scoreStroke(jitter(KAWA[1]!, 0, -9), KAWA[1]!, 1)
    expect(describeStroke(higher)).toMatch(/ke atas/)
  })
})

describe('ratingFromStrokeErrors', () => {
  it('maps error counts onto FSRS ratings without asking the user', () => {
    expect(ratingFromStrokeErrors(0)).toBe(3) // Good
    expect(ratingFromStrokeErrors(1)).toBe(2) // Hard
    expect(ratingFromStrokeErrors(2)).toBe(2)
    expect(ratingFromStrokeErrors(3)).toBe(1) // Again
    expect(ratingFromStrokeErrors(9)).toBe(1)
  })
})

describe('canvasToCharacter', () => {
  it('keeps the y axis pointing the same way as the canvas', () => {
    // KanjiVG uses ordinary SVG orientation, so down on the canvas is down in
    // character space. The previous data source needed a flip here, and getting it
    // wrong scored every vertical stroke as drawn backwards.
    const top = canvasToCharacter({ x: 0, y: 0 }, 300)
    const bottom = canvasToCharacter({ x: 0, y: 300 }, 300)
    expect(bottom.y).toBeGreaterThan(top.y)
  })

  it('scales the canvas into the 109 square', () => {
    const corner = canvasToCharacter({ x: 300, y: 300 }, 300)
    expect(corner.x).toBeCloseTo(CHARACTER_SIZE, 5)
    expect(corner.y).toBeCloseTo(CHARACTER_SIZE, 5)
  })

  it('round-trips through characterToCanvas', () => {
    const original = { x: 42, y: 77 }
    const back = canvasToCharacter(characterToCanvas(original, 300), 300)
    expect(back.x).toBeCloseTo(original.x, 5)
    expect(back.y).toBeCloseTo(original.y, 5)
  })

  it('keeps a traced stroke matching its reference after conversion', () => {
    // Draw stroke 3 of 川 on a 300px canvas, then convert back. A sign error
    // anywhere in the pipeline shows up here as `reversed`.
    const canvasStroke = KAWA[2]!.map((p) => characterToCanvas(p, 300))
    const converted = canvasStroke.map((p) => canvasToCharacter(p, 300))
    const s = scoreStroke(converted, KAWA[2]!, 2)
    expect(s.reversed).toBe(false)
    expect(s.score).toBeGreaterThan(0.95)
  })
})
