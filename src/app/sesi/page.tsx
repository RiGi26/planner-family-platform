'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { RequireAuth, useSession } from '@/components/auth-provider'
import { RequireGoal } from '@/components/require-goal'
import { RatingButtons } from '@/components/rating-buttons'
import { AnswerCells } from '@/components/sheet'
import { clsx } from '@/lib/clsx'
import { KANA, groupByItem } from '@/lib/curriculum'
import { dueCards, localProgress } from '@/lib/db'
import { localDate } from '@/lib/day'
import { parseExamDate } from '@/lib/exam-dates'
import { computeQuota } from '@/lib/goal-engine'
import { fmt, useT } from '@/lib/i18n'
import { itemMapFor, loadTrack, type Item } from '@/lib/items'
import { introduceAcross, pathState, splitQuota, type Track } from '@/lib/path'
import { overdueBefore } from '@/lib/progress'
import { useGoal, useProfile } from '@/lib/queries'
import {
  buildQueue,
  cardFaces,
  currentCard,
  hintBudget,
  initSession,
  reduceSession,
  tally,
  type SessionCard,
  type SessionState,
} from '@/lib/session'
import { bumpProgress, ensureCards, localCards, pushPending, saveReview } from '@/lib/study'
import { jaVoice, speak } from '@/lib/tts'
import type { UserRating } from '@/lib/fsrs'

/**
 * The daily review session.
 *
 * Two rules shape everything on this screen. It never touches the network — the
 * queue is read from IndexedDB and every answer is written back there before the
 * next card appears, so a train tunnel costs nothing and quitting halfway loses
 * nothing. And it has to be fast: twenty cards in under four minutes is a
 * success criterion, which is about twelve seconds a card including the tap.
 *
 * That budget is why there are no transitions between cards. A 200ms fade twice
 * a card across twenty cards is eight seconds spent on nothing. The one piece of
 * motion left is the answer fading in over 120ms, which marks the state change so
 * a stale prompt cannot be misread as an answer.
 *
 * The bottom nav is deliberately absent: the whole screen is a tap target, and a
 * nav bar would sit exactly where the thumb lands.
 */

type Loaded = { queue: SessionCard[]; canvas: SessionCard[]; quotaTotal: number }

