import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

/**
 * delete-account — the way out, as required by both stores.
 *
 * App Store guideline 5.1.1(v) and Google Play's data-deletion policy both require
 * that an account created in the app can be deleted from the app. This function is
 * that path.
 *
 * The JWT is both the authentication and the target: the caller can only ever
 * delete themselves, and no user id is accepted from the body. `verify_jwt` is ON
 * at the gateway; the getUser() call below is defense in depth on top of it, and
 * also simply how we learn who the caller is.
 *
 * Deleting the auth row is the whole job. Every table keyed by user carries
 * ON DELETE CASCADE to auth.users — profiles, goals, card_states, reviews,
 * daily_progress, kana_sheet — so the data goes with the account atomically,
 * with nothing left behind to sweep up later.
 */

const STATIC_ORIGINS = [
  'https://masume.vercel.app',
  'http://localhost:3000',
  'http://localhost:4321',
]

/** Every Vercel preview deploy of this project gets its own hostname. */
const PREVIEW_ORIGIN = /^https:\/\/masume-[a-z0-9-]+\.vercel\.app$/

const EXTRA_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((s: string) => s.trim())
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

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  })
}

Deno.serve(async (req: Request) => {
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

  const authorization = req.headers.get('authorization') ?? ''
  if (!authorization.toLowerCase().startsWith('bearer ')) {
    return json({ error: 'Tidak terautentikasi.' }, 401, origin)
  }

  // Resolve the caller from their own token, with the anon key — the service role
  // client below never touches the request's credentials.
  const asCaller = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    {
      global: { headers: { Authorization: authorization } },
      auth: { autoRefreshToken: false, persistSession: false },
    },
  )

  const {
    data: { user },
    error: userError,
  } = await asCaller.auth.getUser()

  if (userError || !user) {
    return json({ error: 'Tidak terautentikasi.' }, 401, origin)
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id)
  if (deleteError) {
    // Generic outward, specific in the log — same policy as redeem-invite.
    console.error('deleteUser failed', user.id, deleteError.message)
    return json({ error: 'Terjadi gangguan. Coba lagi sebentar lagi.' }, 500, origin)
  }

  return json({ ok: true }, 200, origin)
})
