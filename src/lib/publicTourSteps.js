/**
 * publicTourSteps.js — PLU ARG
 *
 * Recorridos guiados de las pantallas públicas: afiliación, alta de cuenta,
 * inscripción a un meet y cuenta del atleta. Mismo motor que el panel
 * (`AdminTourProvider` + `AdminTourOverlay`, montados global en
 * `AppProviders`): cada paso apunta a un elemento real con un selector CSS y
 * el overlay lo resuelve con `document.querySelector`.
 *
 * Dos formas según la pantalla:
 *
 * - **Presentación** (`modal`): tres o cuatro paradas que muestran de qué se
 *   trata la pantalla y dónde está la acción. Sirve para portada, afiliación,
 *   calendario y cuenta.
 * - **Tutorial campo por campo** (`coach`): un paso por cada inciso del
 *   formulario, explicando qué escribir y con un ejemplo. No bloquea nada, así
 *   que la persona completa el campo mientras lee. Es la forma de las dos
 *   pantallas donde realmente se traba la gente: el alta de cuenta y la
 *   inscripción.
 *
 * Los blancos son clases, `name` de campo o ids que ya usaban los componentes,
 * no atributos nuevos. `frame: '.field'` hace que el spotlight ilumine el
 * bloque completo del campo (etiqueta + control + error) apuntando al control,
 * que es lo único con selector estable: los campos de este proyecto no llevan
 * `id`.
 *
 * Convención de ids: `public-<vista>`, para no colisionar con los
 * `admin-<sección>` que ya persisten su "visto" en localStorage.
 */

const FIELD = '.field'

function buildSteps(t, prefix, entries) {
  return entries.map(([target, placement, key, frame = null]) => ({
    target,
    placement,
    frame,
    title: t(`help.tour.${prefix}.${key}.title`),
    body: t(`help.tour.${prefix}.${key}.body`),
  }))
}

/* ── Presentaciones ─────────────────────────────── */

function getHomeTourSteps(t) {
  return buildSteps(t, 'home', [
    ['.hero__cta--primary', 'bottom', 'affiliate'],
    ['#torneo-destacado', 'top', 'meet'],
    ['[data-tour="help-dock"]', 'top', 'help'],
  ])
}

function getMembersTourSteps(t) {
  return buildSteps(t, 'members', [
    ['.members-plu-hero__cta-row', 'bottom', 'start'],
    ['#requisitos', 'top', 'requirements'],
    ['#planes', 'top', 'plans'],
    ['#members-faq', 'top', 'faq'],
  ])
}

function getEventsTourSteps(t) {
  return buildSteps(t, 'events', [
    ['.events-detail__actions', 'top', 'actions'],
    ['[data-tour="help-dock"]', 'top', 'help'],
  ])
}

function getPitbullTourSteps(t) {
  return buildSteps(t, 'pitbull', [['.pitbull-inscription__cta--primary', 'top', 'register']])
}

function getProfileTourSteps(t) {
  return buildSteps(t, 'profile', [
    ['.account-nav', 'bottom', 'tabs'],
    ['[data-tour="help-dock"]', 'top', 'help'],
  ])
}

/* ── Tutoriales campo por campo ─────────────────── */

/**
 * Alta de la ficha de atleta. Cubre los dos tramos del formulario de corrido:
 * los siete campos personales, el botón que pasa de tramo, y los cuatro de
 * ubicación. Los campos del segundo tramo no existen en el DOM hasta que la
 * persona avanza — en modo coach el paso espera a que aparezcan en vez de
 * saltearse, así que el tutorial no se corta a la mitad.
 */
function getRegisterCoachSteps(t) {
  return buildSteps(t, 'registerCoach', [
    ['[name="fullName"]', 'bottom', 'fullName', FIELD],
    ['[name="country"]', 'bottom', 'country', FIELD],
    ['[name="documentId"]', 'bottom', 'documentId', FIELD],
    ['[name="birthDate"]', 'bottom', 'birthDate', FIELD],
    ['[name="email"]', 'bottom', 'email', FIELD],
    ['[name="phone"]', 'bottom', 'phone', FIELD],
    ['[name="password"]', 'bottom', 'password', FIELD],
    ['.register-card__submit', 'top', 'continue'],
    ['[name="province"]', 'bottom', 'province', FIELD],
    ['[name="city"]', 'bottom', 'city', FIELD],
    ['[name="gym"]', 'bottom', 'gym', FIELD],
    ['[name="sex"]', 'bottom', 'sex', FIELD],
    ['.register-card__submit', 'top', 'finish'],
  ])
}

/** Inscripción a un meet: división, categoría, peso, medio de pago y cierre. */
function getCompetitionCoachSteps(t) {
  return buildSteps(t, 'competitionCoach', [
    ['[name="division"]', 'bottom', 'division', FIELD],
    ['[name="category"]', 'bottom', 'category', FIELD],
    ['[name="estimatedWeight"]', 'bottom', 'estimatedWeight', FIELD],
    ['.plu-checkout__methods', 'top', 'method'],
    ['.register-card__submit', 'top', 'finish'],
  ])
}

const PUBLIC_TOURS = Object.freeze({
  home: { build: getHomeTourSteps, mode: 'modal' },
  members: { build: getMembersTourSteps, mode: 'modal' },
  events: { build: getEventsTourSteps, mode: 'modal' },
  pitbull: { build: getPitbullTourSteps, mode: 'modal' },
  profile: { build: getProfileTourSteps, mode: 'modal' },
  register: { build: getRegisterCoachSteps, mode: 'coach' },
  competition: { build: getCompetitionCoachSteps, mode: 'coach' },
})

/** ¿Esta vista tiene recorrido? La ayuda no ofrece "guiame" si no hay nada que señalar. */
export function hasPublicTour(view) {
  return Object.hasOwn(PUBLIC_TOURS, view)
}

/**
 * @param {string} view
 * @param {(key: string, vars?: Record<string, unknown>) => string} t
 * @returns {{ id: string, mode: 'modal' | 'coach', steps: Array<{ target: string, placement: string, frame: string | null, title: string, body: string }> } | null}
 */
export function getPublicTour(view, t) {
  const entry = PUBLIC_TOURS[view]
  if (!entry) return null
  const steps = entry.build(t)
  if (!steps.length) return null
  return { id: `public-${view}`, mode: entry.mode, steps }
}
