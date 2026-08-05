'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { clsx } from '@/lib/clsx'
import { t } from '@/lib/i18n'
import { canvasToCharacter, inkWidth, type Point } from '@/lib/stroke-score'

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
 *
 * THREE THINGS THIS COMPONENT GETS RIGHT ON PURPOSE, all found by writing on a real
 * phone rather than by reading the code:
 *
 * 1. The page must not scroll mid-stroke. `touch-action: none` on the drawing
 *    surface alone was not enough — the browser could still start a scroll from the
 *    wrapper, and the moment it does it fires `pointercancel` and the stroke is cut
 *    in half. The wrapper opts out too, and a non-passive `touchmove` listener
 *    refuses the gesture outright for the browsers that ignore `touch-action` on SVG.
 *
 * 2. Live ink is drawn imperatively. Re-rendering React on every pointermove means
 *    60–120 renders a second over a path that keeps growing, which on a phone reads
 *    exactly as the stutter it is. The in-progress stroke updates one `d` attribute
 *    through a ref, and React only hears about it when the stroke ends.
 *
 * 3. The canvas rectangle is measured once per stroke. `getBoundingClientRect()` on
 *    every move forces a synchronous layout, which is the same stutter from a
 *    different direction. Measuring at pointerdown is safe precisely because the
 *    page cannot scroll underneath us — point 1 is what makes point 3 correct.
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
  /**
   * Fired after the canvas is wiped. The Trace stage keeps its own progress —
   * which strokes were accepted, how many were repeated — and clearing the ink
   * without telling it would leave a counter describing strokes that are no
   * longer on the paper.
   */
  onClear?: () => void
  /** Anything to draw behind the ink: a faint template, guides, markers. */
  children?: React.ReactNode
  disabled?: boolean
  className?: string
}

const toPath = (pts: Point[]) =>
  pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')

export function InkCanvas({
  size,
  onStrokeEnd,
  validateStroke,
  onClear,
  children,
  disabled = false,
  className,
}: InkCanvasProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const liveRef = useRef<SVGPathElement | null>(null)

  const drawing = useRef(false)
  const rect = useRef<DOMRect | null>(null)
  const current = useRef<Point[]>([])

  const [strokes, setStrokes] = useState<Point[][]>([])

  /**
   * Refuses the scroll gesture for browsers that ignore `touch-action` on an SVG.
   * Has to be registered non-passively; React's onTouchMove is passive and cannot
   * call preventDefault.
   */
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const block = (e: TouchEvent) => {
      if (drawing.current) e.preventDefault()
    }
    el.addEventListener('touchmove', block, { passive: false })
    return () => el.removeEventListener('touchmove', block)
  }, [])

  const paint = useCallback(() => {
    if (liveRef.current) liveRef.current.setAttribute('d', toPath(current.current))
  }, [])

  function start(e: React.PointerEvent<SVGSVGElement>) {
    if (disabled) return
    e.preventDefault()
    // Capture keeps the stroke alive when a finger slides past the edge, which
    // otherwise ends it halfway through a sweeping harai.
    e.currentTarget.setPointerCapture(e.pointerId)

    // Measured once — see note 3 above.
    rect.current = e.currentTarget.getBoundingClientRect()
    drawing.current = true
    current.current = [{ x: e.clientX - rect.current.left, y: e.clientY - rect.current.top }]
    paint()
  }

  function move(e: React.PointerEvent<SVGSVGElement>) {
    if (!drawing.current || !rect.current) return
    e.preventDefault()

    // Mobile browsers batch pointermove to one event per frame and tuck the real
    // samples into getCoalescedEvents(). Reading only the batched event drops the
    // points in between, and a fast harai comes out as three straight segments.
    const native = e.nativeEvent
    const samples =
      typeof native.getCoalescedEvents === 'function' && native.getCoalescedEvents().length > 0
        ? native.getCoalescedEvents()
        : [native]

    let added = false
    for (const ev of samples) {
      const p = { x: ev.clientX - rect.current.left, y: ev.clientY - rect.current.top }
      const last = current.current[current.current.length - 1]
      // Drop points that have barely moved: they add nothing to the shape and make
      // the scorer's resampling noisier.
      if (last && Math.hypot(p.x - last.x, p.y - last.y) < 1.5) continue
      current.current.push(p)
      added = true
    }
    if (added) paint()
  }

  function end(e: React.PointerEvent<SVGSVGElement>) {
    if (!drawing.current) return
    drawing.current = false
    rect.current = null
    e.currentTarget.releasePointerCapture?.(e.pointerId)

    const drawn = current.current
    current.current = []
    paint()

    // A tap with no travel is not a stroke.
    if (drawn.length < 2) return

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
    current.current = []
    paint()
    onStrokeEnd?.([])
    onClear?.()
  }

  return (
    <div
      ref={wrapRef}
      className={clsx('relative', className)}
      // The wrapper opts out too. Blocking the gesture only on the drawing surface
      // still let the browser start a scroll from around it and cancel the stroke.
      style={{ width: size, touchAction: 'none', overscrollBehavior: 'contain' }}
    >
      {/* Paper, guides and any template sit behind the ink, sharing the same box.
          Everything in here is absolutely positioned and clipped: the guides and the
          template are siblings, and normal flow would stack them vertically — which
          once pushed the trace template clean out of the canvas, floating under the
          page as a giant watermark. */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 overflow-hidden rounded-[3px] bg-canvas"
        style={{ width: size, height: size }}
      >
        <svg
          viewBox={`0 0 ${size} ${size}`}
          width={size}
          height={size}
          aria-hidden
          className="absolute inset-0"
        >
          {/* 田 guides — the standard Japanese practice sheet. */}
          <g stroke="var(--color-canvas-rule)" strokeWidth="1" strokeDasharray="4 5">
            <line x1={size / 2} y1={0} x2={size / 2} y2={size} />
            <line x1={0} y1={size / 2} x2={size} y2={size / 2} />
          </g>
        </svg>
        <div className="absolute inset-0">{children}</div>
      </div>

      <svg
        ref={svgRef}
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="application"
        aria-label={t.menulis.canvasLabel}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        style={{ touchAction: 'none' }}
        className="relative rounded-[3px] border border-canvas-rule bg-transparent"
      >
        <g
          fill="none"
          stroke="var(--color-canvas-ink)"
          // The same weight the template and the sheet cells use, so a stroke laid
          // exactly on the guide covers it exactly.
          strokeWidth={inkWidth(size)}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {strokes.map((s, i) => (
            <path key={i} d={toPath(s)} />
          ))}
          {/* The stroke in progress. Updated through the ref, never through state. */}
          <path ref={liveRef} d="" />
        </g>
      </svg>

      <button
        type="button"
        onClick={clear}
        disabled={disabled || strokes.length === 0}
        className="mt-3 min-h-tap w-full rounded-[3px] border border-rule px-4 text-[14px] text-ink-muted disabled:opacity-40"
      >
        {t.menulis.clear}
      </button>
    </div>
  )
}
