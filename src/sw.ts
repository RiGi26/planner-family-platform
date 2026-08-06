/// <reference lib="webworker" />
import { defaultCache } from '@serwist/next/worker'
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist'
import { NetworkFirst, Serwist } from 'serwist'

// Offline is not a nice-to-have here. Reviewing on a train with bad signal is the
// main use case, and "zero data loss" is one of the four success criteria.
declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}

declare const self: ServiceWorkerGlobalScope

/**
 * Documents are handled before anything else, and only ever answered with HTML.
 *
 * Two people have now had a screenful of raw `1:"$Sreact.fragment"` text instead
 * of the app — once after signing up, once after signing out on iPhone Safari.
 * That text is a React Server Components payload: the `.txt` file Next fetches
 * for a client-side navigation. The precache holds no HTML at all (50 entries,
 * all scripts, fonts and images), so every navigation falls through to runtime
 * caching, where the only page-shaped caches are `pages-rsc` and
 * `pages-rsc-prefetch`. Nothing was left that could only answer with a document.
 *
 * Claiming navigations first closes that off by construction: a request the
 * browser is going to render as a page can no longer reach a cache full of
 * payloads, whatever the URL matching does.
 *
 * It also fixes offline navigation, which never worked: with no HTML precached
 * and no page cache, a second visit offline had nothing to show. NetworkFirst
 * fills `pages` as you go, so a route you have opened once opens again on a
 * train.
 */
const pages = new NetworkFirst({
  cacheName: 'pages',
  networkTimeoutSeconds: 10,
})

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      matcher: ({ request, sameOrigin }) =>
        sameOrigin && request.mode === 'navigate' && request.headers.get('RSC') !== '1',
      handler: pages,
    },
    ...defaultCache,
  ],
})

/**
 * A route payload must never become a page.
 *
 * Belt and braces for the same failure: if a `.txt` URL is ever committed as a
 * document — a mid-flight router fetch winning a race against a hard navigation,
 * which is what iPhone Safari appears to do on sign-out — send the browser to
 * the route it belongs to instead of painting the flight data. A redirect the
 * user never notices beats a screen of machine text.
 */
self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.mode !== 'navigate') return

  const url = new URL(request.url)
  if (!url.pathname.endsWith('.txt')) return

  const route = url.pathname.replace(/(?:\/index)?\.txt$/, '/')
  event.respondWith(Response.redirect(new URL(route, url.origin).toString(), 303))
})

serwist.addEventListeners()
