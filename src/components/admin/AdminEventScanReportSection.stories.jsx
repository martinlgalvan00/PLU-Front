import AdminEventScanReportSection from './AdminEventScanReportSection.jsx'
import '../../styles/pages/admin.css'
import '../../styles/pages/admin-minimal.css'
import '../../styles/pages/admin-event-console.css'
import '../../styles/pages/admin-analytics.css'

/**
 * Panel de detección de errores de escaneo -- lo que ve un admin del evento
 * (permiso `admin.audit.read`, no el operador de puerta) para responder
 * "cuánta gente llegó con un QR vencido" o "se configuró mal una zona"
 * después de que la puerta escaneó todo el evento.
 */
export default {
  title: 'Admin/AdminEventScanReportSection',
  component: AdminEventScanReportSection,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  // El panel vive siempre dentro de .admin-shell (AdminPage): sin este
  // wrapper, todo lo que AdminDataTable resuelve por selector `.admin-shell
  // .admin-data-table*` (tema oscuro, overflow horizontal) queda sin aplicar
  // y la tabla se ve con el tema por defecto de antd.
  decorators: [
    (Story) => (
      <div className="admin-shell" style={{ display: 'block', padding: 20 }}>
        <Story />
      </div>
    ),
  ],
  args: {
    eventSlug: 'pitbull-classic-2026',
  },
}

const REPORT = {
  event: {
    slug: 'pitbull-classic-2026',
    title: 'Pitbull Classic 2026',
    from: '2026-08-15T03:00:00.000Z',
    until: '2026-08-17T03:00:00.000Z',
  },
  summary: {
    total: 214,
    admitted: 178,
    rejected: 36,
    byOutcome: [
      { outcome: 'checked_in', count: 178 },
      { outcome: 'expired', count: 14 },
      { outcome: 'already_used', count: 9 },
      { outcome: 'wrong_zone', count: 7 },
      { outcome: 'not_found', count: 4 },
      { outcome: 'not_yet_valid', count: 2 },
    ],
  },
  byGate: [
    { gate: 'Puerta norte', zoneScope: 'gate_tickets', total: 140, rejected: 20 },
    { gate: 'Calentamiento', zoneScope: 'athletes_coaches', total: 74, rejected: 16 },
  ],
  byHour: [],
  repeated: [
    {
      qrFingerprint: 'a1b2c3d4e5f6',
      attempts: 5,
      gates: ['Puerta norte', 'Calentamiento'],
      outcomes: ['already_used', 'wrong_zone'],
      firstAt: '2026-08-15T14:02:00.000Z',
      lastAt: '2026-08-15T15:40:00.000Z',
      ticketCode: 'TCK-2026-0412',
      credentialLabel: 'Entrenadores',
    },
  ],
  recent: [
    {
      id: 'evt-1',
      scannedAt: '2026-08-15T15:40:00.000Z',
      outcome: 'expired',
      kind: 'ticket',
      evidence: 'server',
      gate: 'Puerta norte',
      zoneScope: 'gate_tickets',
      actorLabel: 'staff-1:puerta@plu.test',
      offline: false,
      ticketCode: 'TCK-2026-0511',
      credentialLabel: 'Entrada general',
      ticketTypeName: 'Público general — Día 2',
    },
    {
      id: 'evt-2',
      scannedAt: '2026-08-15T15:38:00.000Z',
      outcome: 'wrong_zone',
      kind: 'ticket',
      evidence: 'operator',
      gate: 'Calentamiento',
      zoneScope: 'athletes_coaches',
      actorLabel: 'staff-2:coach-gate@plu.test',
      offline: true,
      ticketCode: 'TCK-2026-0412',
      credentialLabel: 'Entrenadores',
      ticketTypeName: 'Entrenadores',
    },
  ],
}

export const ConDatos = {
  args: {
    onGetReport: async () => REPORT,
  },
}

export const Vacio = {
  args: {
    onGetReport: async () => ({
      summary: { total: 0, admitted: 0, rejected: 0, byOutcome: [] },
      byGate: [],
      byHour: [],
      repeated: [],
      recent: [],
    }),
  },
}

export const Cargando = {
  args: {
    onGetReport: () => new Promise(() => {}),
  },
}

export const ErrorDeConexion = {
  args: {
    onGetReport: async () => {
      const error = new Error('No se pudo contactar al servidor de PLU ARG.')
      error.status = 0
      throw error
    },
  },
}
