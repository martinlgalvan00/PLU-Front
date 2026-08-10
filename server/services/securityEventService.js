/**
 * securityEventService.js — PLU ARG
 *
 * Resolución de eventos de Supabase (public.events, id uuid) para el lado de
 * seguridad. Los eventos son la fuente de verdad en Supabase; la tabla Prisma
 * Event es legacy y no se puebla. Las cuentas seguridad_plu_arg guardan el
 * uuid en User.eventId (sin FK) + eventSlug desnormalizado.
 *
 * Este módulo centraliza esa lectura para que las rutas de auth y el job de
 * ciclo de vida usen exactamente la misma forma normalizada, sin drift.
 */

import { HttpError } from '../lib/errors.js'

// Forma normalizada que consumen resolveAccessLinkExpiry, la notificación de
// credenciales y la clasificación del ciclo de vida.
function normalizeEventRow(row) {
  return { id: row.id, slug: row.slug, title: row.title, endsAt: row.ends_at }
}

/**
 * Un evento por id. Best-effort: devuelve null si el evento no existe o si
 * Supabase no está listo / falla la lectura (mismo contrato que el closure
 * que antes vivía en routes/auth.js — nunca tira).
 * @param {import('@supabase/supabase-js').SupabaseClient | null | undefined} admin
 * @param {string} eventId
 * @returns {Promise<{ id: string, slug: string, title: string, endsAt: string | null } | null>}
 */
export async function fetchSupabaseEvent(admin, eventId) {
  if (!admin || !eventId) return null
  const { data, error } = await admin
    .from('events')
    .select('id, slug, title, ends_at')
    .eq('id', eventId)
    .maybeSingle()
  if (error || !data) return null
  return normalizeEventRow(data)
}

/**
 * Variante estricta para altas: no confunde un evento inexistente con una
 * caída/configuración faltante de Supabase.
 */
export async function requireSupabaseEvent(admin, eventId) {
  if (!admin) throw new HttpError(503, 'Supabase Admin no está configurado.')
  if (!eventId) throw new HttpError(400, 'Elegí un evento.')

  const { data, error } = await admin
    .from('events')
    .select('id, slug, title, ends_at')
    .eq('id', eventId)
    .maybeSingle()

  if (error) {
    throw new HttpError(503, 'No se pudo validar el evento en Supabase.', {
      code: error.code,
      details: error.message,
    })
  }
  if (!data) throw new HttpError(400, 'El evento no existe.')
  return normalizeEventRow(data)
}

/**
 * Varios eventos en una sola query. A diferencia de fetchSupabaseEvent, acá
 * distinguimos "el evento no existe" (no vuelve en el resultado) de "la
 * lectura falló": si Supabase devuelve error, TIRA — el caller (el job) debe
 * abortar la corrida y no borrar nada sobre una lectura fallida.
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {string[]} ids
 * @returns {Promise<Map<string, { id: string, slug: string, title: string, endsAt: string | null }>>}
 */
export async function fetchSupabaseEventsByIds(admin, ids) {
  const uniqueIds = [...new Set(ids)].filter(Boolean)
  if (!admin || uniqueIds.length === 0) return new Map()

  const { data, error } = await admin
    .from('events')
    .select('id, slug, title, ends_at')
    .in('id', uniqueIds)
  if (error) {
    throw new Error(`No se pudieron leer los eventos de seguridad: ${error.message}`)
  }

  return new Map((data ?? []).map((row) => [row.id, normalizeEventRow(row)]))
}
