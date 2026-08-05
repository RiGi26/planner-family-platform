/**
 * Shape scoring for the writing module.
 *
 * hanzi-writer already tells us whether a stroke was accepted, in the right order,
 * and roughly the right direction. What it does not give is *how close* the shape
 * was, and that is what the Recall stage shows: `BENTUK 92%` plus one specific
 * sentence about the worst stroke.
 *
 * "92%" on its own is useless — the note is the part that teaches. So the scorer's
 * real job is diagnosis, not the number.
 *
 * COORDINATE CONTRACT
 * Both `userStrokes` and `medians` must already be in KanjiVG's 109x109 space, in
 * ordinary SVG orientation — x grows right, **y grows down**. Use
 * `canvasToCharacter()` to map a canvas point into it.
 *
 * Nothing here touches the schedule. FSRS rating in writing mode comes from the
 * count of wrong strokes, not from this percentage — see `ratingFromStrokeErrors`.
 */

export type Point = { x: number; y: number }

/** How many points each stroke is resampled to before comparison. */
const SAMPLES = 24

/** KanjiVG's square. Every threshold below is expressed against it. */
export const CHARACTER_SIZE = 109

/**
 * KanjiVG's own stroke weight, in character units.
 *
 * Every surface that draws a character shares it: the faint template, the strokes
 * already accepted, the learner's ink, and the finished cell on the sheet. Tracing
 * is only honest when the guide and the ink are the same weight — a guide drawn
 * heavier leaves grey showing on both sides of a stroke that was actually perfect,
 * and one drawn lighter hides how far off the ink really was.
 */
export const STROKE_WIDTH = 3

/**
 * That weight scaled to a canvas of `canvasSize` px.
 *
 * The floor keeps ink visible in a 44px sheet cell, where the true proportion works
 * out to barely over a pixel.
 */
export function inkWidth(canvasSize: number, min = 1.5): number {
  return Math.max(min, (STROKE_WIDTH * canvasSize) / CHARACTER_SIZE)
}

/** Distance (in character units) at which a stroke scores zero — about a fifth of the square. */
const MAX_DEVIATION = 20

/** Below this score a stroke is worth remarking on. Above it, the writing is fine. */
const NOTEWORTHY = 0.9

/**
 * What a backwards stroke keeps of its shape score.
 *
 * Not zero: a stroke drawn the wrong way still traces the right shape, and the
 * design reports direction on its own line ("③ ARAH") rather than folding it into
 * the percentage. But not one either — direction is the thing the writing module
 * exists to fix, so it has to cost something visible.
 */
const REVERSED_PENALTY = 0.5

export type StrokeScore = {
  index: number
  /** 0..1, where 1 is indistinguishable from the reference. */
  score: number
  /** Signed degrees: positive means the user's stroke sits counter-clockwise of the reference. */
  angleDelta: number
  /** How far the stroke's centre sits from the reference centre, in character units. */
  offset: Point
  /** User length / reference length. */
  lengthRatio: number
  /** True when the stroke matches far better read backwards — i.e. drawn the wrong way. */
  reversed: boolean
}

export type CharacterScore = {
  /** Rounded 0..100, the number shown as `BENTUK xx%`. */
  percent: number
  strokes: StrokeScore[]
  /** Lowest-scoring stroke, or null when every stroke is clean. */
  worst: StrokeScore | null
  /** One sentence about `worst`, or null when there is nothing worth saying. */
  note: string | null
}

// ---------------------------------------------------------------------------
// geometry
// ---------------------------------------------------------------------------

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function pathLength(points: Point[]): number {
  let total = 0
  for (let i = 1; i < points.length; i++) total += dist(points[i - 1]!, points[i]!)
  return total
}

/**
 * Resamples a polyline to `n` points spaced evenly along its arc length. Without
 * this, a stroke drawn slowly at the start and fast at the end would compare badly
 * against an identically-shaped reference purely because of where its raw samples
 * landed.
 */
