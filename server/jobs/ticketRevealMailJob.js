import { resolveDeploymentAppUrl } from '../lib/deploymentEnvironment.js'
import { logger } from '../lib/logger.js'
import { isMissingRelation, isMissingSchemaColumn } from '../lib/supabaseRpc.js'
import { createBrevoAdapter } from '../modules/notifications/brevoAdapter.js'
import { createEmailDispatcher } from '../modules/notifications/emailDispatcher.js'
import { createSupabaseNotificationRepository } from '../modules/notifications/supabaseNotificationRepository.js'
import {
  buildTicketConfirmationDelivery,
  listMailablePasses,
  ticketRevealMailSettled,
} from '../modules/notifications/ticketConfirmationMail.js'
import { signTicketOpenKey } from '../modules/ticketing/ticketOpenLink.js'
import { partitionTicketsByReveal } from '../../src/lib/ticketReveal.js'

/**
 * Manda el QR cuando la entrada ya se puede ver.
 *
 * La confirmación de compra, si la vigencia todavía no abrió la ventana,
 * sale sin PNG. Este job recorre sólo órdenes aprobadas que ya tienen al
 * menos un pase visible y `pass_revealed_at` vacío. Al cubrir todos los
 * pases de la orden, marca la fila para no repetir el mail.
 *
 * Intervalo en proceso (5 min) cuando Express queda residente. En Vercel
 * Hobby el cron es diario, igual que el resto: el sitio muestra el QR en
 * hora aunque el mail tarde hasta la próxima corrida.
 */

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000
const DEFAULT_BATCH_SIZE = 40

const DUE_ORDER_SELECT = `
  id, buyer_name, buyer_email, reference, status, updated_at, event_id,
  event:events(id, title, slug, starts_at, venue, ticket_reveal_lead_minutes),
  tickets(
    id, ticket_code, qr_token, gate_code, attendee_name, status,
    credential_label, is_primary_credential, valid_from, valid_until,
    ticket_types(name)
  )
`

export function ticketRevealIdempotencyKey(orderId, ticketIds = []) {
  const ids = [...ticketIds].map(String).sort().join(',')
  return `email:ticket-reveal:${orderId}:${ids}`
}

export async function loadDueTicketRevealOrders(client, { limit = DEFAULT_BATCH_SIZE } = {}) {
  const claimed = await client.rpc('list_ticket_orders_pending_reveal', { p_limit: limit })
  if (claimed.error) {
    if (isMissingRelation(claimed.error) || isMissingSchemaColumn(claimed.error)) return null
    throw claimed.error
  }
  const ids = (claimed.data ?? []).map((row) => row?.id ?? row).filter(Boolean)
  if (ids.length === 0) return []
  const rows = await client.from('ticket_orders').select(DUE_ORDER_SELECT).in('id', ids)
  if (rows.error) {
    if (isMissingSchemaColumn(rows.error)) return null
    throw rows.error
  }
  return rows.data ?? []
}

export async function markTicketOrderPassRevealed(client, orderId, now = new Date()) {
  if (!client || !orderId) return
  const result = await client
    .from('ticket_orders')
    .update({ pass_revealed_at: now.toISOString() })
    .eq('id', orderId)
    .is('pass_revealed_at', null)
  if (result.error && !isMissingSchemaColumn(result.error)) {
    logger.warn('ticket.reveal_mark_failed', { err: result.error, orderId })
  }
}

export async function runTicketRevealMailJob({
  client,
  env = process.env,
  now = new Date(),
  appUrl = resolveDeploymentAppUrl(env),
  loadDueOrders = loadDueTicketRevealOrders,
  markRevealed = markTicketOrderPassRevealed,
  sendDelivery = null,
} = {}) {
  if (!client && !loadDueOrders) {
    throw new Error('Supabase no está configurado para habilitar entradas.')
  }

  const orders = await loadDueOrders(client, { limit: Number(env.TICKET_REVEAL_BATCH_SIZE) || DEFAULT_BATCH_SIZE })
  if (orders == null) return { processed: 0, sent: 0, skipped: true }

  const deliver =
    sendDelivery ??
    (async (delivery) => {
      const repository = client ? createSupabaseNotificationRepository(client) : null
      const brevo = createBrevoAdapter({ env })
      if (!brevo.configured) return { status: 'skipped', created: false }
      return createEmailDispatcher({ repository, brevo, env }).send('ticket_confirmation', delivery)
    })

  let sent = 0
  for (const order of orders) {
    const event = order.event ?? null
    const tickets = listMailablePasses(order.tickets)
    const split = partitionTicketsByReveal(tickets, event, now)
    if (split.visible.length === 0) {
      if (split.revealComplete) await markRevealed(client, order.id, now)
      continue
    }

    const delivery = await buildTicketConfirmationDelivery({
      order,
      tickets,
      event,
      appUrl,
      now,
      openKey: order.reference ? signTicketOpenKey(order.reference) : null,
      idempotencyKey: ticketRevealIdempotencyKey(
        order.id,
        split.visible.map((entry) => entry.ticket.id),
      ),
    })
    if (!delivery) continue

    try {
      const result = await deliver(delivery)
      if (!ticketRevealMailSettled(result)) continue
      if (result.status === 'sent') sent += 1
      if (delivery.revealComplete) await markRevealed(client, order.id, now)
    } catch (error) {
      logger.error('ticket.reveal_mail_failed', { err: error, orderId: order.id })
    }
  }

  return { processed: orders.length, sent, skipped: false }
}

export function startTicketRevealMailJob({ client, env = process.env } = {}) {
  if (env.TICKET_REVEAL_JOB_ENABLED === 'false' || !client) return null

  const run = () =>
    runTicketRevealMailJob({ client, env }).catch((error) =>
      logger.error('ticket.reveal_job_failed', { err: error }),
    )

  void run()
  const intervalMs = Number(env.TICKET_REVEAL_JOB_INTERVAL_MS) || DEFAULT_INTERVAL_MS
  const timer = setInterval(run, Math.max(60_000, intervalMs))
  timer.unref()
  return timer
}
