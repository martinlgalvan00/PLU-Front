import { expect, within } from 'storybook/test'
import UsersSection from './UsersSection.jsx'
import { AdminPreviewShell } from './adminPreviewShell.jsx'

/**
 * Usuarios dentro del shell real (sidebar, header y hojas del panel), no solo
 * con `admin.css`. Orden de lectura: barra única (búsqueda, estado, permisos,
 * acción dorada) → padrón compacto.
 */

export default {
  title: 'Admin/Usuarios',
  parameters: { layout: 'fullscreen' },
}

const ACCESS_ROLES = [
  { key: 'plu_arg', name: 'Administrador', active: true, canAssign: true },
  { key: 'seguridad_plu_arg', name: 'Seguridad', active: true, canAssign: true },
  { key: 'finanzas', name: 'Finanzas', active: true, canAssign: true },
]

const USERS = [
  {
    id: 'usr-1',
    name: "Alexis D'Alessandro",
    email: 'maximalstrengthcorp@gmail.com',
    role: 'admin_maximal',
    roleKey: 'admin_maximal',
    status: 'active',
  },
  {
    id: 'usr-2',
    name: 'Martin Galvan',
    email: 'martinlucianogalvan@gmail.com',
    role: 'operador_plu_arg',
    roleKey: 'plu_arg',
    status: 'active',
  },
  {
    id: 'usr-3',
    name: 'Agustin Di Santo',
    email: 'agusdisanto99@gmail.com',
    role: 'admin_maximal',
    roleKey: 'admin_maximal',
    status: 'active',
  },
]

const USERS_MIXED = [
  ...USERS,
  {
    id: 'usr-4',
    name: 'Lucía Fernández',
    email: 'lucia.fernandez@pluarg.com.ar',
    role: 'operador_plu_arg',
    roleKey: 'finanzas',
    status: 'invited',
  },
  {
    id: 'usr-5',
    name: 'Marcos Peralta',
    email: 'marcos.peralta@pluarg.com.ar',
    role: 'seguridad_plu_arg',
    roleKey: 'seguridad_plu_arg',
    status: 'suspended',
  },
  {
    id: 'usr-6',
    name: 'Cuenta de prueba',
    email: 'test@pluarg.com.ar',
    role: 'operador_plu_arg',
    roleKey: 'plu_arg',
    status: 'disabled',
  },
]

function Screen({ users }) {
  return (
    <AdminPreviewShell section="users">
      <UsersSection
        accessRoles={ACCESS_ROLES}
        adminEvents={[]}
        canDeleteUsers
        canManageUsers
        onCreateSecurityUser={async () => ({})}
        onCreateUser={async () => ({})}
        onDeleteUser={async () => ({})}
        onNavigateRoles={() => {}}
        onResetPassword={async () => ({ emailed: true })}
        onUpdateRole={async () => ({})}
        onUpdateStatus={async () => ({})}
        users={users}
      />
    </AdminPreviewShell>
  )
}

export const Padron = {
  render: () => <Screen users={USERS} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText('Martin Galvan')).toBeTruthy()
  },
}

export const ConEstadosMixtos = {
  render: () => <Screen users={USERS_MIXED} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText('Lucía Fernández')).toBeTruthy()
  },
}
