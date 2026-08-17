/**
 * Pasos de los recorridos guiados del panel admin. Cada paso apunta a un
 * elemento existente en el DOM (clase o id ya usado por el componente real,
 * o un `data-tour="..."` puesto a propósito) y `AdminTourOverlay` lo
 * resuelve con `document.querySelector`. Si un paso no encuentra su blanco
 * (viewport angosto, lista vacía, panel sin seleccionar), el overlay lo
 * salta solo -- no hace falta cubrir cada caso a mano acá.
 *
 * Para agregar el tour de una sección nueva: definir una función
 * `get<Sección>TourSteps(t)` acá y sumarla a `ADMIN_SECTION_TOURS`. El botón
 * de ayuda del shell (`AdminShell`) ya resuelve el tour de la sección activa
 * solo con eso.
 */
export function getAdminIntroTourSteps(t) {
  return [
    {
      target: '[data-tour="admin-nav"]',
      placement: 'right',
      title: t('admin.tour.nav.title'),
      body: t('admin.tour.nav.body'),
    },
    {
      target: '[data-tour="dashboard-search"]',
      placement: 'bottom',
      title: t('admin.tour.search.title'),
      body: t('admin.tour.search.body'),
    },
    {
      target: '[data-tour="dashboard-kpis"]',
      placement: 'bottom',
      title: t('admin.tour.kpis.title'),
      body: t('admin.tour.kpis.body'),
    },
    {
      target: '[data-tour="dashboard-quicklinks"]',
      placement: 'bottom',
      title: t('admin.tour.quicklinks.title'),
      body: t('admin.tour.quicklinks.body'),
    },
    {
      target: '[data-tour="dashboard-queue"]',
      placement: 'top',
      title: t('admin.tour.queue.title'),
      body: t('admin.tour.queue.body'),
    },
    {
      target: '[data-tour="admin-help"]',
      placement: 'bottom',
      title: t('admin.tour.help.title'),
      body: t('admin.tour.help.body'),
    },
  ]
}

export function getAthletesTourSteps(t) {
  return [
    {
      target: '.admin-filters__search',
      placement: 'bottom',
      title: t('admin.tour.athletes.search.title'),
      body: t('admin.tour.athletes.search.body'),
    },
    {
      target: '.admin-filter-chips',
      placement: 'bottom',
      title: t('admin.tour.athletes.filters.title'),
      body: t('admin.tour.athletes.filters.body'),
    },
    {
      target: '.admin-list-shell__stats-strip',
      placement: 'bottom',
      title: t('admin.tour.athletes.stats.title'),
      body: t('admin.tour.athletes.stats.body'),
    },
    {
      target: '.admin-list-shell__body',
      placement: 'top',
      title: t('admin.tour.athletes.table.title'),
      body: t('admin.tour.athletes.table.body'),
    },
  ]
}

export function getMembershipsTourSteps(t) {
  return [
    {
      target: '.admin-filters__search',
      placement: 'bottom',
      title: t('admin.tour.memberships.search.title'),
      body: t('admin.tour.memberships.search.body'),
    },
    {
      target: '.admin-filter-chips',
      placement: 'bottom',
      title: t('admin.tour.memberships.filters.title'),
      body: t('admin.tour.memberships.filters.body'),
    },
    {
      target: '.admin-list-shell__stats-strip',
      placement: 'bottom',
      title: t('admin.tour.memberships.stats.title'),
      body: t('admin.tour.memberships.stats.body'),
    },
    {
      target: '.admin-membership-actions',
      placement: 'left',
      title: t('admin.tour.memberships.actions.title'),
      body: t('admin.tour.memberships.actions.body'),
    },
  ]
}

export function getRegistrationsTourSteps(t) {
  return [
    {
      target: '.admin-filters__search',
      placement: 'bottom',
      title: t('admin.tour.registrations.search.title'),
      body: t('admin.tour.registrations.search.body'),
    },
    {
      target: '.admin-filter-chips',
      placement: 'bottom',
      title: t('admin.tour.registrations.filters.title'),
      body: t('admin.tour.registrations.filters.body'),
    },
    {
      target: '.admin-list-shell__actions',
      placement: 'left',
      title: t('admin.tour.registrations.exports.title'),
      body: t('admin.tour.registrations.exports.body'),
    },
    {
      target: '.admin-list-shell__stats-strip',
      placement: 'bottom',
      title: t('admin.tour.registrations.stats.title'),
      body: t('admin.tour.registrations.stats.body'),
    },
    {
      target: '.admin-list-shell__body',
      placement: 'top',
      title: t('admin.tour.registrations.table.title'),
      body: t('admin.tour.registrations.table.body'),
    },
  ]
}

