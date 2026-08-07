import { HttpError } from './errors.js'

const STATUS_BY_CODE = {
  PLU01: 400,
  PLU02: 404,
  PLU03: 409,
  PLU04: 409,
  PLU05: 409,
  PLU06: 409,
  PLU07: 409,
  PLU08: 409,
  PLU09: 409,
  PLU10: 409,
  PLU11: 409,
  PLU12: 409,
  PLU13: 409,
  '23505': 409,
  '23503': 409,
  '23514': 400,
  '42501': 403,
}

export function assertSupabaseResult(result, fallback = 'No se pudo completar la operacion.') {
  if (!result?.error) return result?.data
  const status = STATUS_BY_CODE[result.error.code] ?? 503
  throw new HttpError(status, result.error.message || fallback, {
    code: result.error.code,
    details: result.error.details,
  })
}

export function requireSupabaseClient(client) {
  if (!client) throw new HttpError(503, 'Supabase Admin no esta configurado.')
  return client
}
