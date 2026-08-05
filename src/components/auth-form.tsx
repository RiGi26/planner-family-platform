'use client'

import Link from 'next/link'
import { useId, useState } from 'react'
import { clsx } from '@/lib/clsx'
import { t } from '@/lib/i18n'

/**
 * Shared pieces for the four auth screens.
 *
 * Small things that are easy to skip and expensive to retrofit live here: inputs
 * that password managers recognise, a submit button that cannot fire twice, and
 * messages that are announced to screen readers instead of only appearing.
 */

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  return (
    <main
      className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-6"
      style={{
        paddingTop: 'calc(var(--spacing-safe-top) + 24px)',
        paddingBottom: 'calc(var(--spacing-safe-bottom) + 24px)',
      }}
    >
      <div className="mb-8">
        {/* 升 — the measure that gives 升目 its name. Mincho, so the stroke ends show. */}
        <span
          aria-hidden
          className="font-[family-name:var(--font-zen-mincho)] text-[32px] leading-none text-shu"
        >
          升
        </span>
        <h1 className="mt-4 text-[24px] leading-tight font-bold text-ink">{title}</h1>
        {subtitle ? <p className="mt-2 text-[14px] leading-relaxed text-ink-muted">{subtitle}</p> : null}
      </div>

      {children}

      {footer ? <div className="mt-8 text-[13px] text-ink-muted">{footer}</div> : null}
    </main>
  )
}

export function Field({
  label,
  hint,
  type = 'text',
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  const id = useId()
  const hintId = hint ? `${id}-hint` : undefined
  const isPassword = type === 'password'
  const [reveal, setReveal] = useState(false)

  return (
    <div className="mb-5">
      <label htmlFor={id} className="mb-2 block text-[13px] font-medium text-ink">
        {label}
      </label>
      <div className="relative">
        <input
          {...props}
          id={id}
          type={isPassword && reveal ? 'text' : type}
          aria-describedby={hintId}
          // 16px minimum is enforced globally; below it iOS zooms the viewport on
          // focus and throws the layout off centre.
          className={clsx(
            'w-full rounded-[3px] border border-rule bg-paper-raised px-3 py-3 text-ink',
            'placeholder:text-ink-faint focus:border-ai focus:outline-none focus:ring-1 focus:ring-ai',
            isPassword && 'pr-16',
            // Merged, not overwritten — callers style the invite-code field as
            // monospace and it would silently vanish if props were spread over this.
            className,
          )}
        />
        {isPassword ? (
          <button
            type="button"
            onClick={() => setReveal((v) => !v)}
            // Typing a password blind on a phone keyboard is how people end up
            // locked out of an account they never mistyped in the first place.
            className="absolute inset-y-0 right-0 px-3 text-[12px] text-ink-muted"
          >
            {reveal ? t.authShared.hide : t.authShared.reveal}
          </button>
        ) : null}
      </div>
      {hint ? (
        <p id={hintId} className="mt-2 text-[12px] leading-relaxed text-ink-muted">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

/**
 * A text link that is actually tappable.
 *
 * Inline links inherit the line box and end up around 19px tall — under half the
 * 44px floor. That matters most for "Lupa password", which is precisely the link
 * someone reaches for when they are already annoyed. The negative margin keeps the
 * enlarged hit area from pushing the layout around.
 */
export function AuthLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="-my-3 inline-flex min-h-tap items-center text-ai underline underline-offset-2"
    >
      {children}
    </Link>
  )
}

export function FormMessage({ kind, children }: { kind: 'error' | 'success'; children: React.ReactNode }) {
  if (!children) return null
  return (
    <p
      // Announced rather than merely displayed: a failed sign-in that only changes
      // pixels is invisible to anyone using a screen reader.
      role={kind === 'error' ? 'alert' : 'status'}
      aria-live="polite"
      className={clsx(
        'mb-5 rounded-[3px] px-3 py-3 text-[13px] leading-relaxed',
        kind === 'error' ? 'bg-oker-tint text-oker' : 'bg-pinus-tint text-pinus',
      )}
    >
      {children}
    </p>
  )
}

export function SubmitButton({
  pending,
  children,
  pendingLabel = t.authShared.pendingDefault,
}: {
  pending: boolean
  children: React.ReactNode
  pendingLabel?: string
}) {
  return (
    <button
      type="submit"
      // Disabled while in flight, so an impatient second tap cannot send a second
      // request — which is how duplicate accounts and doubled emails happen.
      disabled={pending}
      className={clsx(
        'flex min-h-[52px] w-full items-center justify-center rounded-[3px] px-4 text-[15px] font-medium',
        pending ? 'bg-rule text-ink-muted' : 'bg-shu text-paper-raised',
      )}
    >
      {pending ? pendingLabel : children}
    </button>
  )
}
