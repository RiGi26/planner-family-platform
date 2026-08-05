'use client'

import Link from 'next/link'
import { useT } from '@/lib/i18n'

/**
 * Tentang — the attribution page, reachable without signing in.
 *
 * This screen is a licence obligation, not marketing. The stroke-order data is
 * KanjiVG under CC BY-SA 3.0, and distributing the app — on the web today, in the
 * stores later — requires the attribution to travel *inside* the thing distributed.
 * A NOTICE file in a GitHub repo does not reach the person holding the phone.
 */

function Section({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-[12px] font-medium tracking-[0.14em] text-ink-muted uppercase">
        {heading}
      </h2>
      {children}
    </section>
  )
}

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="-my-3 inline-flex min-h-tap items-center text-ai underline underline-offset-2"
    >
      {children}
    </a>
  )
}

export default function AboutPage() {
  const t = useT()

  return (
    <main
      className="mx-auto max-w-lg px-5 pb-16"
      style={{ paddingTop: 'calc(var(--spacing-safe-top) + 12px)' }}
    >
      <Link href="/" className="-my-3 inline-flex min-h-tap items-center text-[13px] text-ai">
        ← {t.tentang.back}
      </Link>

      <div className="mt-4">
        <span
          aria-hidden
          className="font-[family-name:var(--font-zen-mincho)] text-[32px] leading-none text-shu"
        >
          升
        </span>
        <h1 className="mt-4 text-[24px] leading-tight font-bold text-ink">{t.tentang.title}</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-ink-muted">{t.tentang.subtitle}</p>
      </div>

      <Section heading={t.tentang.appHeading}>
        <p className="text-[14px] leading-relaxed text-ink-muted">{t.tentang.appBody}</p>
        <p className="mt-3 text-[14px]">
          <ExternalLink href="https://github.com/RiGi26/planner-family-platform">
            {t.tentang.appRepo}
          </ExternalLink>
        </p>
      </Section>

      <Section heading={t.tentang.dataHeading}>
        <p className="text-[14px] leading-relaxed text-ink-muted">{t.tentang.kanjivgBody}</p>
        <ul className="mt-3 flex flex-col gap-1 text-[14px]">
          <li>
            <ExternalLink href="https://kanjivg.tagaini.net/">{t.tentang.kanjivgSite}</ExternalLink>
          </li>
          <li>
            <ExternalLink href="https://creativecommons.org/licenses/by-sa/3.0/">
              {t.tentang.kanjivgLicense}
            </ExternalLink>
          </li>
        </ul>
      </Section>

      <Section heading={t.tentang.depsHeading}>
        <p className="text-[14px] leading-relaxed text-ink-muted">{t.tentang.depsBody}</p>
      </Section>
    </main>
  )
}
