'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { AuthLink, AuthShell, Field, FormMessage, SubmitButton } from '@/components/auth-form'
import { useSession } from '@/components/auth-provider'
import { authErrorMessage } from '@/lib/auth-errors'
import { useT } from '@/lib/i18n'
import { supabase } from '@/lib/supabase-client'

function SignInForm() {
  const t = useT()
  const router = useRouter()
  const params = useSearchParams()
  const { session, loading } = useSession()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  // Where they were headed before being bounced here. Sending them back to it is
  // the difference between a login that interrupts and one that gets out of the way.
  const next = params.get('next') || '/'

  useEffect(() => {
    if (!loading && session) router.replace(next)
  }, [loading, session, next, router])

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (pending) return

    const form = new FormData(e.currentTarget)
    const email = String(form.get('email') ?? '').trim()
    const password = String(form.get('password') ?? '')

    setPending(true)
    setError('')

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })

    if (signInError) {
      setError(authErrorMessage(signInError))
      setPending(false)
      return
    }

    router.replace(next)
  }

  return (
    <AuthShell
      title={t.masuk.title}
      subtitle={t.masuk.subtitle}
      footer={
        <>
          <p>
            {t.masuk.haveInvite} <AuthLink href="/daftar/">{t.masuk.signUpHere}</AuthLink>
          </p>
          <p className="mt-4">
            <AuthLink href="/lupa-password/">{t.masuk.forgotPassword}</AuthLink>
          </p>
        </>
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

        <Field
          label={t.masuk.passwordLabel}
          name="password"
          type="password"
          required
          // Tells a password manager this is a sign-in, not a new password. Without
          // it, phone keychains offer to save the wrong thing or nothing at all.
          autoComplete="current-password"
        />

        <SubmitButton pending={pending} pendingLabel={t.masuk.submitPending}>
          {t.masuk.submit}
        </SubmitButton>
      </form>
    </AuthShell>
  )
}

export default function SignInPage() {
  // useSearchParams needs a Suspense boundary to prerender in a static export.
  return (
    <Suspense fallback={null}>
      <SignInForm />
    </Suspense>
  )
}
