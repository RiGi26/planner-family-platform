'use client'

import { useEffect } from 'react'

/**
 * Reloads once when a new service worker takes over a page that is already open.
 *
 * `sw.ts` sets `skipWaiting` and `clientsClaim`, so a deploy does not politely wait
 * for every tab to close — the new worker activates and claims open pages
 * immediately. The page it claims is still running the previous build's JavaScript
 * and still asking for that build's hashed chunk filenames, which the new precache
 * no longer contains and the new deployment no longer serves. The next navigation
 * then fails to load a chunk, and the router falls back to a hard navigation that
 * can land on a route payload instead of a page — which is what someone saw as a
 * screenful of raw `1:"$Sreact.fragment"` text after signing up.
 *
 * The alternative was dropping `clientsClaim` so updates wait for every tab to
 * close. Rejected: this is a PWA people leave installed for days, so "waits for all
 * tabs to close" means "stays on an old build indefinitely", and an app that cannot
 * converge on a version is worse than one that refreshes itself.
 *
 * The reload is immediate rather than deferred to the next idle moment, because
 * from the instant the controller changes the page is already mismatched — waiting
 * only widens the window in which it can break. Losing an in-progress form is the
 * cost; it is paid rarely, and never in a review session, where every answer is
 * written to IndexedDB the moment it is given.
 */
export function SwUpdateReloader() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return

    // A first visit starts with no controller, and `clientsClaim` then fires
    // controllerchange as a matter of course. Reloading on that one would make
    // every new visitor's first page load flash for nothing — so the first change
    // is swallowed only when the page began uncontrolled. The listener stays
    // attached either way, so an update later in the same session is still caught.
    let sawInitialClaim = Boolean(navigator.serviceWorker.controller)
    let reloading = false

    const onControllerChange = () => {
      if (!sawInitialClaim) {
        sawInitialClaim = true
        return
      }
      if (reloading) return
      reloading = true
      window.location.reload()
    }

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)
    return () =>
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
  }, [])

  return null
}
