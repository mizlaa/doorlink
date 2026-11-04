/**
 * Narration: pre-recorded clips (generated once with an open-source voice,
 * public/audio/*.mp3, ~190 KB) played through one <audio> element. Unlike
 * the Web Speech API, media audio plays with the iPhone silent switch on and
 * inside the app's artifact viewer. The Enter tap starts the element, which
 * lets the later lines play from timers on iOS. Muting is remembered.
 */
const CLIPS: Array<[string, string]> = [
  ['Entering Doorlink', '/audio/enter.mp3'],
  ['More than just garage doors', '/audio/garage.mp3'],
  ['From swing gates', '/audio/gate.mp3'],
  ['And we don’t stop there', '/audio/fence.mp3'],
  ['Explore roller shutters', '/audio/shutters.mp3'],
  ['Doorlink connects customers', '/audio/market.mp3'],
  ['Design it. Visualise it', '/audio/features.mp3'],
  ['Welcome to a smarter way forward', '/audio/reveal.mp3'],
  ['Doorlink. Your vision', '/audio/logo.mp3'],
]
const KEY = 'doorlink:voice-muted'
let muted = (() => {
  try {
    return window.localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
})()
let audio: HTMLAudioElement | null = null
const player = () => {
  if (!audio) {
    audio = new Audio()
    audio.preload = 'auto'
    audio.setAttribute('playsinline', '')
  }
  return audio
}

export const voiceAvailable = typeof window !== 'undefined' && typeof Audio !== 'undefined'
export const isMuted = () => muted

function play(text: string) {
  const clip = CLIPS.find(([start]) => text.startsWith(start))
  if (!clip) return
  const a = player()
  a.pause()
  a.src = clip[1]
  a.currentTime = 0
  void a.play().catch(() => undefined)
}

/** Called from the Enter tap: starting the element inside the gesture unlocks it on iOS. */
export function unlockVoice() {
  if (!voiceAvailable || muted) return
  play('Entering Doorlink')
}

export function say(text: string) {
  if (!voiceAvailable || muted) return
  play(text)
}

export function hush() {
  audio?.pause()
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