export function resample(points: Point[], n = SAMPLES): Point[] {
  if (points.length === 0) return []
  if (points.length === 1) return Array.from({ length: n }, () => points[0]!)

  const total = pathLength(points)
  if (total === 0) return Array.from({ length: n }, () => points[0]!)

  const step = total / (n - 1)
  const out: Point[] = [points[0]!]
  let segment = 0
  let walked = 0

  for (let i = 1; i < n - 1; i++) {
    const target = step * i
    while (segment < points.length - 2 && walked + dist(points[segment]!, points[segment + 1]!) < target) {
      walked += dist(points[segment]!, points[segment + 1]!)
      segment++
    }
    const a = points[segment]!
    const b = points[segment + 1]!
    const segLen = dist(a, b)
    const t = segLen === 0 ? 0 : (target - walked) / segLen
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
  }

  out.push(points[points.length - 1]!)
  return out
}

function centroid(points: Point[]): Point {
  if (points.length === 0) return { x: 0, y: 0 }
  let x = 0
  let y = 0
  for (const p of points) {
    x += p.x
    y += p.y
  }
  return { x: x / points.length, y: y / points.length }
}

/** Direction of travel, in degrees, measured from the first point to the last. */
function heading(points: Point[]): number {
  const a = points[0]
  const b = points[points.length - 1]
  if (!a || !b) return 0
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI
}

function signedAngleDelta(a: number, b: number): number {
  let d = a - b
  while (d > 180) d -= 360
  while (d < -180) d += 360
  return d
}

/** Mean point-to-point distance between two equally-sampled polylines. */
function meanDeviation(a: Point[], b: Point[]): number {
  const n = Math.min(a.length, b.length)
  if (n === 0) return MAX_DEVIATION
  let total = 0
  for (let i = 0; i < n; i++) total += dist(a[i]!, b[i]!)
  return total / n
}

// ---------------------------------------------------------------------------
// scoring
// ---------------------------------------------------------------------------

export function scoreStroke(userStroke: Point[], reference: Point[], index: number): StrokeScore {
  const user = resample(userStroke)
  const ref = resample(reference)

  const forward = meanDeviation(user, ref)
  const backward = meanDeviation([...user].reverse(), ref)
  // A stroke drawn the wrong way round matches the reference well only when read
  // backwards. That distinction is the whole point of the writing module, so it is
  // detected rather than silently forgiven.
  const reversed = backward < forward * 0.6
  const deviation = Math.min(forward, backward)

  const score = Math.max(0, 1 - deviation / MAX_DEVIATION) * (reversed ? REVERSED_PENALTY : 1)

  const refLength = pathLength(ref)
  const userLength = pathLength(user)

  const uc = centroid(user)
  const rc = centroid(ref)

  return {
    index,
    score,
    angleDelta: signedAngleDelta(heading(user), heading(ref)),
    offset: { x: uc.x - rc.x, y: uc.y - rc.y },
    lengthRatio: refLength === 0 ? 1 : userLength / refLength,
    reversed,
  }
}

export function scoreCharacter(userStrokes: Point[][], medians: Point[][]): CharacterScore {
  const count = Math.min(userStrokes.length, medians.length)
  const strokes: StrokeScore[] = []
  let weighted = 0
  let weight = 0

  for (let i = 0; i < count; i++) {
    const ref = medians[i]!
    const s = scoreStroke(userStrokes[i]!, ref, i)
    strokes.push(s)
    // Long strokes carry more of the character's shape than short ones.
    const w = Math.max(1, pathLength(resample(ref)))
    weighted += s.score * w
    weight += w
  }

  // Missing or extra strokes are a structural error, not a shape one, but they still
  // have to drag the number down or a half-written character could score 100%.
  const expected = medians.length
  const completeness = expected === 0 ? 1 : Math.min(userStrokes.length, expected) / expected

  const raw = weight === 0 ? 0 : (weighted / weight) * completeness
  const worst = strokes.length === 0 ? null : strokes.reduce((a, b) => (b.score < a.score ? b : a))

  return {
    percent: Math.round(raw * 100),
    strokes,
    worst: worst && worst.score < NOTEWORTHY ? worst : null,
    note: worst && worst.score < NOTEWORTHY ? describe(worst, medians[worst.index]) : null,
  }
}

// ---------------------------------------------------------------------------
// diagnosis
// ---------------------------------------------------------------------------

const ORDINAL = ['pertama', 'kedua', 'ketiga', 'keempat', 'kelima', 'keenam', 'ketujuh', 'kedelapan']

/**
 * Plain-language direction of a reference stroke, used for the "should be" clause.
 *
 * Read in SVG orientation, where y grows downwards — so 90° points *down*, not up.
 * Under the previous data source the y axis was flipped, and this mapping described
 * every stroke as going the opposite way.
 */
