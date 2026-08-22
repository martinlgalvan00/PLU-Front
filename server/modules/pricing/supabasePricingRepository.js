import { assertSupabaseResult, requireSupabaseClient } from '../../lib/supabaseRpc.js'

export function createSupabasePricingRepository(client) {
  requireSupabaseClient(client)

  const rpc = async (name, args, fallback) =>
    assertSupabaseResult(await client.rpc(name, args), fallback)

  return {
    getConfiguration: () =>
      rpc('staff_get_pricing_configuration', {}, 'No se pudo leer la configuración económica.'),

    getCampaignAnalytics: () =>
      rpc(
        'staff_get_promotion_campaign_analytics',
        {},
        'No se pudo leer el rendimiento de las campañas.',
      ),

    simulatePromotionCode: (codeId) =>
      rpc('staff_simulate_promotion_code', { p_code_id: codeId }, 'No se pudo simular el código.'),

    createPlanVersion: (plan, actor) =>
      rpc(
        'staff_create_membership_plan_version',
        { p_plan: plan, p_actor: actor },
        'No se pudo publicar la nueva versión del plan.',
      ),

    setPlanActive: (planId, active, actor) =>
      rpc(
        'staff_set_membership_plan_active',
        { p_plan_id: planId, p_active: active, p_actor: actor },
        'No se pudo cambiar el estado del plan.',
      ),

    deletePlan: (planId, actor) =>
      rpc(
        'staff_delete_membership_plan',
        { p_plan_id: planId, p_actor: actor },
        'No se pudo eliminar el plan.',
      ),

    setPlanRetirement: (planId, retiresAt, actor) =>
      rpc(
        'staff_set_membership_plan_retirement',
        { p_plan_id: planId, p_retires_at: retiresAt || null, p_actor: actor },
        'No se pudo reprogramar la vigencia del plan.',
      ),

    upsertDiscountCode: (code, actor) =>
      rpc(
        'staff_upsert_discount_code',
        { p_code: code, p_actor: actor },
        'No se pudo guardar el código de descuento.',
      ),

    // Los tres estados de la promoción en una sola RPC. `audience` nulo
    // conserva la actual: apagar y volver a prender no la vuelve pública.
    setDiscountCodeState: (codeId, active, audience, actor) =>
      rpc(
        'staff_set_discount_code_state',
        { p_code_id: codeId, p_active: active, p_audience: audience ?? null, p_actor: actor },
        'No se pudo cambiar el estado de la promoción.',
      ),

    deleteDiscountCode: (codeId, actor) =>
      rpc(
        'staff_delete_discount_code',
        { p_code_id: codeId, p_actor: actor },
        'No se pudo eliminar el código de descuento.',
      ),

  }
}
