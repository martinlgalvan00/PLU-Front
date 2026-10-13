import { expect, userEvent, within } from 'storybook/test'
import UsersSection from './UsersSection.jsx'
import { AdminPreviewShell } from './adminPreviewShell.jsx'
import { PREVIEW_ROLES } from './adminPreviewFixtures.js'
import { PERMISSION_CATALOG } from '../../lib/permissions.js'

/**
 * Usuarios dentro del shell real (sidebar, header y hojas del panel), no solo
 * con `admin.css`. Orden de lectura: barra única (búsqueda, estado, permisos,
 * acción dorada) → padrón compacto.
 */

export default {
  title: 'Admin/Usuarios',
  parameters: { layout: 'fullscreen' },
}

// Los mismos roles que "Roles y permisos": traen descripción y permisos, que el
// alta usa para mostrar qué podrá hacer la persona con cada uno.
const ACCESS_ROLES = PREVIEW_ROLES.map((role) => ({ ...role, canAssign: true }))

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
    id: 'usr-7',
    name: 'Invitación pendiente',
    email: 'invitacion-3f9a@pendiente.invalid',
    role: 'operador_plu_arg',
    roleKey: 'finanzas',
    status: 'invited',
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

// Vista con el cruce atletas/panel: último acceso por cuenta y la marca de quien
// también compite. Las fechas son fijas para que la captura no dependa del día.
const USERS_WITH_ACTIVITY = [
  { ...USERS[0], lastLoginAt: '2026-10-13T12:40:00.000Z' },
  { ...USERS[1], lastLoginAt: '2026-10-09T21:05:00.000Z' },
  { ...USERS[2], lastLoginAt: '2026-10-13T15:12:00.000Z' },
  {
    id: 'usr-8',
    name: 'Gonzalo Taraborrelli',
    email: 'gonzataraborrelli@gmail.com',
    role: 'admin_plu_arg',
    roleKey: 'admin_plu_arg',
    status: 'invited',
    lastLoginAt: null,
  },
]

function Screen({ athletes, users, onCreateUser = async () => ({}) }) {
  return (
    <AdminPreviewShell section="users">
      <UsersSection
        accessRoles={ACCESS_ROLES}
        adminEvents={[]}
        athletes={athletes}
        canDeleteUsers
        canManageUsers
        onCreateSecurityUser={async () => ({})}
        onCreateUser={onCreateUser}
        onDeleteUser={async () => ({})}
        onNavigateRoles={() => {}}
        onOpenAthlete={() => {}}
        onResetPassword={async () => ({ emailed: true })}
        onUpdateRole={async () => ({})}
        onUpdateStatus={async () => ({})}
        permissionCatalog={PERMISSION_CATALOG}
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

// Alta con enlace: el panel recibe la URL firmada y la ofrece para copiar o
// mandar por WhatsApp, además del mail opcional.
export const ConEnlaceDeInvitacion = {
  render: () => (
    <Screen
      users={USERS}
      onCreateUser={async (draft) => ({
        user: { name: draft.name, email: draft.email },
        emailed: false,
        invitationUrl:
          'https://panel.pluarg.com.ar/?invitacion-staff=eyJ1aWQiOiJ1c3ItNSIsImN2IjoiYWJjIn0.Zk3m9Qe1',
        invitationExpiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      })}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByRole('button', { name: /Nuevo usuario/ }))
    await userEvent.type(await canvas.findByLabelText('Nombre'), 'Lucía Fernández')
    await userEvent.type(canvas.getByLabelText('Email'), 'lucia@pluarg.com.ar')
    await userEvent.click(canvas.getByRole('button', { name: /Crear/ }))
    await expect(await canvas.findByLabelText('Enlace de activación')).toBeTruthy()
  },
}

// Alta abierta: datos a la izquierda; a la derecha el rol y lo que habilita.
export const AltaAbierta = {
  render: () => <Screen users={USERS} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByRole('button', { name: /Nuevo usuario/ }))
    await expect(await canvas.findByText('Módulos')).toBeTruthy()
  },
}

// Invitación abierta: sólo el rol. Se genera el enlace y la persona completa
// su nombre, email y contraseña al abrirlo.
export const InvitacionAbierta = {
  render: () => (
    <Screen
      users={USERS_MIXED}
      onCreateUser={async () => ({
        user: { name: 'Invitación pendiente', email: 'invitacion-3f9a@pendiente.invalid' },
        emailed: false,
        invitationUrl:
          'https://panel.pluarg.com.ar/?invitacion-staff=eyJ1aWQiOiJ1c3ItNyIsImN2IjoiYWJjIn0.Zk3m9Qe1',
        invitationExpiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      })}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByRole('button', { name: /Nuevo usuario/ }))
    await userEvent.click(await canvas.findByRole('button', { name: /Generar enlace/ }))
    await expect(await canvas.findByLabelText('Enlace de activación')).toBeTruthy()
  },
}

// Un atleta al que se le dio acceso aparece acá: invitado, sin ingresos todavía,
// con la marca de atleta y el atajo a su ficha en el menú.
export const ConUltimoAccesoYAtletas = {
  render: () => (
    <Screen
      athletes={[{ id: 'ath-1', email: 'gonzataraborrelli@gmail.com' }]}
      users={USERS_WITH_ACTIVITY}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText('Gonzalo Taraborrelli')).toBeTruthy()
    await expect(await canvas.findByText('Atleta')).toBeTruthy()
  },
}
