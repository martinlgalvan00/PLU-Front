import { expect, userEvent, waitFor, within } from 'storybook/test'
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
    const canvas = within(canvasElement)
    const app = canvasElement.querySelector('.checkin-app')
    // Reproduce el viewport angosto donde la tabla de 960px se salía de la card.
    if (app) {
      app.style.width = '768px'
      app.style.maxWidth = '768px'
    }

    await userEvent.click(canvas.getByRole('button', { name: /día 1/i }))
    const list = await waitFor(() => {
      const section = canvasElement.querySelector('.checkin-app__list')
      expect(section).toBeTruthy()
      return section
    })

    await waitFor(() => {
      expect(canvas.getByRole('group', { name: /tipo/i })).toBeVisible()
      expect(canvas.getByRole('group', { name: /estado/i })).toBeVisible()
    })

    await waitFor(() => {
      const toolbar = canvasElement.querySelector('.checkin-app__list-toolbar')
      const tableShell = canvasElement.querySelector('.admin-data-table-shell')
      const listWidth = list.getBoundingClientRect().width
      expect(toolbar.getBoundingClientRect().width).toBeLessThanOrEqual(listWidth + 1)
      expect(tableShell.getBoundingClientRect().width).toBeLessThanOrEqual(listWidth + 1)
    })
  },
}

export const Tickets = {
  play: async ({ canvasElement }) => {
    canvasElement.querySelectorAll('.checkin-app__tab')[3]?.click()
  },
}
