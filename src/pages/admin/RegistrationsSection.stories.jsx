import { within } from 'storybook/test'
import RegistrationsSection from './RegistrationsSection.jsx'
import { AppConfigProvider } from '../../providers/AppConfigProvider.jsx'
// Mismo par de hojas que el resto de las stories del panel: `admin.css` trae la
// celda de estado con motivo y `admin-minimal.css` la densidad de la tabla. Con
// una sola, la lista se ve sin estilos y la QA visual no mide nada.
import '../../styles/pages/admin.css'
import '../../styles/pages/admin-minimal.css'

/**
 * Lista de Inscripciones, con la columna de estado que dice por qué la
 * inscripción está donde está.
 *
 * El caso que la originó: la organización marcó dos inscripciones como
 * `observada` y escribió el motivo ("EL PAGO LLEGÓ A NOMBRE DE MAURO GELVEZ").
 * El texto se guardaba firmado en `manual_override_reason` y la lista pintaba un
 * badge "Observada" pelado: la observación existía en la base y no se leía en
 * ninguna pantalla.
 *
 * Los datos son los de las dos filas reales.
 */

const EVENT = 'Pitbull Classic 2026'

function registration(overrides = {}) {
  return {
    id: '428a53ac-184d-43a0-8d6c-e7e35ffdeccf',
    athleteId: '57220358-ed7b-44ee-8c59-93287bda9a75',
    athlete: { fullName: 'Melisa Quispe', documentId: '36725446', gym: 'La Cápsula / Pitbull' },
    event: EVENT,
    eventSlug: 'pitbull-classic-2026',
    paymentOrderId: 'affdc044-d9db-4e96-8a49-464e35539f01',
    category: 'Raw',
    division: 'Open',
    bodyweight: 67.5,
    status: 'observada',
    schedule: null,
    manualOverride: {
      status: 'observada',
      channel: null,
      reason: 'EL PAGO LLEGÓ A NOMBRE DE MAURO GELVEZ',
      by: 'cmss0uv370000ib04nfhrk133:maximalstrengthcorp@gmail.com',
      at: '2026-08-27T00:59:23.511675+00:00',
    },
    ...overrides,
  }
}

const ROWS = [
  registration(),
  registration({
    id: '7132bf1c-5a74-4940-a9e7-a4321a4c5ced',
    athleteId: 'ab81268a-801e-4a3e-97fe-4fea5e13b53d',
    athlete: { fullName: 'Leonel Prieto', documentId: '50774629', gym: 'Saiyangym' },
    paymentOrderId: '8d9d80a1-b268-4263-893b-d7dad7e52086',
    division: 'Youth',
    manualOverride: {
      status: 'observada',
      channel: null,
      reason: 'PAGO ABONADO POR OTRA PERSONA: GABRIEL CARRIZO',
      by: 'cmss0uv370000ib04nfhrk133:maximalstrengthcorp@gmail.com',
      at: '2026-08-26T14:55:23.351218+00:00',
    },
  }),
  // La fila sana, para poder comparar: sin motivo escrito la celda es un badge y
  // nada más, y la columna no se lleva espacio que necesitan monto y método.
  registration({
    id: 'c958a6ff-2f1a-42c0-9d0e-4b3f1c2a8e77',
    athleteId: '9d3a1f22-77cc-4a51-9f0d-2b6ec4a70d18',
    athlete: { fullName: 'Ana Torres', documentId: '30111222', gym: 'Strength' },
    paymentOrderId: 'c958a6ff-0000-4000-8000-000000000001',
    status: 'confirmada',
    manualOverride: null,
  }),
]

const PAYMENTS = ROWS.map((row) => ({
  id: row.paymentOrderId,
  athleteId: row.athleteId,
  event: EVENT,
  method: 'mercado_pago',
  status: 'aprobado',
  amount: 45000,
  currency: 'ARS',
}))

/**
 * La sección consulta los toggles de validación al montar. Sin API detrás,
 * Storybook devolvía un 404 que el componente traga (queda con validación
 * habilitada, que es lo correcto) pero ensucia la consola y la QA visual. Mismo
 * patrón que `FinanceSection.stories.jsx`: se intercepta `fetch`.
 */
