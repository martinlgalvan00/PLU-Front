import { getSupabaseAdmin, isSupabaseAdminConfigured } from '../lib/supabaseAdmin.js'
import { getDefaultPermissionsForRole } from '../../src/lib/permissions.js'

// Roles de staff que necesitan poder ejecutar RPCs protegidas por
// is_admin()/can_check_in() (supabase/migrations/20260706021905_bootstrap_auth_profiles.sql,
// 20260706030200_phase1_rpc_functions.sql). athlete_plu queda afuera a
// proposito: las RPCs que usa (register_athlete, create_membership_order,
// create_competition_registration) son intencionalmente publicas, igual
// que create_ticket_order.
const BRIDGED_ROLES = new Set([
  'admin_maximal',
  'admin_plu_arg',
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
function usesDefaultPermissionSet(role, permissions) {
  const defaults = getDefaultPermissionsForRole(role)
  if (defaults.length === 0 || !Array.isArray(permissions)) return false
  return (
    defaults.length === permissions.length &&
    defaults.every((permissionKey) => permissions.includes(permissionKey))
  )
}

export async function ensureSupabaseSessionToken({
  email,
  permissions,
  role,
  admin: injectedAdmin,
  env = process.env,
}) {
  // public.profiles todavía expresa el RBAC histórico. Sólo se entrega una
  // sesión Supabase cuando el rol conserva exactamente esa matriz; un rol
  // configurable o restringido opera exclusivamente a través de Express.
  if (
    !email ||
    !BRIDGED_ROLES.has(role) ||
    !usesDefaultPermissionSet(role, permissions)
  ) return null

  const admin =
    injectedAdmin === undefined
      ? (isSupabaseAdminConfigured(env) ? getSupabaseAdmin() : null)
      : injectedAdmin
  if (!admin?.auth?.admin) return null

  const normalizedEmail = email.trim().toLowerCase()

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
