import MembershipsSection from './MembershipsSection.jsx'
import { AppConfigProvider } from '../../providers/AppConfigProvider.jsx'
// Mismo par de hojas que el resto de las stories del panel: `admin.css` trae la
// celda de estado con motivo y `admin-minimal.css` la densidad de la tabla.
import '../../styles/pages/admin.css'
import '../../styles/pages/admin-minimal.css'

/**
 * Lista de Afiliaciones, con la columna de estado que dice quién puso ese estado
 * y por qué.
 *
 * La ficha del atleta ya mostraba la procedencia de una activación manual; la
 * lista -- que es donde se opera el padrón -- mostraba sólo el badge, así que
 * había que entrar socio por socio para saber si un "Activa" lo respaldaba un
 * cobro o la decisión de una persona.
 *
 * El badge de "inscripto a un torneo" sigue al lado del estado: es otro hecho
 * del socio, no una explicación del estado, y por eso no baja al párrafo.
 */

const NEXT_YEAR = new Date().getFullYear() + 1

function membership(overrides = {}) {
  return {
    id: 'd5fe8171-fd58-4906-a3bd-2d08f5c66073',
    athleteId: '57220358-ed7b-44ee-8c59-93287bda9a75',
    athlete: { fullName: 'Melisa Quispe', documentId: '36725446', gym: 'La Cápsula / Pitbull' },
    memberCode: 'PLU-ARG-2026-00000792',
    year: '2026',
    status: 'activa',
    startDate: '2026-08-20',
    expirationDate: `${NEXT_YEAR}-08-20`,
    manualOverride: null,
    ...overrides,
  }
}

const ROWS = [
  membership({
    manualOverride: {
      status: 'activa',
      channel: 'bank_transfer',
      reason: 'Pagó por transferencia el 20/08, comprobante en el grupo de Finanzas.',
      by: 'cmss0uv370000ib04nfhrk133:maximalstrengthcorp@gmail.com',
      at: '2026-08-20T23:35:55.487078+00:00',
    },
  }),
  // El hueco que dejó el backfill: es un pendiente, no una explicación, y se
  // pinta distinto del motivo que alguien sí escribió.
  membership({
    id: 'a1c9d7b4-2f60-4a1e-9b8a-33f0c1d2e4a5',
    athleteId: 'ab81268a-801e-4a3e-97fe-4fea5e13b53d',
    athlete: { fullName: 'Leonel Prieto', documentId: '50774629', gym: 'Saiyangym' },
    memberCode: 'PLU-ARG-2026-00000801',
    manualOverride: {
      status: 'activa',
      channel: null,
      reason: 'Sin motivo registrado (anterior a 20260910100000).',
      by: 'cmss0uv370000ib04nfhrk133:maximalstrengthcorp@gmail.com',
      at: '2026-08-21T12:10:02.114000+00:00',
    },
  }),
  // La fila sana: el cobro respalda la afiliación y no hay nada que explicar.
  membership({
    id: 'f3b7e210-8c44-4d9a-9a11-6d2e5c8b0f37',
    athleteId: '9d3a1f22-77cc-4a51-9f0d-2b6ec4a70d18',
    athlete: { fullName: 'Ana Torres', documentId: '30111222', gym: 'Strength' },
    memberCode: 'PLU-ARG-2026-00000815',
  }),
]

// Melisa está además inscripta al meet: su fila lleva el badge de torneo al lado
// del estado, que es el caso que obliga a que la celda sepa apilar las dos cosas.
const REGISTRATIONS = [
  {
    id: '428a53ac-184d-43a0-8d6c-e7e35ffdeccf',
    athleteId: '57220358-ed7b-44ee-8c59-93287bda9a75',
    event: 'Pitbull Classic 2026',
    status: 'confirmada',
  },
]

/**
 * Los toggles de validación se consultan al montar. Sin API detrás Storybook
 * devolvía un 404 que el componente traga, pero ensucia la consola y la QA
 * visual. Mismo patrón que `FinanceSection.stories.jsx`.
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

function Frame({ rows }) {
  return (
    <AppConfigProvider>
      <div className="admin-shell" style={{ background: 'var(--admin-canvas)', padding: '24px' }}>
        <MembershipsSection canManage memberships={rows} registrations={REGISTRATIONS} />
      </div>
    </AppConfigProvider>
  )
}

export default {
  title: 'Admin/MembershipsSection',
  component: MembershipsSection,
  tags: ['autodocs'],
}

/** Activación manual explicada, el hueco del backfill, y la fila que el cobro respalda. */
export const EstadoConProcedencia = {
  decorators: [withPlatformToggles],
  render: () => <Frame rows={ROWS} />,
}
