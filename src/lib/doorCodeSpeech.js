import { gateCodeUtterance, publicSpokenName } from './doorSpokenCode.js'

function synthesis() {
  if (typeof window === 'undefined') return null
  return window.speechSynthesis ?? null
}

function prefersReducedMotion() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function speak(text, { locale = 'es', force = false } = {}) {
  const synth = synthesis()
  const phrase = String(text ?? '').trim()
  if (!synth || !phrase) return false
  if (!force && prefersReducedMotion()) return false
  synth.cancel()
  const utterance = new SpeechSynthesisUtterance(phrase)
  utterance.lang = String(locale).toLowerCase().startsWith('en') ? 'en-US' : 'es-AR'
  utterance.rate = 0.96
  synth.speak(utterance)
  return true
}

const VERDICT = {
  es: {
    ready: 'Puede ingresar.',
    checked_in: 'Ingreso registrado.',
    already_used: 'Ya ingresó.',
    not_ready: 'No está habilitada.',
    no_registration: 'Sin inscripción a este evento.',
    not_found: 'No encontrada.',
    invalid: 'Código inválido.',
    queued_offline: 'Guardado en el teléfono. Falta señal.',
    wrong_zone: 'No abre esta zona.',
    not_yet_valid: 'Todavía no está vigente.',
    expired: 'Ya venció.',
    service_unavailable: 'Sin conexión. No se pudo validar.',
    session_expired: 'La sesión del puesto venció.',
    not_in_allowlist: 'No está en la lista de este teléfono.',
    door_malformed: 'El código de puerta son seis signos.',
    rate_limited: 'Demasiados intentos. Esperá un momento.',
  },
  en: {
    ready: 'May enter.',
    checked_in: 'Entry recorded.',
    already_used: 'Already inside.',
    not_ready: 'Not eligible.',
    no_registration: 'No registration for this event.',
    not_found: 'Not found.',
    invalid: 'Invalid code.',
    queued_offline: 'Saved on this phone. No signal.',
    wrong_zone: 'Does not open this zone.',
    not_yet_valid: 'Not valid yet.',
    expired: 'Expired.',
    service_unavailable: 'No connection. Could not validate.',
    session_expired: 'This station session expired.',
    not_in_allowlist: 'Not in the list on this phone.',
    door_malformed: 'The door code is six characters.',
    rate_limited: 'Too many attempts. Wait a moment.',
  },
}

export function checkinVerdictUtterance({ outcome, name, credentialLabel, locale = 'es' } = {}) {
  const english = String(locale).toLowerCase().startsWith('en')
  const table = english ? VERDICT.en : VERDICT.es
  const verdict = table[outcome]
  if (!verdict) return ''
  const who = publicSpokenName(name)
  const entry = String(credentialLabel ?? '').trim()
  const safeEntry = entry && !/\d{4,}/.test(entry) ? entry : ''
  return [who, safeEntry, verdict].filter(Boolean).join('. ')
}

/** Canta la entrada: nombre de pila y veredicto. No dice documento ni el código. */
export function announceCheckinVerdict(details, { locale = 'es' } = {}) {
  return speak(checkinVerdictUtterance({ ...details, locale }), { locale })
}

/** Canta el XXX-XXX. Es un gesto explícito. */
export function speakDoorCode(code) {
  return speak(gateCodeUtterance(code), { locale: 'es', force: true })
}

export function speechInputSupported() {
  if (typeof window === 'undefined') return false
  return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)
}

export function listenForDoorUtterance({ onUtterance, onEnd, onError }) {
  if (typeof window === 'undefined') return null
  const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!Ctor) return null
  const recognition = new Ctor()
  recognition.lang = 'es-AR'
  recognition.interimResults = true
  recognition.continuous = false
  recognition.maxAlternatives = 3
  recognition.onresult = (event) => {
    let best = ''
    for (let index = 0; index < event.results.length; index += 1) {
      const row = event.results[index]
      const alternatives = []
      for (let alt = 0; alt < row.length; alt += 1) alternatives.push(row[alt]?.transcript ?? '')
      const chosen = alternatives.sort((left, right) => right.length - left.length)[0] ?? ''
      best = `${best} ${chosen}`.trim()
    }
    const last = event.results[event.results.length - 1]
    onUtterance?.(best, Boolean(last?.isFinal))
  }
  recognition.onerror = (event) => onError?.(event?.error ?? 'unknown')
  recognition.onend = () => onEnd?.()
  return {
    start() {
      recognition.start()
    },
    stop() {
      recognition.stop()
    },
  }
}
