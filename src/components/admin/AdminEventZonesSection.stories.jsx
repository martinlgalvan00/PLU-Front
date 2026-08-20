import AdminEventZonesSection from './AdminEventZonesSection.jsx'
import '../../styles/pages/admin.css'
import '../../styles/pages/admin-minimal.css'
import '../../styles/pages/admin-event-console.css'

const ZONES = [
  {
    id: 'zone-gate',
    eventId: 'evt-1',
    eventSlug: 'pitbull-classic-2026',
    name: 'Puerta principal',
    scope: 'gate_tickets',
    shiftStart: '2026-03-14T11:00:00.000Z',
    shiftEnd: '2026-03-14T17:00:00.000Z',
    sortOrder: 0,
    memberCount: 3,
  },
  {
    id: 'zone-weighin',
    eventId: 'evt-1',
    eventSlug: 'pitbull-classic-2026',
    name: 'Pesaje',
    scope: 'athletes_only',
    shiftStart: '2026-03-14T10:00:00.000Z',
    shiftEnd: '2026-03-14T12:00:00.000Z',
    sortOrder: 1,
    memberCount: 2,
  },
  {
    id: 'zone-warmup',
    eventId: 'evt-1',
    eventSlug: 'pitbull-classic-2026',
    name: 'Calentamiento',
    scope: 'athletes_coaches',
    shiftStart: null,
    shiftEnd: null,
    sortOrder: 2,
    memberCount: 1,
  },
  {
    id: 'zone-platform',
    eventId: 'evt-1',
    eventSlug: 'pitbull-classic-2026',
    name: 'Plataforma',
    scope: 'staff_only',
    shiftStart: '2026-03-14T12:00:00.000Z',
    shiftEnd: '2026-03-14T23:00:00.000Z',
    sortOrder: 3,
    memberCount: 0,
  },
]

const USERS = [
  {
    id: 'usr-1',
    name: 'Lucía Fernández',
    email: 'lucia.fernandez@segur.com.ar',
    role: 'seguridad_plu_arg',
    status: 'active',
    securityZoneId: 'zone-gate',
  },
  {
    id: 'usr-2',
    name: 'Martín Sosa',
    email: 'martin.sosa@segur.com.ar',
    role: 'seguridad_plu_arg',
    status: 'active',
    securityZoneId: 'zone-gate',
  },
  {
    id: 'usr-3',
    name: 'Diego Funes',
    email: 'diego.funes@segur.com.ar',
    role: 'seguridad_plu_arg',
    status: 'invited',
    securityZoneId: 'zone-gate',
  },
  {
    id: 'usr-4',
    name: 'Camila Vera',
    email: 'camila.vera@segur.com.ar',
    role: 'seguridad_plu_arg',
    status: 'active',
    securityZoneId: 'zone-weighin',
  },
  {
    id: 'usr-5',
    name: 'Sergio Barrios',
    email: 's.barrios@segur.com.ar',
    role: 'seguridad_plu_arg',
    status: 'invited',
    securityZoneId: 'zone-weighin',
  },
  {
    id: 'usr-6',
    name: 'Nadia Rossi',
    email: 'nadia.rossi@segur.com.ar',
    role: 'seguridad_plu_arg',
    status: 'active',
    securityZoneId: 'zone-warmup',
  },
  // Sin zona: es el estado que hay que resolver antes del meet.
  {
    id: 'usr-7',
    name: 'Tomás Aguirre',
    email: 't.aguirre@segur.com.ar',
    role: 'seguridad_plu_arg',
    status: 'invited',
    securityZoneId: null,
  },
]

export default {
  title: 'Admin/AdminEventZonesSection',
  component: AdminEventZonesSection,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="admin-shell">
        <div className="admin-page">
          <Story />
        </div>
      </div>
    ),
  ],
  args: {
    canManageUsers: true,
    eventId: 'evt-1',
    eventSlug: 'pitbull-classic-2026',
    onListZones: async () => ZONES,
    onListSecurityUsers: async () => USERS,
    onCreateZone: async () => ZONES,
    onUpdateZone: async () => ZONES,
    onDeleteZone: async () => ZONES.slice(1),
    onPresetZones: async () => ZONES,
    onAssignMember: async () => ZONES,
    onCreateAccessLink: async () => ({
      url: 'https://plu-arg.com/evento/pitbull-classic-2026/seguridad?acceso=demo',
      expiresAt: '2026-03-15T00:00:00.000Z',
      emailed: true,
    }),
  },
}

export const Default = {}

/** Sin permiso de gestión: se lee el operativo, no se toca. */
export const ReadOnly = {
  args: { canManageUsers: false },
}

/** Evento nuevo: el camino es el preset del meet estándar. */
export const SinZonas = {
  args: {
    onListZones: async () => [],
    onListSecurityUsers: async () => [],
  },
}

/** Cuentas creadas y nadie asignado todavía. */
export const TodoSinAsignar = {
  args: {
    onListSecurityUsers: async () => USERS.map((user) => ({ ...user, securityZoneId: null })),
  },
}

export const ErrorDeCarga = {
  args: {
    onListZones: async () => {
      throw new Error('No se pudieron cargar las zonas del evento.')
    },
  },
}
