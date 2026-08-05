import type { MetadataRoute } from 'next'

// Metadata routes are treated as dynamic by default. Under `output: 'export'` there
// is nothing to serve them at request time, so this has to be declared static or the
// build fails outright.
export const dynamic = 'force-static'

/**
 * The web app manifest.
 *
 * Not decoration: PRD §2.4 chose a PWA over a native shell precisely because it
 * already provides a home-screen icon, offline, and fullscreen. Without this file
 * none of those three exist, and the reasoning behind the whole platform decision
 * quietly stops holding.
 *
 * `display: standalone` is what removes the browser chrome, which matters more here
 * than it sounds: a review session is a full-screen, thumb-driven surface, and a URL
 * bar sitting above it eats the safe area we carefully budgeted.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Masume — planner sertifikasi JLPT',
    short_name: 'Masume',
    description:
      'Hitung mundur dari tanggal ujian ke kuota harian, lalu jalankan kuota itu lewat satu mesin SRS.',
    lang: 'id',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#E7E1D8',
    theme_color: '#E7E1D8',
    categories: ['education'],
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
    ],
  }
}
