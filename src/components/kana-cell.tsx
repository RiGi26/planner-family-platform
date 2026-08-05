'use client'

import { clsx } from '@/lib/clsx'
import type { CellStatus, KanaItem } from '@/lib/curriculum'
import { fmt, t } from '@/lib/i18n'
import { characterToCanvas, inkWidth, type Point } from '@/lib/stroke-score'

/**
 * One square of the Kana Sheet.
 *
 * The rule the whole screen rests on: **a cell never shows the character.** Position
 * is the question — row k, column a — and the learner derives か from it. A glyph
 * printed in an unwritten cell would make the sheet a cheat sheet.
 *
 * A written cell shows the learner's own handwriting, not a typeset glyph. After a
 * few weeks that adds up to a complete chart in their own hand, and the change from
 * week one to week six is visible.
 */

export type CellProps = {
  item: KanaItem
  status: CellStatus
  /** Captured stroke points in character space, from the Recall stage only. */
  strokes?: Point[][]
  /** Test mode blanks every cell without deleting anything. */
  hidden?: boolean
  size?: number
  onSelect?: (item: KanaItem) => void
}

/**
 * Stored strokes live in KanjiVG's 109-unit square, in ordinary SVG orientation, so
 * drawing them back is a plain scale with no flip — `characterToCanvas` is the same
 * mapping the writing canvas uses in reverse.
 */
function toCellPath(stroke: Point[], size: number): string {
  return stroke
    .map((p, i) => {
      const { x, y } = characterToCanvas(p, size)
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(' ')
}

export function KanaCell({ item, status, strokes, hidden = false, size = 56, onSelect }: CellProps) {
  const written = !hidden && strokes && strokes.length > 0
  const label = hidden
    ? t.kana.cellHidden
    : written
      ? fmt(t.kana.cellWritten, { status })
      : fmt(t.kana.cellUnwritten, { row: item.data.row })

  return (
    <button
      type="button"
      onClick={() => onSelect?.(item)}
      aria-label={label}
      style={{ width: size, height: size }}
      className={clsx(
        'relative flex items-center justify-center rounded-[2px] transition-colors',
        written ? 'border border-rule bg-canvas' : 'border border-dashed border-cell-empty',
        // Due cells get a ring, never a revealed character. Saying "review this" by
        // showing the answer would defeat the point of asking.
        status === 'due' && 'ring-2 ring-ai ring-offset-1 ring-offset-paper',
      )}
    >
      {written ? (
        <svg
          viewBox={`0 0 ${size} ${size}`}
          width={size}
          height={size}
          aria-hidden
          className="pointer-events-none"
        >
          {strokes.map((stroke, i) => (
            <path
              key={i}
              d={toCellPath(stroke, size)}
              fill="none"
              stroke="var(--color-canvas-ink)"
              // The same weight the writing canvas uses, so a cell shows the
              // handwriting shrunk rather than a heavier version of it.
              strokeWidth={inkWidth(size)}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        </svg>
      ) : null}
    </button>
  )
}

/** A position on the chart that has no character — drawn as nothing, not as a box. */
export function KanaGap({ size = 56 }: { size?: number }) {
  return <span aria-hidden style={{ width: size, height: size }} className="block" />
}