function withPlatformToggles(Story) {
  const original = globalThis.fetch
  globalThis.fetch = async (input, init) => {
    const url = String(typeof input === 'string' ? input : (input?.url ?? ''))
    if (url.includes('/api/platform-settings')) {
      return new Response(
        JSON.stringify({
          membershipValidationEnabled: true,
          registrationValidationEnabled: true,
          ticketValidationEnabled: true,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }
    return original ? original(input, init) : new Response('{}', { status: 200 })
  }
  return <Story />
}

function Frame({ rows, canAssignSchedule = false, onBulkSetRegistrationStatus }) {
  return (
    <AppConfigProvider>
      <div className="admin-shell" style={{ background: 'var(--admin-canvas)', padding: '24px' }}>
        <RegistrationsSection
          canEdit
          canSetStatus
          canAssignSchedule={canAssignSchedule}
          filters={{ event: 'all', status: 'all', query: '' }}
          filteredRegistrations={rows}
          payments={PAYMENTS}
          registrations={rows}
          registrationsCount={rows.length}
          onApprovePayment={() => {}}
          onExportAdmin={() => {}}
          onExportPluUsa={() => {}}
          onSetFilters={() => {}}
          onSetRegistrationStatus={() => {}}
          onBulkSetRegistrationStatus={onBulkSetRegistrationStatus}
        />
      </div>
    </AppConfigProvider>
  )
}

export default {
  title: 'Admin/RegistrationsSection',
  component: RegistrationsSection,
  tags: ['autodocs'],
}

/** Dos inscripciones observadas con su motivo, y una confirmada sin nada que explicar. */
export const EstadoConObservacion = {
  decorators: [withPlatformToggles],
  render: () => <Frame rows={ROWS} />,
}

const PENDING_ROWS = [
  registration({
    id: 'a1a1a1a1-0000-4000-8000-000000000001',
    athleteId: 'a1a1a1a1-0000-4000-8000-000000000011',
    athlete: { fullName: 'Julian Ferreyra', documentId: '40111222', gym: 'Hierro Bruto' },
    paymentOrderId: 'a1a1a1a1-0000-4000-8000-000000000021',
    status: 'pendiente_pago',
    manualOverride: null,
  }),
  registration({
    id: 'a1a1a1a1-0000-4000-8000-000000000002',
    athleteId: 'a1a1a1a1-0000-4000-8000-000000000012',
    athlete: { fullName: 'Rocio Aguero', documentId: '40111223', gym: 'Fuerza Sur' },
    paymentOrderId: 'a1a1a1a1-0000-4000-8000-000000000022',
    status: 'pendiente_pago',
    manualOverride: null,
  }),
  registration({
    id: 'a1a1a1a1-0000-4000-8000-000000000003',
    athleteId: 'a1a1a1a1-0000-4000-8000-000000000013',
    athlete: { fullName: 'Braian Sosa', documentId: '40111224', gym: 'Hierro Bruto' },
    paymentOrderId: 'a1a1a1a1-0000-4000-8000-000000000023',
    status: 'confirmada',
    manualOverride: null,
  }),
]

/**
 * Quien abrió el checkout y nunca completó el pago queda `pendiente_pago`
 * hasta que el timeout técnico lo vence solo (30min Mercado Pago, 5 días
 * transferencia). Este es el atajo manual para vaciar el lote antes de esa
 * fecha: filtrar por el estado, seleccionar y cancelar de una.
 */
export const PendientesDePagoParaCancelar = {
  decorators: [withPlatformToggles],
  render: () => (
    <Frame rows={PENDING_ROWS} canAssignSchedule onBulkSetRegistrationStatus={() => ({ updated: 2, failed: 0, results: [] })} />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const checkboxes = await canvas.findAllByRole('checkbox', { name: /seleccionar la inscripción/i })
    checkboxes[0].click()
    checkboxes[1].click()
  },
}