export function getEventsTourSteps(t) {
  return [
    {
      target: '.admin-events__header-actions',
      placement: 'left',
      title: t('admin.tour.events.create.title'),
      body: t('admin.tour.events.create.body'),
    },
    {
      target: '.admin-events-kpis',
      placement: 'bottom',
      title: t('admin.tour.events.kpis.title'),
      body: t('admin.tour.events.kpis.body'),
    },
    {
      target: '.admin-event-list',
      placement: 'right',
      title: t('admin.tour.events.list.title'),
      body: t('admin.tour.events.list.body'),
    },
    {
      target: '.admin-event-preview',
      placement: 'left',
      title: t('admin.tour.events.preview.title'),
      body: t('admin.tour.events.preview.body'),
    },
  ]
}

export function getPaymentsTourSteps(t) {
  return [
    {
      target: '.admin-payments-ops-strip__kpis',
      placement: 'bottom',
      title: t('admin.tour.payments.kpis.title'),
      body: t('admin.tour.payments.kpis.body'),
    },
    {
      target: '#admin-athlete-payments',
      placement: 'top',
      title: t('admin.tour.payments.athletes.title'),
      body: t('admin.tour.payments.athletes.body'),
    },
    {
      target: '#admin-ticket-orders',
      placement: 'top',
      title: t('admin.tour.payments.tickets.title'),
      body: t('admin.tour.payments.tickets.body'),
    },
    {
      target: '#admin-payment-ledger',
      placement: 'top',
      title: t('admin.tour.payments.ledger.title'),
      body: t('admin.tour.payments.ledger.body'),
    },
  ]
}

export function getPricingTourSteps(t) {
  return [
    {
      target: '.admin-pricing__hero',
      placement: 'bottom',
      title: t('admin.tour.pricing.intro.title'),
      body: t('admin.tour.pricing.intro.body'),
    },
    {
      target: 'section[aria-labelledby="pricing-plans-title"]',
      placement: 'top',
      title: t('admin.tour.pricing.plans.title'),
      body: t('admin.tour.pricing.plans.body'),
    },
    {
      target: 'section[aria-labelledby="pricing-combo-title"]',
      placement: 'top',
      title: t('admin.tour.pricing.combos.title'),
      body: t('admin.tour.pricing.combos.body'),
    },
    {
      target: 'section[aria-labelledby="pricing-codes-title"]',
      placement: 'top',
      title: t('admin.tour.pricing.codes.title'),
      body: t('admin.tour.pricing.codes.body'),
    },
    {
      target: 'section[aria-labelledby="pricing-subscriptions-title"]',
      placement: 'top',
      title: t('admin.tour.pricing.subscriptions.title'),
      body: t('admin.tour.pricing.subscriptions.body'),
    },
  ]
}

export function getAccessGatesTourSteps(t) {
  return [
    {
      target: '.admin-registration-access__hero',
      placement: 'bottom',
      title: t('admin.tour.accessGates.intro.title'),
      body: t('admin.tour.accessGates.intro.body'),
    },
    {
      target: 'section[aria-labelledby="access-toggles-title"]',
      placement: 'top',
      title: t('admin.tour.accessGates.toggles.title'),
      body: t('admin.tour.accessGates.toggles.body'),
    },
    {
      target: 'section[aria-labelledby="access-gates-private-title"]',
      placement: 'top',
      title: t('admin.tour.accessGates.gates.title'),
      body: t('admin.tour.accessGates.gates.body'),
    },
  ]
}

/** Sección activa (key de `ADMIN_SECTIONS`) -> id de tour + pasos. Usado por
 * el botón de ayuda del shell para repetir el tour de lo que se está viendo. */
export const ADMIN_SECTION_TOURS = {
  dashboard: { id: 'admin-intro', getSteps: getAdminIntroTourSteps },
  athletes: { id: 'admin-athletes', getSteps: getAthletesTourSteps },
  memberships: { id: 'admin-memberships', getSteps: getMembershipsTourSteps },
  registrations: { id: 'admin-registrations', getSteps: getRegistrationsTourSteps },
  events: { id: 'admin-events', getSteps: getEventsTourSteps },
  payments: { id: 'admin-payments', getSteps: getPaymentsTourSteps },
  pricing: { id: 'admin-pricing', getSteps: getPricingTourSteps },
  'access-gates': { id: 'admin-access-gates', getSteps: getAccessGatesTourSteps },
}

export function getTourForSection(sectionKey, t) {
  const entry = ADMIN_SECTION_TOURS[sectionKey]
  if (!entry) return null
  return { id: entry.id, steps: entry.getSteps(t) }
}
