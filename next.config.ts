import type { NextConfig } from 'next'
import withSerwistInit from '@serwist/next'

// Static export is the load-bearing decision here: one build serves Vercel *and* drops
// straight into a Capacitor WebView later without a rewrite (PRD §2.4, §3.1).
//
// Consequences we live with everywhere else in this repo:
//   - no API routes, no server components that fetch, no middleware
//   - every data access goes through @supabase/supabase-js from the client, guarded by RLS
//   - anything genuinely server-side becomes a Supabase Edge Function
const withSerwist = withSerwistInit({
  swSrc: 'src/sw.ts',
  swDest: 'public/sw.js',
  // The service worker only makes sense in a real deployment; in dev it caches away
  // the very changes we are trying to see.
  disable: process.env.NODE_ENV === 'development',
})

const nextConfig: NextConfig = {
  output: 'export',
  reactStrictMode: true,
  images: {
    // No server, so no image optimizer.
    unoptimized: true,
  },
  // Static hosts serve /route/ as /route/index.html.
  trailingSlash: true,
}

export default withSerwist(nextConfig)
