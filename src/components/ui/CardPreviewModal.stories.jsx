import CardPreviewModal from './CardPreviewModal.jsx'

const cardData = {
  athleteName: 'Juan Pérez',
  athleteCode: 'PLU-AR-0042',
  eventTitle: 'Apertura Nacional 2026',
  eventDate: '08-09 Ago 2026',
  eventVenue: 'Club Atlético River',
  eventLocation: 'Buenos Aires',
  eventSlug: 'apertura-nacional-2026',
}

export default {
  title: 'UI/CardPreviewModal',
  component: CardPreviewModal,
  tags: ['autodocs'],
  args: {
    open: true,
    cardData,
    onClose: () => {},
  },
}

export const Open = {}
