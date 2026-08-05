'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import { clearAll, db } from '@/lib/db'
import { supabase } from '@/lib/supabase-client'

/**
 * One source of session truth for the whole app.
 *
 * `getSession()` is a network call, and scattering it through pages means every
 * screen pays for it and every screen renders its own version of "not sure yet".
 * Here it resolves once, then `onAuthStateChange` keeps it current — including the
 * silent token refresh, sign-out from another tab, and the moment a recovery link
 * is opened.
 */

type AuthState = {
  session: Session | null
  user: User | null
  /** True until the first session check settles. Guards must wait for it. */
  loading: boolean
  /** Set while the user is on a password-recovery link and has not set one yet. */
  recovering: boolean
}

const AuthContext = createContext<AuthState>({
  session: null,
  user: null,
  loading: true,
  recovering: false,
})

/**
 * The local database is per-origin, not per-user. If account B signs in on a
 * device where account A studied, A's cards, queue and handwriting are all still
 * sitting in IndexedDB — and the sync layer would happily push them under B's
 * session to be rejected row by row by RLS. Wiping on a detected switch keeps one
 * device usable by more than one person, which "general app" now requires.
 */
async function guardLocalData(userId: string) {
  try {
    const last = await db.meta.get('last_user_id')
    if (last && last.value !== userId) {
      await clearAll()
      // delete() closes the connection; reopen so the app keeps working without a
      // reload when the switch happens mid-session.
      await db.open()
    }
    await db.meta.put({ key: 'last_user_id', value: userId })
  } catch {
    // IndexedDB unavailable (private mode, storage pressure) — nothing to guard.
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    session: null,
    user: null,
    loading: true,
    recovering: false,
  })

  const userId = state.user?.id
  useEffect(() => {
    if (userId) void guardLocalData(userId)
  }, [userId])

  useEffect(() => {
    let active = true

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setState((s) => ({ ...s, session: data.session, user: data.session?.user ?? null, loading: false }))
    })

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      setState((s) => ({
        session,
        user: session?.user ?? null,
        loading: false,
        // Supabase signs the user in when they open a recovery or invite link. That
        // is a real session, but they have no password yet — so the app has to know
        // the difference and send them to set one instead of to the dashboard.
        recovering:
          event === 'PASSWORD_RECOVERY'
            ? true
            : event === 'USER_UPDATED' || event === 'SIGNED_OUT'
              ? false
              : s.recovering,
      }))
    })

    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>
}

export function useSession() {
  return useContext(AuthContext)
}

/**
 * Wraps a page that needs a signed-in user.
 *
 * This is presentation only. With a static export there is no server to enforce
 * anything, and anyone can walk past this with devtools — which is fine, because
 * RLS is what actually protects the data. What this buys is not showing a signed-out
 * person an empty dashboard.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { session, loading, recovering } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (loading) return
    if (recovering) {
      router.replace('/atur-password/')
      return
    }
    if (!session) {
      const next = typeof window !== 'undefined' ? window.location.pathname : '/'
      router.replace(`/masuk/?next=${encodeURIComponent(next)}`)
    }
  }, [session, loading, recovering, router])

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <span className="sr-only">Memuat</span>
        <span aria-hidden className="animate-pulse text-[28px] text-ink-faint">
          升
        </span>
      </div>
    )
  }

  if (!session || recovering) return null

  return <>{children}</>
}
