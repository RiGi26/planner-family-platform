'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useLiveQuery } from 'dexie-react-hooks'
import { RequireAuth, useSession } from '@/components/auth-provider'
import { BottomNav } from '@/components/bottom-nav'
import { Sheet } from '@/components/sheet'
import { clsx } from '@/lib/clsx'
import { groupByItem } from '@/lib/curriculum'
import { fmt, useT } from '@/lib/i18n'
import { loadN5Items, loadUnits, type Item } from '@/lib/items'
import { localCards } from '@/lib/study'
import { jaVoice, speak } from '@/lib/tts'
import { currentUnit, unitProgress, type Unit, type UnitProgress } from '@/lib/units'

/**
 * Jalur — the guided path.
 *
 * The screen exists to remove a decision. A beginner cannot choose between
 * "kana / vocabulary / grammar / kanji", and being asked to is what made the app
 * feel directionless; here there is one question and one button: continue.
 *
 * Units are titled by what you can DO afterwards, not by the grammar inside them
 * — "Menanyakan tempat" rather than "Partikel は". A locked unit says which unit
 * opens it and how far that unit has come, because a number is a plan and a
 * padlock is a wall.
 */

type Loaded = { units: Unit[]; items: Map<string, Item> }

function UnitRow({
  unit,
  progress,
  state,
  onOpen,
}: {
  unit: Unit
  progress: UnitProgress
  state: 'done' | 'current' | 'locked'
  onOpen: () => void
}) {
  const t = useT()

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className={clsx(
          'flex w-full items-start gap-3 rounded-[3px] border px-4 py-3 text-left transition-colors',
          state === 'current'
            ? 'border-shu bg-paper-raised'
            : 'border-rule bg-paper-raised hover:border-ink-faint',
        )}
      >
        <span
          aria-hidden
          className={clsx(
            'tnum mt-[2px] w-7 shrink-0 text-center text-[13px]',
            state === 'done' ? 'text-pinus' : state === 'current' ? 'text-shu' : 'text-ink-faint',
          )}
        >
          {state === 'done' ? '済' : unit.n}
        </span>

        <span className="min-w-0 flex-1">
          <span
            className={clsx(
              'block text-[15px] leading-snug',
              state === 'locked' ? 'text-ink-muted' : 'text-ink',
            )}
          >
            {unit.title}
          </span>
          <span className="mt-[2px] block text-[12px] leading-relaxed text-ink-muted">
            {unit.cando}
          </span>

          {progress.total > 0 ? (
            <span className="tnum mt-2 block text-[11px] text-ink-faint">
              {fmt(t.jalur.itemProgress, { strong: progress.strong, total: progress.total })}
            </span>
          ) : null}
        </span>
      </button>
    </li>
  )
}

