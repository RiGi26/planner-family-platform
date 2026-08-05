'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { clsx } from '@/lib/clsx'

/**
 * Navigation uses kanji glyphs rather than line icons, so every tap is also one more
 * exposure to a character. Japanese typography is the icon set.
 *
 * Hidden during a review session: the whole screen is a tap target there, and a nav
 * bar at the bottom would sit exactly where the thumb lands.
 */
const TABS = [
  { href: '/', glyph: '今', label: 'Hari Ini' },
  { href: '/kana/', glyph: 'あ', label: 'Kana' },
  { href: '/menulis/', glyph: '筆', label: 'Menulis' },
  { href: '/keluarga/', glyph: '家', label: 'Keluarga' },
] as const

export function BottomNav() {
  const pathname = usePathname()

  return (
    <nav
      aria-label="Navigasi utama"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-rule bg-paper-raised"
      style={{ paddingBottom: 'var(--spacing-safe-bottom)' }}
    >
      <ul className="mx-auto flex max-w-lg">
        {TABS.map((tab) => {
          const active = pathname === tab.href
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                // 56px keeps the whole tile above the 44px floor even on a short phone,
                // and the label stays visible rather than relying on the glyph alone.
                className={clsx(
                  'flex min-h-[56px] flex-col items-center justify-center gap-[2px] transition-colors',
                  active ? 'text-ink' : 'text-ink-faint',
                )}
              >
                <span aria-hidden className="text-[20px] leading-none">
                  {tab.glyph}
                </span>
                <span className="text-[10px] tracking-[0.08em] uppercase">{tab.label}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
