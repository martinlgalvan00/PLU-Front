/** Orden lógico de vistas para inferir dirección de transición (forward / back). */
export const VIEW_RANK = {
  home: 0,
  notFound: 5,
  members: 10,
  membership: 11,
  register: 12,
  pitbull: 20,
  tickets: 21,
  events: 30,
  competition: 31,
  results: 40,
  records: 45,
  resources: 48,
  rulebook: 50,
  community: 60,
  faq: 70,
  contact: 80,
  login: 90,
  profile: 95,
  admin: 100,
}

export function getTransitionDirection(fromView, toView) {
  const fromRank = VIEW_RANK[fromView] ?? 50
  const toRank = VIEW_RANK[toView] ?? 50
  return toRank >= fromRank ? 'forward' : 'back'
}

const ATHLETE_DESTINATIONS = new Set(['membership', 'competition'])

export const DEFAULT_ACCOUNT_TAB = 'account-qr'
export const ACCOUNT_MEMBERSHIP_TAB = 'account-membership'

/**
 * El cobro de afiliación vive en la cuenta (`#account-membership`), no en un
 * checkout paralelo. `navigate('membership')` y el pending post-login siguen
 * usando esa vista para no perder la intención; acá se traduce al tab.
 */
export function resolveMembershipCheckout(view, options = {}) {
  if (view !== 'membership') return { view, options }
  return {
    view: 'profile',
    options: { ...options, tab: ACCOUNT_MEMBERSHIP_TAB },
  }
}

/**
 * Conserva la acción que llevó a una persona al login. El login del atleta
 * navega a `profile` por defecto; si antes había elegido afiliarse o
 * inscribirse, se retoma ese destino en vez de perder la intención.
 */
export function resolveAfterLoginDestination(nextView, role, pendingDestination) {
  if (
    nextView === 'profile' &&
    role === 'athlete_plu' &&
    ATHLETE_DESTINATIONS.has(pendingDestination?.view)
  ) {
    return pendingDestination
  }

  return { view: nextView, options: {} }
}