function SessionScreen() {
  const t = useT()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { user } = useSession()
  const { data: profile } = useProfile(user?.id)
  const { data: goal } = useGoal(user?.id)

  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [state, setState] = useState<SessionState | null>(null)
  const [revealedAt, setRevealedAt] = useState<number | null>(null)
  const started = useRef(false)

  // undefined = still resolving; null = this device has no Japanese voice.
  // The queue build waits for the answer, because whether listening cards may
  // be created — and whether due ones may be asked — depends on it.
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null | undefined>(undefined)
  useEffect(() => {
    void jaVoice().then(setVoice)
  }, [])

  const timezone = profile?.timezone ?? 'Asia/Jakarta'

  /**
   * Builds the queue once per visit.
   *
   * New cards are created up front rather than one at a time, which does mean a
   * session abandoned on card one leaves cards introduced but unseen. They come
   * back due tomorrow and the quota rebalances around them — the alternative,
   * introducing lazily, would make the queue length change under the counter.
   */
  useEffect(() => {
    if (!user || !goal || voice === undefined || started.current) return
    started.current = true

    void (async () => {
      const today = localDate(new Date(), timezone)
      const cards = await localCards(user.id)
      const states = groupByItem(cards)

      // The ladder: kana always, the N5 tracks once the gate is open. The gate
      // is checked BEFORE loading N5 so a person still in the kana phase never
      // downloads a byte of it.
      const gateCheck = pathState(cards, null)
      const n5 = gateCheck.gate.open
        ? {
            vocab: await loadTrack('N5', 'vocab'),
            kanji: await loadTrack('N5', 'kanji'),
            grammar: await loadTrack('N5', 'grammar'),
          }
        : null
      const path = n5 ? pathState(cards, n5) : gateCheck

      const quota = computeQuota({
        remainingNew: path.remainingNew,
        dueToday: cards.filter((c) => new Date(c.due) <= new Date()).length,
        dueWriting: cards.filter((c) => c.mode === 'writing' && new Date(c.due) <= new Date())
          .length,
        targetExamDate: parseExamDate(goal.target_exam_date),
        today: new Date(),
        ...(goal.baseline_new_per_day ? { baselineNewPerDay: goal.baseline_new_per_day } : {}),
      })

      // How many of today's allowance has already been handed out.
      //
      // `started` is a ref, so it only guards one mount: a reload, a second tab,
      // or coming back to the session later started the whole allowance again,
      // and someone who opened the session three times in a day was handed three
      // days of new material. The count has to outlive the component, so it
      // lives in the same daily row everything else about today lives in.
      const introducedToday = (await localProgress(user.id)).find((r) => r.date === today)
        ?.new_done_items ?? 0
      const allowance = Math.max(0, quota.newPerDay - introducedToday)

      // Divide the allowance across open tracks and introduce per track — kana
      // to completion first, then the N5 tracks in proportion, none starving.
      const tracks: Track[] = [{ key: 'kana', items: KANA as Item[] }]
      if (n5) {
        tracks.push(
          { key: 'vocab', items: n5.vocab },
          { key: 'kanji', items: n5.kanji },
          { key: 'grammar', items: n5.grammar },
        )
      }
      const allotments = splitQuota(allowance, path.openTracks)
      const perTrack = introduceAcross(tracks, states, allotments)
      const fresh = perTrack.flatMap((t) => t.fresh)

      const prefs = {
        kanaWriting: profile?.writing_kana_enabled ?? true,
        kanjiWriting: profile?.writing_kanji_enabled ?? false,
        listening: Boolean(voice),
      }
      const introduced: Awaited<ReturnType<typeof ensureCards>> = []
      for (const item of fresh) {
        const made = await ensureCards(user.id, item, prefs)
        // ensureCards is idempotent and returns every mode, including ones that
        // already existed; only the genuinely new rows belong in this batch.
        introduced.push(...made.filter((c) => c.reps === 0 && !states.has(c.item_id)))
      }
      if (fresh.length > 0) {
        await bumpProgress(user.id, { newItems: fresh.length }, { timezone })
      }

      // A due listening card on a device with no Japanese voice would be a
      // silent prompt; it is held back, not skipped-and-forgotten — it stays
      // due for the next device that can speak it.
      const due = (await dueCards(user.id)).filter(
        (c) => c.mode !== 'listening' || Boolean(voice),
      )
      const items = await itemMapFor([...due, ...introduced].map((c) => c.item_id))
      const built = buildQueue({ due, introduced, items })

      // The quota is a promise made once a day. Recording it here is what lets
      // Hari Ini show delivery against it rather than a moving target.
      //
      // Measured in CARDS, deliberately, because `new_done` and `review_done`
      // are. `quota.newPerDay` counts *items* — PRD §6.1 divides `sisa_item` —
      // and one item becomes two cards in the fast lane, so storing it here
      // would have Hari Ini reporting six answers against a target of three.
      const rows = await localProgress(user.id)
      if (!rows.some((r) => r.date === today)) {
        await bumpProgress(user.id, { quotaTarget: built.queue.length }, { timezone })
      }

      setLoaded({ queue: built.queue, canvas: built.canvas, quotaTotal: built.queue.length })
      setState(initSession(built.queue, Date.now()))
    })()
  }, [user, goal, profile, timezone, voice])

  const card = state ? currentCard(state) : null

  // A listening card speaks itself the moment it appears — the tap budget is
  // twelve seconds a card, and demanding a tap just to hear the prompt spends
  // it. Replay stays one tap away.
  const cardId = card?.card.id
  const cardMode = card?.card.mode
  useEffect(() => {
    if (cardMode !== 'listening' || !card || !voice) return
    speak(cardFaces(card.item, 'listening').prompt, voice)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardId, cardMode, voice])

  const answer = useCallback(
    (rating: UserRating) => {
      if (!state || !user || !card) return
      const at = Date.now()
      const { state: next, effect } = reduceSession(state, { kind: 'rate', rating, at })
      setState(next)
      setRevealedAt(null)

      if (!effect) return
      void (async () => {
        // Local first, always: the answer is durable before the next card paints.
        const ok = await saveReview(user.id, effect.itemId, effect.mode, effect.rating, {
          durationMs: effect.durationMs,
          hintsUsed: effect.hintsUsed,
        })
        // saveReview returns false when the card does not exist. Swallowing that
        // would drop an answer with no trace, which is the one thing the offline
        // layer exists to prevent.
        if (!ok) console.error('[sesi] jawaban tidak tersimpan', effect.itemId, effect.mode)

        await bumpProgress(
          user.id,
          effect.wasNew ? { new: 1, ms: effect.durationMs } : { review: 1, ms: effect.durationMs },
          { timezone },
        )
      })()
    },
    [state, user, card, timezone],
  )

  // Sync and refresh the screens that read this data — after the session, never
  // during it.
  useEffect(() => {
    if (state?.phase !== 'done' || !user) return
    void (async () => {
      await pushPending()
      await queryClient.invalidateQueries({ queryKey: ['card_states', user.id] })
    })()
  }, [state?.phase, user, queryClient])

  if (!state || !loaded) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <span className="sr-only">{t.sesi.loading}</span>
        <span aria-hidden className="animate-pulse text-[28px] text-ink-faint">
          升
        </span>
      </div>
    )
  }

  if (state.phase === 'done') {
    return <Summary state={state} canvas={loaded.canvas} />
  }

  if (!card) return null

  const isRecognition = card.card.mode === 'recognition'
  const faces = cardFaces(card.item, card.card.mode)
  const budget = faces.hintTarget ? hintBudget(faces.hintTarget) : 0
  const revealedChars = [...faces.hintTarget]

  // A five-character word at the kana size overflows a 390px screen; the size
  // steps down with length instead of wrapping a prompt mid-word.
  const promptLen = [...faces.prompt].length
  const promptClass =
    faces.promptKind === 'text'
      ? 'max-w-[320px] text-center text-[28px] leading-snug text-ink sm:text-[36px]'
      : promptLen <= 2
        ? 'text-[88px] leading-none text-ink sm:text-[120px]'
        : promptLen <= 6
          ? 'text-[52px] leading-none text-ink sm:text-[72px]'
          : 'max-w-[340px] text-center text-[36px] leading-tight text-ink sm:text-[48px]'

  const answerLen = [...faces.answerMain].length
  const answerClass =
    answerLen <= 4
      ? 'text-[56px] leading-none text-shu sm:text-[80px]'
      : answerLen <= 12
        ? 'text-[36px] leading-tight text-shu sm:text-[48px]'
        : 'max-w-[340px] text-center text-[22px] leading-snug text-shu sm:text-[26px]'

  const promptLabel =
    faces.promptKind === 'audio'
      ? t.sesi.promptListening
      : isRecognition
        ? card.item.type === 'grammar'
          ? t.sesi.promptMeaning
          : card.item.type === 'kanji'
            ? t.sesi.promptKanjiRecognition
            : t.sesi.promptRecognition
        : faces.promptKind === 'text'
          ? t.sesi.promptProduce
          : t.sesi.promptRecall

  const badgeLabel =
    faces.badge === 'hiragana'
      ? t.sesi.scriptHiragana
      : faces.badge === 'katakana'
        ? t.sesi.scriptKatakana
        : faces.badge === 'vocab'
          ? t.sesi.badgeVocab
          : faces.badge === 'kanji'
            ? t.sesi.badgeKanji
            : faces.badge === 'grammar'
              ? t.sesi.badgeGrammar
              : null

  return (
    <main
      // The session is one big tap target; a stray pixel of scroll while tapping
      // is the most common way a rating gets recorded by accident.
      className="flex h-dvh flex-col overflow-hidden overscroll-contain px-5"
      style={{
        paddingTop: 'calc(var(--spacing-safe-top) + 12px)',
        paddingBottom: 'calc(var(--spacing-safe-bottom) + 16px)',
      }}
    >
      <header className="flex items-center justify-between">
        <span className="tnum text-[12px] text-ink-faint">
          {fmt(t.sesi.progress, { done: state.index + 1, total: state.queue.length })}
        </span>
        <Link href="/" className="-my-3 inline-flex min-h-tap items-center text-[13px] text-ai">
          {t.sesi.quit}
        </Link>
      </header>

      {/* The prompt node is never remounted with a key — only its text changes.
          Remounting forces a full layout on every card.

          `min-h-0` is what lets this shrink inside the flex column instead of
          pushing the rating buttons off the bottom, and the internal scroll is
          the escape hatch on a short phone: the page stays fixed, this box
          scrolls. Without both, a 96px glyph plus an answer plus 64px buttons
          clips on anything smaller than the test device. */}
      <section className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 overflow-y-auto py-4">
        <p className="text-[12px] tracking-[0.14em] text-ink-muted uppercase">{promptLabel}</p>

        <div className="flex flex-col items-center gap-3">
          {faces.promptKind === 'audio' ? (
            /* Nothing Japanese on screen before reveal — the ear is the thing
               being tested. The button replays; the card already spoke once. */
            <button
              type="button"
              onClick={() => voice && speak(faces.prompt, voice)}
              className="flex min-h-tap touch-manipulation items-center gap-2 rounded-[3px] border border-rule px-6 py-4 text-[15px] text-ink"
            >
              <svg
                aria-hidden
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
              </svg>
              {t.sesi.listenReplay}
            </button>
          ) : (
            <p className={clsx(faces.promptKind === 'glyph' && 'tnum', promptClass)}>
              {faces.prompt}
            </p>
          )}
          {/* Kana recall is unanswerable without the script — "a" could be あ or
              ア — and a bare English word could be asking for vocabulary or a
              kanji, so every non-kana card names its own type. */}
          {badgeLabel ? (
            <span className="rounded-[2px] bg-paper-sunken px-2 py-[3px] text-[11px] tracking-[0.08em] text-ink-muted uppercase">
              {badgeLabel}
            </span>
          ) : null}
        </div>

        {state.revealed ? (
          <div className="animate-reveal flex flex-col items-center gap-2">
            <p className={answerClass}>{faces.answerMain}</p>
            {faces.answerSub.map((line) => (
              <p
                key={line}
                className="max-w-[340px] text-center text-[15px] leading-relaxed text-ink-muted"
              >
                {line}
              </p>
            ))}
          </div>
        ) : faces.hintTarget ? (
          <AnswerCells
            length={revealedChars.length}
            revealed={revealedChars.map((c, idx) => (idx < state.hintsUsed ? c : ''))}
          />
        ) : null}
      </section>

      <footer className="flex flex-col gap-2">
        {state.revealed && revealedAt !== null ? (
          <RatingButtons card={card.card} now={revealedAt} onRate={answer} />
        ) : (
          <>
            {budget > 0 && state.hintsUsed < budget && Boolean(faces.hintTarget) ? (
              <button
                type="button"
                onClick={() => setState(reduceSession(state, { kind: 'hint' }).state)}
                className="min-h-tap touch-manipulation rounded-[3px] border border-rule text-[14px] text-ink-muted"
              >
                {t.sesi.hint}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                const at = Date.now()
                setRevealedAt(at)
                setState(reduceSession(state, { kind: 'reveal', at }).state)
              }}
              className={clsx(
                'flex min-h-[64px] touch-manipulation items-center justify-center rounded-[3px]',
                'bg-shu px-4 text-[15px] font-medium text-paper-raised',
              )}
            >
              {t.sesi.reveal}
            </button>
          </>
        )}
      </footer>
    </main>
  )
}

