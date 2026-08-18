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
  23505: 409,
  23503: 409,
  23514: 400,
  42501: 403,
  // Objeto ausente -- tabla, columna o funcion que el codigo pide y la base no
  // tiene. No es indisponibilidad: es una migracion sin aplicar en el entorno
  // desplegado. Sin este mapeo caian en el 503 por defecto y el frontend los
  // mostraba como "el servicio no esta disponible, reintenta en unos segundos",
  // que manda a esperar cuando lo que corresponde es `supabase db push`. Ya
  // paso en produccion: `admin_queue_dismissals` y `event_registrations
  // .public_visible` dejaron el panel entero con 503 mientras la API estaba
  // sana. Como 500 quedan del lado de los bugs de deploy, que es donde se
  // buscan, y el `code` viaja en el cuerpo para identificar el objeto.
  PGRST202: 500,
  PGRST203: 500,
  PGRST204: 500,
  PGRST205: 500,
  '42P01': 500,
  42703: 500,
  42883: 500,
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
