import { RequireAuth } from '@/components/auth-provider'
import { BottomNav } from '@/components/bottom-nav'
import { Sheet, Ticks } from '@/components/sheet'

/**
 * Hari Ini — the on-track state.
 *
 * One glance has to answer four things: how much is done, how long until the exam,
 * whether the pace is holding, and what to press. Everything else is secondary.
 *
 * The quota is a 原稿用紙 sheet rather than a progress bar on purpose: 38 empty cells
 * read as work left to do, where "39%" reads as nothing at all.
 *
 * Numbers here are still hardcoded — the data layer lands once migration 0001 is
 * applied. The layout, tokens and safe-area handling are real.
 */

const DEMO = {
  weekday: 'RAB · 5 AGU',
  level: 'JLPT N5',
  examDate: '6 Des 2026',
  daysLeft: 118,
  quotaDone: 24,
  quotaTotal: 62,
  minutes: 12,
  tracks: [
    { label: 'Kana', glyph: 'あ', count: 12 },
    { label: 'Kosakata', glyph: '語', count: 26 },
    { label: 'Kanji', glyph: '字', count: 14 },
    { label: 'Tata bahasa', glyph: '文', count: 10 },
  ],
  week: [true, true, true, false, true, true, true],
  writingQueued: 8,
}

export default function TodayPage() {
  const left = DEMO.quotaTotal - DEMO.quotaDone

  return (
    <RequireAuth>
      <main
        className="mx-auto max-w-lg px-5 pb-40"
        style={{ paddingTop: 'calc(var(--spacing-safe-top) + 12px)' }}
      >
        <header className="flex items-baseline justify-between">
          <h1 className="text-[13px] tracking-[0.14em] text-ink-muted uppercase">Hari Ini</h1>
          <span className="tnum text-[12px] text-ink-faint">{DEMO.weekday}</span>
        </header>

        <div className="mt-1 flex items-baseline justify-between border-b border-rule pb-4">
          <span className="text-[13px] text-ink-muted">
            {DEMO.level} · {DEMO.examDate}
          </span>
          <span className="tnum text-[13px] text-ink">{DEMO.daysLeft} hari</span>
        </div>

        <section className="mt-7">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[12px] tracking-[0.14em] text-ink-muted uppercase">Kuota hari ini</h2>
            <span className="rounded-[2px] bg-pinus-tint px-2 py-[3px] text-[11px] tracking-[0.08em] text-pinus uppercase">
              On track
            </span>
          </div>

          <p className="tnum mt-2 text-[40px] leading-none text-ink">
            {DEMO.quotaDone}
            <span className="text-ink-faint"> / {DEMO.quotaTotal}</span>
          </p>
          <p className="mt-1 text-[13px] text-ink-muted">
            {left} kartu sisa · ±{DEMO.minutes} menit
          </p>

          <Sheet
            total={DEMO.quotaTotal}
            done={DEMO.quotaDone}
            columns={16}
            size={16}
            className="mt-4"
            label={`${DEMO.quotaDone} dari ${DEMO.quotaTotal} kartu selesai`}
          />
        </section>

        <section className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-[3px] bg-rule sm:grid-cols-4">
          {DEMO.tracks.map((t) => (
            <div key={t.label} className="flex items-center gap-3 bg-paper-raised px-3 py-3">
              <span aria-hidden className="text-[22px] leading-none text-ink-faint">
                {t.glyph}
              </span>
              <span>
                <span className="tnum block text-[18px] leading-none text-ink">{t.count}</span>
                <span className="block text-[11px] text-ink-muted">{t.label}</span>
              </span>
            </div>
          ))}
        </section>

        <section className="mt-8">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[12px] tracking-[0.14em] text-ink-muted uppercase">7 hari terakhir</h2>
            {/* A gap in the week is shown and not commented on. */}
            <span className="tnum text-[12px] text-ink-muted">
              {DEMO.week.filter(Boolean).length} dari 7
            </span>
          </div>
          <Ticks done={DEMO.week} className="mt-3" />
        </section>
      </main>

      {/* The single primary action, in the thumb zone, sitting above the nav. */}
      <div
        className="fixed inset-x-0 z-30 mx-auto max-w-lg px-5"
        style={{ bottom: 'calc(var(--spacing-safe-bottom) + 68px)' }}
      >
        <a
          href="/sesi/"
          className="flex min-h-[60px] items-center justify-center gap-3 rounded-[3px] bg-shu px-5 text-paper-raised shadow-[0_8px_24px_-12px_rgba(0,0,0,0.55)]"
        >
          <span aria-hidden className="font-[family-name:var(--font-zen-mincho)] text-[22px] leading-none">
            始
          </span>
          <span className="text-left">
            <span className="block text-[15px] leading-tight font-medium">Mulai sesi</span>
            <span className="tnum block text-[11px] opacity-80">
              {left} kartu · recognition &amp; recall
            </span>
          </span>
        </a>
        <p className="mt-2 text-center text-[12px] text-ink-muted">
          Latihan menulis ({DEMO.writingQueued})
        </p>
      </div>

      <BottomNav />
    </RequireAuth>
  )
}
