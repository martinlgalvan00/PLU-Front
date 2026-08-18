import { getSupabaseAdmin } from './supabaseAdmin.js'

export const PLATFORM_LAUNCH_EVENT_SLUG = 'pitbull-classic-2026'

/**
 * Fecha de apertura de cobros/inscripción administrada en el panel del evento.
 * Preferimos Pitbull Classic; si no hay, el destacado publicado.
 */
export async function resolvePlatformRegistrationOpensAt(client = getSupabaseAdmin()) {
  if (!client?.from) return null

  try {
    const { data: pitbull, error: pitbullError } = await client
      .from('events')
      .select('registration_opens_at, slug, published, rules')
      .eq('slug', PLATFORM_LAUNCH_EVENT_SLUG)
      .maybeSingle()

    if (pitbullError) {
      console.error(
        '[registrationSchedule] fallo la lectura del evento de lanzamiento',
        pitbullError.message,
      )
    } else if (pitbull?.registration_opens_at) {
      return String(pitbull.registration_opens_at)
    }

    const { data: rows, error } = await client
      .from('events')
      .select('registration_opens_at, published, rules')
      .eq('published', true)
      .not('registration_opens_at', 'is', null)
      .order('starts_at', { ascending: true })
      .limit(30)

    if (error) {
      console.error('[registrationSchedule] fallo la lectura del evento destacado', error.message)
      return null
    }
    if (!Array.isArray(rows) || rows.length === 0) return null

    const featured = rows.find((row) => row?.rules?.featured === true)
    const chosen = featured ?? rows[0]
    return chosen?.registration_opens_at ? String(chosen.registration_opens_at) : null
  } catch (err) {
    console.error(
      '[registrationSchedule] excepcion resolviendo la apertura de cobros de plataforma',
      err?.message ?? err,
    )
    return null
  }
}

/**
 * Fecha de apertura de un evento puntual (inscripción/entrada/combo ligados a
 * ese evento). A diferencia de `resolvePlatformRegistrationOpensAt`, nunca cae
 * a otro evento: si este no tiene fecha, el checkout de ese evento queda
 * cerrado en producción.
 */
export async function resolveEventRegistrationOpensAt(
  client,
  { eventId = null, eventSlug = null } = {},
) {
  if (!client?.from || (!eventId && !eventSlug)) return null

  try {
    let query = client.from('events').select('registration_opens_at')
    query = eventId ? query.eq('id', eventId) : query.eq('slug', eventSlug)
    const { data, error } = await query.maybeSingle()
    if (error) {
      console.error(
        '[registrationSchedule] fallo la lectura de apertura del evento',
        eventId ?? eventSlug,
        error.message,
      )
      return null
    }
    if (!data) return null
    return data.registration_opens_at ? String(data.registration_opens_at) : null
  } catch (err) {
    console.error(
      '[registrationSchedule] excepcion resolviendo apertura del evento',
      eventId ?? eventSlug,
      err?.message ?? err,
    )
    return null
  }
}

export function hasRegistrationOpensAtPassed(opensAt, now = new Date()) {
  if (!opensAt) return false
  const ms = new Date(opensAt).getTime()
  if (!Number.isFinite(ms)) return false
  const nowMs = now instanceof Date ? now.getTime() : Number(now)
  return nowMs >= ms
}
