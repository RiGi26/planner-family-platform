'use client'

import { useCallback, useRef, useState } from 'react'
import { clsx } from '@/lib/clsx'
import { canvasToCharacter, type Point } from '@/lib/stroke-score'

/**
 * A square of practice paper you can write on.
 *
 * Used by the Recall stage, where hanzi-writer's quiz mode is deliberately *not*
 * used: quiz rejects a wrong stroke the instant it is drawn, and that is correction,
 * not recall. Here the ink goes down uninterrupted and nothing is judged until the
 * character is finished.
 *
 * The paper stays paper-coloured in dark mode. People write on paper, not on ink —
 * and this is the one lit surface in a night-time session, on purpose.
 */

export type InkCanvasProps = {
  size: number
  onStrokeEnd?: (strokes: Point[][]) => void
  /**
   * Trace stage only. Return false to reject the stroke just drawn — the ink is
   * removed and the learner writes it again. Correction, not erasure: the reason is
   * shown beside the canvas rather than by wiping the whole attempt.
   */
  validateStroke?: (stroke: Point[], index: number) => boolean
  /** Anything to draw behind the ink: a faint template, guides, markers. */
  children?: React.ReactNode
  disabled?: boolean
  hideClear?: boolean
  className?: string
}

export function InkCanvas({
  size,
  onStrokeEnd,
  validateStroke,
  children,
  disabled = false,
  hideClear = false,
  className,
}: InkCanvasProps) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const drawing = useRef(false)
  const current = useRef<Point[]>([])
  const [strokes, setStrokes] = useState<Point[][]>([])
  const [live, setLive] = useState<Point[]>([])

  const pointFrom = useCallback((e: React.PointerEvent) => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }, [])

  function start(e: React.PointerEvent) {
    if (disabled) return
    // Capture keeps the stroke alive when a finger slides past the edge, which
    // otherwise ends the stroke halfway through a sweeping harai.
    e.currentTarget.setPointerCapture(e.pointerId)
    drawing.current = true
    current.current = [pointFrom(e)]
    setLive(current.current)
  }

  function move(e: React.PointerEvent) {
    if (!drawing.current) return
    const p = pointFrom(e)
    const last = current.current[current.current.length - 1]
    // Drop points that have barely moved: they add nothing to the shape and make
    // the scorer's resampling noisier.
    if (last && Math.hypot(p.x - last.x, p.y - last.y) < 1.5) return
    current.current = [...current.current, p]
    setLive(current.current)
  }

  function end(e: React.PointerEvent) {
    if (!drawing.current) return
    drawing.current = false
    e.currentTarget.releasePointerCapture?.(e.pointerId)

    // A tap with no travel is not a stroke.
    if (current.current.length < 2) {
      current.current = []
      setLive([])
      return
    }

    const drawn = current.current
    current.current = []
    setLive([])

    const inCharacterSpace = drawn.map((p) => canvasToCharacter(p, size))
    if (validateStroke && !validateStroke(inCharacterSpace, strokes.length)) {
      // Rejected: the ink never lands, so the stroke count stays honest and the
      // learner repeats that stroke rather than starting the character again.
      return
    }

    const next = [...strokes, drawn]
    setStrokes(next)
    onStrokeEnd?.(next.map((s) => s.map((p) => canvasToCharacter(p, size))))
  }

  function clear() {
    setStrokes([])
    setLive([])
    current.current = []
    onStrokeEnd?.([])
  }

  const path = (pts: Point[]) =>
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')

  return (
    <div className={clsx('relative', className)} style={{ width: size }}>
      {/* Paper, guides and any template sit behind the ink, sharing the same box.
          The paper stays paper-coloured in dark mode: people write on paper, not on
          ink, and this is the one lit surface in a night-time session. */}
      <div
        className="absolute inset-x-0 top-0 rounded-[3px] bg-canvas"
        style={{ width: size, height: size }}
      >
        <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden>
          {/* 田 guides — the standard Japanese practice sheet. */}
          <g stroke="var(--color-canvas-rule)" strokeWidth="1" strokeDasharray="4 5">
            <line x1={size / 2} y1={0} x2={size / 2} y2={size} />
            <line x1={0} y1={size / 2} x2={size} y2={size / 2} />
          </g>
        </svg>
        {children}
      </div>

      <svg
        ref={svgRef}
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="application"
        aria-label="Kanvas menulis"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        // Without this, dragging a finger down the canvas triggers pull-to-refresh
        // and the stroke is lost along with the page.
        style={{ touchAction: 'none' }}
        className="relative rounded-[3px] border border-canvas-rule bg-transparent"
      >
        <g
          fill="none"
          stroke="var(--color-canvas-ink)"
          strokeWidth={Math.max(4, size / 28)}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {strokes.map((s, i) => (
            <path key={i} d={path(s)} />
          ))}
          {live.length > 1 ? <path d={path(live)} /> : null}
        </g>
      </svg>

      {hideClear ? null : (
        <button
          type="button"
          onClick={clear}
          disabled={disabled || strokes.length === 0}
          className="mt-3 min-h-tap w-full rounded-[3px] border border-rule px-4 text-[14px] text-ink-muted disabled:opacity-40"
        >
          Hapus
        </button>
      )}
    </div>
  )
}
