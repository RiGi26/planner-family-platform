'use client'

import { useEffect, useRef, useState } from 'react'
import { InkCanvas } from '@/components/ink-canvas'
import { clsx } from '@/lib/clsx'
import type { KanaItem } from '@/lib/curriculum'
import { characterJson, charDataLoader, mediansAsPoints, strokeCount } from '@/lib/strokes'
import { ratingFromStrokeErrors, scoreCharacter, type Point } from '@/lib/stroke-score'

/**
 * Demo → Jiplak → Ingat.
 *
 * The difference in feedback between the middle and last stage is the whole design.
 * Trace corrects every stroke as it happens; Recall withholds everything until the
 * character is finished. If Recall corrected as you went it would stop being recall
 * — you would just be following the corrections.
 *
 * That is also why the two stages use different machinery. hanzi-writer's quiz mode
 * rejects a wrong stroke the moment it is drawn, which is exactly right for tracing
 * and exactly wrong for recalling.
 */

export type Stage = 'demo' | 'jiplak' | 'ingat'

const STAGE_LABEL: Record<Stage, string> = {
  demo: 'Demo',
  jiplak: 'Jiplak',
  ingat: 'Ingat',
}

export type WritingResult = {
  strokes: Point[][]
  strokeErrors: number
  shapePercent: number
  note: string | null
  /** Derived from stroke errors alone — never from the shape score, never from the user. */
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
  const [stage, setStage] = useState<Stage>('demo')
  const [speed, setSpeed] = useState(1)
  const [traceMistakes, setTraceMistakes] = useState(0)
  const [traceNote, setTraceNote] = useState<string | null>(null)
  const [traceDone, setTraceDone] = useState(false)
  const [recallStrokes, setRecallStrokes] = useState<Point[][]>([])
  const [checked, setChecked] = useState<WritingResult | null>(null)

  const character = item.data.strokes_key
  const total = strokeCount(character)
  const json = characterJson(character)

  const mountRef = useRef<HTMLDivElement | null>(null)
  const writerRef = useRef<{ animateCharacter: (o?: unknown) => void; quiz: (o?: unknown) => void; cancelQuiz: () => void } | null>(null)

  // hanzi-writer touches the DOM directly, so it can only be created in the browser
  // and has to be torn down by hand when the stage or character changes.
  useEffect(() => {
    if (stage === 'ingat' || !mountRef.current) return
    let cancelled = false
    const host = mountRef.current
    host.innerHTML = ''

    import('hanzi-writer').then(({ default: HanziWriter }) => {
      if (cancelled) return
      const writer = HanziWriter.create(host, character, {
        width: size,
        height: size,
        padding: Math.round(size * 0.08),
        showCharacter: stage === 'demo',
        showOutline: true,
        strokeColor: '#211D1A',
        outlineColor: '#C9C0B2',
        drawingColor: '#211D1A',
        highlightColor: '#CE3F29',
        strokeAnimationSpeed: speed,
        delayBetweenStrokes: 320,
        charDataLoader,
      })
      writerRef.current = writer as never

      if (stage === 'demo') {
        writer.animateCharacter()
      } else {
        setTraceMistakes(0)
        setTraceDone(false)
        setTraceNote(null)
        writer.quiz({
          // Adults learning to write miss on direction more than on shape, so the
          // grader stays forgiving on shape and lets direction do the teaching.
          leniency: 1.2,
          showHintAfterMisses: 3,
          acceptBackwardsStrokes: false,
          onMistake: (s: { strokeNum: number }) => {
            setTraceMistakes((m) => m + 1)
            setTraceNote(`Goresan ${s.strokeNum + 1} belum pas — perhatikan arah dan urutannya.`)
          },
          onCorrectStroke: () => setTraceNote(null),
          onComplete: () => setTraceDone(true),
        })
      }
    })

    return () => {
      cancelled = true
      writerRef.current?.cancelQuiz?.()
      writerRef.current = null
      host.innerHTML = ''
    }
  }, [stage, character, size, speed])

  function check() {
    const medians = mediansAsPoints(character)
    const score = scoreCharacter(recallStrokes, medians)
    // Stroke errors carry over from Trace; Recall itself never interrupts to count.
    const errors = Math.max(traceMistakes, recallStrokes.length === total ? 0 : total - recallStrokes.length)
    const result: WritingResult = {
      strokes: recallStrokes,
      strokeErrors: errors,
      shapePercent: score.percent,
      note: score.note,
      rating: ratingFromStrokeErrors(errors),
    }
    setChecked(result)
  }

  if (!json) {
    return (
      <p className="rounded-[3px] bg-oker-tint px-3 py-3 text-[13px] text-oker">
        Data goresan untuk {item.expression} belum tersedia di perangkat ini.
      </p>
    )
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex w-full items-center justify-between">
        <span className="text-[12px] tracking-[0.14em] text-ink-muted uppercase">
          {item.data.row_label} · kolom {item.data.col}
        </span>
        <span className="tnum text-[12px] text-ink-muted">{total} goresan</span>
      </div>

      <div className="flex w-full rounded-[3px] border border-rule bg-paper-raised p-[3px]">
        {(['demo', 'jiplak', 'ingat'] as Stage[]).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStage(s)}
            className={clsx(
              'min-h-tap flex-1 rounded-[2px] text-[13px] transition-colors',
              stage === s ? 'bg-ink text-paper-raised' : 'text-ink-muted',
            )}
          >
            {STAGE_LABEL[s]}
          </button>
        ))}
      </div>

      {stage === 'ingat' ? (
        <InkCanvas size={size} onStrokeEnd={setRecallStrokes} disabled={Boolean(checked)} />
      ) : (
        <div
          ref={mountRef}
          style={{ width: size, height: size, touchAction: 'none' }}
          className="rounded-[3px] border border-canvas-rule bg-canvas"
        />
      )}

      {stage === 'demo' ? (
        <div className="flex w-full flex-col gap-3">
          <div className="flex gap-2">
            {[0.5, 1].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSpeed(s)}
                className={clsx(
                  'min-h-tap flex-1 rounded-[3px] border text-[13px]',
                  speed === s ? 'border-ink text-ink' : 'border-rule text-ink-muted',
                )}
              >
                {s}×
              </button>
            ))}
          </div>
          <p className="text-center text-[12px] text-ink-muted">
            Tonton sebanyak yang perlu. Kecepatan 0,5× karena orang dewasa kalah di arah,
            bukan di bentuk.
          </p>
          <button
            type="button"
            onClick={() => setStage('jiplak')}
            className="min-h-tap rounded-[3px] bg-shu px-4 text-[15px] font-medium text-paper-raised"
          >
            Lanjut ke jiplak
          </button>
        </div>
      ) : null}

      {stage === 'jiplak' ? (
        <div className="flex w-full flex-col gap-3">
          {traceNote ? (
            <p role="status" className="rounded-[3px] bg-shu-tint px-3 py-2 text-[13px] text-shu">
              {traceNote}
            </p>
          ) : null}
          <p className="text-center text-[12px] text-ink-muted">
            Goresan yang salah tidak dihapus — hanya ditolak, dan kamu ulangi goresan itu.
          </p>
          <button
            type="button"
            onClick={() => setStage('ingat')}
            disabled={!traceDone}
            className="min-h-tap rounded-[3px] bg-shu px-4 text-[15px] font-medium text-paper-raised disabled:bg-rule disabled:text-ink-muted"
          >
            {traceDone ? 'Lanjut ke ingat' : 'Selesaikan jiplakannya dulu'}
          </button>
        </div>
      ) : null}

      {stage === 'ingat' ? (
        <div className="flex w-full flex-col gap-3">
          <p className="text-center text-[12px] text-ink-muted">
            Tanpa contoh. Tulis dari ingatan — tidak ada yang dinilai sampai kamu selesai.
          </p>

          {checked ? (
            <div className="rounded-[3px] border border-rule bg-paper-raised px-4 py-4">
              <div className="flex items-baseline justify-between">
                <span className="text-[12px] tracking-[0.12em] text-ink-muted uppercase">Bentuk</span>
                <span className="tnum text-[24px] text-ink">{checked.shapePercent}%</span>
              </div>
              {checked.note ? (
                <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">{checked.note}</p>
              ) : (
                <p className="mt-2 text-[13px] text-pinus">Urutan dan arahnya benar.</p>
              )}
            </div>
          ) : null}

          <button
            type="button"
            onClick={checked ? () => onFinished(checked) : check}
            disabled={recallStrokes.length === 0}
            className="min-h-tap rounded-[3px] bg-shu px-4 text-[15px] font-medium text-paper-raised disabled:bg-rule disabled:text-ink-muted"
          >
            {checked ? 'Simpan ke lembar' : 'Bandingkan'}
          </button>
        </div>
      ) : null}
    </div>
  )
}
