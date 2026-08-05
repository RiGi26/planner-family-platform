'use client'

import { useCallback, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { RequireAuth, useSession } from '@/components/auth-provider'
import { BottomNav } from '@/components/bottom-nav'
import { KanaCell, KanaGap } from '@/components/kana-cell'
import { clsx } from '@/lib/clsx'
import {
  cellStatus,
  dakuten,
  gojuon,
  groupByItem,
  sheetProgress,
  youon,
  type ItemStates,
  type KanaGroup,
  type KanaItem,
  type Script,
  type SheetRow,
  VOWELS,
  YOUON_VOWELS,
} from '@/lib/curriculum'
import { fmt, useT } from '@/lib/i18n'
import { useCardStates, useKanaSheet } from '@/lib/queries'
import type { Point } from '@/lib/stroke-score'

/**
 * Lembar Kana — the 五十音 chart that starts empty and gets filled in by hand.
 *
 * This replaces a linear curriculum map for the kana phase, and it teaches the thing
 * that matters most about kana: it is a structured system, not 46 arbitrary symbols.
 * Nothing on screen may carry an answer — the axis labels are romaji consonants and
 * vowels, and the cells hold only the learner's own handwriting.
 */

type GridProps = {
  rows: SheetRow[]
  cols: readonly string[]
  states: ItemStates
  /** Handwriting per item, keyed by item id. Absent until the cell has been written. */
  strokes: Map<string, Point[][]> | undefined
  hidden: boolean
  size: number
  onSelect: (item: KanaItem) => void
}

function Grid({ rows, cols, states, strokes, hidden, size, onSelect }: GridProps) {
  return (
    <div className="w-fit">
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: `28px repeat(${cols.length}, ${size}px)` }}
      >
        <span aria-hidden />
        {cols.map((c) => (
          <span
            key={c}
            className="tnum text-center text-[11px] tracking-[0.1em] text-ink-faint lowercase"
          >
            {c}
          </span>
        ))}

        {rows.map((row) => (
          <FragmentRow
            key={row.key}
            row={row}
            states={states}
            strokes={strokes}
            hidden={hidden}
            size={size}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  )
}

function FragmentRow({
  row,
  states,
  strokes,
  hidden,
  size,
  onSelect,
}: Omit<GridProps, 'rows' | 'cols'> & { row: SheetRow }) {
  return (
    <>
      <span className="tnum flex items-center justify-end pr-1 text-[11px] text-ink-faint">
        {row.axis}
      </span>
      {row.cells.map((cell, i) =>
        cell.kind === 'empty' ? (
          <KanaGap key={i} size={size} />
        ) : (
          <KanaCell
            key={cell.item.id}
            item={cell.item}
            size={size}
            hidden={hidden}
            status={cellStatus(states.get(cell.item.id) ?? [])}
            strokes={strokes?.get(cell.item.id)}
            onSelect={onSelect}
          />
        ),
      )}
    </>
  )
}

function Section({
  title,
  count,
  children,
}: {
  title: string
  count: string
  children: React.ReactNode
}) {
  return (
    <section className="mt-8">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-[12px] tracking-[0.14em] text-ink-muted uppercase">{title}</h2>
        <span className="tnum text-[12px] text-ink-muted">{count}</span>
      </div>
      <div className="overflow-x-auto pb-1">{children}</div>
    </section>
  )
}

export default function KanaSheetPage() {
  const t = useT()
  const { user } = useSession()
  const router = useRouter()
  const [script, setScript] = useState<Script>('hiragana')
  // "uji aku" blanks every cell without deleting anything, so the sheet can be
  // refilled as a test. Once cells are visible the chart stops being a test — the
  // answers are sitting right there.
  const [testMode, setTestMode] = useState(false)

  const { data: cards } = useCardStates(user?.id)
  const { data: sheet } = useKanaSheet(user?.id)

  const states = useMemo(() => groupByItem(cards ?? []), [cards])
  const progress = useMemo(
    () =>
      (['basic', 'dakuten', 'youon'] as KanaGroup[]).map((g) => ({
        group: g,
        ...sheetProgress(script, g, states),
      })),
    [script, states],
  )

  const overall = progress.reduce(
    (acc, p) => ({ strong: acc.strong + p.strong, total: acc.total + p.total }),
    { strong: 0, total: 0 },
  )

  // Tapping a cell opens its row for writing. A 56px cell cannot be written in with
  // a 40–50px fingertip, so the cell is a target, not a canvas.
  const openCell = useCallback(
    (item: KanaItem) => router.push(`/menulis/?item=${encodeURIComponent(item.id)}`),
    [router],
  )

  const label = (g: KanaGroup) => progress.find((p) => p.group === g)!

  return (
    <RequireAuth>
      <main
        className="mx-auto max-w-3xl px-5 pb-32"
        style={{ paddingTop: 'calc(var(--spacing-safe-top) + 12px)' }}
      >
        <header className="flex items-baseline justify-between">
          <h1 className="text-[13px] tracking-[0.14em] text-ink-muted uppercase">{t.kana.title}</h1>
          <span className="tnum text-[13px] text-ink">
            {overall.strong}{' '}
            <span className="text-ink-faint">{fmt(t.kana.strongCount, { total: overall.total })}</span>
          </span>
        </header>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="flex rounded-[3px] border border-rule bg-paper-raised p-[3px]">
            {(['hiragana', 'katakana'] as Script[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setScript(s)}
                className={clsx(
                  'min-h-tap rounded-[2px] px-4 text-[13px] transition-colors',
                  script === s ? 'bg-ink text-paper-raised' : 'text-ink-muted',
                )}
              >
                {s === 'hiragana' ? t.kana.hiragana : t.kana.katakana}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setTestMode((v) => !v)}
            aria-pressed={testMode}
            className={clsx(
              'min-h-tap rounded-[3px] border px-4 text-[13px] transition-colors',
              testMode
                ? 'border-shu bg-shu text-paper-raised'
                : 'border-rule bg-paper-raised text-ink-muted',
            )}
          >
            {testMode ? t.kana.testModeOn : t.kana.testModeOff}
          </button>
        </div>

        {testMode ? (
          <p className="mt-3 text-[13px] leading-relaxed text-ink-muted">
            {t.kana.testModeNoteBefore}
            <strong className="text-ink">{t.kana.testModeNoteStrong}</strong>
            {t.kana.testModeNoteAfter}
          </p>
        ) : null}

        <Section
          title={t.kana.gojuonHeading}
          count={`${label('basic').strong} / ${label('basic').total}`}
        >
          <Grid
            rows={gojuon(script)}
            cols={VOWELS}
            states={states}
            strokes={sheet}
            hidden={testMode}
            size={56}
            onSelect={openCell}
          />
        </Section>

        <Section
          title={t.kana.dakutenHeading}
          count={`${label('dakuten').strong} / ${label('dakuten').total}`}
        >
          <Grid
            rows={dakuten(script)}
            cols={VOWELS}
            states={states}
            strokes={sheet}
            hidden={testMode}
            size={52}
            onSelect={openCell}
          />
        </Section>

        <Section title={t.kana.youonHeading} count={`${label('youon').strong} / ${label('youon').total}`}>
          <Grid
            rows={youon(script)}
            cols={YOUON_VOWELS}
            states={states}
            strokes={sheet}
            hidden={testMode}
            size={52}
            onSelect={openCell}
          />
        </Section>

        <p className="mt-10 text-[12px] leading-relaxed text-ink-faint">{t.kana.legend}</p>
      </main>

      <BottomNav />
    </RequireAuth>
  )
}
