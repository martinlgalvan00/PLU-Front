import { assertSupabaseResult, requireSupabaseClient } from '../../lib/supabaseRpc.js'

export function createSupabasePlatformSettingsRepository(client) {
  requireSupabaseClient(client)

  const rpc = async (name, args, fallback) =>
    assertSupabaseResult(await client.rpc(name, args), fallback)

  return {
    get: () =>
      rpc(
        'staff_get_platform_feature_toggles',
        {},
        'No se pudieron leer los interruptores de la plataforma.',
      ),

    setToggle: (feature, enabled, actor) =>
      rpc(
        'staff_set_platform_feature_toggle',
        { p_feature: feature, p_enabled: enabled, p_actor: actor },
        'No se pudo actualizar el interruptor.',
      ),

    // Una celda de la matriz concepto × canal. Devuelve el payload completo,
    // igual que `setToggle`, así el panel repinta todo con una sola respuesta.
    setPaymentChannel: (concept, channel, enabled, actor) =>
      rpc(
        'staff_set_payment_channel',
        { p_concept: concept, p_channel: channel, p_enabled: enabled, p_actor: actor },
        'No se pudo actualizar el medio de pago.',
      ),
  }
}
