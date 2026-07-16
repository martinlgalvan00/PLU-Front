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
