const FEEDBACK_BY_OUTCOME = {
  ready: 'success',
  already_used: 'warning',
  not_ready: 'warning',
  no_registration: 'warning',
  not_found: 'error',
  invalid: 'error',
  checkin_ok: 'checkin_ok',
}

const VIBRATION_PATTERNS = {
  success: [35, 25, 35],
  checkin_ok: [70, 35, 70, 35, 100],
  warning: [90],
  error: [180, 80, 180],
}

const SOUND_SEQUENCES = {
  success: [
    { frequency: 880, duration: 90, type: 'sine', volume: 0.12 },
    { frequency: 1174, duration: 110, type: 'sine', volume: 0.1, delay: 95 },
  ],
  checkin_ok: [
    { frequency: 659, duration: 80, type: 'triangle', volume: 0.11 },
    { frequency: 880, duration: 90, type: 'triangle', volume: 0.11, delay: 85 },
    { frequency: 1046, duration: 140, type: 'triangle', volume: 0.1, delay: 180 },
  ],
  warning: [{ frequency: 440, duration: 160, type: 'square', volume: 0.07 }],
  error: [
    { frequency: 220, duration: 140, type: 'sawtooth', volume: 0.08 },
    { frequency: 196, duration: 180, type: 'sawtooth', volume: 0.08, delay: 150 },
  ],
}

let audioContext

function getAudioContext() {
  if (typeof window === 'undefined') return null
  const AudioCtx = window.AudioContext ?? window.webkitAudioContext
  if (!AudioCtx) return null
  if (!audioContext) {
    audioContext = new AudioCtx()
  }
  return audioContext
}

function playTone({ frequency, duration, type = 'sine', volume = 0.12, delay = 0 }) {
  const ctx = getAudioContext()
  if (!ctx) return

  const startAt = ctx.currentTime + delay / 1000
  const oscillator = ctx.createOscillator()
  const gain = ctx.createGain()

  oscillator.type = type
  oscillator.frequency.value = frequency
  gain.gain.setValueAtTime(volume, startAt)
  gain.gain.exponentialRampToValueAtTime(0.001, startAt + duration / 1000)

  oscillator.connect(gain)
  gain.connect(ctx.destination)
  oscillator.start(startAt)
  oscillator.stop(startAt + duration / 1000 + 0.02)
}

function playSound(category) {
  const ctx = getAudioContext()
  if (!ctx) return

  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {})
  }

  const sequence = SOUND_SEQUENCES[category] ?? SOUND_SEQUENCES.warning
  sequence.forEach((tone) => playTone(tone))
}

function playVibration(category) {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return
  const pattern = VIBRATION_PATTERNS[category] ?? VIBRATION_PATTERNS.warning
  navigator.vibrate(pattern)
}

/**
 * Emite feedback háptico y sonoro según el resultado del escaneo o check-in.
 * @param {string} outcome — ready | already_used | not_found | checkin_ok | …
 * @param {{ soundEnabled?: boolean, vibrateEnabled?: boolean }} options
 */
export function playCheckinFeedback(outcome, { soundEnabled = true, vibrateEnabled = true } = {}) {
  const category = FEEDBACK_BY_OUTCOME[outcome] ?? 'warning'
  if (soundEnabled) playSound(category)
  if (vibrateEnabled) playVibration(category)
}

export function getFeedbackTone(outcome) {
  const category = FEEDBACK_BY_OUTCOME[outcome] ?? 'warning'
  if (category === 'success' || category === 'checkin_ok') return 'success'
  if (category === 'error') return 'danger'
  return 'warning'
}
