import QRCode from 'qrcode'
import { mapWithConcurrency } from '../../lib/concurrency.js'
import { HttpError } from '../../lib/errors.js'
import { resolveDeploymentAppUrl } from '../../lib/deploymentEnvironment.js'
import { buildEventPagePath } from '../../../src/lib/eventPageRoute.js'

/**
 * eventCredentialNotificationService.js — PLU ARG
 *
 * "Tu credencial para {evento}": el mail que le dice al atleta que ya puede
 * entrar y le deja el QR a mano. La credencial existía (cada atleta tiene su
 * `credential_token` desde el alta), pero ningún mail la mandaba: el atleta
 * llegaba a la puerta sin saber dónde estaba su QR, y una inscripción
 * confirmada a mano desde el panel no avisaba nada.
 *
 * Dos caminos, una sola clave de idempotencia por inscripción:
 *  - al confirmar una inscripción desde el panel (individual o en lote);
 *  - "Enviar credenciales" del evento, a todos los confirmados que todavía
 *    no lo recibieron. Apretarlo dos veces no duplica nada.
 *
 * El QR viaja como adjunto PNG (los clientes de mail bloquean imágenes
 * embebidas en base64) y nunca en los params: el outbox guarda los params
 * para auditoría y el token del QR es una credencial de ingreso.
 */

export const EVENT_CREDENTIAL_EMAIL = 'event_credential'

const REGISTRATION_SELECT =
  'id, status, division, category, athlete:athletes(id, full_name, email, status, credential_token)'
const EVENT_SELECT = 'id, slug, title, starts_at, venue, location, requires_membership'

/**
 * Misma URL que arma `buildAthleteCredentialUrl` en el cliente: la home con
 * `?credencial=`. Se arma acá porque el módulo del cliente depende de
 * `window` para el origen.
 */
export function buildCredentialScanUrl(appUrl, token) {
  const url = new URL(appUrl || 'https://www.powerliftingunited.ar')
  url.searchParams.set('credencial', token)
  return url.toString()
}

async function renderQrPng(text) {
  // Nivel H como el QR del perfil: aguanta brillo bajo y pantallas rayadas.
  return QRCode.toBuffer(text, { errorCorrectionLevel: 'H', margin: 2, width: 640 })
}

function isMembershipCurrent(membership, today) {
  if (membership?.status !== 'activa') return false
  const start = membership.start_date ?? today
  const end = membership.expiration_date ?? null
  return start <= today && Boolean(end) && end >= today
}

