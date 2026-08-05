import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

/**
 * redeem-invite — the only door into this app.
 *
 * Public signups are disabled in the dashboard, so the admin API is the sole way a
 * user row can come into existence, and this function is the only thing holding the
 * service role key. The invite code is the authentication: that is why verify_jwt is
 * off here, since someone signing up cannot possibly present a JWT yet.
 *
 * No password ever passes through this function. It sends an invitation, and the
 * recipient sets their own password from the emailed link — which also means email
 * verification is inherent to the flow rather than a step that can be skipped.
 */

/** Where the app lives. Public information, not a secret, so it is a default rather
 *  than a manual dashboard step someone has to remember. Overridable by env. */
const APP_URL = Deno.env.get('APP_URL') ?? 'https://masume.vercel.app'

const STATIC_ORIGINS = [
  'https://masume.vercel.app',
  'http://localhost:3000',
  'http://localhost:4321',
]

/** Every Vercel preview deploy of this project gets its own hostname. */
const PREVIEW_ORIGIN = /^https:\/\/masume-[a-z0-9-]+\.vercel\.app$/

const EXTRA_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

function isAllowed(origin: string | null): origin is string {
  if (!origin) return false
  return (
    STATIC_ORIGINS.includes(origin) ||
    EXTRA_ORIGINS.includes(origin) ||
    PREVIEW_ORIGIN.test(origin)
  )
}

function corsHeaders(origin: string | null) {
  return {
    'Access-Control-Allow-Origin': isAllowed(origin) ? origin : '',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
}

/**
 * One reply for every rejection reason.
 *
 * Telling an unauthenticated caller the difference between "no such code", "already
 * used" and "expired" hands them a way to probe the invite table one guess at a
 * time. The person holding a real invite does not need the distinction; someone
 * guessing does.
 */
const INVITE_REJECTED = 'Kode undangan tidak berlaku.'

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  })
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin')

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) })
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405, origin)
  }
  if (!isAllowed(origin)) {
    return json({ error: 'Origin tidak dikenali.' }, 403, origin)
  }

  let body: { email?: unknown; code?: unknown; displayName?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Permintaan tidak terbaca.' }, 400, origin)
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : ''
  const displayName =
    typeof body.displayName === 'string' ? body.displayName.trim().slice(0, 60) : ''

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return json({ error: 'Alamat email tidak valid.' }, 400, origin)
  }
  if (code.length < 6 || code.length > 64) {
    return json({ error: INVITE_REJECTED }, 403, origin)
  }
  if (displayName.length < 1) {
    return json({ error: 'Nama tampilan wajib diisi.' }, 400, origin)
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    // Injected by the platform, so rotating the key in the dashboard does not break
    // this function and the value never has to be pasted anywhere.
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  // Claim first. The conditional UPDATE inside claim_invite is atomic, so two people
  // racing for the last use cannot both win.
  //
  // Two result shapes are accepted on purpose: claim_invite used to return the
  // household row the invite carried, and returns a plain boolean since the app
  // was generalized. This function deploys before the migration lands, so for a
  // window it must speak both dialects.
  const { data: claimed, error: claimError } = await admin.rpc('claim_invite', { p_code: code })
  if (claimError) {
    console.error('claim_invite failed', claimError.message)
    return json({ error: 'Terjadi gangguan. Coba lagi sebentar lagi.' }, 500, origin)
  }
  const claimOk = claimed === true || (Array.isArray(claimed) && claimed.length > 0)
  if (!claimOk) {
    return json({ error: INVITE_REJECTED }, 403, origin)
  }

  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { display_name: displayName },
    redirectTo: `${APP_URL.replace(/\/$/, '')}/atur-password/`,
  })

  if (inviteError || !invited?.user) {
    // Give the use back — a mail failure must not silently burn someone's invite.
    await admin.rpc('release_invite', { p_code: code })
    console.error('inviteUserByEmail failed', inviteError?.message)

    const alreadyRegistered = (inviteError?.message ?? '').toLowerCase().includes('already')
    return json(
      {
        error: alreadyRegistered
          ? 'Email ini sudah terdaftar. Coba masuk, atau pakai tautan lupa password.'
          : 'Undangan gagal dikirim. Coba lagi sebentar lagi.',
      },
      alreadyRegistered ? 409 : 502,
      origin,
    )
  }

  // The signup trigger has already created the profile row; there is nothing left
  // to link. An account is just an account now.
  return json({ ok: true, email }, 200, origin)
})
