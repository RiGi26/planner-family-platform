'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { isLeaving, useSession } from '@/components/auth-provider'
import { t } from '@/lib/i18n'
import { useGoal } from '@/lib/queries'

/**
 * Wraps the two screens that are meaningless without an exam date: Hari Ini and
 * the review session. Both print quotas, and a quota with no target is a number
 * with no source.
 *
 * Deliberately NOT on /kana/, /menulis/ or /setelan/. Those work perfectly well
 * before onboarding, and putting Setelan behind it would trap anyone who cannot
 * finish onboarding — including someone who needs to sign out and try another
 * account.
 *
 * The redirect fires only on `isSuccess && data === null`. On `isError` — which
 * is what being offline looks like — it renders the children instead. Redirecting
 * on error would mean opening the app on a train throws you back into onboarding
 * for a goal you set weeks ago.
 */
export function RequireGoal({ children }: { children: React.ReactNode }) {
  const { user } = useSession()
  const router = useRouter()
  const { data: goal, isSuccess, isLoading } = useGoal(user?.id)

  const missing = isSuccess && goal === null
  useEffect(() => {
    // Same reason as RequireAuth: never add a second navigation to one already
    // in flight.
    if (missing && !isLeaving()) router.replace('/mulai/')
  }, [missing, router])

  if (isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <span className="sr-only">{t.common.loading}</span>
        <span aria-hidden className="animate-pulse text-[28px] text-ink-faint">
          升
        </span>
      </div>
    )
  }

  if (missing) return null

  return <>{children}</>
}
