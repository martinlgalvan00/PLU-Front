import { mapWithConcurrency } from '../../lib/concurrency.js'
import { HttpError } from '../../lib/errors.js'
import { PRIMARY_ORGANIZATION_ID } from '../../lib/organizations.js'
import { buildEventPagePath } from '../../../src/lib/eventPageRoute.js'
import { resolveDeploymentAppUrl } from '../../lib/deploymentEnvironment.js'

/**
 * eventNotificationService.js — PLU ARG
 *
 * Avisos de evento a una audiencia: anuncio de fecha nueva y recordatorio
 * previo a la competencia. Es el único email del sistema que sale a muchos
 * destinatarios a la vez, así que tiene dos cuidados que los transaccionales
 * no necesitan:
 *
 *  - Es opt-out. `event_announcement` y `event_reminder` están marcados con
 *    `optOutAllowed` en el catálogo, así que el dispatcher respeta la lista de
 *    supresión por desuscripción. Los emails llevan link para darse de baja.
 *  - La `idempotencyKey` combina evento, campaña y atleta. Si un operador
 *    aprieta "notificar" dos veces, el segundo intento no manda nada: la clave
 *    ya existe en `transactional_email_logs`.
 *
 * `campaignKey` distingue envíos sucesivos sobre el mismo evento ("apertura de
 * inscripciones", "faltan 7 días"), que sí deben llegar aunque compartan tipo.
 */

const AUDIENCES = Object.freeze(['registered', 'members', 'all_athletes'])

export function createEventAudienceRepository(client, { organizationId = PRIMARY_ORGANIZATION_ID } = {}) {
  if (!client) throw new HttpError(503, 'Supabase Admin no está configurado.')

  function assertResult(result, message) {
    if (result.error) throw new HttpError(503, result.error.message || message)
    return result.data ?? []
  }

  return {
    async findEvent(eventId) {
      const result = await client
        .from('events')
        .select('id, slug, title, starts_at, venue, registration_opens_at')
        .eq('id', eventId)
        .maybeSingle()
      if (result.error) throw new HttpError(503, result.error.message)
      return result.data
    },

    async listRecipients(audience, eventId) {
      if (audience === 'registered') {
        const rows = assertResult(
          await client
            .from('event_registrations')
            .select('athlete:athletes(id, full_name, email, status)')
            .eq('event_id', eventId)
            // Solo quien ya pagó o está confirmado. Una inscripción en
            // borrador todavía no es un compromiso con el evento.
            .in('status', ['pagada', 'confirmada']),
          'No se pudieron leer las inscripciones.',
        )
        return rows.map((row) => row.athlete).filter(Boolean)
      }

      if (audience === 'members') {
        const rows = assertResult(
          await client
            .from('memberships')
            .select('athlete:athletes(id, full_name, email, status)')
            .eq('organization_id', organizationId)
            .eq('status', 'activa'),
          'No se pudieron leer las afiliaciones.',
        )
        return rows.map((row) => row.athlete).filter(Boolean)
      }

      return assertResult(
        await client
          .from('athletes')
          .select('id, full_name, email, status')
          .eq('organization_id', organizationId),
        'No se pudieron leer los atletas.',
      )
    },
  }
}

export function createEventNotificationService({
  audienceRepository,
  notificationRepository,
  dispatcher,
  env = process.env,
}) {
  const appUrl = (resolveDeploymentAppUrl(env) || env.VITE_APP_URL || '').replace(/\/$/, '')
  // 8 en paralelo: cubre una audiencia de ~500 dentro del maxDuration de 60 s
  // de Vercel sin acercarse al 429 de Brevo.
  const concurrency = Math.max(1, Number(env.EMAIL_BROADCAST_CONCURRENCY) || 8)

  return async function notifyEvent({
    eventId,
    audience = 'registered',
    type = 'event_announcement',
    campaignKey,
    summary,
    notes,
    subject,
  }) {
    if (!AUDIENCES.includes(audience)) {
      throw new HttpError(400, `Audiencia desconocida: ${audience}.`)
    }
    if (!['event_announcement', 'event_reminder'].includes(type)) {
      throw new HttpError(400, `Tipo de aviso de evento inválido: ${type}.`)
    }

    const event = await audienceRepository.findEvent(eventId)
    if (!event) throw new HttpError(404, 'El evento no existe.')

    const recipients = await audienceRepository.listRecipients(audience, eventId)
    const campaign = campaignKey ?? type

    const deliverable = recipients.filter((a) => a?.email && a.status !== 'bloqueado')
    let skipped = recipients.length - deliverable.length

    // Una sola consulta para toda la audiencia, en vez de una por destinatario.
    const suppressionCache =
      typeof notificationRepository?.findSuppressions === 'function'
        ? await notificationRepository.findSuppressions(deliverable.map((a) => a.email))
        : undefined

    const params = {
      eventTitle: event.title,
      eventDate: event.starts_at,
      venue: event.venue ?? '',
      registrationOpensAt: event.registration_opens_at ?? '',
      eventUrl: `${appUrl}${buildEventPagePath(event.slug)}`,
      summary: summary ?? '',
      notes: notes ?? '',
    }

    const results = await mapWithConcurrency(deliverable, concurrency, (athlete) =>
      dispatcher.send(type, {
        to: athlete.email,
        toName: athlete.full_name,
        entityType: 'event',
        entityId: event.id,
        idempotencyKey: `email:${campaign}:${event.id}:${athlete.id}`,
        subject,
        suppressionCache,
        params: { ...params, name: athlete.full_name },
      }),
    )

    let sent = 0
    let failed = 0
    for (const [index, result] of results.entries()) {
      if (result.status === 'rejected') {
        failed += 1
        console.warn('[event-notification]', deliverable[index]?.email, result.reason?.message ?? result.reason)
      } else if (result.value?.status === 'sent') {
        sent += 1
      } else {
        skipped += 1
      }
    }

    return {
      event: { id: event.id, title: event.title },
      audience,
      campaign,
      total: recipients.length,
      sent,
      skipped,
      failed,
    }
  }
}

export { AUDIENCES as EVENT_NOTIFICATION_AUDIENCES }
