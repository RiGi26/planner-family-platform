'use client'

import { useState } from 'react'
import Link from 'next/link'
import { AuthLink, AuthShell, Field, FormMessage, SubmitButton } from '@/components/auth-form'
import { authErrorMessage } from '@/lib/auth-errors'
import { supabase } from '@/lib/supabase-client'

/**
 * Password reset request.
 *
 * The confirmation is deliberately the same whether or not the address has an
 * account. Saying "no account with that email" would turn this page into a way to
 * find out who has one.
 */
export default function ForgotPasswordPage() {
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
        title="Cek emailmu"
        subtitle="Kalau alamat itu terdaftar, tautan untuk mengatur ulang password sudah dikirim. Tautannya berlaku terbatas."
        footer={<p>Tidak ada di kotak masuk? Cek folder spam.</p>}
      >
        <Link
          href="/masuk/"
          className="flex min-h-[52px] w-full items-center justify-center rounded-[3px] border border-rule px-4 text-[15px] text-ink"
        >
          Kembali ke halaman masuk
        </Link>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="Lupa password"
      subtitle="Masukkan emailmu, kami kirim tautan untuk mengatur password baru."
      footer={
        <p>
          Ingat lagi? <AuthLink href="/masuk/">Kembali ke halaman masuk</AuthLink>
        </p>
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

        <SubmitButton pending={pending} pendingLabel="Mengirim…">
          Kirim tautan
        </SubmitButton>
      </form>
    </AuthShell>
  )
}
