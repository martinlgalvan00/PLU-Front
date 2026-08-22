/**
 * publicTourSteps.js — PLU ARG
 *
 * Recorridos guiados de las pantallas públicas y de la cuenta. Mismo motor que
 * el panel (`AdminTourProvider` + `AdminTourOverlay`, montados global en
 * `AppProviders`): cada paso apunta a un elemento real con un selector CSS y el
 * overlay lo resuelve quedándose con el primero **visible**.
 *
 * Dos formas, y una sola se ofrece por pantalla:
 *
 * - **Tutorial campo por campo** (`coach`) en las tres pantallas con
 *   formulario — entrar, crear la cuenta e inscribirse. Un paso por inciso,
 *   con qué escribir y un ejemplo. No bloquea nada: la persona completa el
 *   campo mientras lee.
 * - **Orientación** (`modal`) en todas las demás. No presenta la pantalla:
 *   enseña a *moverse* — el escudo que vuelve al inicio, dónde está la
 *   afiliación, dónde se abre el resto del sitio, dónde se entra a la cuenta,
 *   dónde está la ayuda y qué hay en el pie. Termina en el punto de acción de
 *   la pantalla donde se lanzó, así la orientación no queda abstracta.
 *
 * La orientación tiene una variante propia para el modo simple, donde la
 * navegación *es* la barra de cuatro botones y explicar el navbar completo
 * sería explicar algo que la persona no está viendo.
 *
 * Convenciones:
 * - Los blancos son clases, `name` de campo o `data-tour` que ya existen. Un
 *   paso puede listar varios selectores separados por coma: el overlay se
 *   queda con el visible, que es lo que resuelve desktop vs mobile (el navbar
 *   monta las dos versiones y esconde una con `display: none`).
 * - `frame` hace que el spotlight ilumine el bloque completo del campo
 *   (etiqueta + control + error) apuntando al control, que es lo único con
 *   selector estable: los campos de este proyecto no llevan `id`.
 * - Ids `public-<vista>` y `public-orientation[-simple]`, para no colisionar
 *   con los `admin-<sección>` que persisten su "visto" en localStorage.
 */

const FIELD = '.field'
const LOGIN_FIELD = '.login-field'

/** El navbar monta desktop y mobile a la vez; el overlay elige el visible. */
const NAV_BRAND = '.plu-global-nav__brand'
const NAV_AFFILIATE = '.plu-global-nav__link--affiliate, .plu-global-nav__mobile-affiliate'
const NAV_MENU = '.plu-global-nav__dropdown, .plu-global-nav__menu-button'
const NAV_ACCOUNT =
  '.plu-global-nav__login, .plu-global-nav__profile, .plu-global-nav__mobile-login'
const HELP_TRIGGER = '[data-tour~="help-dock"]'

function buildSteps(t, prefix, entries) {
  return entries.map(([target, placement, key, frame = null]) => ({
    target,
    placement,
    frame,
    title: t(`help.tour.${prefix}.${key}.title`),
    body: t(`help.tour.${prefix}.${key}.body`),
  }))
}

/* ── Orientación ────────────────────────────────── */

/**
 * Punto de acción por pantalla: el último paso de la orientación aterriza en
 * lo que esa pantalla concretamente ofrece hacer. Las pantallas con formulario
 * no están acá porque tienen su propio tutorial.
 */
const ORIENTATION_ACTION = Object.freeze({
  home: '.hero__cta--primary',
  members: '.members-plu-hero__cta-row',
  events: '.events-detail__actions',
  pitbull: '.pitbull-inscription__cta--primary',
  profile: '.account-nav',
})

/** `App` no monta el pie en estas dos vistas: el paso no tendría blanco. */
const VIEWS_WITHOUT_FOOTER = new Set(['login', 'register'])

/**
 * @param {(key: string, vars?: Record<string, unknown>) => string} t
 * @param {{ assist?: boolean, view?: string | null }} options
 */
export function getOrientationTour(t, { assist = false, view = null } = {}) {
  const entries = assist
    ? [
        ['[data-tour~="assist-nav-home"]', 'top', 'assistHome'],
        ['[data-tour~="assist-nav-action"]', 'top', 'assistAction'],
        ['[data-tour~="assist-nav-account"]', 'top', 'assistAccount'],
        ['[data-tour~="assist-nav-help"]', 'top', 'assistHelp'],
      ]
    : [
        [NAV_BRAND, 'bottom', 'brand'],
        [NAV_AFFILIATE, 'bottom', 'affiliate'],
        [NAV_MENU, 'bottom', 'menu'],
        [NAV_ACCOUNT, 'bottom', 'account'],
        [HELP_TRIGGER, 'top', 'help'],
      ]

  const action = view ? ORIENTATION_ACTION[view] : null
  if (action) entries.push([action, 'top', `action_${view}`])
  if (!VIEWS_WITHOUT_FOOTER.has(view)) entries.push(['.site-footer', 'top', 'footer'])

  return {
    id: assist ? 'public-orientation-simple' : 'public-orientation',
    mode: 'modal',
    kind: 'orientation',
    steps: buildSteps(t, 'orientation', entries),
  }
}

/* ── Tutoriales campo por campo ─────────────────── */

/** Entrar con una cuenta que ya existe. Es donde más se traba quien ya se
 *  registró y no logra volver a entrar. */
function getLoginCoachSteps(t) {
  return buildSteps(t, 'loginCoach', [
    ['[name="email"]', 'bottom', 'email', LOGIN_FIELD],
    ['[name="password"]', 'bottom', 'password', LOGIN_FIELD],
    ['.login-field__forgot', 'bottom', 'forgot'],
    ['.login-submit', 'top', 'submit'],
    ['.login-join__link', 'top', 'join'],
  ])
}

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

const FIELD_COACHES = Object.freeze({
  login: getLoginCoachSteps,
  register: getRegisterCoachSteps,
  competition: getCompetitionCoachSteps,
})

/** ¿Esta pantalla se guía campo por campo, o se orienta la navegación? */
export function hasFieldCoach(view) {
  return Object.hasOwn(FIELD_COACHES, view)
}

/**
 * El recorrido que ofrece la ayuda en esta pantalla. Uno solo: si la pantalla
 * tiene formulario, el tutorial de sus campos; si no, la orientación.
 *
 * @param {string} view
 * @param {(key: string, vars?: Record<string, unknown>) => string} t
 * @param {{ assist?: boolean }} options
 * @returns {{ id: string, mode: 'modal' | 'coach', kind: 'coach' | 'orientation', steps: Array<object> }}
 */
export function getPublicTour(view, t, { assist = false } = {}) {
  const build = FIELD_COACHES[view]
  if (build) {
    return { id: `public-${view}`, mode: 'coach', kind: 'coach', steps: build(t) }
  }
  return getOrientationTour(t, { assist, view })
}
