import HeroStatusCard from './HeroStatusCard.jsx'

export default {
  title: 'UI/HeroStatusCard',
  component: HeroStatusCard,
  tags: ['autodocs'],
}

export const Default = {}

export const TicketsOnSale = {
  args: {
    event: { status: 'cerrado', pricing: { ticketsEnabled: true } },
    ticketsAvailable: true,
    statusLabelOverride: 'Entradas disponibles',
    onSelect: () => {},
    onSelectTickets: () => {},
  },
}
