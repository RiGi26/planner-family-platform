'use client'

import { useCallback, useMemo, useState } from 'react'
import { InkCanvas } from '@/components/ink-canvas'
import { StrokeFigure, StrokeStartMarkers } from '@/components/stroke-figure'
import { clsx } from '@/lib/clsx'
import { consonantOf, type KanaItem } from '@/lib/curriculum'
import { fmt, useT } from '@/lib/i18n'
import { kvgCharacter, medians, strokeCount } from '@/lib/kvg'
import {
  describe as describeStroke,
  ratingFromStrokeErrors,
  scoreCharacter,
  scoreStroke,
  type Point,
} from '@/lib/stroke-score'

/**
 * Demo → Jiplak → Ingat.
 *
 * The difference in feedback between the last two stages is the whole design. Trace
 * corrects every stroke as it happens; Recall withholds everything until the
 * character is finished. A Recall stage that corrected as you went would stop being
 * recall — you would just be following the corrections.
 *
 * Stroke data is KanjiVG, which follows Japanese handwriting convention. The library
 * this replaced brought data derived from Chinese font outlines, and taught あ as
 * four strokes where it is three.
 */

export type Stage = 'demo' | 'jiplak' | 'ingat'

/** Below this, a traced stroke is in the wrong place rather than merely untidy. */
const TRACE_ACCEPT = 0.55

export type WritingResult = {
  strokes: Point[][]
  strokeErrors: number
  shapePercent: number
  note: string | null
  /** From stroke errors alone — never the shape score, never the user's opinion. */
  rating: 1 | 2 | 3
}

