import CheckInAppPage from './CheckInAppPage.jsx'

const athletes = [
  { id: 'ath-1', fullName: 'Martina Rivas', documentId: '40111222' },
  { id: 'ath-2', fullName: 'Nicolás Aguirre', documentId: '36888999' },
  { id: 'ath-3', fullName: 'Lucía Fernández', documentId: '42555111' },
]

const registrations = [
  {
    id: 'reg-1',
    athleteId: 'ath-1',
    eventSlug: 'pitbull-classic-2026',
    category: 'Raw',
    division: 'Open',
    competitionDay: 'day1',
    status: 'confirmada',
  },
  {
    id: 'reg-2',
    athleteId: 'ath-2',
    eventSlug: 'pitbull-classic-2026',
    category: 'Raw With Wraps',
    division: 'Junior',
    competitionDay: 'day2',
    status: 'pendiente_pago',
  },
  {
    id: 'reg-3',
    athleteId: 'ath-3',
    eventSlug: 'pitbull-classic-2026',
    category: 'Raw',
    division: 'Open',
    competitionDay: 'day1',
    status: 'confirmada',
    checkedInAt: '2026-08-15T10:15:00.000Z',
  },
]

const eventDays = [
  { dayIndex: 0, label: 'Día 1' },
  { dayIndex: 1, label: 'Día 2' },
]

const ticketTypes = [
  { id: 'type-day1', name: 'Día 1', price: 12000, dayIndexes: [0], includedAddonIds: [] },
  { id: 'type-both', name: 'Ambos días', price: 20000, dayIndexes: [0, 1], includedAddonIds: [] },
]

const tickets = [
  {
    id: 'tkt-1',
    eventSlug: 'pitbull-classic-2026',
    attendeeName: 'Sofía López',
    attendeeDni: '39111444',
    ticketCode: 'PLU-D1-001',
    qrToken: 'ticket-1',
    ticketTypeId: 'type-day1',
    ticketTypeName: 'Día 1',
    status: 'pagada',
  },
  {
    id: 'tkt-2',
    eventSlug: 'pitbull-classic-2026',
    attendeeName: 'Ramiro Díaz',
    attendeeDni: '35222888',
    ticketCode: 'PLU-2D-002',
    qrToken: 'ticket-2',
    ticketTypeId: 'type-both',
    ticketTypeName: 'Ambos días',
    status: 'usada',
    checkedInAt: '2026-08-15T10:20:00.000Z',
  },
]

export default {
  title: 'Pages/CheckInAppPage',
  component: CheckInAppPage,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  args: {
    athletes,
    canCheckIn: true,
    eventDays,
    eventSlug: 'pitbull-classic-2026',
    eventTitle: 'Pitbull Classic 2026',
    registrations,
    roleLabel: 'Seguridad',
    // Puesto asignado: es lo que le dice a quien escanea a qué sector está
    // habilitado y qué credenciales le van a abrir ahí.
    securityZone: { id: 'z-calentamiento', name: 'Calentamiento', scope: 'athletes_coaches' },
    ticketTypes,
    tickets,
    onCheckInRegistration: async () => ({ outcome: 'ok' }),
    onCheckInTicket: async () => ({ outcome: 'ok' }),
    onExit: () => {},
    onRedeemTicketAddon: async () => ({}),
    onRefreshTickets: async () => {},
  },
}

export const Scanner = {}

export const DayOne = {
  play: async ({ canvasElement }) => {
    canvasElement.querySelectorAll('.checkin-app__tab')[1]?.click()
  },
}

export const Tickets = {
  play: async ({ canvasElement }) => {
    canvasElement.querySelectorAll('.checkin-app__tab')[3]?.click()
  },
}
