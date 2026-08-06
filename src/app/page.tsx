'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import Link from 'next/link'
import { RequireAuth, useSession } from '@/components/auth-provider'
import { BottomNav } from '@/components/bottom-nav'
import { RequireGoal } from '@/components/require-goal'
import { Sheet, Ticks } from '@/components/sheet'
import { clsx } from '@/lib/clsx'
import { groupByItem, sheetProgress } from '@/lib/curriculum'
import { localDate } from '@/lib/day'
import { db, localProgress } from '@/lib/db'
import { parseExamDate } from '@/lib/exam-dates'
import { computeQuota } from '@/lib/goal-engine'
import { fmt, useT } from '@/lib/i18n'
import { dayState, overdueBefore, shouldStamp, weekTicks } from '@/lib/progress'
import { useGoal, useProfile } from '@/lib/queries'
import { localCards } from '@/lib/study'

/**
 * Hari Ini.
 *
 * One glance has to answer four things: how much is done, how long until the
 * exam, whether the pace is holding, and what to press.
 *
 * Three faces, and the colour rule decides them. `shu` marks the one primary
 * action, so it belongs to the button and nothing else. Being behind is drawn in
 * `oker` — never shu — because falling behind is a fact, not an error, and the
 * screen someone opens after missing two days should not look like a warning
 * dialog. Finishing is drawn as the hanko: the one stamp in the app, once a day.
 *
 * Everything is read from IndexedDB rather than the network, so this screen is
 * correct on a train and updates the moment a session writes to it.
 */

