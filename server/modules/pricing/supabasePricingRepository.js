import { assertSupabaseResult, requireSupabaseClient } from '../../lib/supabaseRpc.js'

export function createSupabasePricingRepository(client) {
  requireSupabaseClient(client)

  const rpc = async (name, args, fallback) =>
    assertSupabaseResult(await client.rpc(name, args), fallback)

  return {
    getWiseCatalogPrices: async () => {
      const [plans, events] = await Promise.all([
        assertSupabaseResult(await client.from('membership_plans').select('id, wise_price'), 'No se pudieron leer los precios Wise de afiliaciones.'),
        assertSupabaseResult(await client.from('events').select('slug, wise_price'), 'No se pudieron leer los precios Wise de inscripciones.'),
      ])
      return { plans, events }
    },
    setMembershipPlanWisePrice: (planId, wisePrice, actor) =>
      rpc('staff_set_membership_plan_wise_price', { p_plan_id: planId, p_wise_price: wisePrice ?? null, p_actor: actor }, 'No se pudo cambiar el precio Wise de la afiliacion.'),
    setEventRegistrationWisePrice: (eventSlug, wisePrice, actor) =>
      rpc('staff_set_event_registration_wise_price', { p_event_slug: eventSlug, p_wise_price: wisePrice ?? null, p_actor: actor }, 'No se pudo cambiar el precio Wise de la inscripcion.'),
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

    // El historial de canjes de un código: quién lo usó, cuándo y sobre qué
    // orden. Lectura directa y no RPC: es un SELECT plano sin reglas de
    // negocio sobre una tabla que solo service_role puede leer, y una función
    // versionada no agregaría ninguna garantía. Atleta y orden entran por sus
    // FK, así que PostgREST arma el join solo.
    listDiscountCodeRedemptions: async (codeId) =>
      assertSupabaseResult(
        await client
          .from('discount_code_redemptions')
          .select(
            'id, discount_amount, created_at, athlete:athletes(id, full_name, email), order:athlete_payment_orders(id, status, amount, currency, method, concept, created_at)',
          )
          .eq('discount_code_id', codeId)
          .order('created_at', { ascending: false })
          .limit(200),
        'No se pudo leer el historial de canjes.',
      ),

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

    // El precio de inscripción, ahora o desde una fecha. `effectiveAt` vacío
    // aplica en el momento; con fecha futura el cambio queda programado y lo
    // corre el barrido de pg_cron cada minuto.
    setEventRegistrationPrice: (eventSlug, { price, manualPrice, effectiveAt }, actor) =>
      rpc(
        'staff_set_event_registration_price',
        {
          p_event_slug: eventSlug,
          p_price: price,
          p_manual_price: manualPrice ?? null,
          p_effective_at: effectiveAt || null,
          p_actor: actor,
        },
        'No se pudo cambiar el precio de la inscripción.',
      ),

    clearEventRegistrationPriceSchedule: (eventSlug, actor) =>
      rpc(
        'staff_clear_event_registration_price_schedule',
        { p_event_slug: eventSlug, p_actor: actor },
        'No se pudo cancelar el cambio de precio programado.',
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