function referenceDirection(reference: Point[] | undefined): string | null {
  if (!reference || reference.length < 2) return null
  const angle = heading(resample(reference))
  const a = ((angle % 360) + 360) % 360
  if (a < 22.5 || a >= 337.5) return 'ditarik ke kanan'
  if (a < 67.5) return 'menyapu turun ke kanan'
  if (a < 112.5) return 'ditarik lurus ke bawah'
  if (a < 157.5) return 'menyapu turun ke kiri'
  if (a < 202.5) return 'ditarik ke kiri'
  if (a < 247.5) return 'menyapu naik ke kiri'
  if (a < 292.5) return 'ditarik lurus ke atas'
  return 'menyapu naik ke kanan'
}

/**
 * Turns the dominant deviation into one sentence. Only the largest problem is
 * mentioned — a list of four small faults is not coaching, it is nagging.
 */
export function describe(s: StrokeScore, reference?: Point[]): string {
  const nth = ORDINAL[s.index] ?? `ke-${s.index + 1}`
  const should = referenceDirection(reference)

  if (s.reversed) {
    return should
      ? `Goresan ${nth} ditarik dari arah yang berlawanan — seharusnya ${should}.`
      : `Goresan ${nth} ditarik dari arah yang berlawanan.`
  }

  const angle = Math.abs(s.angleDelta)
  const offset = Math.hypot(s.offset.x, s.offset.y)
  const lengthOff = Math.abs(1 - s.lengthRatio)

  // Rank the three failure modes on a common scale so the biggest one wins.
  const ranked = (
    [
      { kind: 'angle', magnitude: angle / 30 },
      // Roughly 6% of the square — the point at which a stroke visibly sits in the
      // wrong place rather than merely wobbling.
      { kind: 'offset', magnitude: offset / 6.5 },
      { kind: 'length', magnitude: lengthOff / 0.25 },
    ] as const
  )
    .slice()
    .sort((a, b) => b.magnitude - a.magnitude)

  switch (ranked[0]!.kind) {
    case 'angle': {
      const tilt = s.angleDelta > 0 ? 'terlalu mendatar' : 'sedikit terlalu tegak'
      return should
        ? `Goresan ${nth} ${tilt} — di sini goresannya ${should}.`
        : `Goresan ${nth} ${tilt}.`
    }
    case 'length':
      return s.lengthRatio < 1
        ? `Goresan ${nth} kurang panjang.`
        : `Goresan ${nth} kelewat panjang.`
    default: {
      const horizontal = Math.abs(s.offset.x) > Math.abs(s.offset.y)
      const where = horizontal
        ? s.offset.x > 0
          ? 'ke kanan'
          : 'ke kiri'
        : s.offset.y > 0
          ? 'ke bawah'
          : 'ke atas'
      return `Goresan ${nth} agak bergeser ${where}.`
    }
  }
}

// ---------------------------------------------------------------------------
// FSRS bridge
// ---------------------------------------------------------------------------

/**
 * Writing is the one mode that needs no self-assessment, and that is exactly what
 * makes it the honest one. The rating comes from how many strokes came out wrong —
 * never from the shape percentage, and never from the user's own opinion.
 *
 * 1 = Again, 2 = Hard, 3 = Good (ts-fsrs numeric Rating).
 */
export function ratingFromStrokeErrors(errors: number): 1 | 2 | 3 {
  if (errors === 0) return 3
  if (errors <= 2) return 2
  return 1
}

/**
 * Maps a canvas point into KanjiVG's 109-unit square.
 *
 * A plain scale, with no flip: KanjiVG uses ordinary SVG orientation, so canvas and
 * character space already agree on which way is down. The previous data source
 * needed a y flip here, and getting it wrong scored every vertical stroke as drawn
 * backwards.
 */
export function canvasToCharacter(p: Point, canvasSize: number): Point {
  const scale = CHARACTER_SIZE / canvasSize
  return { x: p.x * scale, y: p.y * scale }
}

/** The inverse, for drawing stored strokes back onto a canvas of any size. */
export function characterToCanvas(p: Point, canvasSize: number): Point {
  const scale = canvasSize / CHARACTER_SIZE
  return { x: p.x * scale, y: p.y * scale }
}
