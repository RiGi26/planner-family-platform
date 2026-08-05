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
  /** Faint template shown behind the ink, for the Trace stage. */
  templatePaths?: string[]
  onStrokeEnd?: (strokes: Point[][]) => void
  disabled?: boolean
  className?: string
}

export type InkCanvasHandle = {
  clear: () => void
  strokes: Point[][]
}

export function InkCanvas({
  size,
  templatePaths,
  onStrokeEnd,
  disabled = false,
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

    const next = [...strokes, current.current]
    setStrokes(next)
    current.current = []
    setLive([])
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

  const guide = size / 2

  return (
    <div className={clsx('relative', className)}>
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
        className="rounded-[3px] border border-canvas-rule bg-canvas"
      >
        {/* 田 guides — the standard Japanese practice sheet. */}
        <g stroke="var(--color-canvas-rule)" strokeWidth="1" strokeDasharray="4 5">
          <line x1={guide} y1={0} x2={guide} y2={size} />
          <line x1={0} y1={guide} x2={size} y2={guide} />
        </g>

        {templatePaths?.length ? (
          <g
            transform={`scale(${size / 1024}, ${-size / 1024}) translate(0, -900)`}
            fill="var(--color-canvas-ink)"
            opacity="0.14"
          >
            {templatePaths.map((d, i) => (
              <path key={i} d={d} />
            ))}
          </g>
        ) : null}

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

      <button
        type="button"
        onClick={clear}
        disabled={disabled || strokes.length === 0}
        className="mt-3 min-h-tap w-full rounded-[3px] border border-rule px-4 text-[14px] text-ink-muted disabled:opacity-40"
      >
        Hapus
      </button>
    </div>
  )
}
