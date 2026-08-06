'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useQueryClient } from '@tanstack/react-query'
import { Field, FormMessage } from '@/components/auth-form'
import { beginSignOut, RequireAuth, useSession } from '@/components/auth-provider'
import { BottomNav } from '@/components/bottom-nav'
import { clsx } from '@/lib/clsx'
import { clearAll, pendingCount, syncPending } from '@/lib/db'
import { fmt, useT } from '@/lib/i18n'
import { useProfile } from '@/lib/queries'
import { functionsUrl, signOutLocal, supabase } from '@/lib/supabase-client'

/**
 * Setelan — profile, sign-out, and the way out entirely.
 *
 * Sign-out and account deletion both end with local storage wiped. The IndexedDB
 * database is shared per-origin, not per-user, so leaving it behind would hand the
 * next person to sign in on this device someone else's practice history.
 *
 * Deletion is the store-mandated path (App Store 5.1.1(v), Play data deletion):
 * the Edge Function deletes the auth row and every table cascades from it. The
 * typed confirmation is not decoration — this is the one action in the app that
 * cannot be undone.
 */

const TIMEZONES = [
  'Asia/Jakarta',
  'Asia/Makassar',
  'Asia/Jayapura',
  'Asia/Tokyo',
] as const

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 text-[12px] font-medium tracking-[0.14em] text-ink-muted uppercase">
      {children}
    </h2>
  )
}

/** A labelled switch row that keeps the whole line tappable, not just the box. */
function ToggleRow({
  label,
  checked,
  onChange,
  disabled = false,
  note,
}: {
  label: string
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
  note?: string
}) {
  return (
    <label
      className={clsx(
        'flex min-h-tap items-center justify-between gap-3 py-1',
        disabled ? 'cursor-not-allowed' : 'cursor-pointer',
      )}
    >
      <span className={clsx('text-[14px]', disabled ? 'text-ink-muted' : 'text-ink')}>
        {label}
        {note ? (
          <span className="mt-[2px] block text-[12px] leading-relaxed text-ink-faint">{note}</span>
        ) : null}
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-5 w-5 accent-shu disabled:opacity-40"
      />
    </label>
  )
}

