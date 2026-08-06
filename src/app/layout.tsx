import type { Metadata, Viewport } from 'next'
import { AuthProvider } from '@/components/auth-provider'
import { QueryProvider } from '@/components/query-provider'
import { SwUpdateReloader } from '@/components/sw-update'
import { SyncProvider } from '@/components/sync-provider'
import { t } from '@/lib/i18n'
import './globals.css'

/**
 * The fonts are self-hosted from `public/fonts` and declared in globals.css.
 *
 * next/font/google used to load them here, and the reason it no longer does is
 * not preference: it registers a *hashed* family name and exposes it through a
 * CSS variable, while globals.css asked for the literal family name. Nothing
 * matched, every screen rendered in system-ui, and 13.2 MB of Japanese webfont
 * was downloaded and precached to draw nothing. Real `@font-face` rules with
 * real family names remove the indirection that hid this for weeks.
 *
 * Mincho stays reserved for 升 and 始 — it shows tome, hane and harai, which is
 * what the writing module is teaching. It must never leak into general UI.
 */

export const metadata: Metadata = {
  title: t.meta.title,
  description: t.meta.description,
  manifest: '/manifest.webmanifest',
  // iOS ignores the manifest's icons entirely and looks for this link, so an
  // app installed from Safari would otherwise get a screenshot of the page as
  // its home-screen icon.
  icons: { apple: '/apple-touch-icon.png' },
  appleWebApp: { capable: true, statusBarStyle: 'default', title: t.meta.title },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // The app is a full-screen surface with its own safe-area handling; letting the
  // browser inset it as well would double the padding on notched phones.
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#E7E1D8' },
    { media: '(prefers-color-scheme: dark)', color: '#171512' },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" suppressHydrationWarning>
      <head>
        {/* Only the body face. Preloading all six would repeat the mistake this
            change exists to undo, at a smaller scale. */}
        <link
          rel="preload"
          href="/fonts/zen-kaku-400.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body>
        {/* Outside the providers: it owns nothing and reads nothing, it only
            watches for a deploy claiming this page mid-session. */}
        <SwUpdateReloader />
        <QueryProvider>
          <AuthProvider>
            {/* Inside AuthProvider because it reads the session; wraps everything
                because the local store has to be filled before any screen reads it. */}
            <SyncProvider>{children}</SyncProvider>
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  )
}
