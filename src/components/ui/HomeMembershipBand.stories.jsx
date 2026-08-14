import HomeMembershipBand from './HomeMembershipBand.jsx'

export default {
  title: 'UI/HomeMembershipBand',
  component: HomeMembershipBand,
  tags: ['autodocs'],
  args: {
    onNavigate: () => {},
  },
}

/** Visitante: con promo viva el CTA primario es el combo. */
export const Default = {}

/** Atleta logueado sin afiliación activa — combo + afiliación subordinada. */
export const LoggedInNoMembership = {
  args: { isLoggedInAthlete: true, hasActiveMembership: false },
}

/** Atleta ya afiliado — sin combo; CTA "Ya afiliado". */
export const AlreadyAffiliated = {
  args: { isLoggedInAthlete: true, hasActiveMembership: true },
}

export const ComboPromo = {
  args: {
    gateEvent: {
      slug: 'pitbull-classic-2026',
      title: 'Pitbull Classic',
      status: 'inscripcion_abierta',
      price: 75000,
      pricing: { membership: 75000, registration: 75000, combo: 120000 },
      comboOffer: {
        active: true,
        price: 120000,
        currency: 'ARS',
        startsAt: '2020-01-01T00:00:00.000Z',
        endsAt: '2026-08-28T23:59:59-03:00',
      },
    },
    onSelectEvent: () => {},
  },
}
