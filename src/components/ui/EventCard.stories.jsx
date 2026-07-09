import EventCard from './EventCard.jsx'

export default {
  title: 'UI/EventCard',
  component: EventCard,
  tags: ['autodocs'],
  args: {
    date: '08 Ago',
    title: 'Apertura Nacional 2026',
    venue: 'Club Atlético River',
    location: 'CABA',
    status: 'inscripcion_abierta',
    onAction: () => {},
    onSelect: () => {},
  },
}

export const Default = {}

export const Featured = {
  args: { featured: true },
}

export const Selected = {
  args: { selected: true },
}

export const Closed = {
  args: { status: 'cerrado' },
}
