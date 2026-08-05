'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { RequireAuth, useSession } from '@/components/auth-provider'
import { FormMessage } from '@/components/auth-form'
import { clsx } from '@/lib/clsx'
import { groupByItem, remainingNew } from '@/lib/curriculum'
import { db } from '@/lib/db'
import { toExamDate, upcomingSittings, type Sitting } from '@/lib/exam-dates'
import { computeQuota, planTracks, REVIEW_BUFFER_DAYS } from '@/lib/goal-engine'
import { fmt, useT } from '@/lib/i18n'
import { useCardStates, useGoal } from '@/lib/queries'
import { supabase } from '@/lib/supabase-client'

/**
 * Onboarding: the exam date, and the arithmetic that follows from it.
 *
 * Two steps in one route, with the step in component state. Under
 * `output: 'export'` every route is a separate document, so splitting the steps
 * across routes would make "back" a full navigation and drop the choice made on
 * the first screen.
 *
 * The date is picked from the real JLPT calendar rather than typed. The exam is
 * held on the first Sunday of July and December; a free date field would let
 * someone plan towards a day on which no exam exists, and every number this
 * screen prints after that would be confidently wrong.
 */

const LEVELS = ['N5', 'N4', 'N3', 'N2', 'N1'] as const

function OnboardingScreen() {
  const t = useT()
  const router = useRouter()
  const params = useSearchParams()
  const queryClient = useQueryClient()
  const { user } = useSession()

  const [step, setStep] = useState<1 | 2>(1)
  const [level, setLevel] = useState<string>('N5')
  const [chosen, setChosen] = useState<Sitting | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const { data: goal, isSuccess: goalLoaded } = useGoal(user?.id)
  const { data: cards } = useCardStates(user?.id)

  // Changing an existing goal is a deliberate act, marked by the query string.
  // Without it, someone who already onboarded and lands here by a stale link
  // should simply be sent home rather than shown a form that would replace it.
  const changing = params.get('ganti') === '1'
  useEffect(() => {
    if (goalLoaded && goal && !changing) router.replace('/')
  }, [goalLoaded, goal, changing, router])

  const today = useMemo(() => new Date(), [])
  const sittings = useMemo(() => upcomingSittings(today, 4), [today])

  const left = useMemo(() => remainingNew(groupByItem(cards ?? [])), [cards])

  const quota = useMemo(() => {
    if (!chosen) return null
    return computeQuota({
      remainingNew: left,
      dueToday: 0,
      targetExamDate: chosen.date,
      today,
    })
  }, [chosen, left, today])

  // Only tracks that actually have content. Listing vocabulary, kanji and grammar
  // today would promise material that has not been built.
  const plan = useMemo(
    () => (quota ? planTracks([{ track: t.hariIni.trackKana, items: left }], quota.newPerDay) : null),
    [quota, left, t],
  )

  async function start() {
    if (!user || !chosen || !quota || saving) return
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setError(t.onboarding.offline)
      return
    }

    setSaving(true)
    setError('')

    // Straight to the server, not through the offline queue. Onboarding happens
    // exactly once, seconds after a sign-in that already proved the network works
    // — and the queue is built for append-only rows carrying a client-minted id,
    // while a goal is a mutable singleton. It is the one shape that queue cannot
    // hold.
    const { error: rpcError } = await supabase.rpc('set_active_goal', {
      p_level: level,
      p_exam_date: toExamDate(chosen.date),
      p_baseline: quota.newPerDay,
    })

    if (rpcError) {
      // Never the raw message. A stale session whose account was deleted elsewhere
      // reaches this line and Postgres answers `violates foreign key constraint
      // "goals_user_id_fkey"` — a sentence that tells the reader nothing and tells
      // an attacker the schema. The detail belongs in the console.
      console.error('[mulai] set_active_goal gagal', rpcError)
      setError(t.errors.auth.fallback)
      setSaving(false)
      return
    }

    // A local copy so Hari Ini can still read the target tomorrow morning on a
    // train. Best effort: failing to cache must not fail the onboarding.
    try {
      await db.meta.put({
        key: 'active_goal',
        value: JSON.stringify({ level, examDate: toExamDate(chosen.date), baseline: quota.newPerDay }),
      })
    } catch {
      // IndexedDB unavailable — the server copy is the one that matters.
    }

    await queryClient.invalidateQueries({ queryKey: ['goal', user.id] })
    router.replace('/')
  }

  return (
    <main
      className="mx-auto max-w-lg px-5 pb-16"
      style={{ paddingTop: 'calc(var(--spacing-safe-top) + 12px)' }}
    >
      <p className="tnum text-[12px] tracking-[0.14em] text-ink-faint uppercase">
        {fmt(t.onboarding.stepOf, { n: step })}
      </p>

      <FormMessage kind="error">{error}</FormMessage>

      {step === 1 ? (
        <>
          <h1 className="mt-3 text-[24px] leading-tight font-bold text-ink sm:text-[30px]">
            {t.onboarding.targetTitle}
          </h1>
          <p className="mt-2 text-[14px] leading-relaxed text-ink-muted">
            {t.onboarding.targetSubtitle}
          </p>

          <h2 className="mt-8 mb-3 text-[12px] font-medium tracking-[0.14em] text-ink-muted uppercase">
            {t.onboarding.levelHeading}
          </h2>
          <div className="flex flex-wrap gap-2">
            {LEVELS.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLevel(l)}
                aria-pressed={level === l}
                className={clsx(
                  'min-h-tap min-w-[64px] rounded-[3px] border px-4 text-[14px] transition-colors',
                  level === l
                    ? 'border-ink bg-ink text-paper-raised'
                    : 'border-rule bg-paper-raised text-ink-muted',
                )}
              >
                {l}
              </button>
            ))}
          </div>

          <h2 className="mt-8 mb-3 text-[12px] font-medium tracking-[0.14em] text-ink-muted uppercase">
            {t.onboarding.sittingHeading}
          </h2>
          <ul className="flex flex-col gap-2">
            {sittings.map((s) => {
              const label = new Intl.DateTimeFormat('id-ID', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              }).format(s.date)
              const active = chosen?.date.getTime() === s.date.getTime()
              return (
                <li key={s.date.toISOString()}>
                  <button
                    type="button"
                    disabled={s.tooSoon}
                    onClick={() => setChosen(s)}
                    aria-pressed={active}
                    className={clsx(
                      'flex min-h-tap w-full flex-col items-start gap-1 rounded-[3px] border px-4 py-3 text-left transition-colors',
                      s.tooSoon
                        ? 'border-rule bg-paper-sunken opacity-60'
                        : active
                          ? // Ink, not shu: shu marks the one primary action on a
                            // screen, and that is already the Lanjut button. A
                            // chosen date is state, and state is drawn in ink.
                            'border-ink bg-paper-raised ring-1 ring-ink'
                          : 'border-rule bg-paper-raised',
                    )}
                  >
                    <span className="text-[15px] text-ink">{label}</span>
                    <span className="tnum text-[12px] text-ink-muted">
                      {s.tooSoon
                        ? fmt(t.onboarding.tooSoon, { buffer: REVIEW_BUFFER_DAYS })
                        : fmt(t.onboarding.daysAway, { n: s.daysLeft })}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>

          <button
            type="button"
            onClick={() => setStep(2)}
            disabled={!chosen}
            className="mt-8 flex min-h-[52px] w-full items-center justify-center rounded-[3px] bg-shu px-4 text-[15px] font-medium text-paper-raised disabled:bg-rule disabled:text-ink-muted"
          >
            {t.onboarding.next}
          </button>
        </>
      ) : null}

      {step === 2 && quota && plan && chosen ? (
        <>
          <h1 className="mt-3 text-[24px] leading-tight font-bold text-ink sm:text-[30px]">
            {t.onboarding.quotaTitle}
          </h1>
          <p className="mt-2 text-[14px] leading-relaxed text-ink-muted">
            {t.onboarding.quotaSubtitle}
          </p>

          <p className="tnum mt-8 text-[40px] leading-none text-ink sm:text-[52px]">{quota.newPerDay}</p>
          <p className="mt-1 text-[14px] text-ink-muted">
            {fmt(t.onboarding.perDay, { n: quota.newPerDay })}
          </p>

          <div className="mt-6 flex flex-col gap-2 border-t border-rule pt-4">
            <p className="tnum text-[13px] text-ink-muted">
              {fmt(t.onboarding.arithmetic, { items: left, days: quota.workingDays })}
            </p>
            {plan.plans.map((p) => (
              <p key={p.track} className="tnum text-[13px] text-ink-muted">
                {p.track} — {fmt(t.onboarding.trackRow, { items: p.items, days: p.days })}
              </p>
            ))}
            <p className="text-[13px] leading-relaxed text-ink-faint">
              {fmt(t.onboarding.bufferNote, { buffer: REVIEW_BUFFER_DAYS })}
            </p>
            <p className="tnum text-[13px] text-ink-muted">
              {fmt(t.onboarding.minutesNote, { n: quota.estimatedMinutes })}
            </p>
          </div>

          {quota.unrealistic ? (
            <div className="mt-6 rounded-[3px] border border-oker/40 bg-oker-tint px-4 py-4">
              <h2 className="text-[14px] font-semibold text-oker">
                {t.onboarding.unrealisticTitle}
              </h2>
              <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">
                {fmt(t.onboarding.unrealisticBody, { n: quota.newPerDay })}
              </p>
            </div>
          ) : null}

          <button
            type="button"
            onClick={start}
            disabled={saving}
            className="mt-8 flex min-h-[52px] w-full items-center justify-center rounded-[3px] bg-shu px-4 text-[15px] font-medium text-paper-raised disabled:bg-rule disabled:text-ink-muted"
          >
            {saving ? t.onboarding.starting : t.onboarding.start}
          </button>
          <button
            type="button"
            onClick={() => setStep(1)}
            className="mt-3 flex min-h-tap w-full items-center justify-center text-[14px] text-ink-muted"
          >
            {t.onboarding.pickAnother}
          </button>
        </>
      ) : null}
    </main>
  )
}

export default function OnboardingPage() {
  return (
    <RequireAuth>
      {/* useSearchParams needs a Suspense boundary or the static export bails out
          to client rendering and the build fails. */}
      <Suspense fallback={null}>
        <OnboardingScreen />
      </Suspense>
    </RequireAuth>
  )
}
