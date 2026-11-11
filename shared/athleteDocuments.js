/**
 * Completitud del legajo de documentos para afiliarse / inscribirse.
 * Vive en shared/ para que UI y API usen la misma regla.
 */

export const ATHLETE_DOCUMENT_KINDS = [
  'dni_front',
  'dni_back',
  'medical_certificate',
  'minor_authorization',
]

export const REQUIRED_ATHLETE_DOCUMENT_KINDS = ['dni_front', 'dni_back', 'medical_certificate']

export const ATHLETE_DOCUMENT_KIND_LABELS = {
  dni_front: 'DNI frente',
  dni_back: 'DNI dorso',
  medical_certificate: 'certificado médico',
  minor_authorization: 'autorización del tutor',
}

export const ATHLETE_DOCUMENT_BUCKET = 'athlete-documents'
export const ATHLETE_DOCUMENT_UPLOAD_MAX_BYTES = 400 * 1024
export const ATHLETE_DOCUMENT_PDF_MAX_BYTES = 200 * 1024

export const ATHLETE_DOCUMENT_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]

export function athleteAgeYears(birthDate, now = new Date()) {
  const stamp = String(birthDate ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(stamp)) return null
  const birth = new Date(`${stamp}T00:00:00`)
  if (Number.isNaN(birth.getTime())) return null
  let age = now.getFullYear() - birth.getFullYear()
  const monthDelta = now.getMonth() - birth.getMonth()
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < birth.getDate())) age -= 1
  return age
}

export function isAthleteMinor(birthDate, now = new Date()) {
  const age = athleteAgeYears(birthDate, now)
  return age != null && age < 18
}

export function requiredDocumentKinds(athlete, { now = new Date() } = {}) {
  const birthDate = athlete?.birthDate ?? athlete?.birth_date
  const kinds = [...REQUIRED_ATHLETE_DOCUMENT_KINDS]
  if (isAthleteMinor(birthDate, now)) kinds.push('minor_authorization')
  return kinds
}

export function documentKindOf(row) {
  return row?.kind ?? null
}

export function isDocumentPackComplete(athlete, documents = athlete?.documents, { now } = {}) {
  const required = requiredDocumentKinds(athlete, { now })
  // `undefined` = el payload todavía no trae el legajo (sesión vieja o fixture
  // de test). Un array vacío sí es "cargó y no hay nada".
  if (documents == null) {
    return {
      complete: true,
      missing: [],
      required,
      filled: 0,
      total: required.length,
      unavailable: true,
    }
  }
  const uploaded = new Set(
    documents.map((row) => documentKindOf(row)).filter((kind) => Boolean(kind)),
  )
  const missing = required.filter((kind) => !uploaded.has(kind))
  return {
    complete: missing.length === 0,
    missing,
    required,
    filled: required.length - missing.length,
    total: required.length,
  }
}

/**
 * Inscripción a evento: las cuentas previas al legajo no se bloquean.
 * Pagar afiliación / combo siempre exige el pack, grandfathered o no.
 */
export function needsDocumentGateForRegistration(athlete) {
  if (!athlete) return true
  return athlete.documentsGrandfathered !== true && athlete.documents_grandfathered !== true
}

export function needsDocumentGate({ athlete, purpose }) {
  if (purpose === 'membership' || purpose === 'combo') return true
  if (purpose === 'registration') return needsDocumentGateForRegistration(athlete)
  return true
}

export function documentPackGate(athlete, documents = athlete?.documents, { purpose, now } = {}) {
  if (!needsDocumentGate({ athlete, purpose })) {
    return { blocked: false, complete: true, missing: [], required: requiredDocumentKinds(athlete, { now }) }
  }
  const pack = isDocumentPackComplete(athlete, documents, { now })
  return {
    blocked: !pack.complete,
    complete: pack.complete,
    missing: pack.missing,
    required: pack.required,
  }
}

export function isSafeAthleteDocumentPath(path, { athleteId = null, kind = null } = {}) {
  const value = String(path ?? '').trim()
  if (!value || value.length > 300) return false
  if (value.includes('..') || value.includes('\\') || value.startsWith('/')) return false
  const parts = value.split('/')
  if (parts.length !== 3) return false
  if (!parts[0] || !parts[1] || !parts[2]) return false
  if (!ATHLETE_DOCUMENT_KINDS.includes(parts[1])) return false
  if (athleteId && parts[0] !== String(athleteId)) return false
  if (kind && parts[1] !== kind) return false
  return true
}
