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
  },
  {
    id: 'usr-002',
    name: 'Juan Portero',
    email: 'juan.portero@pluarg.com.ar',
    role: 'seguridad_plu_arg',
  },
]

export function getInitialUsers(storedUsers) {
  return storedUsers?.length ? storedUsers : initialUsers
}

export function updateUserRole(users, userId, role) {
  return users.map((user) => (user.id === userId ? { ...user, role } : user))
}

export function createUser(users, { name, email, role }) {
  const user = {
    id: generateId('usr', users.length + 1),
    name: name.trim(),
    email: email.trim().toLowerCase(),
    role,
  }
  return [user, ...users]
}
