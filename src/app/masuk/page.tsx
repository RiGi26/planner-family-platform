'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { AuthLink, AuthShell, Field, FormMessage, SubmitButton } from '@/components/auth-form'
import { useSession } from '@/components/auth-provider'
import { authErrorMessage } from '@/lib/auth-errors'
import { supabase } from '@/lib/supabase-client'

function SignInForm() {
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
      title="Masuk"
      subtitle="Sekali masuk, tetap masuk — sampai kamu keluar sendiri."
      footer={
        <>
          <p>
            Punya kode undangan? <AuthLink href="/daftar/">Daftar di sini</AuthLink>
          </p>
          <p className="mt-4">
            <AuthLink href="/lupa-password/">Lupa password</AuthLink>
          </p>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate>
        <FormMessage kind="error">{error}</FormMessage>

        <Field
          label="Email"
          name="email"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect="off"
          placeholder="kamu@contoh.com"
        />

        <Field
          label="Password"
          name="password"
          type="password"
          required
          // Tells a password manager this is a sign-in, not a new password. Without
          // it, phone keychains offer to save the wrong thing or nothing at all.
          autoComplete="current-password"
        />

        <SubmitButton pending={pending} pendingLabel="Masuk…">
          Masuk
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
