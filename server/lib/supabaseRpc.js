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
  // Canje de códigos de descuento/promoción: inválido, sin cupo, ya usado por
  // este atleta, con canjes registrados (no se puede borrar) y sin mejora de
  // precio. Son conflictos de negocio con mensaje propio; sin este mapeo caían
  // en el 503 por defecto y el checkout mostraba "el servicio no está
  // disponible" en vez de explicar qué pasó con el código.
  PLU20: 409,
  PLU21: 409,
  PLU22: 409,
  PLU23: 409,
  PLU24: 409,
  // Misma familia, agregados después: todavía no está vigente (PLU25),
  // reservado para otras cuentas (PLU26), es de otra inscripción (PLU27) y no
  // acepta el medio de pago elegido (PLU28, ver
  // 20260908100000_promo_code_mercado_pago_optout). Los tres primeros ya los
  // levantaba la RPC sin mapeo y salían como 503; PLU28 nace mapeado porque el
  // checkout tiene que poder distinguir "código inválido" de "este código no se
  // paga con la pasarela".
  PLU25: 409,
  PLU26: 409,
  PLU27: 409,
  PLU28: 409,
  // La orden abierta que se reanuda no se pudo recotizar con el código de este
  // pedido porque ya tiene comprobante, pago declarado o un intento de pasarela
  // en vuelo (20261019130000). Es un conflicto con salida —completar, cancelar o
  // esperar la revisión—, no una indisponibilidad: sin el mapeo salía como 503 y
  // el checkout decía "el servicio no está disponible" ante un caso que el
  // atleta puede resolver.
  PLU30: 409,
  // Analítica / defensa: input inválido. Varias RPCs levantan estos códigos
  // con `errcode = '22023'` (Postgres) y el mensaje `PLU9x · …`; sin mapeo
  // caían al 503 y el tracker pintaba "servicio no disponible" en consola.
  PLU90: 400,
  PLU91: 400,
  PLU92: 400,
  PLU95: 400,
  PLU96: 400,
  22023: 400,
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

// Violaciones de integridad: unique, foreign key y check. A diferencia de los
// PLU*, que la base levanta con una frase escrita para el atleta, estos traen
// el nombre crudo del constraint -- `duplicate key value violates unique
// constraint "event_registrations_event_id_athlete_id_key"`. Eso ya se mostro
// tal cual en el checkout de Pitbull. Cuando pasa, el unico texto presentable
// es el fallback en castellano que aporta cada call site; el mensaje de
// Postgres viaja en `details` para que quede en el log del errorHandler y no
// en la pantalla.
const RAW_INTEGRITY_CODES = new Set(['23505', '23503', '23514'])
const PLU_CODE_IN_MESSAGE = /\b(PLU\d{2})\b/

/**
 * PostgREST a veces devuelve el `errcode` de Postgres (`22023`) aunque el
 * mensaje ya traiga el código de producto (`PLU91 · …`). Preferimos el PLU
 * del mensaje cuando el code crudo no tiene mapeo propio.
 */
function resolveErrorCode(error) {
  const rawCode = error?.code != null ? String(error.code) : null
  if (rawCode && STATUS_BY_CODE[rawCode] != null) return rawCode
  const fromMessage = String(error?.message ?? '').match(PLU_CODE_IN_MESSAGE)
  if (fromMessage && STATUS_BY_CODE[fromMessage[1]] != null) return fromMessage[1]
  return rawCode
}

export function assertSupabaseResult(result, fallback = 'No se pudo completar la operacion.') {
  if (!result?.error) return result?.data
  const code = resolveErrorCode(result.error)
  const status = STATUS_BY_CODE[code] ?? 503
  const raw = result.error.message
  const leaksConstraintName = RAW_INTEGRITY_CODES.has(String(code))
  throw new HttpError(status, (!leaksConstraintName && raw) || fallback, {
    code,
    details: result.error.details,
    ...(leaksConstraintName && raw ? { raw } : {}),
  })
}

export function requireSupabaseClient(client) {
  if (!client) throw new HttpError(503, 'Supabase Admin no esta configurado.')
  return client
}
