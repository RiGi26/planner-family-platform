import { clsx } from '@/lib/clsx'
import { fmt, t } from '@/lib/i18n'

/**
 * 原稿用紙 — the one primitive the whole app is built from.
 *
 * Progress is never a bar. It is a sheet of manuscript cells that fills with ink,
 * because "38 empty cells" reads as work left to do while "39%" reads as nothing.
 * The same component draws the daily quota, the answer-length hint in recall, the
 * first-load screen, and — at a larger size — the Kana Sheet itself.
 *
 * Three cell states:
 *   done  inked      (dark on light; the theme inverts it in dark mode)
 *   now   outlined in shu — the single cell you are on
 *   todo  dashed outline, empty
 */

export type SheetProps = {
  total: number
  done: number
  /** Cells per row. Defaults to a square-ish grid. */
  columns?: number
  /** Cell edge in px. */
  size?: number
  /**
   * Above this many cells the sheet downsamples: one drawn cell stands for several
   * real ones. The first-load screen counts 998 cards, and 998 nodes is a scroll
   * jank we would then spend a day chasing.
   */
  maxCells?: number
  /** Marks the next cell with a shu outline. Off for read-only summaries. */
  showCursor?: boolean
  label?: string
  className?: string
}

export function Sheet({
  total,
  done,
  columns,
  size = 14,
  maxCells = 240,
  showCursor = true,
  label,
  className,
}: SheetProps) {
  const safeTotal = Math.max(0, Math.floor(total))
  const safeDone = Math.min(Math.max(0, Math.floor(done)), safeTotal)

  // Downsample by scaling both numbers, so the inked fraction stays honest.
  const scale = safeTotal > maxCells ? safeTotal / maxCells : 1
  const drawn = Math.min(safeTotal, maxCells)
  const drawnDone = Math.round(safeDone / scale)

  const cols = columns ?? Math.min(drawn, Math.ceil(Math.sqrt(drawn * 1.9)))

  return (
    <div
      role="img"
      aria-label={label ?? fmt(t.common.sheetLabel, { done: safeDone, total: safeTotal })}
      className={clsx('grid w-fit gap-[2px]', className)}
      style={{ gridTemplateColumns: `repeat(${Math.max(1, cols)}, ${size}px)` }}
    >
      {Array.from({ length: drawn }, (_, i) => {
        const state = i < drawnDone ? 'done' : i === drawnDone && showCursor ? 'now' : 'todo'
        return (
          <span
            key={i}
            aria-hidden
            style={{ width: size, height: size }}
            className={clsx(
              'rounded-[1px] border',
              state === 'done' && 'border-ink bg-ink',
              state === 'now' && 'border-shu bg-transparent',
              state === 'todo' && 'border-cell-empty border-dashed bg-transparent',
            )}
          />
        )
      })}
    </div>
  )
}

/**
 * The 7-day streak strip. Same idea, no borders — a missed day is simply an
 * unfilled square, and it is never commented on.
 */
export function Ticks({
  total = 7,
  done,
  size = 16,
  label,
  className,
}: {
  total?: number
  done: boolean[]
  size?: number
  label?: string
  className?: string
}) {
  return (
    <div
      role="img"
      aria-label={label ?? fmt(t.common.ticksLabel, { done: done.filter(Boolean).length, total })}
      className={clsx('flex gap-[3px]', className)}
    >
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          aria-hidden
          style={{ width: size, height: size }}
          className={clsx(
            'rounded-[2px]',
            done[i] ? 'bg-ink' : 'bg-cell-empty',
          )}
        />
      ))}
    </div>
  )
}

/**
 * Answer-length hint for recall: one empty cell per kana, revealed one at a time
 * when the user asks for a hint. Shows how long the answer is without giving it away.
 */
export function AnswerCells({
  length,
  revealed = [],
  size = 44,
  className,
}: {
  length: number
  /** Characters already unlocked, index-aligned. Empty string = still hidden. */
  revealed?: string[]
  size?: number
  className?: string
}) {
  return (
    <div className={clsx('flex flex-wrap justify-center gap-2', className)}>
      {Array.from({ length }, (_, i) => {
        const ch = revealed[i]
        return (
          <span
            key={i}
            style={{ width: size, height: size }}
            className={clsx(
              'flex items-center justify-center rounded-[2px] border text-[24px] leading-none',
              ch
                ? 'border-rule bg-paper-raised text-ink'
                : 'border-cell-empty border-dashed text-transparent',
            )}
          >
            {ch ?? ''}
          </span>
        )
      })}
    </div>
  )
}
