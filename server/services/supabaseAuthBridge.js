import { getSupabaseAdmin, isSupabaseAdminConfigured } from '../lib/supabaseAdmin.js'

// Roles de staff que necesitan poder ejecutar RPCs protegidas por
// is_admin()/can_check_in() (supabase/migrations/20260706021905_bootstrap_auth_profiles.sql,
// 20260706030200_phase1_rpc_functions.sql). athlete_plu queda afuera a
// proposito: las RPCs que usa (register_athlete, create_membership_order,
// create_competition_registration) son intencionalmente publicas, igual
// que create_ticket_order.
const BRIDGED_ROLES = new Set([
  'admin_maximal',
  'admin_plu_arg',
  'operador_plu_arg',
  'viewer_plu_usa',
  'seguridad_plu_arg',
])

async function findSupabaseUserByEmail(admin, email) {
  let page = 1
  const perPage = 200

  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
    if (error) throw error

    const found = data.users.find((user) => user.email?.toLowerCase() === email)
    if (found) return found
    if (data.users.length < perPage) return null

    page += 1
  }
}

async function ensureSupabaseUser(admin, email) {
  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true })
  if (!error) return data.user

  const alreadyExists = error.code === 'email_exists' || /already been registered/i.test(error.message ?? '')
  if (alreadyExists) {
    const existing = await findSupabaseUserByEmail(admin, email)
    if (existing) return existing
  }

  throw error
}

/**
 * Da de alta (si hace falta) un usuario de Supabase Auth + su fila en
 * public.profiles para las cuentas de staff, y devuelve un token de un
 * solo uso que el cliente canjea via supabase.auth.verifyOtp para
 * establecer una sesion real.
 *
 * Sin esto, auth.uid() es siempre null en el navegador (el login de esta
 * app corre sobre Prisma/Auth0, nunca sobre supabase.auth) y ninguna RPC
 * protegida por is_admin()/can_check_in() puede autorizar a nadie -- ni
 * siquiera a un admin real logueado. Best-effort: si Supabase admin no
 * esta configurado o algo falla, se devuelve null y el login normal sigue
 * funcionando igual (la sesion de la app no depende de esto).
 */
export async function ensureSupabaseSessionToken({ email, role }) {
  if (!email || !BRIDGED_ROLES.has(role) || !isSupabaseAdminConfigured()) return null

  const normalizedEmail = email.trim().toLowerCase()
  const admin = getSupabaseAdmin()

  try {
    const user = await ensureSupabaseUser(admin, normalizedEmail)

    const { error: profileError } = await admin.from('profiles').upsert({ id: user.id, role })
    if (profileError) throw profileError

    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: normalizedEmail,
    })
    if (linkError) throw linkError

    const tokenHash = linkData?.properties?.hashed_token
    if (!tokenHash) return null

    return { email: normalizedEmail, tokenHash }
  } catch (error) {
    console.warn('No se pudo preparar la sesion de Supabase Auth para', normalizedEmail, error)
    return null
  }
}
