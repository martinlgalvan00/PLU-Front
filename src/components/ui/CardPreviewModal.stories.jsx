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

export const OpenWithPhoto = {
  args: {
    cardData: { ...cardData, variant: 'membership', athletePhotoUrl: 'https://picsum.photos/seed/plu-arg/400/400' },
  },
}

/** Abierto directo en formato historia (así se abre desde el perfil en mobile). */
export const OpenAsStory = {
  args: {
    initialFormat: 'story',
    cardData: { ...cardData, variant: 'membership' },
  },
}
