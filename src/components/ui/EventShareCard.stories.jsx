import EventShareCard from './EventShareCard.jsx'

export default {
  title: 'UI/EventShareCard',
  component: EventShareCard,
  tags: ['autodocs'],
  args: {
    preview: true,
    athleteName: 'Juan Pérez',
    athleteCode: 'PLU-AR-0042',
    eventTitle: 'Apertura Nacional 2026',
    eventDate: '08-09 Ago 2026',
    eventVenue: 'Club Atlético River',
    eventLocation: 'Buenos Aires',
    category: 'Sub-Junior',
    division: 'Clásico',
    eventSlug: 'apertura-nacional-2026',
  },
}

export const Event = {}

export const Membership = {
  args: {
    variant: 'membership',
    membershipSeason: '2026',
    membershipExpiration: '31 dic 2026',
  },
}

export const Ticket = {
  args: {
    variant: 'ticket',
    attendeeDocument: '30111222',
    dayPassLabel: 'Ambos días',
  },
}

export const Story = {
  args: { format: 'story' },
}

export const EventWithPhoto = {
  args: {
    athletePhotoUrl: 'https://picsum.photos/seed/event-card/400/400',
  },
}

export const MembershipWithPhoto = {
  args: {
    variant: 'membership',
    membershipSeason: '2026',
    membershipExpiration: '31 dic 2026',
    athletePhotoUrl: 'https://picsum.photos/seed/plu-arg/400/400',
  },
}
