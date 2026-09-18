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
 * para el instante del test. `staff_check_in_ticket` y `get_ticket_by_qr_token`
 * (el pre-chequeo de Node lee de ahí) ya no miran `tickets.valid_from/until`
 * -- esas columnas quedan congeladas al emitir la entrada y no se tocan más.
 * La vigencia efectiva sale, siempre en vivo, de
 * `resolve_ticket_type_access_window`, que primero chequea
 * `access_override_enabled`: exactamente el mecanismo de excepción de acceso
 * (staff_set_ticket_access_override) que un test usa para forzar la entrada
 * a vigente sin depender del calendario del tipo de entrada.
 */
export async function markTicketReadyForCheckin(supabaseAdmin, ticketId) {
  const now = Date.now()
  const { error } = await supabaseAdmin
    .from('tickets')
    .update({
      status: 'pagada',
      access_override_enabled: true,
      access_override_valid_from: new Date(now - 60_000).toISOString(),
      access_override_valid_until: new Date(now + 86_400_000).toISOString(),
    })
    .eq('id', ticketId)
  return error
}
