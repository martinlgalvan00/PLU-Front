/** Orden lógico de vistas para inferir dirección de transición (forward / back). */
export const VIEW_RANK = {
  home: 0,
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
