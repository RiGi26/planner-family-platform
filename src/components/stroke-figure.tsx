'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { KVG_SIZE, kvgCharacter } from '@/lib/kvg'
import { clsx } from '@/lib/clsx'

/**
 * Draws a character from its KanjiVG strokes, and animates them in writing order.
 *
 * Replaced hanzi-writer, which brought its own data — data that splits closed loops
 * into two strokes and so taught あ as four. Since KanjiVG paths are centrelines,
 * drawing them is just stroking a path, and animating one is a dash offset. There
 * was never much library here to miss.
 */

export type StrokeFigureProps = {
  character: string
  size: number
  /** Draw strokes one after another. Off shows the finished character. */
  animate?: boolean
  /** Show only the first N strokes; the rest stay hidden. */
  upTo?: number
  /** Faint, for tracing behind the learner's own ink. */
  template?: boolean
  /** Milliseconds per stroke at 1×. */
  strokeMs?: number
  speed?: number
  onDone?: () => void
  className?: string
}

export function StrokeFigure({
  character,
  size,
  animate = false,
  upTo,
  template = false,
  strokeMs = 620,
  speed = 1,
  onDone,
  className,
}: StrokeFigureProps) {
  const data = useMemo(() => kvgCharacter(character), [character])
  const [drawn, setDrawn] = useState(animate ? 0 : (upTo ?? data?.strokes.length ?? 0))
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => {
    timers.current.forEach(clearTimeout)
    timers.current = []

    if (!animate || !data) {
      setDrawn(upTo ?? data?.strokes.length ?? 0)
      return
    }

    setDrawn(0)
    const per = strokeMs / Math.max(0.25, speed)
    data.strokes.forEach((_, i) => {
      timers.current.push(setTimeout(() => setDrawn(i + 1), per * (i + 1)))
    })
    timers.current.push(setTimeout(() => onDone?.(), per * data.strokes.length + 120))

    return () => {
      timers.current.forEach(clearTimeout)
      timers.current = []
    }
    // onDone is intentionally excluded: a caller passing an inline arrow would
    // otherwise restart the animation on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [character, animate, speed, strokeMs, upTo, data])

  if (!data) return null

  const per = strokeMs / Math.max(0.25, speed)
  const visible = animate ? drawn : (upTo ?? data.strokes.length)

  return (
    <svg
      viewBox={`0 0 ${KVG_SIZE} ${KVG_SIZE}`}
      width={size}
      height={size}
      aria-hidden
      className={clsx('block', className)}
    >
      <g
        fill="none"
        stroke={template ? 'var(--color-canvas-ink)' : 'var(--color-canvas-ink)'}
        strokeOpacity={template ? 0.16 : 1}
        strokeWidth={template ? 5 : 4.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {data.strokes.map((d, i) => {
          if (i >= visible) return null
          // The stroke currently being drawn sweeps in; earlier ones are already down.
          const isCurrent = animate && i === visible - 1
          return (
            <path
              key={i}
              d={d}
              style={
                isCurrent
                  ? {
                      strokeDasharray: 1000,
                      strokeDashoffset: 0,
                      animation: `kvg-draw ${per}ms linear both`,
                    }
                  : undefined
              }
            />
          )
        })}
      </g>

      <style>{`
        @keyframes kvg-draw {
          from { stroke-dashoffset: 1000; }
          to   { stroke-dashoffset: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          path { animation: none !important; }
        }
      `}</style>
    </svg>
  )
}

/**
 * The order marker for a single stroke: a shu number at the stroke's start, so the
 * learner can see *where* a stroke begins, not only that it exists.
 */
export function StrokeStartMarkers({
  character,
  size,
  upTo,
}: {
  character: string
  size: number
  upTo?: number
}) {
  const data = kvgCharacter(character)
  const [points, setPoints] = useState<{ x: number; y: number }[]>([])

  useEffect(() => {
    if (!data || typeof document === 'undefined') return
    const svgNs = 'http://www.w3.org/2000/svg'
    setPoints(
      data.strokes.map((d) => {
        const p = document.createElementNS(svgNs, 'path')
        p.setAttribute('d', d)
        const pt = p.getPointAtLength(0)
        return { x: pt.x, y: pt.y }
      }),
    )
  }, [data])

  if (!data) return null
  const limit = upTo ?? data.strokes.length

  return (
    <svg
      viewBox={`0 0 ${KVG_SIZE} ${KVG_SIZE}`}
      width={size}
      height={size}
      aria-hidden
      className="pointer-events-none absolute inset-0"
    >
      {points.slice(0, limit).map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="6" fill="var(--color-canvas)" opacity="0.85" />
          <text
            x={p.x}
            y={p.y + 2.6}
            textAnchor="middle"
            fontSize="7"
            fontFamily="ui-monospace, monospace"
            fill="#CE3F29"
          >
            {i + 1}
          </text>
        </g>
      ))}
    </svg>
  )
}
