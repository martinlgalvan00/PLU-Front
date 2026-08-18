import EventCalendar from './EventCalendar.jsx'

const events = [
  {
    slug: 'apertura',
    title: 'Apertura Nacional',
    dateISO: '2026-08-08',
    status: 'inscripcion_abierta',
  },
  { slug: 'copa-sur', title: 'Copa Sur', dateISO: '2026-08-15', status: 'cupos_limitados' },
  { slug: 'clasico', title: 'Clásico PLU', dateISO: '2026-08-22', status: 'cerrado' },
]

export default {
  title: 'UI/EventCalendar',
  component: EventCalendar,
  tags: ['autodocs'],
  args: {
    events,
    initialDate: '2026-08-01',
    onEventSelect: () => {},
  },
}

export const Default = {}
