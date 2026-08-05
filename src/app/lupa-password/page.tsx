'use client'

import { useState } from 'react'
import Link from 'next/link'
import { AuthLink, AuthShell, Field, FormMessage, SubmitButton } from '@/components/auth-form'
import { authErrorMessage } from '@/lib/auth-errors'
import { useT } from '@/lib/i18n'
import { supabase } from '@/lib/supabase-client'

/**
 * Password reset request.
 *
 * The confirmation is deliberately the same whether or not the address has an
 * account. Saying "no account with that email" would turn this page into a way to
 * find out who has one.
 */
export default function ForgotPasswordPage() {
  const t = useT()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (pending) return

    const email = String(new FormData(e.currentTarget).get('email') ?? '').trim()

    setPending(true)
    setError('')

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/atur-password/`,
    })

    // Only surface genuine failures, like being rate-limited or offline. An unknown
    // address is not one of them.
    if (resetError && /rate limit|too many|network|fetch/i.test(resetError.message)) {
      setError(authErrorMessage(resetError))
      setPending(false)
      return
    }

    setSent(true)
  }

  if (sent) {
    return (
      <AuthShell
        title={t.lupaPassword.sentTitle}
        subtitle={t.lupaPassword.sentSubtitle}
        footer={<p>{t.lupaPassword.sentFooter}</p>}
      >
        <Link
          href="/masuk/"
          className="flex min-h-[52px] w-full items-center justify-center rounded-[3px] border border-rule px-4 text-[15px] text-ink"
        >
          {t.authShared.backToSignIn}
        </Link>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title={t.lupaPassword.title}
      subtitle={t.lupaPassword.subtitle}
      footer={
        <p>
          {t.lupaPassword.remembered}{' '}
          <AuthLink href="/masuk/">{t.authShared.backToSignIn}</AuthLink>
        </p>
      }
    >
      <form onSubmit={onSubmit} noValidate>
        <FormMessage kind="error">{error}</FormMessage>

        <Field
          label={t.authShared.emailLabel}
          name="email"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect="off"
          placeholder={t.authShared.emailPlaceholder}
        />

        <SubmitButton pending={pending} pendingLabel={t.lupaPassword.submitPending}>
          {t.lupaPassword.submit}
        </SubmitButton>
      </form>
    </AuthShell>
  )
}
