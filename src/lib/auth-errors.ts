/**
 * Supabase auth errors, in language a person can act on.
 *
 * Raw messages come back in English and describe the API ("Invalid login
 * credentials", "AuthApiError"), not the situation. Showing them raw is the thing
 * every project patches later, one error at a time, once someone hits it. Doing it
 * once here is cheaper and kinder.
 *
 * Deliberately vague on one point: a wrong password and an unknown email give the
 * same answer, because telling them apart lets anyone check which addresses have
 * accounts.
 */

import { t } from './i18n'

type Matcher = { test: RegExp; message: string }

const MATCHERS: Matcher[] = [
  { test: /invalid login credentials|invalid_credentials/i, message: t.errors.auth.invalidCredentials },
  { test: /email not confirmed|email_not_confirmed/i, message: t.errors.auth.emailNotConfirmed },
  { test: /user already registered|already been registered/i, message: t.errors.auth.alreadyRegistered },
  { test: /password should be at least (\d+)/i, message: t.errors.auth.passwordTooShort },
  { test: /(pwned|leaked|compromised) password/i, message: t.errors.auth.passwordPwned },
  { test: /same as the old password|should be different/i, message: t.errors.auth.passwordSameAsOld },
  { test: /token has expired|expired|invalid.*token|otp_expired/i, message: t.errors.auth.linkExpired },
  {
    test: /email rate limit|over_email_send_rate_limit|too many requests|rate limit/i,
    message: t.errors.auth.rateLimited,
  },
  { test: /signups not allowed|signup_disabled/i, message: t.errors.auth.signupsDisabled },
  { test: /unable to validate email|invalid format/i, message: t.errors.auth.invalidEmail },
  { test: /failed to fetch|networkerror|network request failed/i, message: t.errors.auth.offline },
]

export function authErrorMessage(error: unknown): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : typeof error === 'object' && error !== null && 'message' in error
          ? String((error as { message: unknown }).message)
          : ''

  for (const { test, message } of MATCHERS) {
    if (test.test(raw)) return message
  }

  // Nothing matched. Say so plainly rather than showing an API string that means
  // nothing to the reader — and log the original so it can be added above.
  if (raw) console.warn('[auth] unmapped error:', raw)
  return t.errors.auth.fallback
}
