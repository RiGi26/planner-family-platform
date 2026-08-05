'use client'

import { useState } from 'react'
import Link from 'next/link'
import { AuthLink, AuthShell, Field, FormMessage, SubmitButton } from '@/components/auth-form'
import { authErrorMessage } from '@/lib/auth-errors'
import { useT } from '@/lib/i18n'
import { functionsUrl } from '@/lib/supabase-client'

/**
 * Signup, by invitation only.
 *
 * No password field, on purpose. This page asks the Edge Function to send an
 * invitation; the password is set from the emailed link. That keeps the password
 * out of our function entirely and makes email verification part of the flow rather
 * than a step someone can skip.
 *
 * The invite code is never checked here. Anything checked in the browser can be
 * walked past with devtools — the code goes straight to the function, which is the
 * only thing holding the service role key.
 */

// Built from the validated origin in supabase-client rather than from the raw env
// var, so a malformed value cannot quietly turn this into a same-origin request.
const FUNCTIONS_URL = functionsUrl('redeem-invite')

export default function SignUpPage() {
  const t = useT()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [sentTo, setSentTo] = useState('')

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (pending) return

    const form = new FormData(e.currentTarget)
    const displayName = String(form.get('displayName') ?? '').trim()
    const email = String(form.get('email') ?? '').trim()
    const code = String(form.get('code') ?? '').trim()

    setPending(true)
    setError('')

    try {
      const res = await fetch(FUNCTIONS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // The function does not verify JWTs — the invite code is the credential —
          // but the gateway still expects the project's publishable key.
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        },
        body: JSON.stringify({ displayName, email, code }),
      })

      const data = (await res.json().catch(() => ({}))) as { error?: string }

      if (!res.ok) {
        setError(data.error || authErrorMessage(null))
        setPending(false)
        return
      }

      setSentTo(email)
    } catch (e) {
      setError(authErrorMessage(e))
      setPending(false)
    }
  }

  if (sentTo) {
    return (
      <AuthShell
        title={t.daftar.sentTitle}
        subtitle={
          <>
            {t.daftar.sentBefore}
            <strong className="text-ink">{sentTo}</strong>
            {t.daftar.sentAfter}
          </>
        }
        footer={<p>{t.daftar.sentFooter}</p>}
      >
        <Link
          href="/masuk/"
          className="flex min-h-[52px] w-full items-center justify-center rounded-[3px] border border-rule px-4 text-[15px] text-ink"
        >
          {t.daftar.backToSignIn}
        </Link>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title={t.daftar.title}
      subtitle={t.daftar.subtitle}
      footer={
        <p>
          {t.daftar.haveAccount} <AuthLink href="/masuk/">{t.daftar.signIn}</AuthLink>
        </p>
      }
    >
      <form onSubmit={onSubmit} noValidate>
        <FormMessage kind="error">{error}</FormMessage>

        <Field
          label={t.daftar.nameLabel}
          name="displayName"
          required
          maxLength={60}
          autoComplete="name"
          placeholder={t.daftar.namePlaceholder}
          hint={t.daftar.nameHint}
        />

        <Field
          label={t.daftar.emailLabel}
          name="email"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect="off"
          placeholder={t.daftar.emailPlaceholder}
        />

        <Field
          label={t.daftar.codeLabel}
          name="code"
          required
          autoComplete="off"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          className="font-mono tracking-[0.12em] uppercase"
          placeholder={t.daftar.codePlaceholder}
        />

        <SubmitButton pending={pending} pendingLabel={t.daftar.submitPending}>
          {t.daftar.submit}
        </SubmitButton>
      </form>
    </AuthShell>
  )
}
