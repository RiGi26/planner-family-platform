import type { MetadataRoute } from 'next'
import { t } from '@/lib/i18n'

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
    name: t.meta.manifestName,
    short_name: t.meta.title,
    description: t.meta.manifestDescription,
    lang: 'id',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#E7E1D8',
    theme_color: '#E7E1D8',
    categories: ['education'],
    /**
     * Chrome refuses the install prompt without a raster icon of at least 192px,
     * so an SVG-only manifest meant the app could be used and never installed.
     *
     * `any` and `maskable` are separate entries on purpose. Declaring one icon as
     * `"any maskable"` tells Android it may crop that art to a circle *and* use
     * the same file untouched elsewhere — so it gets shrunk-with-padding in the
     * places that do not crop, and the artwork loses a fifth of its size for a
     * safety margin it does not need there.
     */
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      // Last: browsers that can use it prefer it, and the rasters above cover the rest.
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
  }
}
