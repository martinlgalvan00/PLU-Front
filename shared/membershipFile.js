/**
 * Ficha mínima para emitir una afiliación.
 * No pide categoría ni peso: eso es de la inscripción a un meet.
 * La fecha de nacimiento sí, porque define si el legajo incluye autorización de tutor.
 */

import { athleteAgeYears } from './athleteDocuments.js'

export const MIN_MEMBERSHIP_AGE = 14

export const MEMBERSHIP_FILE_FIELDS = [
  'fullName',
  'documentId',
  'birthDate',
  'sex',
  'phone',
  'country',
  'province',
  'city',
]

const FIELD_LABELS = {
  fullName: 'nombre y apellido',
  documentId: 'documento',
  birthDate: 'fecha de nacimiento',
  sex: 'sexo',
  phone: 'teléfono',
  country: 'país',
  province: 'provincia',
  city: 'ciudad',
}

function read(athlete, camel, snake) {
  return athlete?.[camel] ?? athlete?.[snake] ?? ''
}

function cleanDocument(value) {
  return String(value ?? '').replace(/[.\-\s]/g, '')
}

function phoneDigits(value) {
  return String(value ?? '').replace(/\D/g, '')
}

/**
 * @param {object | null | undefined} athlete
 * @param {{ now?: Date }} [options]
 * @returns {{ complete: boolean, missing: string[], invalid: string[], labels: string[] }}
 */
export function membershipFileStatus(athlete, { now = new Date() } = {}) {
  const file = {
    fullName: String(read(athlete, 'fullName', 'full_name')).trim(),
    documentId: cleanDocument(read(athlete, 'documentId', 'document_id')),
    birthDate: String(read(athlete, 'birthDate', 'birth_date')).slice(0, 10),
    sex: String(read(athlete, 'sex', 'sex')).trim(),
    phone: String(read(athlete, 'phone', 'phone')).trim(),
    country: String(read(athlete, 'country', 'country')).trim(),
    province: String(read(athlete, 'province', 'province')).trim(),
    city: String(read(athlete, 'city', 'city')).trim(),
  }

  const missing = []
  const invalid = []

  if (file.fullName.length < 3) missing.push('fullName')
  if (!file.documentId) missing.push('documentId')
  else {
    const argentina = file.country === 'Argentina' || !file.country
    const documentOk = argentina
      ? /^\d{7,8}$/.test(file.documentId)
      : file.documentId.length >= 5 && file.documentId.length <= 20
    if (!documentOk) invalid.push('documentId')
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(file.birthDate)) missing.push('birthDate')
  else {
    const age = athleteAgeYears(file.birthDate, now)
    if (age == null || age < MIN_MEMBERSHIP_AGE) invalid.push('birthDate')
  }

  if (file.sex !== 'Masculino' && file.sex !== 'Femenino') missing.push('sex')

  const digits = phoneDigits(file.phone)
  if (!digits) missing.push('phone')
  else if (digits.length < 8 || digits.length > 15) invalid.push('phone')

  if (file.country.length < 2) missing.push('country')
  if (file.province.length < 2) missing.push('province')
  if (file.city.length < 2) missing.push('city')

  const problems = [...missing, ...invalid]
  return {
    complete: problems.length === 0,
    missing,
    invalid,
    labels: problems.map((field) => FIELD_LABELS[field] ?? field),
  }
}
