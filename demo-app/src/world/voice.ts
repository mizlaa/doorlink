/**
 * Narration with the browser's own speech synthesis: free, offline, no
 * service. Prefers a natural Australian or British English voice. Muting is
 * remembered. iOS only allows speech after a tap, so unlockVoice() is
 * called from the Enter button.
 */
const ok = typeof window !== 'undefined' && 'speechSynthesis' in window
const KEY = 'doorlink:voice-muted'
let muted = (() => {
  try {
    return window.localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
})()
let voice: SpeechSynthesisVoice | null = null

function pickVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices()
  const nice = /natural|neural|premium|enhanced|siri|google|karen|catherine|serena|daniel|samantha/i
  for (const lang of [/^en-AU/i, /^en-GB/i, /^en-US/i, /^en/i]) {
    const list = voices.filter((v) => lang.test(v.lang))
    const best = list.find((v) => nice.test(v.name)) ?? list[0]
    if (best) return best
  }
  return null
}
if (ok) window.speechSynthesis.onvoiceschanged = () => (voice = pickVoice())

export const voiceAvailable = ok
export const isMuted = () => muted

/** Called from the Enter tap: a real, audible line inside the gesture is what unlocks speech on iOS. */
export function unlockVoice() {
  if (!ok || muted) return
  speak('Entering Doorlink World.')
}

let pending = 0
export function say(text: string) {
  if (!ok || muted) return
  const synth = window.speechSynthesis
  window.clearTimeout(pending)
  // iOS drops an utterance spoken straight after cancel(): cancel, then speak a beat later.
  if (synth.speaking || synth.pending) {
    synth.cancel()
    pending = window.setTimeout(() => speak(text), 120)
  } else speak(text)
}

function speak(text: string) {
  const synth = window.speechSynthesis
  synth.resume()
  const u = new SpeechSynthesisUtterance(text)
  voice ??= pickVoice()
  if (voice) u.voice = voice
  u.lang = voice?.lang ?? 'en-AU'
  u.rate = 1.02
  u.pitch = 1
  synth.speak(u)
}

export function hush() {
  if (!ok) return
  window.clearTimeout(pending)
  window.speechSynthesis.cancel()
}

export function setMuted(on: boolean) {
  muted = on
  try {
    window.localStorage.setItem(KEY, on ? '1' : '0')
  } catch {
    /* not remembered in private mode */
  }
  if (on) hush()
}
