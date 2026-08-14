import { assertSupabaseResult, requireSupabaseClient } from '../../lib/supabaseRpc.js'

export function createSupabasePricingRepository(client) {
  requireSupabaseClient(client)

  const rpc = async (name, args, fallback) =>
    assertSupabaseResult(await client.rpc(name, args), fallback)

  return {
    getConfiguration: () =>
      rpc('staff_get_pricing_configuration', {}, 'No se pudo leer la configuración económica.'),

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

    upsertComboOffer: (eventSlug, offer, actor) =>
      rpc(
        'staff_save_event_combo_offer',
        { p_event_slug: eventSlug, p_offer: offer, p_actor: actor },
        'No se pudo guardar la oferta combo.',
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

    setDiscountCodeActive: (codeId, active, actor) =>
      rpc(
        'staff_set_discount_code_active',
        { p_code_id: codeId, p_active: active, p_actor: actor },
        'No se pudo cambiar el estado del código de descuento.',
      ),
  }
}
