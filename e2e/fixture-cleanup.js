/**
 * Limpieza de eventos E2E. Las corridas que abortan dejan slugs `e2e-*` en el
 * catálogo público: la página de entradas arma un picker enorme y remonta el
 * checkout cuando llega el listado, pisando el formulario a mitad de un test.
 */
export async function deleteEventsByIds(admin, eventIds) {
  const ids = [...new Set((eventIds ?? []).filter(Boolean))]
  for (const eventId of ids) {
    const { data: tickets } = await admin
      .from('tickets')
      .select('id, order_id')
      .eq('event_id', eventId)
    const ticketIds = (tickets ?? []).map((row) => row.id)
    const orderIds = [...new Set((tickets ?? []).map((row) => row.order_id).filter(Boolean))]
    if (ticketIds.length) {
      await admin.from('check_ins').delete().in('ticket_id', ticketIds)
      await admin.from('tickets').delete().in('id', ticketIds)
    }
    if (orderIds.length) {
      await admin.from('ticket_orders').delete().in('id', orderIds)
    }
    await admin.from('ticket_types').delete().eq('event_id', eventId)
    await admin.from('events').delete().eq('id', eventId)
  }
}

export async function wipeStaleE2eEvents(admin) {
  const { data, error } = await admin.from('events').select('id').like('slug', 'e2e-%')
  if (error) throw new Error(`No se pudieron listar eventos E2E viejos: ${error.message}`)
  await deleteEventsByIds(admin, (data ?? []).map((row) => row.id))
}
