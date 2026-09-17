import { createClient } from '@supabase/supabase-js'

/**
 * Cliente service_role real contra la instancia de Supabase apuntada por
 * SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY (típicamente local, `supabase
 * start`) — es lo mismo que `getSupabaseAdmin()` en server/lib/supabaseAdmin.js,
 * pero construido directo acá para no depender de que esas env vars ya
 * estén leídas en el momento en que ese módulo se importó.
 */
export function createSupabaseTestClient() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export function listen(app) {
  const server = app.listen(0)
  const { port } = server.address()
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  }
}

/**
 * Fixture de puerta: saltea comprobante/aprobación y abre la vigencia del QR
 * para el instante del test. `staff_check_in_ticket` (y el pre-chequeo de
 * Node) rechazan con 409/PLU14 si `now` está antes de `valid_from`. Un evento
 * futuro —necesario para que el POST de la orden no cierre por transferencia—
 * congela esa ventana al emitir, así que un test que compra hoy y escanea hoy
 * tiene que reabrirla.
 */
export async function markTicketReadyForCheckin(supabaseAdmin, ticketId) {
  const now = Date.now()
  const { error } = await supabaseAdmin
    .from('tickets')
    .update({
      status: 'pagada',
      valid_from: new Date(now - 60_000).toISOString(),
      valid_until: new Date(now + 86_400_000).toISOString(),
    })
    .eq('id', ticketId)
  return error
}