/** One dialogue, readable and speakable line by line. */
function Dialog({ unit, voice }: { unit: Unit; voice: SpeechSynthesisVoice | null }) {
  const t = useT()
  if (unit.dialog.length === 0) return null

  return (
    <section className="mt-6">
      <h2 className="mb-3 text-[12px] tracking-[0.14em] text-ink-muted uppercase">
        {t.jalur.dialogHeading}
      </h2>
      <ol className="flex flex-col gap-2">
        {unit.dialog.map((line, i) => (
          <li
            key={i}
            className={clsx(
              'rounded-[3px] border border-rule bg-paper-raised px-3 py-2',
              // Two speakers, so a conversation reads as one. Indenting the
              // second is enough; colour would spend the accent on decoration.
              line.speaker === 'B' && 'ml-6',
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 flex-1 text-[16px] leading-relaxed text-ink">{line.ja}</p>
              {voice ? (
                <button
                  type="button"
                  onClick={() => speak(line.ja, voice)}
                  aria-label={t.jalur.playLine}
                  className="-my-2 -mr-1 flex min-h-tap min-w-tap shrink-0 touch-manipulation items-center justify-center text-ink-faint"
                >
                  <svg
                    aria-hidden
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                  </svg>
                </button>
              ) : null}
            </div>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">{line.id}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}

function UnitDetail({
  unit,
  progress,
  voice,
  onBack,
}: {
  unit: Unit
  progress: UnitProgress
  voice: SpeechSynthesisVoice | null
  onBack: () => void
}) {
  const t = useT()

  return (
    <>
      <button
        type="button"
        onClick={onBack}
        className="-my-3 inline-flex min-h-tap items-center text-[13px] text-ai"
      >
        ← {t.jalur.backToPath}
      </button>

      <header className="mt-4">
        <p className="tnum text-[12px] tracking-[0.14em] text-ink-muted uppercase">
          {fmt(t.jalur.unitN, { n: unit.n })}
        </p>
        <h1 className="mt-1 text-[22px] leading-tight font-bold text-ink">{unit.title}</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-ink-muted">{unit.cando}</p>
      </header>

      {progress.total > 0 ? (
        <Sheet
          total={progress.total}
          done={progress.strong}
          size={16}
          className="mt-4"
          label={fmt(t.jalur.itemProgress, { strong: progress.strong, total: progress.total })}
        />
      ) : null}

      {unit.grammar.length > 0 ? (
        <section className="mt-6">
          <h2 className="mb-2 text-[12px] tracking-[0.14em] text-ink-muted uppercase">
            {t.jalur.patternHeading}
          </h2>
          <ul className="flex flex-wrap gap-2">
            {unit.grammar.map((g) => (
              <li
                key={g}
                className="rounded-[3px] border border-rule bg-paper-raised px-2 py-1 text-[14px] text-ink"
              >
                {g}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Dialog unit={unit} voice={voice} />

      {unit.sentences.length > 0 ? (
        <section className="mt-6">
          <h2 className="mb-2 text-[12px] tracking-[0.14em] text-ink-muted uppercase">
            {t.jalur.sentenceHeading}
          </h2>
          <ul className="flex flex-col gap-2">
            {unit.sentences.map((s) => (
              <li key={s.ja} className="rounded-[3px] border border-rule bg-paper-raised px-3 py-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 text-[16px] leading-relaxed text-ink">{s.ja}</p>
                  {voice ? (
                    <button
                      type="button"
                      onClick={() => speak(s.ja, voice)}
                      aria-label={t.jalur.playLine}
                      className="-my-2 -mr-1 flex min-h-tap min-w-tap shrink-0 touch-manipulation items-center justify-center text-ink-faint"
                    >
                      <svg
                        aria-hidden
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                        <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                      </svg>
                    </button>
                  ) : null}
                </div>
                <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">{s.id}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* The honesty label. It says what was checked and what was not, and it
          stays until a native speaker has actually read the unit. */}
      {!unit.reviewed ? (
        <p className="mt-6 rounded-[3px] bg-oker-tint px-3 py-2 text-[12px] leading-relaxed text-oker">
          {t.jalur.notReviewed}
        </p>
      ) : null}
    </>
  )
}

function JalurScreen() {
  const t = useT()
  const router = useRouter()
  const params = useSearchParams()
  const { user } = useSession()

  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(null)

  useEffect(() => {
    void Promise.all([loadUnits(), loadN5Items()]).then(([units, items]) =>
      setLoaded({ units, items }),
    )
    void jaVoice().then(setVoice)
  }, [])

  const cards = useLiveQuery(() => (user ? localCards(user.id) : Promise.resolve([])), [user?.id])
  const states = useMemo(() => groupByItem(cards ?? []), [cards])

  const rows = useMemo(() => {
    if (!loaded) return null
    const now = new Date()
    const current = currentUnit(loaded.units, loaded.items, states, now)
    return [...loaded.units]
      .sort((a, b) => a.n - b.n)
      .map((unit) => {
        const progress = unitProgress(unit, loaded.items, states, now)
        const state: 'done' | 'current' | 'locked' =
          unit.n === current.n ? 'current' : progress.passed ? 'done' : unit.n < current.n ? 'done' : 'locked'
        return { unit, progress, state }
      })
  }, [loaded, states])

  if (!rows || !cards) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <span className="sr-only">{t.common.loading}</span>
        <span aria-hidden className="animate-pulse text-[28px] text-ink-faint">
          升
        </span>
      </div>
    )
  }

  // Read the parameter's presence, not its value: `Number(null)` is 0, and
  // Unit 0 exists — so /jalur/ with no query opened Unit 0's detail instead of
  // the path. Zero being both "absent" and a real unit number is the whole trap.
  const unitParam = params.get('unit')
  const open = unitParam === null ? undefined : rows.find((r) => r.unit.n === Number(unitParam))
  const current = rows.find((r) => r.state === 'current') ?? rows[0]!

  return (
    <>
      <main
        className="mx-auto max-w-lg px-5 pb-32"
        style={{ paddingTop: 'calc(var(--spacing-safe-top) + 12px)' }}
      >
        {open ? (
          <UnitDetail
            unit={open.unit}
            progress={open.progress}
            voice={voice}
            onBack={() => router.replace('/jalur/')}
          />
        ) : (
          <>
            <header className="flex items-baseline justify-between border-b border-rule pb-4">
              <h1 className="text-[13px] tracking-[0.14em] text-ink-muted uppercase">
                {t.jalur.title}
              </h1>
              <span className="tnum text-[12px] text-ink-faint">
                {fmt(t.jalur.position, { n: current.unit.n, total: rows.length })}
              </span>
            </header>

            <p className="mt-4 text-[13px] leading-relaxed text-ink-muted">{t.jalur.intro}</p>

            <ul className="mt-4 flex flex-col gap-2">
              {rows.map((r) => (
                <UnitRow
                  key={r.unit.n}
                  unit={r.unit}
                  progress={r.progress}
                  state={r.state}
                  onOpen={() => router.replace(`/jalur/?unit=${r.unit.n}`)}
                />
              ))}
            </ul>

            <p className="mt-6 text-[12px] leading-relaxed text-ink-faint">{t.jalur.moreSoon}</p>
          </>
        )}
      </main>

      {/* The single action, in the thumb zone above the nav. */}
      <div
        className="fixed inset-x-0 z-30 mx-auto max-w-lg px-5"
        style={{ bottom: 'calc(var(--spacing-safe-bottom) + 68px)' }}
      >
        <Link
          href="/sesi/"
          className="flex min-h-[60px] items-center justify-center gap-3 rounded-[3px] bg-shu px-5 text-paper-raised shadow-[0_8px_24px_-12px_rgba(0,0,0,0.55)]"
        >
          <span aria-hidden className="font-mincho text-[22px] leading-none">
            始
          </span>
          <span className="text-left">
            <span className="block text-[15px] leading-tight font-medium">
              {fmt(t.jalur.continueUnit, { n: current.unit.n })}
            </span>
            <span className="block text-[11px] opacity-80">{current.unit.title}</span>
          </span>
        </Link>
      </div>

      <BottomNav />
    </>
  )
}

export default function JalurPage() {
  return (
    <RequireAuth>
      <Suspense fallback={null}>
        <JalurScreen />
      </Suspense>
    </RequireAuth>
  )
}
