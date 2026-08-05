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

type Matcher = { test: RegExp; message: string }

const MATCHERS: Matcher[] = [
  {
    test: /invalid login credentials|invalid_credentials/i,
    message: 'Email atau password salah.',
  },
  {
    test: /email not confirmed|email_not_confirmed/i,
    message: 'Emailmu belum dikonfirmasi. Cek kotak masuk untuk tautan konfirmasinya.',
  },
  {
    test: /user already registered|already been registered/i,
    message: 'Email ini sudah terdaftar. Coba masuk, atau pakai tautan lupa password.',
  },
  {
    test: /password should be at least (\d+)/i,
    message: 'Password terlalu pendek.',
  },
  {
    test: /(pwned|leaked|compromised) password/i,
    message:
      'Password ini pernah muncul di kebocoran data publik. Pilih yang lain — bukan berarti akunmu bocor.',
  },
  {
    test: /same as the old password|should be different/i,
    message: 'Password barunya masih sama dengan yang lama.',
  },
  {
    test: /token has expired|expired|invalid.*token|otp_expired/i,
    message: 'Tautannya sudah kedaluwarsa. Minta tautan baru, ya.',
  },
  {
    test: /email rate limit|over_email_send_rate_limit|too many requests|rate limit/i,
    message: 'Terlalu banyak percobaan. Tunggu beberapa menit sebelum mencoba lagi.',
  },
  {
    test: /signups not allowed|signup_disabled/i,
    message: 'Pendaftaran mandiri ditutup. Kamu perlu kode undangan.',
  },
  {
    test: /unable to validate email|invalid format/i,
    message: 'Alamat emailnya tidak valid.',
  },
  {
    test: /failed to fetch|networkerror|network request failed/i,
    message: 'Tidak bisa terhubung. Cek koneksimu lalu coba lagi.',
  },
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
  return 'Terjadi gangguan. Coba lagi sebentar lagi.'
}
