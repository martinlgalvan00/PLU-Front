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
      <div className="admin-shell" style={{ display: 'block' }}>
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
    price: 12000,
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
    price: 25000,
    quota: 20,
    sortOrder: 1,
    active: true,
    dayIndexes: [0, 1],
    includedAddonIds: [],
    credentials: coachTicketCredentials(),
  },
]

function Editable({ tipos = TYPES, addons = [], canEdit = true }) {
  const [ticketTypes, setTicketTypes] = useState(tipos)
  return (
    <AdminTicketTypesEditor
      addonsCatalog={addons}
      canEdit={canEdit}
      eventDays={EVENT_DAYS}
      ticketTypes={ticketTypes}
      onChangeTicketTypes={setTicketTypes}
    />
  )
}

/** El caso real: dos tipos, uno de ellos con las dos credenciales. */
export const Default = { render: () => <Editable /> }

/** Sin tipos cargados todavía. */
export const Vacio = { render: () => <Editable tipos={[]} /> }

/** Con catálogo de beneficios disponible para armar packs. */
export const ConBeneficios = {
  render: () => (
    <Editable addons={[{ id: 'bife', label: 'Bife + agua' }, { id: 'remera', label: 'Remera' }]} />
  ),
}

/** Sin permiso de escritura. */
export const SoloLectura = { render: () => <Editable canEdit={false} /> }
