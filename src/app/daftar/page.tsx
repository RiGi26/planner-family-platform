'use client'

import { useState } from 'react'
import Link from 'next/link'
import { AuthLink, AuthShell, Field, FormMessage, SubmitButton } from '@/components/auth-form'
import { authErrorMessage } from '@/lib/auth-errors'

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

const FUNCTIONS_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/redeem-invite`

export default function SignUpPage() {
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
        title="Cek emailmu"
        subtitle={
          <>
            Undangan sudah dikirim ke <strong className="text-ink">{sentTo}</strong>. Buka tautannya
            untuk menetapkan password, lalu kamu langsung masuk.
          </>
        }
        footer={
          <p>
            Tidak ada di kotak masuk? Cek folder spam. Kalau tetap tidak ada setelah beberapa menit,
            minta kode undangan baru.
          </p>
        }
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
      title="Daftar"
      subtitle="Pendaftaran hanya lewat undangan. Kamu akan menetapkan password dari tautan yang kami kirim."
      footer={
        <p>
          Sudah punya akun? <AuthLink href="/masuk/">Masuk</AuthLink>
        </p>
      }
    >
      <form onSubmit={onSubmit} noValidate>
        <FormMessage kind="error">{error}</FormMessage>

        <Field
          label="Nama tampilan"
          name="displayName"
          required
          maxLength={60}
          autoComplete="name"
          placeholder="Nama panggilanmu"
          hint="Yang dilihat anggota keluarga lain di dashboard."
        />

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
          label="Kode undangan"
          name="code"
          required
          autoComplete="off"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          className="font-[family-name:var(--font-plex-mono)] tracking-[0.12em] uppercase"
          placeholder="XXXX-XXXX-XXXX"
        />

        <SubmitButton pending={pending} pendingLabel="Mengirim undangan…">
          Kirim undangan
        </SubmitButton>
      </form>
    </AuthShell>
  )
}
