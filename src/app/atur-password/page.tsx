'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AuthShell, Field, FormMessage, SubmitButton } from '@/components/auth-form'
import { useSession } from '@/components/auth-provider'
import { authErrorMessage } from '@/lib/auth-errors'
import { supabase } from '@/lib/supabase-client'

/**
 * Where both the invitation link and the reset link land.
 *
 * They are the same screen because they are the same act: Supabase has already
 * signed the user in from the link, and what is missing is a password. Splitting it
 * into two pages would mean maintaining the same form twice.
 *
 * The session arrives asynchronously as Supabase parses the link, so the page waits
 * rather than deciding too early that the link was bad.
 */
export default function SetPasswordPage() {
  const router = useRouter()
  const { session, loading } = useSession()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [linkDead, setLinkDead] = useState(false)

  useEffect(() => {
    if (loading || session) return
    // No session shortly after landing means the link was already used, expired, or
    // tampered with. A short grace period avoids calling it dead while the token is
    // still being exchanged.
    const timer = setTimeout(() => setLinkDead(true), 2500)
    return () => clearTimeout(timer)
  }, [loading, session])

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (pending) return

    const form = new FormData(e.currentTarget)
    const password = String(form.get('password') ?? '')
    const confirm = String(form.get('confirm') ?? '')

    if (password !== confirm) {
      setError('Dua password yang kamu ketik belum sama.')
      return
    }
    if (password.length < 8) {
      setError('Password minimal 8 karakter.')
      return
    }

    setPending(true)
    setError('')

    const { error: updateError } = await supabase.auth.updateUser({ password })

    if (updateError) {
      setError(authErrorMessage(updateError))
      setPending(false)
      return
    }

    // updateUser fires USER_UPDATED, which clears the recovering flag in the auth
    // provider — so the guard stops redirecting back here.
    router.replace('/')
  }

  if (linkDead) {
    return (
      <AuthShell
        title="Tautannya sudah tidak berlaku"
        subtitle="Tautan undangan dan atur-ulang hanya bisa dipakai sekali dan punya masa berlaku. Minta yang baru, ya."
      >
        <Link
          href="/lupa-password/"
          className="flex min-h-[52px] w-full items-center justify-center rounded-[3px] bg-shu px-4 text-[15px] font-medium text-paper-raised"
        >
          Minta tautan baru
        </Link>
        <Link
          href="/masuk/"
          className="mt-3 flex min-h-[52px] w-full items-center justify-center rounded-[3px] border border-rule px-4 text-[15px] text-ink"
        >
          Kembali ke halaman masuk
        </Link>
      </AuthShell>
    )
  }

  if (loading || !session) {
    return (
      <AuthShell title="Sebentar…" subtitle="Memeriksa tautanmu.">
        <span aria-hidden className="block animate-pulse text-center text-[28px] text-ink-faint">
          合
        </span>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="Atur password"
      subtitle={
        <>
          Untuk akun <strong className="text-ink">{session.user.email}</strong>. Setelah ini kamu
          langsung masuk, dan tetap masuk sampai keluar sendiri.
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate>
        <FormMessage kind="error">{error}</FormMessage>

        <Field
          label="Password baru"
          name="password"
          type="password"
          required
          minLength={8}
          // Marks this as a new password so phone keychains offer to generate and
          // save one, instead of autofilling the old one.
          autoComplete="new-password"
          hint="Minimal 8 karakter. Pakai password manager kalau ada — kamu hanya perlu mengetiknya sekali."
        />

        <Field
          label="Ulangi password"
          name="confirm"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
        />

        <SubmitButton pending={pending} pendingLabel="Menyimpan…">
          Simpan dan masuk
        </SubmitButton>
      </form>
    </AuthShell>
  )
}
