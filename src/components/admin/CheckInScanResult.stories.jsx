import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react'
import '../../styles/layout/admin-shell.css'
import '../../styles/pages/admin.css'
import '../../styles/pages/admin-minimal.css'
import '../../styles/pages/checkin-app.css'
import CheckInScanResult from './CheckInScanResult.jsx'

/**
 * El resultado de un escaneo, que es lo único que mira quien está en la puerta.
 *
 * No tenía historia, así que no había forma de revisarlo sin una cámara y un QR
 * real. Los estados de acá son los que salen de `useCheckInWorkspace`.
 */
export default {
  title: 'Admin/CheckInScanResult',
  component: CheckInScanResult,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div className="admin-shell" style={{ display: 'block' }}>
        <div className="checkin-app" style={{ padding: 20, maxWidth: 640 }}>
          <Story />
        </div>
      </div>
    ),
  ],
}

const base = {
  canCheckIn: true,
  locale: 'es',
  onDismiss: () => {},
  onScanCheckIn: () => {},
  scanBusy: false,
  redeemBusyId: null,
  redeemError: null,
}

/** Entrada de espectador lista para ingresar. */
export const Espectador = {
  args: {
    ...base,
    scanPersonName: 'Juana Pérez',
    scanPersonDoc: '30111222',
    scanTicketPaid: true,
    scanVerdict: { Icon: CheckCircle2, tone: 'success' },
    scanResult: {
      kind: 'ticket',
      outcome: 'ready',
      canCheckIn: true,
      status: 'pagada',
      row: {
        id: 'tkt-1',
        type: 'espectador',
        name: 'Juana Pérez',
        document: '30111222',
        ticketTypeName: 'Público general',
        credentialLabel: 'Entrada general',
        credentialScopes: ['gate_tickets'],
        status: 'pagada',
        addons: [],
      },
    },
  },
}

/**
 * El caso que motivó todo: la credencial de ENTRENADOR. Mismo nombre y mismo
 * DNI que su credencial de espectador -- lo único que las distingue en la
 * puerta es la credencial.
 */
export const Entrenador = {
  args: {
    ...base,
    scanPersonName: 'Coach Gómez',
    scanPersonDoc: '28999111',
    scanTicketPaid: true,
    scanVerdict: { Icon: CheckCircle2, tone: 'success' },
    scanResult: {
      kind: 'ticket',
      outcome: 'ready',
      canCheckIn: true,
      status: 'pagada',
      row: {
        id: 'tkt-2',
        type: 'espectador',
        name: 'Coach Gómez',
        document: '28999111',
        ticketTypeName: 'Entrenadores',
        credentialLabel: 'ENTRENADOR',
        credentialScopes: ['athletes_coaches'],
        status: 'pagada',
        addons: [],
      },
    },
  },
}

/** Ya usada: el caso que evita que una entrada circule entre varias personas. */
export const YaUtilizada = {
  args: {
    ...base,
    scanPersonName: 'Coach Gómez',
    scanPersonDoc: '28999111',
    scanTicketPaid: true,
    scanVerdict: { Icon: AlertTriangle, tone: 'warning' },
    scanResult: {
      kind: 'ticket',
      outcome: 'already_used',
      canCheckIn: false,
      status: 'usada',
      row: {
        id: 'tkt-2',
        type: 'espectador',
        name: 'Coach Gómez',
        document: '28999111',
        ticketTypeName: 'Entrenadores',
        credentialLabel: 'ENTRENADOR',
        credentialScopes: ['athletes_coaches'],
        status: 'usada',
        addons: [],
      },
    },
  },
}

/** No encontrada: un QR que no es de este evento. */
export const NoEncontrada = {
  args: {
    ...base,
    scanPersonName: null,
    scanPersonDoc: null,
    scanVerdict: { Icon: XCircle, tone: 'danger' },
    scanResult: { kind: 'ticket', outcome: 'not_found', canCheckIn: false },
  },
}

/** Atleta inscripto, con su tanda y horario. */
export const Atleta = {
  args: {
    ...base,
    scanPersonName: 'Martín Ruiz',
    scanPersonDoc: '31222333',
    scanVerdict: { Icon: CheckCircle2, tone: 'success' },
    scanResult: {
      kind: 'registration',
      outcome: 'ready',
      canCheckIn: true,
      status: 'confirmada',
      row: {
        id: 'reg-1',
        type: 'atleta',
        name: 'Martín Ruiz',
        document: '31222333',
        status: 'confirmada',
        membershipStatus: 'activa',
        schedule: null,
      },
    },
  },
}
