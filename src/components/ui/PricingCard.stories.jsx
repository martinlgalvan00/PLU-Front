import { PricingCard } from './Cards.jsx'

export default {
  title: 'UI/PricingCard',
  component: PricingCard,
  tags: ['autodocs'],
  args: {
    title: 'Membresía anual',
    price: '$25000',
    details: ['Acceso a torneos', 'Credencial digital', 'Seguro deportivo'],
    onJoin: () => {},
  },
}

export const Default = {}