function SettingsScreen() {
  const t = useT()
  const { user, session } = useSession()
  const queryClient = useQueryClient()
  const { data: profile } = useProfile(user?.id)

  const [name, setName] = useState('')
  const [timezone, setTimezone] = useState<string>('Asia/Jakarta')
  const [writingKana, setWritingKana] = useState(true)
  const [writingKanji, setWritingKanji] = useState(false)
  const [dirty, setDirty] = useState(false)

  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [error, setError] = useState('')

  const [signingOut, setSigningOut] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)

  // The form is initialised from the profile once it arrives; after that the user's
  // edits win over refetches.
  useEffect(() => {
    if (!profile || dirty) return
    setName(profile.display_name)
    setTimezone(profile.timezone)
    setWritingKana(profile.writing_kana_enabled)
    setWritingKanji(profile.writing_kanji_enabled)
  }, [profile, dirty])

  function touch<T>(setter: (v: T) => void) {
    return (value: T) => {
      setter(value)
      setDirty(true)
      setSaveMsg('')
    }
  }

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!user || saving) return
    setSaving(true)
    setError('')
    setSaveMsg('')

    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        display_name: name.trim(),
        timezone,
        writing_kana_enabled: writingKana,
        writing_kanji_enabled: writingKanji,
      })
      .eq('id', user.id)

    if (updateError) {
      setError(updateError.message)
    } else {
      setDirty(false)
      setSaveMsg(t.setelan.saved)
      await queryClient.invalidateQueries({ queryKey: ['profile', user.id] })
    }
    setSaving(false)
  }

  async function signOut() {
    if (signingOut) return
    setSigningOut(true)
    setError('')

    try {
      // Best effort: push what we can while we still have a session. What cannot be
      // pushed is about to be wiped, and the user gets to veto that.
      if (navigator.onLine) await syncPending(supabase)

      // Only work the person actually did. `pendingCount().total` also counts
      // card-state and daily-summary rows, which are bookkeeping — warning
      // "42 latihan akan hilang" after a session that answered six cards is
      // both wrong and frightening.
      const pending = await pendingCount()
      const unsavedWork = pending.reviews + pending.kana
      if (unsavedWork > 0) {
        const proceed = window.confirm(fmt(t.setelan.signOutUnsynced, { n: unsavedWork }))
        if (!proceed) {
          setSigningOut(false)
          return
        }
      }

      // Claim the navigation before the session disappears, so the route guards
      // stay out of the way — two navigations to the login screen at once is
      // what painted a route payload over it on iPhone Safari.
      beginSignOut()
      await clearAll()
      await signOutLocal()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setSigningOut(false)
      return
    }

    // Hard navigation on purpose: clearAll() deletes the Dexie database out from
    // under every open hook, and a fresh document is the only clean slate.
    // replace, not assign: Back must not return to a screen whose account is
    // gone, where the guards would only bounce the user forward again.
    window.location.replace('/masuk/')
  }

  async function deleteAccount() {
    if (deleting || confirmText !== t.setelan.dangerConfirmWord) return
    setDeleting(true)
    setError('')

    try {
      const res = await fetch(functionsUrl('delete-account'), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session?.access_token ?? ''}`,
          // The gateway wants the publishable key even when the JWT does the
          // authenticating — without it the request dies as 401 before the function.
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        },
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        setError(data.error || t.errors.auth.fallback)
        setDeleting(false)
        return
      }

      await clearAll()
      await signOutLocal()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setDeleting(false)
      return
    }

    // replace, not assign: Back must not return to a screen whose account is
    // gone, where the guards would only bounce the user forward again.
    window.location.replace('/masuk/')
  }

  return (
    <main
      className="mx-auto max-w-lg px-5 pb-28"
      style={{ paddingTop: 'calc(var(--spacing-safe-top) + 12px)' }}
    >
      <h1 className="text-[24px] leading-tight font-bold text-ink">{t.setelan.title}</h1>

      <FormMessage kind="error">{error}</FormMessage>

      <form onSubmit={save} className="mt-6">
        <SectionHeading>{t.setelan.profil}</SectionHeading>

        <Field
          label={t.setelan.nameLabel}
          name="displayName"
          value={name}
          onChange={(e) => touch(setName)(e.target.value)}
          required
          maxLength={60}
          autoComplete="name"
          hint={t.setelan.nameHint}
        />

        <div className="mb-5">
          <label htmlFor="timezone" className="mb-2 block text-[13px] font-medium text-ink">
            {t.setelan.timezoneLabel}
          </label>
          <select
            id="timezone"
            value={timezone}
            onChange={(e) => touch(setTimezone)(e.target.value)}
            className="w-full rounded-[3px] border border-rule bg-paper-raised px-3 py-3 text-ink focus:border-ai focus:ring-1 focus:ring-ai focus:outline-none"
          >
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
            {/* A profile can hold a timezone outside the short list (set before a
                move, or by support). Losing it silently on save would be worse than
                one odd-looking option. */}
            {profile && !TIMEZONES.includes(profile.timezone as (typeof TIMEZONES)[number]) ? (
              <option value={profile.timezone}>{profile.timezone}</option>
            ) : null}
          </select>
          <p className="mt-2 text-[12px] leading-relaxed text-ink-muted">
            {t.setelan.timezoneHint}
          </p>
        </div>

        <SectionHeading>{t.setelan.writingHeading}</SectionHeading>
        <div className="mb-2">
          <ToggleRow label={t.setelan.writingKana} checked={writingKana} onChange={touch(setWritingKana)} />
          <ToggleRow
            label={t.setelan.writingKanji}
            checked={writingKanji}
            onChange={touch(setWritingKanji)}
          />
        </div>
        <p className="mb-5 text-[12px] leading-relaxed text-ink-muted">{t.setelan.writingHint}</p>

        <button
          type="submit"
          disabled={saving || !dirty}
          className={clsx(
            'flex min-h-[52px] w-full items-center justify-center rounded-[3px] px-4 text-[15px] font-medium',
            saving || !dirty ? 'bg-rule text-ink-muted' : 'bg-shu text-paper-raised',
          )}
        >
          {saving ? t.setelan.savePending : t.setelan.save}
        </button>
        {saveMsg ? (
          <p role="status" className="mt-3 text-center text-[13px] text-pinus">
            {saveMsg}
          </p>
        ) : null}
      </form>

      <div className="mt-10 border-t border-rule pt-6">
        <Link
          href="/tentang/"
          className="flex min-h-tap items-center justify-between text-[14px] text-ink"
        >
          {t.setelan.aboutLink}
          <span aria-hidden className="text-ink-faint">
            →
          </span>
        </Link>
      </div>

      <div className="mt-6 border-t border-rule pt-6">
        <button
          type="button"
          onClick={signOut}
          disabled={signingOut}
          className="flex min-h-[52px] w-full items-center justify-center rounded-[3px] border border-rule px-4 text-[15px] text-ink disabled:opacity-40"
        >
          {signingOut ? t.setelan.signOutPending : t.setelan.signOut}
        </button>
      </div>

      <div className="mt-10 rounded-[3px] border border-oker/40 bg-oker-tint px-4 py-4">
        <h2 className="text-[14px] font-semibold text-oker">{t.setelan.dangerHeading}</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">{t.setelan.dangerBody}</p>

        <label htmlFor="confirm-delete" className="mt-4 mb-2 block text-[13px] font-medium text-ink">
          {t.setelan.dangerConfirmLabel}
        </label>
        <input
          id="confirm-delete"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          className="w-full rounded-[3px] border border-rule bg-paper-raised px-3 py-3 tracking-[0.12em] text-ink uppercase focus:border-oker focus:ring-1 focus:ring-oker focus:outline-none"
        />
        <button
          type="button"
          onClick={deleteAccount}
          disabled={deleting || confirmText !== t.setelan.dangerConfirmWord}
          className={clsx(
            'mt-4 flex min-h-[52px] w-full items-center justify-center rounded-[3px] px-4 text-[15px] font-medium',
            deleting || confirmText !== t.setelan.dangerConfirmWord
              ? 'bg-rule text-ink-muted'
              : 'bg-oker text-paper-raised',
          )}
        >
          {deleting ? t.setelan.dangerPending : t.setelan.dangerSubmit}
        </button>
      </div>

      <BottomNav />
    </main>
  )
}

export default function SettingsPage() {
  return (
    <RequireAuth>
      <SettingsScreen />
    </RequireAuth>
  )
}
