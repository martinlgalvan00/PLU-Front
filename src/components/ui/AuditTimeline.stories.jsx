import AuditTimeline from './AuditTimeline.jsx'

const items = [
  {
    id: '1',
    createdAt: '2026-07-01T10:00:00Z',
    createdAtLabel: '01/07/2026 10:00',
    actor: 'admin@plu.ar',
    action: 'Aprobó el pago',
    detail: 'Orden #1042 marcada como pagada.',
  },
  {
    id: '2',
    createdAt: '2026-06-28T15:30:00Z',
    createdAtLabel: '28/06/2026 15:30',
    actor: 'sistema',
    action: 'Orden creada',
  },
]

export default {
  title: 'UI/AuditTimeline',
  component: AuditTimeline,
  tags: ['autodocs'],
  args: { items },
}

export const Default = {}

export const Empty = {
  args: { items: [] },
}
