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
  }
}