export function WritingPractice({
  item,
  size = 300,
  onFinished,
}: {
  item: KanaItem
  size?: number
  onFinished: (result: WritingResult) => void
}) {
  const t = useT()
  const STAGE_LABEL: Record<Stage, string> = {
    demo: t.menulis.stageDemo,
    jiplak: t.menulis.stageJiplak,
    ingat: t.menulis.stageIngat,
  }
  const character = item.data.strokes_key
  const data = useMemo(() => kvgCharacter(character), [character])
  const total = strokeCount(character)

  const [stage, setStage] = useState<Stage>('demo')
  const [speed, setSpeed] = useState(1)
  const [demoKey, setDemoKey] = useState(0)

  const [traced, setTraced] = useState(0)
  const [mistakes, setMistakes] = useState(0)
  const [traceNote, setTraceNote] = useState<string | null>(null)

  const [recall, setRecall] = useState<Point[][]>([])
  const [checked, setChecked] = useState<WritingResult | null>(null)

  // Sampling needs the browser's SVG geometry, so it comes back empty during
  // prerender — harmless, because nothing renders it directly. What matters is that
  // it does NOT depend on the stage: recomputing on the Jiplak → Ingat switch put
  // synchronous geometry work inside the very tap the learner was waiting on.
  const reference = useMemo(() => medians(character), [character])

  /**
   * The only way stages change. Every stage starts clean: leftover Jiplak ink
   * shown during Ingat is the answer leaked, and a leftover `checked` from a
   * previous visit is a canvas that refuses to draw.
   */
  function go(next: Stage) {
    setStage(next)
    setChecked(null)
    setRecall([])
    if (next === 'jiplak') reset()
    if (next === 'demo') setDemoKey((k) => k + 1)
  }

  const validate = useCallback(
    (stroke: Point[], index: number) => {
      const expected = reference[index]
      if (!expected) return true

      const s = scoreStroke(stroke, expected, index)
      if (s.score >= TRACE_ACCEPT && !s.reversed) {
        setTraced(index + 1)
        setTraceNote(null)
        return true
      }

      // Rejected, but explained. The learner repeats this stroke; nothing already
      // written is thrown away.
      setMistakes((m) => m + 1)
      setTraceNote(describeStroke(s, expected))
      return false
    },
    [reference],
  )

  function reset() {
    setTraced(0)
    setMistakes(0)
    setTraceNote(null)
  }

  function check() {
    const score = scoreCharacter(recall, reference)
    const missing = Math.max(0, total - recall.length)
    const errors = mistakes + missing
    setChecked({
      strokes: recall,
      strokeErrors: errors,
      shapePercent: score.percent,
      note: score.note,
      rating: ratingFromStrokeErrors(errors),
    })
  }

  if (!data) {
    return (
      <p className="rounded-[3px] bg-oker-tint px-3 py-3 text-[13px] text-oker">
        {fmt(t.menulis.noStrokeData, { char: item.expression })}
      </p>
    )
  }

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Axis and column, not the 行 name: for any column-a cell the 行 label *is*
          the answer, and Recall is the stage that must not give it away. */}
      <div className="flex w-full items-center justify-between">
        <span className="tnum text-[12px] tracking-[0.14em] text-ink-muted uppercase">
          {consonantOf(item.reading)} · {item.data.col}
        </span>
        <span className="tnum text-[12px] text-ink-muted">
          {fmt(t.menulis.strokeCount, { n: total })}
        </span>
      </div>

      <div className="flex w-full rounded-[3px] border border-rule bg-paper-raised p-[3px]">
        {(['demo', 'jiplak', 'ingat'] as Stage[]).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => go(s)}
            className={clsx(
              'min-h-tap flex-1 rounded-[2px] text-[13px] transition-colors',
              stage === s ? 'bg-ink text-paper-raised' : 'text-ink-muted',
            )}
          >
            {STAGE_LABEL[s]}
          </button>
        ))}
      </div>

      {stage === 'demo' ? (
        <div
          className="relative rounded-[3px] border border-canvas-rule bg-canvas"
          style={{ width: size, height: size }}
        >
          <StrokeFigure
            key={demoKey}
            character={character}
            size={size}
            animate
            speed={speed}
          />
          <StrokeStartMarkers character={character} size={size} />
        </div>
      ) : (
        <InkCanvas
          // Remounted on every stage change. Jiplak and Ingat sharing one canvas
          // instance carried the traced ink into Recall — the answer on screen, and
          // the traced strokes silently prepended to what got saved as "from memory".
          key={stage}
          size={size}
          onStrokeEnd={stage === 'ingat' ? setRecall : undefined}
          validateStroke={stage === 'jiplak' ? validate : undefined}
          // Clearing the tracing puts the stage back to stroke one. Without this the
          // accepted-stroke overlay and the "goresan 3/3" counter would keep
          // describing ink the learner has just wiped off.
          onClear={stage === 'jiplak' ? reset : undefined}
          disabled={Boolean(checked)}
        >
          {stage === 'jiplak' ? (
            <>
              {/* The whole character, faint, to trace over — plus the strokes
                  already accepted, so progress is visible without a counter. */}
              <StrokeFigure character={character} size={size} template />
              <div className="absolute inset-0">
                <StrokeFigure character={character} size={size} upTo={traced} />
              </div>
              <StrokeStartMarkers character={character} size={size} upTo={traced + 1} />
            </>
          ) : null}
        </InkCanvas>
      )}

      {stage === 'demo' ? (
        <div className="flex w-full flex-col gap-3">
          <div className="flex gap-2">
            {[0.5, 1].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setSpeed(s)
                  setDemoKey((k) => k + 1)
                }}
                className={clsx(
                  'min-h-tap flex-1 rounded-[3px] border text-[13px]',
                  speed === s ? 'border-ink text-ink' : 'border-rule text-ink-muted',
                )}
              >
                {s}×
              </button>
            ))}
            <button
              type="button"
              onClick={() => setDemoKey((k) => k + 1)}
              className="min-h-tap flex-1 rounded-[3px] border border-rule text-[13px] text-ink-muted"
            >
              {t.menulis.demoReplay}
            </button>
          </div>
          <p className="text-center text-[12px] leading-relaxed text-ink-muted">
            {t.menulis.demoNote}
          </p>
          <button
            type="button"
            onClick={() => go('jiplak')}
            className="min-h-tap rounded-[3px] bg-shu px-4 text-[15px] font-medium text-paper-raised"
          >
            {t.menulis.toTrace}
          </button>
        </div>
      ) : null}

      {stage === 'jiplak' ? (
        <div className="flex w-full flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="tnum text-[12px] text-ink-muted">
              {fmt(t.menulis.traceProgress, { current: Math.min(traced + 1, total), total })}
            </span>
            {mistakes > 0 ? (
              <span className="tnum text-[12px] text-oker">
                {fmt(t.menulis.traceRepeats, { n: mistakes })}
              </span>
            ) : null}
          </div>

          {traceNote ? (
            <p role="status" className="rounded-[3px] bg-shu-tint px-3 py-2 text-[13px] leading-relaxed text-shu">
              {traceNote}
            </p>
          ) : (
            <p className="text-center text-[12px] text-ink-muted">{t.menulis.traceNote}</p>
          )}

          <button
            type="button"
            onClick={() => go('ingat')}
            disabled={traced < total}
            className="min-h-tap rounded-[3px] bg-shu px-4 text-[15px] font-medium text-paper-raised disabled:bg-rule disabled:text-ink-muted"
          >
            {traced < total ? t.menulis.finishTraceFirst : t.menulis.toRecall}
          </button>
        </div>
      ) : null}

      {stage === 'ingat' ? (
        <div className="flex w-full flex-col gap-3">
          <p className="text-center text-[12px] leading-relaxed text-ink-muted">
            {t.menulis.recallNote}
          </p>

          {checked ? (
            <div className="rounded-[3px] border border-rule bg-paper-raised px-4 py-4">
              <div className="flex items-baseline justify-between">
                <span className="text-[12px] tracking-[0.12em] text-ink-muted uppercase">
                  {t.menulis.shapeLabel}
                </span>
                <span className="tnum text-[24px] text-ink">{checked.shapePercent}%</span>
              </div>
              {checked.note ? (
                <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">{checked.note}</p>
              ) : (
                <p className="mt-2 text-[13px] text-pinus">{t.menulis.cleanWrite}</p>
              )}
            </div>
          ) : null}

          <button
            type="button"
            onClick={checked ? () => onFinished(checked) : check}
            disabled={recall.length === 0}
            className="min-h-tap rounded-[3px] bg-shu px-4 text-[15px] font-medium text-paper-raised disabled:bg-rule disabled:text-ink-muted"
          >
            {checked ? t.menulis.saveToSheet : t.menulis.compare}
          </button>
        </div>
      ) : null}
    </div>
  )
}
