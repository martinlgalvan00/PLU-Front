import { PRIMARY_ORGANIZATION_ID } from '../../lib/organizations.js'
import { assertSupabaseResult, requireSupabaseClient } from '../../lib/supabaseRpc.js'

function nowIso() {
  return new Date().toISOString()
}

export function createSupabaseRegistrationAccessRepository(
  client,
  { organizationId = PRIMARY_ORGANIZATION_ID } = {},
) {
  requireSupabaseClient(client)

  const rpc = async (name, args, fallback) =>
    assertSupabaseResult(await client.rpc(name, args), fallback)

  return {
    list: () => rpc('staff_get_registration_access_gates', {}, 'No se pudieron leer las tandas de habilitación.'),

    save: (gate, actor) =>
      rpc(
        'staff_upsert_registration_access_gate',
        { p_gate: gate, p_actor: actor },
        'No se pudo guardar la tanda de habilitación.',
      ),

    remove: (gateId, actor) =>
      rpc(
        'staff_delete_registration_access_gate',
        { p_gate_id: gateId, p_actor: actor },
        'No se pudo eliminar la tanda de habilitación.',
      ),

    async findActiveGate({ scope, eventSlug = null }) {
      const current = nowIso()
      let query = client
        .from('registration_access_gates')
        .select('id, code_hash, scope, event_id, label')
        .eq('organization_id', organizationId)
        .eq('scope', scope)
        .eq('active', true)
        .not('code_hash', 'is', null)
        .or(`starts_at.is.null,starts_at.lte.${current}`)
        .or(`ends_at.is.null,ends_at.gt.${current}`)

      if (scope === 'membership') {
        query = query.is('event_id', null)
      } else {
        const event = assertSupabaseResult(
          await client
            .from('events')
            .select('id')
            .eq('organization_id', organizationId)
            .eq('slug', eventSlug)
            .maybeSingle(),
          'No se pudo validar el evento.',
        )
        if (!event) return null
        query = query.eq('event_id', event.id)
      }

      return assertSupabaseResult(await query.maybeSingle(), 'No se pudo validar la tanda de habilitación.')
    },

    recordUse: ({ gate, athleteId, orderId, concept }) =>
      assertSupabaseResult(
        client.from('domain_audit_logs').insert({
          organization_id: organizationId,
          action: 'registration_access_gate.used',
          entity_type: 'registration_access_gate',
          entity_id: gate.id,
          actor_type: 'athlete',
          actor_id: athleteId,
          metadata: { orderId, concept, scope: gate.scope, label: gate.label },
        }),
        'No se pudo auditar la habilitación.',
      ),
  }
}
