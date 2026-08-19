import { createHash, randomBytes } from 'node:crypto'
import { HttpError } from '../../lib/errors.js'
import { assertSupabaseResult, requireSupabaseClient } from '../../lib/supabaseRpc.js'
import { PROOF_BUCKET } from '../../lib/supabaseAdmin.js'

const hash = (value) => createHash('sha256').update(value).digest('hex')
const ORDER_ACCESS_SELECT = 'id,provider'
const PENDING_MANUAL_ORDER_SELECT = `
  id, event_id, buyer_name, buyer_email, buyer_phone, amount, currency,
  provider, manual_payment_channel, status, reference, payment_proof_path,
  payment_proof_uploaded_at, created_at, updated_at,
  event:events(slug,title),
  tickets(attendee_name,attendee_dni)
`

export function createSupabaseTicketRepository(client) {
  requireSupabaseClient(client)
  const rpc = async (name, args, fallback) =>
    assertSupabaseResult(await client.rpc(name, args), fallback)

  async function requireOrderAccess(orderId, accessToken) {
    if (!accessToken) throw new HttpError(401, 'Falta el token de acceso de la orden.')
    const order = assertSupabaseResult(
      await client
        .from('ticket_orders')
        .select(ORDER_ACCESS_SELECT)
        .eq('id', orderId)
        .eq('access_token_hash', hash(accessToken))
        .maybeSingle(),
      'No se pudo validar la orden.',
    )
    if (!order) throw new HttpError(403, 'Token de orden invalido.')
    return order
  }

  return {
    async createOrder(data) {
      const accessToken = data.accessToken ?? randomBytes(32).toString('base64url')
      const result = await rpc(
        'create_ticket_order_v2',
        {
          p_event_slug: data.eventSlug,
          p_attendees: data.attendees,
          p_buyer: {
            ...data.buyer,
            provider: data.provider,
            manualPaymentChannel: data.manualPaymentChannel ?? null,
            wiseAmount: data.wiseAmount ?? null,
            wiseCurrency: data.wiseCurrency ?? null,
          },
          p_idempotency_key: data.idempotencyKey,
          p_access_token_hash: hash(accessToken),
        },
        'No se pudo crear la orden de entradas.',
      )
      return { ...result, orderAccessToken: accessToken }
    },
    verify: (qrToken) =>
      rpc('get_ticket_by_qr_token', { p_qr_token: qrToken }, 'No se pudo verificar la entrada.'),
    availability: (eventSlug) =>
      rpc(
        'get_event_ticket_availability',
        { p_event_slug: eventSlug },
        'No se pudo consultar la disponibilidad.',
      ),
    listForEvent: (eventSlug) =>
      rpc(
        'staff_list_tickets_for_event',
        { p_event_slug: eventSlug },
        'No se pudieron listar las entradas.',
      ),
    allowlist: (eventSlug) =>
      rpc(
        'staff_get_event_checkin_allowlist',
        { p_event_slug: eventSlug },
        'No se pudo descargar la lista de ingreso.',
      ),
    checkIn: (qrToken, gate, actor) =>
      rpc(
        'staff_check_in_ticket',
        { p_qr_token: qrToken, p_gate: gate, p_actor: actor },
        'No se pudo registrar el ingreso.',
      ),
    async getRegistrationEventId(registrationId) {
      const registration = assertSupabaseResult(
        await client
          .from('event_registrations')
          .select('event_id')
          .eq('id', registrationId)
          .maybeSingle(),
        'No se pudo validar la inscripcion.',
      )
      if (!registration) throw new HttpError(404, 'Inscripcion no encontrada.')
      return registration.event_id
    },
    checkInRegistration: (registrationId, gate, actor) =>
      rpc(
        'staff_check_in_registration',
        { p_registration_id: registrationId, p_gate: gate, p_actor: actor },
        'No se pudo registrar el ingreso.',
      ),
    redeemAddon: (qrToken, addonId, actor) =>
      rpc(
        'staff_redeem_ticket_addon',
        { p_qr_token: qrToken, p_addon_id: addonId, p_actor: actor },
        'No se pudo canjear el beneficio.',
      ),
    async listPending() {
      const rows = assertSupabaseResult(
        await client
          .from('ticket_orders')
          .select(PENDING_MANUAL_ORDER_SELECT)
          .eq('provider', 'manual')
          .in('status', ['creado', 'pendiente'])
          .order('created_at', { ascending: false }),
        'No se pudieron listar las ordenes pendientes.',
      )
      return rows.map((order) => ({
        order,
        event: order.event,
        ticketCount: order.tickets?.length ?? 0,
        attendees: (order.tickets ?? []).map((ticket) => ({
          name: ticket.attendee_name,
          dni: ticket.attendee_dni,
        })),
      }))
    },
    async approve(orderId, actor) {
      return rpc(
        'staff_approve_ticket_order',
        { p_order_id: orderId, p_actor: actor ?? null },
        'No se pudo aprobar la orden.',
      )
    },
    async reject(orderId, reason, actor) {
      return rpc(
        'reject_ticket_payment_order',
        { p_order_id: orderId, p_reason: reason ?? null, p_actor: actor ?? null },
        'No se pudo rechazar la orden.',
      )
    },
    async createProofUpload(orderId, accessToken, fileName) {
      const order = await requireOrderAccess(orderId, accessToken)
      if (order.provider !== 'manual') throw new HttpError(400, 'La orden no admite comprobante.')
      const safeName = String(fileName)
        .replace(/[^\w.\-()+ ]/g, '_')
        .slice(0, 120)
      const path = `${orderId}/${Date.now()}-${safeName}`
      const signed = assertSupabaseResult(
        await client.storage.from(PROOF_BUCKET).createSignedUploadUrl(path),
        'No se pudo preparar el comprobante.',
      )
      return { path, token: signed.token }
    },
    async registerProof(orderId, accessToken, proofPath) {
      await requireOrderAccess(orderId, accessToken)
      return rpc(
        'register_ticket_payment_proof',
        { p_order_id: orderId, p_proof_path: proofPath },
        'No se pudo registrar el comprobante.',
      )
    },
    async proofUrl(orderId) {
      const order = assertSupabaseResult(
        await client
          .from('ticket_orders')
          .select('payment_proof_path')
          .eq('id', orderId)
          .maybeSingle(),
        'No se pudo leer la orden.',
      )
      if (!order?.payment_proof_path) throw new HttpError(404, 'La orden no tiene comprobante.')
      const signed = assertSupabaseResult(
        await client.storage.from(PROOF_BUCKET).createSignedUrl(order.payment_proof_path, 300),
        'No se pudo abrir el comprobante.',
      )
      return signed.signedUrl
    },
  }
}
