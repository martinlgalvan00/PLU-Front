import '../../styles/pages/members.css'
import MembershipCard from './MembershipCard.jsx'

const pluFeatures = ['Mayores de 18 años', 'Credencial digital', 'Eventos del calendario PLU ARG']

function PluFrame({ children }) {
  return (
    <section className="members-plu-plans">
      <div className="membership-grid membership-grid--plu membership-grid--plu-solo">
        {children}
      </div>
    </section>
  )
}

export default {
  title: 'UI/MembershipCard',
  component: MembershipCard,
  tags: ['autodocs'],
  args: {
    id: 'athlete',
    variant: 'editorial',
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

export const Plu = {
  args: {
    variant: 'plu',
    title: 'Afiliación PLU anual',
    kicker: 'Anual',
    price: 75000,
    features: pluFeatures,
  },
  decorators: [
    (Story) => (
      <PluFrame>
        <Story />
      </PluFrame>
    ),
  ],
}

export const PluFeatured = {
  args: {
    variant: 'plu',
    highlighted: true,
    title: 'Afiliación PLU anual',
    kicker: 'Anual',
    price: 75000,
    features: pluFeatures,
  },
  decorators: [
    (Story) => (
      <PluFrame>
        <Story />
      </PluFrame>
    ),
  ],
}

export const PluWithDistinctKicker = {
  args: {
    variant: 'plu',
    highlighted: true,
    title: 'Afiliación + Pitbull Classic',
    kicker: 'Hasta el 28 ago',
    price: 120000,
    features: ['Afiliación anual PLU ARG', 'Inscripción Pitbull Classic', 'Un solo pago'],
    compareWith: [{ price: 75000 }, { price: 75000 }],
  },
  decorators: [
    (Story) => (
      <PluFrame>
        <Story />
      </PluFrame>
    ),
  ],
}

export const PluWithBilling = {
  args: {
    variant: 'plu',
    highlighted: true,
    title: 'Afiliación PLU anual',
    kicker: 'Anual',
    price: 75000,
    features: pluFeatures,
    billingToggleEnabled: true,
    billingAutoRenew: false,
    billingToggleHint: 'Pago único por temporada.',
    onBillingAutoRenewChange: () => {},
  },
  decorators: [
    (Story) => (
      <PluFrame>
        <Story />
      </PluFrame>
    ),
  ],
}
