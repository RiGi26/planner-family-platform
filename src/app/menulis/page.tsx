'use client'

import { Suspense, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { RequireAuth, useSession } from '@/components/auth-provider'
import { KanaCell, KanaGap } from '@/components/kana-cell'
import { WritingPractice, type WritingResult } from '@/components/writing-practice'
import {
  KANA,
  cellStatus,
  dakuten,
  gojuon,
  groupByItem,
  youon,
  type KanaItem,
  type Script,
  type SheetRow,
} from '@/lib/curriculum'
import { useT } from '@/lib/i18n'
import { useCardStates, useKanaSheet } from '@/lib/queries'
import { pushPending, saveWriting } from '@/lib/study'

/**
 * Writing one cell of the sheet, in the context of its row.
 *
 * Tapping a cell opens the row rather than enlarging the cell: a sheet cell is about
 * 56px and an adult fingertip covers 40–50px, so writing a legible character inside
 * one is not a design preference, it is impossible.
 */

function rowsFor(script: Script): SheetRow[] {
  return [...gojuon(script), ...dakuten(script), ...youon(script)]
}

function WritingScreen() {
  const t = useT()
  const params = useSearchParams()
  const router = useRouter()
  const { user } = useSession()
  const queryClient = useQueryClient()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const itemId = params.get('item')
  const item = useMemo(() => KANA.find((i) => i.id === itemId) ?? null, [itemId])

  const { data: cards } = useCardStates(user?.id)
  const { data: sheet } = useKanaSheet(user?.id)
  const states = useMemo(() => groupByItem(cards ?? []), [cards])

  const row = useMemo(() => {
    if (!item) return null
    return (
      rowsFor(item.data.script).find((r) =>
        r.cells.some((c) => c.kind === 'cell' && c.item.id === item.id),
      ) ?? null
    )
  }, [item])

  const written = row
    ? row.cells.filter((c) => c.kind === 'cell' && sheet?.has(c.item.id)).length
    : 0
  const inRow = row ? row.cells.filter((c) => c.kind === 'cell').length : 0

  async function save(result: WritingResult) {
    if (!user || !item) return
    setSaving(true)
    setError('')

    try {
      // Local first, always. Only the Recall strokes are stored — the sheet is meant
      // to hold writing from memory, and keeping a trace would make it a record of
      // copying. The schedule moves only if the card was actually due.
      await saveWriting(user.id, item, {
        strokes: result.strokes,
        strokeErrors: result.strokeErrors,
        rating: result.rating,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setSaving(false)
      return
    }

    // Uploading is a separate concern: a failure here loses nothing, because the
    // work is already in the local queue and the next sync will carry it.
    void pushPending()

    await queryClient.invalidateQueries({ queryKey: ['kana_sheet', user.id] })
    await queryClient.invalidateQueries({ queryKey: ['card_states', user.id] })
    setSaving(false)

    // Move to the next unwritten cell in this row, or back to the sheet when the
    // row is done.
    const next = row?.cells.find(
      (c) => c.kind === 'cell' && c.item.id !== item.id && !sheet?.has(c.item.id),
    )
    if (next && next.kind === 'cell') {
      router.replace(`/menulis/?item=${encodeURIComponent(next.item.id)}`)
    } else {
      router.push('/kana/')
    }
  }

  if (!itemId || !item || !row) {
    return (
      <main
        className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-4 px-5"
        style={{ paddingTop: 'var(--spacing-safe-top)' }}
      >
        <h1 className="text-[20px] font-bold text-ink">{t.menulis.pickTitle}</h1>
        <p className="text-[14px] leading-relaxed text-ink-muted">{t.menulis.pickBody}</p>
        <Link
          href="/kana/"
          className="flex min-h-tap items-center justify-center rounded-[3px] bg-shu px-4 text-[15px] font-medium text-paper-raised"
        >
          {t.menulis.pickCta}
        </Link>
      </main>
    )
  }

  return (
    <main
      className="mx-auto max-w-lg px-5 pb-16"
      style={{ paddingTop: 'calc(var(--spacing-safe-top) + 12px)' }}
    >
      <header className="flex items-center justify-between">
        <Link href="/kana/" className="min-h-tap -my-3 inline-flex items-center text-[13px] text-ai">
          {t.menulis.backToSheet}
        </Link>
        {/* Axis, not the 行 name — see the note in WritingPractice. */}
        <span className="tnum text-[12px] text-ink-muted">
          {row.axis} · {written}/{inRow}
        </span>
      </header>

      {/* The row so far, in the learner's own hand. The active cell is marked in shu
          and labelled by its column — never by the character it holds. */}
      <div className="mt-4 flex items-end gap-1 overflow-x-auto pb-1">
        {row.cells.map((cell, i) =>
          cell.kind === 'empty' ? (
            <KanaGap key={i} size={44} />
          ) : (
            <div key={cell.item.id} className="flex flex-col items-center gap-1">
              <span
                className={clsxCol(cell.item.id === item.id)}
                aria-hidden
              >
                {cell.item.data.col}
              </span>
              <div className={cell.item.id === item.id ? 'ring-2 ring-shu rounded-[3px]' : ''}>
                <KanaCell
                  item={cell.item}
                  size={44}
                  status={cellStatus(states.get(cell.item.id) ?? [])}
                  strokes={sheet?.get(cell.item.id)}
                />
              </div>
            </div>
          ),
        )}
      </div>

      {error ? (
        <p role="alert" className="mt-4 rounded-[3px] bg-oker-tint px-3 py-2 text-[13px] text-oker">
          {error}
        </p>
      ) : null}

      <div className="mt-6">
        <WritingPractice item={item} size={300} onFinished={save} />
      </div>

      {saving ? (
        <p role="status" className="mt-4 text-center text-[13px] text-ink-muted">
          {t.menulis.saving}
        </p>
      ) : null}
    </main>
  )
}

function clsxCol(active: boolean) {
  return active
    ? 'tnum text-[11px] text-shu font-semibold'
    : 'tnum text-[11px] text-ink-faint'
}

export default function WritingPage() {
  return (
    <RequireAuth>
      <Suspense fallback={null}>
        <WritingScreen />
      </Suspense>
    </RequireAuth>
  )
}

export type { KanaItem }
