import { createHash, randomBytes } from 'node:crypto'
import { HttpError } from '../../lib/errors.js'
import { assertSupabaseResult, requireSupabaseClient } from '../../lib/supabaseRpc.js'
import { createSupabasePaymentProfileRepository } from '../payments/supabasePaymentProfileRepository.js'
import { mapShopSettingsRow } from './shopCheckout.js'

export const SHOP_PROOF_BUCKET = 'shop-payment-proofs'

const hash = (value) => createHash('sha256').update(value).digest('hex')

const ORDER_COLUMNS = `
  id, reference, status, payment_method, amount, currency, buyer_name, buyer_email,
  expires_at, mercado_pago_profile_id, provider_preference_id, provider_payment_id,
  proof_path, access_token_hash
`

/**
 * Repositorio de pedidos de la tienda. Toda escritura pasa por una RPC
 * `security definer`; las lecturas puntuales usan la tabla con `service_role`.
 */
export function createSupabaseShopOrderRepository(client) {
  requireSupabaseClient(client)
  const rpc = async (name, args, fallback) =>
    assertSupabaseResult(await client.rpc(name, args), fallback)

  async function findOrderRow(orderId) {
    return assertSupabaseResult(
      await client.from('shop_orders').select(ORDER_COLUMNS).eq('id', orderId).maybeSingle(),
      'No se pudo leer el pedido.',
    )
  }

  /** El token es el único "login" del comprador: sin él no se ve ni se toca el pedido. */
  async function requireBuyerOrder(orderId, accessToken) {
    if (!accessToken) throw new HttpError(401, 'Falta el token de acceso del pedido.')
    const row = await findOrderRow(orderId)
    if (!row || row.access_token_hash !== hash(accessToken)) {
      throw new HttpError(403, 'Token de pedido inválido.')
    }
    return row
  }

  return {
    async getSettings(organizationId) {
      const query = client.from('shop_checkout_settings').select('*')
      const row = assertSupabaseResult(
        await (organizationId ? query.eq('organization_id', organizationId) : query).maybeSingle(),
        'No se pudo leer la configuración de cobro.',
      )
      return mapShopSettingsRow(row)
    },

    async saveSettings(data, actor) {
      const row = await rpc(
        'upsert_shop_checkout_settings',
        { p_data: data, p_actor: actor },
        'No se pudo guardar la configuración de cobro.',
      )
      return mapShopSettingsRow(row)
    },

    /** Perfil bancario elegido para la tienda (alias / CBU / titular). */
    async getBankProfile(profileId) {
      if (!profileId) return null
      return createSupabasePaymentProfileRepository(client).findById(profileId)
    },

    async createOrder({ items, buyer, paymentMethod, holdMinutes, mercadoPagoProfileId }) {
      const accessToken = randomBytes(32).toString('base64url')
      const order = await rpc(
        'create_shop_order',
        {
          p_items: items,
          p_buyer: buyer,
          p_payment_method: paymentMethod,
          p_access_token_hash: hash(accessToken),
          p_hold_minutes: holdMinutes,
          p_mercado_pago_profile_id: mercadoPagoProfileId ?? null,
        },
        'No se pudo crear el pedido.',
      )
      return { order, accessToken }
    },

    /** Pedido del comprador (con renglones) tras validar su token. */
    async getBuyerOrder(orderId, accessToken) {
      await requireBuyerOrder(orderId, accessToken)
      return this.getOrderView(orderId)
    },

    getOrderView(orderId) {
      return rpc('get_shop_order', { p_order_id: orderId }, 'No se pudo leer el pedido.')
    },

    /** Datos que el workflow de pago necesita (monto, perfil MP, estado). */
    async getOrderForPayment(orderId) {
      const row = await findOrderRow(orderId)
      if (!row) throw new HttpError(404, 'Pedido no encontrado.')
      return {
        id: row.id,
        kind: 'shop',
        reference: row.reference,
        status: row.status,
        method: row.payment_method,
        amount: row.amount,
        currency: row.currency,
        payerEmail: row.buyer_email,
        buyerName: row.buyer_name,
        expiresAt: row.expires_at,
        mercadoPagoProfileId: row.mercado_pago_profile_id,
        providerPreferenceId: row.provider_preference_id,
      }
    },

    async assertBuyerAccess(orderId, accessToken) {
      return requireBuyerOrder(orderId, accessToken)
    },

    async savePreference(orderId, preferenceId) {
      assertSupabaseResult(
        await client
          .from('shop_orders')
          .update({ provider_preference_id: preferenceId, updated_at: new Date().toISOString() })
          .eq('id', orderId),
        'No se pudo guardar la preferencia de pago.',
      )
    },

    async applyMercadoPagoPayment({ orderId, paymentId, status, amount, currency }) {
      return rpc(
        'apply_shop_mercado_pago_payment',
        {
          p_order_id: orderId,
          p_provider_payment_id: String(paymentId),
          p_status: status,
          p_amount: amount,
          p_currency: currency,
        },
        'No se pudo acreditar el pago del pedido.',
      )
    },

    async createProofUpload(orderId, accessToken, fileName) {
      const order = await requireBuyerOrder(orderId, accessToken)
      if (order.payment_method !== 'bank_transfer') {
        throw new HttpError(400, 'El pedido no admite comprobante.')
      }
      const safeName = String(fileName)
        .replace(/[^\w.\-()+ ]/g, '_')
        .slice(0, 120)
      const path = `${orderId}/${Date.now()}-${safeName}`
      const signed = assertSupabaseResult(
        await client.storage.from(SHOP_PROOF_BUCKET).createSignedUploadUrl(path),
        'No se pudo preparar el comprobante.',
      )
      return { path, token: signed.token }
    },

    async registerProof(orderId, accessToken, proofPath) {
      await requireBuyerOrder(orderId, accessToken)
      return rpc(
        'register_shop_order_proof',
        {
          p_order_id: orderId,
          p_access_token_hash: hash(accessToken),
          p_proof_path: proofPath,
        },
        'No se pudo registrar el comprobante.',
      )
    },

    /** URL temporal para que el staff vea el comprobante (no se expone el bucket). */
    async createProofViewUrl(orderId) {
      const row = await findOrderRow(orderId)
      if (!row?.proof_path) throw new HttpError(404, 'El pedido no tiene comprobante.')
      const signed = assertSupabaseResult(
        await client.storage.from(SHOP_PROOF_BUCKET).createSignedUrl(row.proof_path, 120),
        'No se pudo abrir el comprobante.',
      )
      return signed.signedUrl
    },

    listAdminOrders({ status = null, limit = 100 } = {}) {
      return rpc(
        'list_admin_shop_orders',
        { p_status: status, p_limit: limit },
        'No se pudieron leer los pedidos.',
      )
    },

    approveOrder: (orderId, actor) =>
      rpc(
        'staff_approve_shop_order',
        { p_order_id: orderId, p_actor: actor },
        'No se pudo acreditar el pedido.',
      ),
    cancelOrder: (orderId, actor, reason) =>
      rpc(
        'staff_cancel_shop_order',
        { p_order_id: orderId, p_actor: actor, p_reason: reason ?? null },
        'No se pudo cancelar el pedido.',
      ),
    fulfillOrder: (orderId, actor) =>
      rpc(
        'staff_fulfill_shop_order',
        { p_order_id: orderId, p_actor: actor },
        'No se pudo marcar la entrega.',
      ),
    resolveRefund: (orderId, actor) =>
      rpc(
        'staff_resolve_shop_refund',
        { p_order_id: orderId, p_actor: actor },
        'No se pudo resolver la devolución.',
      ),
    expireOrders: () => rpc('expire_shop_orders', {}, 'No se pudieron vencer los pedidos.'),
  }
}
