import type { Metadata, Viewport } from 'next'
import { IBM_Plex_Mono, Zen_Kaku_Gothic_New, Zen_Old_Mincho } from 'next/font/google'
import { AuthProvider } from '@/components/auth-provider'
import './globals.css'

// next/font/google downloads these at build time and serves them from our own origin.
// That is the whole reason for using it here: a CDN <link> would break the first load
// offline and would not resolve at all inside a Capacitor WebView later.
const gothic = Zen_Kaku_Gothic_New({
  weight: ['400', '500', '700', '900'],
  subsets: ['latin'],
  variable: '--font-zen-kaku',
  display: 'swap',
})

// Mincho exists only for the writing module and the hanko stamp — it shows tome,
// hane and harai, which is exactly what the user is practising. It must never leak
// out into general UI, or it stops meaning anything.
const mincho = Zen_Old_Mincho({
  weight: ['400', '600', '900'],
  subsets: ['latin'],
  variable: '--font-zen-mincho',
  display: 'swap',
})

const mono = IBM_Plex_Mono({
  weight: ['400', '500', '600'],
  subsets: ['latin'],
  variable: '--font-plex-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Goukaku',
  description: 'Planner sertifikasi JLPT — hitung mundur dari tanggal ujian ke kuota harian.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Goukaku' },
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
      <body className={`${gothic.variable} ${mincho.variable} ${mono.variable}`}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  )
}
