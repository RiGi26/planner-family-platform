'use client'

/**
 * Text-to-speech for listening cards — the device's own Japanese voice, no
 * server and no audio files.
 *
 * The one rule that shapes everything: **a listening card must never exist on
 * an account before the session can play it.** So the voice check runs before
 * introduction (prefs.listening), and a due listening card on a device that
 * turns out to have no Japanese voice is held back from the queue rather than
 * shown as a silent prompt. PRD lists the missing-voice case as a risk; hiding
 * the mode honestly is the mitigation.
 *
 * getVoices() is empty until the browser fires `voiceschanged` — famously so on
 * Chrome — which is why the lookup is a promise with a small timeout rather
 * than a synchronous read that would report "no voice" on every first load.
 */

let cached: SpeechSynthesisVoice | null | undefined

function findJa(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis?.getVoices() ?? []
  return voices.find((v) => v.lang.toLowerCase().startsWith('ja')) ?? null
}

/** Resolves the device's Japanese voice, or null when there is none. */
export function jaVoice(): Promise<SpeechSynthesisVoice | null> {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return Promise.resolve(null)
  }
  if (cached !== undefined) return Promise.resolve(cached)

  const direct = findJa()
  if (direct) {
    cached = direct
    return Promise.resolve(direct)
  }

  return new Promise((resolve) => {
    const settle = (v: SpeechSynthesisVoice | null) => {
      cached = v
      window.speechSynthesis.removeEventListener('voiceschanged', onChange)
      resolve(v)
    }
    const onChange = () => settle(findJa())
    window.speechSynthesis.addEventListener('voiceschanged', onChange)
    // Some browsers never fire the event when the list is simply empty.
    setTimeout(() => settle(findJa()), 1500)
  })
}

/** Speaks Japanese text with the given voice. Cancels anything still playing —
 *  two overlapping prompts is worse than restarting one. */
export function speak(text: string, voice: SpeechSynthesisVoice) {
  const u = new SpeechSynthesisUtterance(text)
  u.voice = voice
  u.lang = voice.lang
  u.rate = 0.9
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(u)
}
