import AdminEventRegistrationsPanel from './AdminEventRegistrationsPanel.jsx'
import { AdminPreviewShell } from '../../pages/admin/adminPreviewShell.jsx'

const event = {
  id: 'evt-copa-norte',
  slug: 'copa-norte-2026',
  title: 'Copa Norte 2026',
  slots: 40,
}

const people = [
  [
    'Ana Pérez',
    '30111222',
    'Masters',
    'Open',
    ['full_power', 'bench'],
    'confirmada',
    90000,
    'aprobado',
    'mercado_pago',
  ],
  [
    'Bruno Díaz',
    '30222333',
    'Open',
    '',
    ['full_power'],
    'pendiente_pago',
    60000,
    'pendiente',
    'mercado_pago',
  ],
  [
    'Carla Gómez',
    '30333444',
    'Junior',
    'Open',
    ['push_pull'],
    'validacion_manual',
    90000,
    'validacion_manual',
    'bank_transfer',
  ],
  [
    'Diego Sosa',
    '30444555',
    'Open',
    '',
    ['full_power'],
    'confirmada',
    60000,
    'aprobado',
    'cash_pitbull',
  ],
  [
    'Elena Ríos',
    '30555666',
    'Sub-Masters',
    '',
    ['squat', 'deadlift'],
    'confirmada',
    60000,
    'aprobado',
    'mercado_pago',
  ],
  [
    'Facundo Paz',
    '30666777',
    'Open',
    '',
    ['full_power'],
    'observada',
    60000,
    'aprobado',
    'mercado_pago',
  ],
  [
    'Gala Vera',
    '30777888',
    'Youth',
    'Open',
    ['full_power'],
    'cancelada',
    90000,
    'cancelado',
    'bank_transfer',
  ],
]

const athletes = people.map(([fullName, documentId], index) => ({
  id: `ath-${index}`,
  fullName,
  documentId,
  email: `${fullName.split(' ')[0].toLowerCase()}@plu.test`,
}))

const registrations = people.map(
  ([, , division, secondaryDivision, modalities, status], index) => ({
    id: `reg-${index}`,
    athleteId: `ath-${index}`,
    eventSlug: event.slug,
    event: event.title,
    category: index === 2 ? 'Equipped' : 'Raw',
    division,
    secondaryDivision,
    modalities,
    status,
    paymentOrderId: `ord-${index}`,
    createdAt: `2026-10-${String(10 + index).padStart(2, '0')}T12:00:00Z`,
  }),
)

const payments = people.map(([, , , , , , amount, status, channel], index) => ({
  id: `ord-${index}`,
  athleteId: `ath-${index}`,
  event: event.title,
  amount,
  status,
  method: channel === 'mercado_pago' ? 'mercado_pago' : 'manual_link',
  manualPaymentChannel: channel === 'mercado_pago' ? null : channel,
}))

export default {
  title: 'Admin/AdminEventRegistrationsPanel',
  component: AdminEventRegistrationsPanel,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <AdminPreviewShell section="events">
        <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 16px' }}>
          <Story />
        </div>
      </AdminPreviewShell>
    ),
  ],
  args: {
    athletes,
    canSetStatus: true,
    event,
    onOpenFullList: () => {},
    onSetRegistrationStatus: async () => ({}),
    payments,
    registrations,
  },
}

export const Default = {}

/** Sin inscripciones todavía: el resumen no inventa números. */
export const SinInscripciones = {
  args: { registrations: [], payments: [] },
}

/**
 * Staff general con permiso de escritura: la franja "Credenciales de ingreso"
 * manda el mail con el QR adjunto a los confirmados.
 */
export const ConEnvioDeCredenciales = {
  args: { canSendCredentials: true },
}
