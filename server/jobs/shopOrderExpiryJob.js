import { logger } from '../lib/logger.js'
import { createSupabaseShopOrderRepository } from '../modules/shop/supabaseShopOrderRepository.js'

const DEFAULT_INTERVAL_MS = 10 * 60 * 1000

/**
 * Vence los pedidos de la tienda sin pagar y devuelve su stock al catálogo.
 * Es solo base de datos (una RPC con `for update skip locked`), así que puede
 * correr en varias instancias sin duplicar nada. Opt-out: si no corre, el stock
 * reservado por pedidos abandonados queda trabado, que es peor que el riesgo de
 * dejarlo prendido.
 */
export async function runShopOrderExpiryJob({ client } = {}) {
  if (!client) throw new Error('Supabase no está configurado para vencer pedidos de la tienda.')
  const result = await createSupabaseShopOrderRepository(client).expireOrders()
  if (result?.expired > 0) logger.info('shop.orders_expired', { count: result.expired })
  return result
}

export function startShopOrderExpiryJob({ client, env = process.env } = {}) {
  if (env.SHOP_ORDER_EXPIRY_JOB_ENABLED === 'false' || !client) return null

  const run = () =>
    runShopOrderExpiryJob({ client }).catch((error) =>
      logger.error('shop.order_expiry_job_failed', { err: error }),
    )

  void run()
  const intervalMs = Number(env.SHOP_ORDER_EXPIRY_JOB_INTERVAL_MS) || DEFAULT_INTERVAL_MS
  const timer = setInterval(run, Math.max(60_000, intervalMs))
  timer.unref()
  return timer
}