function Summary({ state, canvas }: { state: SessionState; canvas: SessionCard[] }) {
  const t = useT()
  const counts = tally(state.answered)

  if (counts.total === 0) {
    return (
      <main
        className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-4 px-5"
        style={{ paddingTop: 'var(--spacing-safe-top)' }}
      >
        <h1 className="text-[24px] leading-tight font-bold text-ink sm:text-[30px]">{t.sesi.emptyTitle}</h1>
        <p className="text-[14px] leading-relaxed text-ink-muted">{t.sesi.emptyBody}</p>
        <Link
          href="/"
          className="flex min-h-[52px] items-center justify-center rounded-[3px] bg-shu px-4 text-[15px] font-medium text-paper-raised"
        >
          {t.sesi.emptyCta}
        </Link>
      </main>
    )
  }

  return (
    <main
      className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-3 px-5"
      style={{ paddingTop: 'var(--spacing-safe-top)' }}
    >
      <span aria-hidden className="font-mincho text-[40px] leading-none text-shu">
        済
      </span>
      <h1 className="mt-2 text-[24px] leading-tight font-bold text-ink sm:text-[30px]">{t.sesi.doneTitle}</h1>

      <p className="tnum text-[40px] leading-none text-ink sm:text-[52px]">
        {fmt(t.sesi.doneCount, { n: counts.total })}
      </p>
      <p className="tnum text-[13px] text-ink-muted">
        {fmt(t.sesi.doneBreakdown, { baru: counts.baru, ulangan: counts.ulangan })}
        {' · '}
        {fmt(t.sesi.doneMinutes, { n: Math.max(1, Math.round(counts.ms / 60_000)) })}
      </p>
      {counts.lupa > 0 ? (
        <p className="tnum text-[13px] text-oker">{fmt(t.sesi.doneForgot, { n: counts.lupa })}</p>
      ) : null}

      {/* The handover. Writing cards are scheduled by FSRS like everything else,
          so if the daily flow never mentions them they pile up unseen. */}
      {canvas.length > 0 ? (
        <div className="mt-6 rounded-[3px] border border-rule bg-paper-raised px-4 py-4">
          <p className="text-[14px] text-ink">{fmt(t.sesi.writingLeft, { n: canvas.length })}</p>
          <Link
            href={`/menulis/?item=${encodeURIComponent(canvas[0]!.item.id)}`}
            className="mt-3 flex min-h-tap items-center justify-center rounded-[3px] border border-shu text-[15px] font-medium text-shu"
          >
            {t.sesi.writingCta}
          </Link>
        </div>
      ) : null}

      <Link
        href="/"
        className="mt-6 flex min-h-[52px] items-center justify-center rounded-[3px] bg-shu px-4 text-[15px] font-medium text-paper-raised"
      >
        {t.sesi.backHome}
      </Link>
    </main>
  )
}

export default function SessionPage() {
  return (
    <RequireAuth>
      <RequireGoal>
        <SessionScreen />
      </RequireGoal>
    </RequireAuth>
  )
}
