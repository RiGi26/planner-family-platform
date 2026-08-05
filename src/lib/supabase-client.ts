'use client'

import { createClient, type SupportedStorage } from '@supabase/supabase-js'

/**
 * The one Supabase client. With `output: 'export'` there is no server tier at all,
 * so every read and write in the app goes through here and is guarded by RLS.
 *
 * The anon key is public by design and safe in the bundle. The service role key and
 * any Claude API key are not, and must never appear outside an Edge Function.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error(
    'NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set. ' +
      'Static export inlines them at build time, so a missing value fails the build rather than the request.',
  )
}

/**
 * Session storage, deliberately isolated behind its own object.
 *
 * On the web this is just localStorage — it survives a closed browser and a phone
 * restart, which is what "log in once and stay logged in" needs. `sessionStorage`
 * would be wiped the moment a tab closes.
 *
 * In a Capacitor WebView, though, the OS is allowed to clear localStorage when
 * storage runs low, and the symptom is a user being logged out for no visible
 * reason. Swapping this object for @capacitor/preferences is the entire fix, and
 * `SupportedStorage` already accepts async values — which is why it is split out
 * now rather than when we get there.
 */
export const sessionStorageAdapter: SupportedStorage = {
  getItem: (key) => (typeof window === 'undefined' ? null : window.localStorage.getItem(key)),
  setItem: (key, value) => {
    if (typeof window !== 'undefined') window.localStorage.setItem(key, value)
  },
  removeItem: (key) => {
    if (typeof window !== 'undefined') window.localStorage.removeItem(key)
  },
}

export const supabase = createClient(url, anonKey, {
  auth: {
    storage: sessionStorageAdapter,
    persistSession: true,
    // Refreshes the hour-long access token in the background. The session itself has
    // no expiry — that is governed by the dashboard's Sessions settings, which must
    // stay empty.
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
})

/**
 * Ends the session on this device only.
 *
 * With `scope: 'global'` — the default — signing out on a phone would also kick the
 * laptop, which is almost never what anyone means by "log out".
 */
export async function signOutLocal() {
  return supabase.auth.signOut({ scope: 'local' })
}

export async function getSession() {
  const { data } = await supabase.auth.getSession()
  return data.session
}
