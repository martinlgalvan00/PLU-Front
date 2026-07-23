import HomeMembershipBand from './HomeMembershipBand.jsx'

export default {
  title: 'UI/HomeMembershipBand',
  component: HomeMembershipBand,
  tags: ['autodocs'],
  args: {
    onNavigate: () => {},
  },
}

/** Visitante sin sesión — CTA "Ver planes". */
export const Default = {}

/** Atleta logueado sin afiliación activa — CTA "Afiliarme". */
export const LoggedInNoMembership = {
  args: { isLoggedInAthlete: true, hasActiveMembership: false },
}

/** Atleta ya afiliado — CTA "Ya afiliado", lleva a su perfil. */
export const AlreadyAffiliated = {
  args: { isLoggedInAthlete: true, hasActiveMembership: true },
}
