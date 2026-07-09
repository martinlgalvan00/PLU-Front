import MembershipCard from './MembershipCard.jsx'

export default {
  title: 'UI/MembershipCard',
  component: MembershipCard,
  tags: ['autodocs'],
  args: {
    id: 'athlete',
    title: 'Atleta',
    price: 25000,
    features: ['Acceso a torneos', 'Credencial digital', 'Seguro deportivo'],
    onSelect: () => {},
  },
}

export const Default = {}

export const Featured = {
  args: { highlighted: true },
}

export const Combo = {
  args: {
    id: 'combo',
    title: 'Combo Familiar',
    price: 40000,
    compareWith: [{ price: 25000 }, { price: 25000 }],
  },
}