function TodayScreen() {
  const t = useT()
  const { user } = useSession()
  const { data: profile } = useProfile(user?.id)
  const { data: goal } = useGoal(user?.id)

  const timezone = profile?.timezone ?? 'Asia/Jakarta'
  const now = new Date()
  const today = localDate(now, timezone)

  // useLiveQuery rather than a one-shot read: finishing a session writes to
  // these tables, and this screen is where the user lands straight afterwards.
  const cards = useLiveQuery(() => (user ? localCards(user.id) : Promise.resolve([])), [user?.id])
  const progressRows = useLiveQuery(
    () => (user ? localProgress(user.id) : Promise.resolve([])),
    [user?.id],
  )
  const stampedOn = useLiveQuery(() => db.meta.get('hanko_on').then((m) => m?.value), [])

  if (!cards || !progressRows || !goal) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <span className="sr-only">{t.common.loading}</span>
        <span aria-hidden className="animate-pulse text-[28px] text-ink-faint">
          升
        </span>
      </div>
    )
  }

  const states = groupByItem(cards)
  const due = cards.filter((c) => new Date(c.due) <= now)
  const overdue = overdueBefore(cards, today, timezone)

  const quota = computeQuota({
    remainingNew: 208 - states.size,
    dueToday: due.length,
    dueWriting: due.filter((c) => c.mode === 'writing').length,
    targetExamDate: parseExamDate(goal.target_exam_date),
    today: now,
    ...(goal.baseline_new_per_day ? { baselineNewPerDay: goal.baseline_new_per_day } : {}),
  })

  const todayRow = progressRows.find((r) => r.date === today)
  const done = (todayRow?.new_done ?? 0) + (todayRow?.review_done ?? 0)
  // The target was promised once this morning; before a session has run there is
  // nothing promised yet, so fall back to what is actually waiting.
  const target = todayRow?.quota_target ?? due.filter((c) => c.mode !== 'writing').length
  const remaining = Math.max(0, target - done)

  const state = dayState({ dueRemaining: remaining, overdue, quota, doneToday: done })
  const writingDue = due.filter((c) => c.mode === 'writing').length

  const kana = (['basic', 'dakuten', 'youon'] as const).reduce(
    (acc, group) => {
      const p = sheetProgress('hiragana', group, states, now)
      const k = sheetProgress('katakana', group, states, now)
      return { strong: acc.strong + p.strong + k.strong, total: acc.total + p.total + k.total }
    },
    { strong: 0, total: 0 },
  )

  // Fires once, on the day the quota is first cleared. A hard refresh afterwards
  // shows the stamp without replaying it — the animation marks the moment, and
  // the moment has passed.
  const fresh = state === 'selesai' && shouldStamp(stampedOn, today)
  if (fresh) void db.meta.put({ key: 'hanko_on', value: today })

  const badge =
    state === 'tertinggal'
      ? { label: t.hariIni.behind, className: 'bg-oker-tint text-oker' }
      : { label: t.hariIni.onTrack, className: 'bg-pinus-tint text-pinus' }

  return (
    <>
      <main
        className="mx-auto max-w-lg px-5 pb-40"
        style={{ paddingTop: 'calc(var(--spacing-safe-top) + 12px)' }}
      >
        <header className="flex items-baseline justify-between">
          <h1 className="text-[13px] tracking-[0.14em] text-ink-muted uppercase">
            {t.hariIni.title}
          </h1>
          <span className="tnum text-[12px] text-ink-faint">
            {new Intl.DateTimeFormat('id-ID', { weekday: 'short', day: 'numeric', month: 'short' })
              .format(now)
              .toUpperCase()}
          </span>
        </header>

        <div className="mt-1 flex items-baseline justify-between border-b border-rule pb-4">
          <span className="text-[13px] text-ink-muted">
            JLPT {goal.target_level} ·{' '}
            {new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
              .format(parseExamDate(goal.target_exam_date))}
          </span>
          <span className="tnum text-[13px] text-ink">
            {fmt(t.hariIni.daysLeft, { n: Math.max(0, quota.daysLeft) })}
          </span>
        </div>

        <section className="mt-7">
          {state === 'selesai' ? (
            <div className="flex flex-col items-center py-4">
              {/* The one stamp in the app. */}
              <span
                aria-hidden
                className={clsx('font-mincho text-[64px] leading-none text-shu', fresh && 'animate-hanko')}
              >
                済
              </span>
              <h2 className="mt-4 text-[18px] font-bold text-ink">{t.hariIni.doneHeading}</h2>
              <p className="mt-1 text-center text-[13px] leading-relaxed text-ink-muted">
                {t.hariIni.doneDetail}
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-baseline justify-between">
                <h2 className="text-[12px] tracking-[0.14em] text-ink-muted uppercase">
                  {t.hariIni.quotaHeading}
                </h2>
                <span
                  className={clsx(
                    'rounded-[2px] px-2 py-[3px] text-[11px] tracking-[0.08em] uppercase',
                    badge.className,
                  )}
                >
                  {badge.label}
                </span>
              </div>

              <p className="tnum mt-2 text-[40px] leading-none text-ink sm:text-[52px]">
                {done}
                <span className="text-ink-faint"> / {target}</span>
              </p>
              <p className="mt-1 text-[13px] text-ink-muted">
                {target === 0
                  ? t.hariIni.noQuotaYet
                  : fmt(t.hariIni.remaining, { n: remaining, m: quota.estimatedMinutes })}
              </p>
              {state === 'tertinggal' ? (
                <p className="tnum mt-1 text-[13px] text-oker">
                  {fmt(t.hariIni.behindDetail, { n: overdue })}
                </p>
              ) : null}

              {target > 0 ? (
                <Sheet
                  total={target}
                  done={done}
                  columns={16}
                  size={16}
                  className="mt-4"
                  label={fmt(t.hariIni.quotaSheetLabel, { done, total: target })}
                />
              ) : null}
            </>
          )}
        </section>

        {/* One track, because one track is what exists. Listing vocabulary, kanji
            and grammar at zero would promise material that has not been built. */}
        <section className="mt-8 flex items-center justify-between rounded-[3px] bg-paper-raised px-4 py-3">
          <span className="flex items-center gap-3">
            <span aria-hidden className="text-[22px] leading-none text-ink-faint">
              あ
            </span>
            <span className="text-[13px] text-ink-muted">{t.hariIni.kanaStrength}</span>
          </span>
          <span className="tnum text-[15px] text-ink">
            {fmt(t.hariIni.kanaStrengthValue, { strong: kana.strong, total: kana.total })}
          </span>
        </section>

        <section className="mt-8">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[12px] tracking-[0.14em] text-ink-muted uppercase">
              {t.hariIni.weekHeading}
            </h2>
            {/* A gap in the week is shown and not commented on. */}
            <span className="tnum text-[12px] text-ink-muted">
              {fmt(t.hariIni.weekCount, {
                n: weekTicks(progressRows, today).filter(Boolean).length,
              })}
            </span>
          </div>
          <Ticks done={weekTicks(progressRows, today)} className="mt-3" />
        </section>
      </main>

      {/* The single primary action, in the thumb zone, above the nav. It is gone
          when the day is done — a screen that keeps asking after you finished is
          a screen that does not believe you. */}
      {state !== 'selesai' ? (
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
                {remaining > 0 ? t.hariIni.startSession : t.hariIni.startFirst}
              </span>
              <span className="tnum block text-[11px] opacity-80">
                {fmt(t.hariIni.startSessionDetail, { n: remaining })}
              </span>
            </span>
          </Link>
          {writingDue > 0 ? (
            <p className="mt-2 text-center text-[12px] text-ink-muted">
              {fmt(t.hariIni.writingQueued, { n: writingDue })}
            </p>
          ) : null}
        </div>
      ) : null}

      <BottomNav />
    </>
  )
}

export default function TodayPage() {
  return (
    <RequireAuth>
      {/* A quota with no exam date is a number with no source, so this screen
          waits for onboarding rather than inventing one. */}
      <RequireGoal>
        <TodayScreen />
      </RequireGoal>
    </RequireAuth>
  )
}
