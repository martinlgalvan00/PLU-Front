import { generateId } from '../lib/format.js'

/**
 * userService.js — PLU ARG
 *
 * Cuentas del panel administrativo (no atletas): quién puede entrar al
 * panel y con qué rol. Vive en el mismo localStorage que el resto de la
 * demo — no hay todavía un backend de autenticación multiusuario real
 * (los logins admin/seguridad de hoy son sesiones demo hardcodeadas en
 * useAppData.login), pero este listado es la base para asignar el rol
 * "seguridad" a alguien y, más adelante, conectarlo a cuentas reales.
 */

const initialUsers = [
  {
    id: 'usr-001',
    name: 'Admin Demo',
    email: 'demo@pluarg.com.ar',
    role: 'admin_plu_arg',
    status: 'active',
  },
  {
    id: 'usr-002',
    name: 'Juan Portero',
    email: 'juan.portero@pluarg.com.ar',
    role: 'seguridad_plu_arg',
    status: 'active',
  },
]

export function getInitialUsers(storedUsers) {
  return storedUsers?.length ? storedUsers : initialUsers
}

export function updateUserRole(users, userId, role) {
  return users.map((user) => (user.id === userId ? { ...user, role, roleKey: role } : user))
}

/**
 * Cuentas cuyo rol se puede cambiar en lote: el Super Admin no se modifica
 * desde el panel y Seguridad se asigna por evento. El servidor vuelve a
 * validarlo; esto sólo evita ofrecer lo que sabemos que va a fallar.
 */
export function isBulkRoleTarget(user) {
  return Boolean(user) && user.role !== 'admin_maximal' && user.role !== 'seguridad_plu_arg'
}

/** Aplica sobre el padrón local los resultados `updated` de un cambio en lote. */
export function mergeBulkRoleResults(users, results = []) {
  const updatedById = new Map(
    results
      .filter((item) => item.status === 'updated' && item.user)
      .map((item) => [item.userId, item.user]),
  )
  return users.map((user) => updatedById.get(user.id) ?? user)
}

/** Cuenta los resultados y deja a mano las cuentas que fallaron, con su motivo. */
export function summarizeBulkRoleResults(results = []) {
  const summary = { total: results.length, updated: 0, unchanged: 0, failed: [] }
  for (const item of results) {
    if (item.status === 'updated') summary.updated += 1
    else if (item.status === 'unchanged') summary.unchanged += 1
    else summary.failed.push({ userId: item.userId, error: item.error ?? '' })
  }
  return summary
}

/** Sesión demo: mismo contrato que el endpoint, sobre el padrón local. */
export function bulkUpdateUserRole(users, userIds, roleKey) {
  const results = userIds.map((userId) => {
    const user = users.find((item) => item.id === userId)
    if (!user) return { userId, status: 'failed', error: 'El usuario no existe.' }
    if (!isBulkRoleTarget(user)) {
      return { userId, status: 'failed', error: 'No se puede cambiar el rol de esta cuenta.' }
    }
    if ((user.roleKey ?? user.role) === roleKey) return { userId, status: 'unchanged', user }
    return { userId, status: 'updated', user: { ...user, role: roleKey, roleKey } }
  })
  return { users: mergeBulkRoleResults(users, results), results }
}

export function updateUserStatus(users, userId, status) {
  return users.map((user) => (user.id === userId ? { ...user, status } : user))
}

export function deleteUser(users, userId) {
  return users.filter((user) => user.id !== userId)
}

export function createUser(users, { name, email, role }) {
  const user = {
    id: generateId('usr', users.length + 1),
    name: name.trim(),
    email: email.trim().toLowerCase(),
    role,
    roleKey: role,
    status: 'active',
  }
  return [user, ...users]
}
