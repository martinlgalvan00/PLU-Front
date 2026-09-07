import { useState } from 'react'
import '../../styles/layout/admin-shell.css'
import '../../styles/pages/admin.css'
import '../../styles/pages/admin-minimal.css'
import AdminTicketCredentialsEditor from './AdminTicketCredentialsEditor.jsx'
import { coachTicketCredentials, defaultTicketCredential } from '../../lib/ticketCredentials.js'

/**
 * Subcategorías de un tipo de entrada. Lo que motivó el componente: el
 * entrenador paga una vez y recibe dos credenciales -- espectador para la
 * tribuna y ENTRENADOR para la entrada en calor -- y seguridad canjea cada una
 * en su puesto.
 */
export default {
  title: 'Admin/AdminTicketCredentialsEditor',
  component: AdminTicketCredentialsEditor,
  decorators: [
    (Story) => (
      <div className="admin-shell" style={{ display: 'block' }}>
        <div className="admin-event-form" style={{ maxWidth: 720, padding: 24 }}>
          <Story />
        </div>
      </div>
    ),
  ],
}

/** Interactivo: sin estado propio el editor no se puede probar de verdad. */
function Editable({ initial, quota = null, canEdit = true }) {
  const [credentials, setCredentials] = useState(initial)
  return (
    <AdminTicketCredentialsEditor
      canEdit={canEdit}
      credentials={credentials}
      fieldPrefix="ticketTypes.0"
      quota={quota}
      onChange={setCredentials}
    />
  )
}

/** Entrada común: una credencial, y el atajo para armar la de entrenador. */
export const EntradaComun = {
  render: () => <Editable initial={[defaultTicketCredential()]} quota={200} />,
}

/** El caso del pedido: dos credenciales, con el aviso de cupo vs. credenciales. */
export const Entrenador = {
  render: () => <Editable initial={coachTicketCredentials()} quota={20} />,
}

/** Errores: sin nombre, sin zona y con nombre repetido. */
export const ConErrores = {
  render: () => (
    <Editable
      initial={[
        { label: 'Espectador', zoneScopes: ['gate_tickets'] },
        { label: '', zoneScopes: [] },
        { label: 'espectador', zoneScopes: ['athletes_coaches'] },
      ]}
      quota={20}
    />
  ),
}

/** Sin permiso de edición: se lee, no se toca. */
export const SoloLectura = {
  render: () => <Editable canEdit={false} initial={coachTicketCredentials()} quota={20} />,
}