function slugifyFileName(value) {
  return String(value ?? 'evento')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function createEventCredentialRepository(client) {
  if (!client) throw new HttpError(503, 'Supabase Admin no está configurado.')

  function rows(result, message) {
    if (result.error) throw new HttpError(503, result.error.message || message)
    return result.data ?? []
  }

  return {
    async findEventBySlug(slug) {
      const result = await client.from('events').select(EVENT_SELECT).eq('slug', slug).maybeSingle()
      if (result.error) throw new HttpError(503, result.error.message)
      return result.data
    },

    async listConfirmedRegistrations(eventId) {
      return rows(
        await client
          .from('event_registrations')
          .select(REGISTRATION_SELECT)
          .eq('event_id', eventId)
          .eq('status', 'confirmada'),
        'No se pudieron leer las inscripciones.',
      )
    },

    async findRegistration(registrationId) {
      const result = await client
        .from('event_registrations')
        .select(`${REGISTRATION_SELECT}, event:events(${EVENT_SELECT})`)
        .eq('id', registrationId)
        .maybeSingle()
      if (result.error) throw new HttpError(503, result.error.message)
      return result.data
    },

    async listMemberships(athleteIds) {
      if (athleteIds.length === 0) return []
      return rows(
        await client
          .from('memberships')
          .select('athlete_id, status, start_date, expiration_date')
          .in('athlete_id', athleteIds)
          .eq('status', 'activa'),
        'No se pudieron leer las afiliaciones.',
      )
    },
  }
}

export function createEventCredentialNotificationService({
  repository,
  dispatcher,
  env = process.env,
  renderQr = renderQrPng,
  now = () => new Date(),
}) {
  const appUrl = (resolveDeploymentAppUrl(env) || env.VITE_APP_URL || '').replace(/\/$/, '')
  const concurrency = Math.max(1, Number(env.EMAIL_BROADCAST_CONCURRENCY) || 8)

  /**
   * Quién puede entrar hoy con su QR: confirmada, con mail y, si el evento
   * pide afiliación, con una vigente. Mismo criterio que
   * `staff_check_in_registration`: no se le dice "ya podés entrar" a quien la
   * puerta va a rechazar.
   */
  async function classify(event, registrations) {
    const today = now().toISOString().slice(0, 10)
    const needsMembership = event.requires_membership !== false
    const currentMembers = new Set()
    if (needsMembership) {
      const ids = [...new Set(registrations.map((row) => row.athlete?.id).filter(Boolean))]
      const memberships = await repository.listMemberships(ids)
      memberships
        .filter((membership) => isMembershipCurrent(membership, today))
        .forEach((membership) => currentMembers.add(membership.athlete_id))
    }

    const ready = []
    let noEmail = 0
    let blocked = 0
    for (const registration of registrations) {
      const athlete = registration.athlete
      if (!athlete?.email || !athlete.credential_token || athlete.status === 'bloqueado') {
        noEmail += 1
        continue
      }
      if (needsMembership && !currentMembers.has(athlete.id)) {
        blocked += 1
        continue
      }
      ready.push(registration)
    }
    return { ready, noEmail, blocked }
  }

  async function sendOne(event, registration, { resend = false } = {}) {
    const athlete = registration.athlete
    const png = await renderQr(buildCredentialScanUrl(appUrl, athlete.credential_token))
    const day = now().toISOString().slice(0, 10)
    const result = await dispatcher.send(EVENT_CREDENTIAL_EMAIL, {
      to: athlete.email,
      toName: athlete.full_name,
      entityType: 'event_registration',
      entityId: registration.id,
      // Una por inscripción. "Reenviar" abre una por día: si alguien perdió el
      // mail se le puede volver a mandar, pero no cada vez que se aprieta.
      idempotencyKey: resend
        ? `email:event-credential:${registration.id}:resend:${day}`
        : `email:event-credential:${registration.id}`,
      attachment: [
        {
          name: `credencial-${slugifyFileName(event.slug ?? event.title)}.png`,
          content: Buffer.from(png).toString('base64'),
        },
      ],
      params: {
        name: athlete.full_name,
        eventTitle: event.title,
        eventDate: event.starts_at ?? '',
        venue: [event.venue, event.location].filter(Boolean).join(' · '),
        division: registration.division ?? '',
        category: registration.category ?? '',
        accountUrl: `${appUrl}/mi-cuenta?section=qr`,
        eventUrl: event.slug ? `${appUrl}${buildEventPagePath(event.slug)}` : '',
      },
    })
    if (result?.created === false) return 'already'
    return result?.status === 'sent' ? 'sent' : result?.status === 'skipped' ? 'skipped' : 'failed'
  }

  async function sendForEvent({ eventSlug, dryRun = false, resend = false }) {
    const event = await repository.findEventBySlug(eventSlug)
    if (!event) throw new HttpError(404, 'El evento no existe.')
    const registrations = await repository.listConfirmedRegistrations(event.id)
    const { ready, noEmail, blocked } = await classify(event, registrations)
    const summary = {
      confirmed: registrations.length,
      ready: ready.length,
      blocked,
      noEmail,
    }
    if (dryRun) return { ...summary, dryRun: true }

    const settled = await mapWithConcurrency(ready, concurrency, (registration) =>
      sendOne(event, registration, { resend }),
    )
    const outcomes = settled.map((item) => (item.status === 'fulfilled' ? item.value : 'failed'))
    const count = (value) => outcomes.filter((outcome) => outcome === value).length
    return {
      ...summary,
      sent: count('sent'),
      already: count('already'),
      skipped: count('skipped'),
      failed: count('failed'),
    }
  }

  /** Al confirmar una inscripción a mano. Best-effort: nunca rompe la confirmación. */
  async function sendForRegistration(registrationId) {
    const registration = await repository.findRegistration(registrationId)
    if (!registration?.event || registration.status !== 'confirmada') return 'skipped'
    const { ready } = await classify(registration.event, [registration])
    if (ready.length === 0) return 'skipped'
    return sendOne(registration.event, registration)
  }

  return { sendForEvent, sendForRegistration }
}
