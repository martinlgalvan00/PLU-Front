import { assertSupabaseResult, requireSupabaseClient } from '../../lib/supabaseRpc.js'

export function createSupabaseAdminQueueRepository(client) {
  requireSupabaseClient(client)

  const rpc = async (name, args, fallback) =>
    assertSupabaseResult(await client.rpc(name, args), fallback)

  return {
    list: () =>
      rpc('staff_get_dismissed_queue_items', {}, 'No se pudieron leer los descartes de la cola.'),

    dismiss: (itemKey, itemType, actor) =>
      rpc(
        'staff_dismiss_queue_item',
        { p_item_key: itemKey, p_item_type: itemType, p_actor: actor },
        'No se pudo descartar este ítem de la cola.',
      ),

    undismiss: (itemKey, actor) =>
      rpc(
        'staff_undismiss_queue_item',
        { p_item_key: itemKey, p_actor: actor },
        'No se pudo restaurar este ítem de la cola.',
      ),
  }
}
