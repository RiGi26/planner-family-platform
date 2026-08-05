'use client'

import { clsx } from '@/lib/clsx'
import { Rating, type CardStateRow, type UserRating } from '@/lib/fsrs'
import { previewSchedule } from '@/lib/fsrs'
import { formatInterval } from '@/lib/session'
import { useT } from '@/lib/i18n'

/**
 * The four ratings, each carrying what it will actually do.
 *
 * Writing the next interval under the label is what turns a guess into a choice —
 * and it is the reason `previewSchedule` exists: `scheduled_days` is zero for
 * every card still in learning steps, so labelling from day counts would print
 * "0 hr" four times on exactly the day when most cards are new.
 *
 * One row of four, sitting in the thumb zone. Nothing here is shu: shu marks the
 * single primary action on a screen, and four equal choices are not that. The
 * only colour is on Lupa, in oker, because forgetting is not an error either.
 */

const ORDER: { rating: UserRating; key: 'rateAgain' | 'rateHard' | 'rateGood' | 'rateEasy' }[] = [
  { rating: Rating.Again as UserRating, key: 'rateAgain' },
  { rating: Rating.Hard as UserRating, key: 'rateHard' },
  { rating: Rating.Good as UserRating, key: 'rateGood' },
  { rating: Rating.Easy as UserRating, key: 'rateEasy' },
]

export function RatingButtons({
  card,
  now,
  onRate,
}: {
  card: CardStateRow
  /** Frozen at reveal, so the four labels cannot drift apart as seconds pass. */
  now: number
  onRate: (rating: UserRating) => void
}) {
  const t = useT()
  const preview = previewSchedule(card, new Date(now))

  return (
    <div className="grid grid-cols-4 gap-2">
      {ORDER.map(({ rating, key }) => {
        const { n, unit } = formatInterval(preview[rating].due.getTime(), now)
        const unitLabel = {
          mnt: t.sesi.unitMnt,
          jam: t.sesi.unitJam,
          hr: t.sesi.unitHr,
          bln: t.sesi.unitBln,
          thn: t.sesi.unitThn,
        }[unit]

        return (
          <button
            key={rating}
            type="button"
            onClick={() => onRate(rating)}
            // touch-manipulation kills the 300ms double-tap wait; across twenty
            // cards that delay alone is six seconds of a four-minute budget.
            className={clsx(
              'flex min-h-[64px] touch-manipulation flex-col items-center justify-center gap-1 rounded-[3px] border px-1',
              rating === Rating.Again
                ? 'border-oker/50 bg-oker-tint text-oker'
                : 'border-rule bg-paper-raised text-ink',
            )}
          >
            <span className="text-[14px] leading-none font-medium">{t.sesi[key]}</span>
            <span className="tnum text-[11px] leading-none text-ink-faint">
              {n} {unitLabel}
            </span>
          </button>
        )
      })}
    </div>
  )
}
