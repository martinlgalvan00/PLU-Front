import { useState } from 'react'
// Mismo orden de hojas que `AdminPage`: sin las cuatro el editor renderiza sin
// su tipografía ni su densidad.
import '../../styles/layout/admin-shell.css'
import '../../styles/pages/admin.css'
import '../../styles/pages/admin-institutional.css'
import '../../styles/pages/admin-minimal.css'
import '../../styles/pages/admin-event-console.css'
import AdminTicketTypesEditor from './AdminTicketTypesEditor.jsx'
import { coachTicketCredentials, defaultTicketCredential } from '../../lib/ticketCredentials.js'

/**
 * Tipos de entrada, en el contexto REAL de la página del evento.
 *
 * El envoltorio no es decorativo: buena parte del CSS de este editor está
 * scopeado a `.admin-event-editor-modal__panel` (el modal viejo) y no aplica en
 * la página, que usa `.admin-event-workspace__panel`. Sin reproducir esa cadena
 * la historia se ve bien y la app no.
 */
export default {
  title: 'Admin/AdminTicketTypesEditor',
  component: AdminTicketTypesEditor,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div
        className="admin-shell"
        style={{ display: 'block', height: 'auto', minHeight: '100vh', overflow: 'visible' }}
      >
        <div className="admin-event-workspace__panel">
          <div className="admin-event-workspace__body">
            <div className="admin-event-editor admin-event-editor--embedded admin-event-editor--accordion">
              <div className="admin-event-form admin-event-form--editor">
                <div className="admin-event-form__body">
                  <Story />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
  ],
}

const EVENT_DAYS = [
  { dayIndex: 0, label: 'Día 1', date: '2026-12-11' },
  { dayIndex: 1, label: 'Día 2', date: '2026-12-12' },
]

const TYPES = [
  {
    id: 'tt-1',
    name: 'Día 1',
    description: 'Acceso general válido únicamente durante la jornada inaugural.',
    price: 12000,
    manualPrice: 10000,
    wisePrice: 12,
    quota: 8,
    sortOrder: 0,
    active: true,
    dayIndexes: [0],
    includedAddonIds: [],
    credentials: [defaultTicketCredential()],
  },
  {
    id: 'tt-2',
    name: 'Entrenador',
    description: 'Pase para acompañar al atleta durante ambas jornadas.',
    price: 25000,
    quota: 20,
    sortOrder: 1,
    active: true,
    dayIndexes: [0, 1],
    includedAddonIds: [],
    credentials: coachTicketCredentials(),
  },
]

function Editable({ tipos = TYPES, addons = [], canEdit = true, eventOverrides = null }) {
  const [ticketTypes, setTicketTypes] = useState(tipos)
  return (
    <AdminTicketTypesEditor
      addonsCatalog={addons}
      canEdit={canEdit}
      eventDays={EVENT_DAYS}
      eventPaymentChannelOverrides={eventOverrides}
      ticketTypes={ticketTypes}
      onChangeTicketTypes={setTicketTypes}
    />
  )
}

/** El caso real: dos tipos, uno de ellos con las dos credenciales. */
export const Default = { render: () => <Editable /> }

/** Público de un día: el QR vale el Día 1 y la credencial queda compacta. */
export const PublicoUnDia = {
  render: () => <Editable tipos={[TYPES[0]]} />,
}

/** Sin tipos cargados todavía. */
export const Vacio = { render: () => <Editable tipos={[]} /> }

/**
 * Medios de cobro propios: el palco se cobra sólo por Mercado Pago —se acredita
 * solo, sin comprobante que aprobar a mano— y la general sigue aceptando todo.
 * El evento tiene Wise cerrado, así que ese medio aparece apagado y explicado.
 */
export const MediosPorEntrada = {
  render: () => (
    <Editable
      eventOverrides={{
        ticket: {
          mercado_pago: true,
          bank_transfer: true,
          cash_pitbull: true,
          wise_transfer: false,
        },
      }}
      tipos={[
        TYPES[0],
        {
          ...TYPES[1],
          id: 'tt-palco',
          name: 'Palco',
          price: 38000,
          paymentChannels: { mercado_pago: true, bank_transfer: false, cash_pitbull: false },
        },
      ]}
    />
  ),
}

/** Con catálogo de beneficios disponible para armar packs. */
export const ConBeneficios = {
  render: () => (
    <Editable
      addons={[
        { id: 'bife', label: 'Bife + agua', price: 8000 },
        { id: 'remera', label: 'Remera', price: 12000, wisePrice: 10 },
      ]}
    />
  ),
}

/** Sin permiso de escritura. */
export const SoloLectura = { render: () => <Editable canEdit={false} /> }
