/**
 * athleteJourney.js — PLU ARG
 *
 * "¿En qué paso del trámite estoy?" resuelto en un solo lugar.
 *
 * El trámite real es una cadena de tres eslabones con precondiciones —
 * cuenta → afiliación → inscripción — repartida en cuatro pantallas
 * distintas. La ayuda guiada (`HelpPanel`) lo consume para decir cuál es el
 * próximo paso *de esta persona* en vez de repetir un texto fijo de tres
 * pasos que no sabe si ya tenés cuenta, afiliación vigente o inscripción
 * paga (era el problema de la guía anterior de la portada).
 *
 * No decide precios, permisos ni cupos: sólo compone estado que ya resuelven
 * `membershipService` (vigencia) y `athleteEventStatus` (inscripción). Si un
 * día cambia la regla de "qué cuenta como afiliado", cambia allá y acá se
 * entera solo.
 */

import { hasCurrentMembership, isMembershipCurrent } from '../services/membershipService.js'
import { resolveAthleteEventStatus } from './athleteEventStatus.js'
import { ACCOUNT_EVENTS_TAB, DEFAULT_ACCOUNT_TAB } from './navigation.js'

/** Orden del trámite. El índice es el número que se muestra en pantalla. */
export const JOURNEY_STEP_IDS = Object.freeze(['account', 'membership', 'registration'])

/**
 * `done` cerrado, `todo` es el que toca ahora, `blocked` necesita un paso
 * anterior, `pending` está pago/enviado pero sin acreditar, `closed` el meet
 * ya no toma inscripciones y `unavailable` no hay meet al que inscribirse.
 */
export const JOURNEY_STATES = Object.freeze({
  DONE: 'done',
  TODO: 'todo',
  BLOCKED: 'blocked',
  PENDING: 'pending',
  CLOSED: 'closed',
  UNAVAILABLE: 'unavailable',
})

const { DONE, TODO, BLOCKED, PENDING, CLOSED, UNAVAILABLE } = JOURNEY_STATES

/** Traducción del estado del atleta frente al meet al estado del paso 3. */
const REGISTRATION_STATE_BY_EVENT_STATUS = Object.freeze({
  registered: DONE,
  pending_payment: PENDING,
  closed: CLOSED,
  needs_membership: BLOCKED,
  guest: BLOCKED,
  can_register: TODO,
})

function findCurrentMembership(memberships, athleteId, now) {
  if (!athleteId) return null
  return (
    (Array.isArray(memberships) ? memberships : []).find(
      (membership) => membership?.athleteId === athleteId && isMembershipCurrent(membership, now),
    ) ?? null
  )
}

/**
 * @param {{
 *   session?: { role?: string, athleteId?: string, email?: string } | null,
 *   memberships?: unknown[],
 *   registrations?: unknown[],
 *   event?: { slug?: string, title?: string, requiresMembership?: boolean, status?: string } | null,
 *   now?: Date,
 * }} input
 */
export function resolveAthleteJourney({
  session = null,
  memberships = [],
  registrations = [],
  event = null,
  now = new Date(),
} = {}) {
  const isAthlete = session?.role === 'athlete_plu'
  const athleteId = isAthlete ? session.athleteId : null

  const accountState = isAthlete ? DONE : TODO

  const membershipOk = isAthlete && hasCurrentMembership(memberships, athleteId, now)
  const membershipState = !isAthlete ? BLOCKED : membershipOk ? DONE : TODO
  const currentMembership = membershipOk ? findCurrentMembership(memberships, athleteId, now) : null

  const eventStatus = event?.slug
    ? resolveAthleteEventStatus({ event, session, registrations, memberships })
    : null
  const registrationState = eventStatus
    ? (REGISTRATION_STATE_BY_EVENT_STATUS[eventStatus] ?? UNAVAILABLE)
    : UNAVAILABLE

  const steps = [
    { id: 'account', index: 1, state: accountState },
    { id: 'membership', index: 2, state: membershipState },
    { id: 'registration', index: 3, state: registrationState },
  ]

  return {
    steps,
    /** Fecha de vencimiento de la afiliación vigente, para el detalle del paso 2. */
    membershipExpiresAt: currentMembership?.expirationDate ?? null,
    eventTitle: event?.title ?? null,
    eventStatus,
    complete: steps.every((step) => step.state === DONE),
    next: resolveNextAction(steps),
  }
}

/**
 * ¿La acción del panel llevaría a la pantalla en la que ya estamos?
 *
 * Un botón principal que no cambia nada es peor que no tenerlo: en el alta de
 * cuenta, "Crear mi cuenta" navegaba a la misma vista y no pasaba nada. Sólo
 * cuenta como redundante cuando la navegación es exactamente la misma vista
 * *sin* opciones — `membership` se traduce a una ficha de la cuenta y
 * `credential`/`events` cambian de ficha, así que ésas siguen haciendo algo.
 *
 * @param {{ intent?: string, view?: string, options?: object }} next
 * @param {string} view vista activa de `App`
 */
export function isJourneyActionRedundant(next, view) {
  if (!next || !view) return false
  if (next.intent === 'event') return view === 'competition'
  return next.intent === 'view' && next.view === view && !next.options
}

/**
 * La única acción que la ayuda ofrece. Deliberadamente una: el público al que
 * apunta esta pantalla no elige entre tres botones, sigue el que le señalan.
 *
 * `intent` lo traduce `HelpPanel` a la navegación que ya existe en `App`
 * (`navigate`, `selectEvent`), así que la ayuda no abre rutas ni checkouts
 * propios — reusa exactamente el mismo camino que los CTA de cada pantalla.
 * `actionKey` es el identificador semántico del botón; el copy lo resuelve el
 * componente contra `help.action*`.
 */
function resolveNextAction(steps) {
  const byId = Object.fromEntries(steps.map((step) => [step.id, step.state]))

  if (byId.account === TODO) {
    return { step: 'account', intent: 'view', view: 'register', actionKey: 'account' }
  }
  if (byId.membership === TODO) {
    return { step: 'membership', intent: 'view', view: 'membership', actionKey: 'membership' }
  }
  if (byId.registration === TODO) {
    return { step: 'registration', intent: 'event', actionKey: 'registration' }
  }
  // Inscripción cargada sin acreditar: el checkout retoma la orden pendiente,
  // así que el próximo paso sigue siendo el mismo camino, no la cuenta.
  if (byId.registration === PENDING) {
    return { step: 'registration', intent: 'event', actionKey: 'registrationPending' }
  }
  // Llegar acá implica cuenta y afiliación resueltas (los dos chequeos de
  // arriba salen antes). Sin meet abierto al que inscribirse, lo útil que
  // queda es la cuenta: las competencias si el meet cerró, la credencial si
  // el trámite está completo.
  if (byId.registration === CLOSED || byId.registration === UNAVAILABLE) {
    return {
      step: null,
      intent: 'view',
      view: 'profile',
      options: { tab: ACCOUNT_EVENTS_TAB },
      actionKey: 'events',
    }
  }

  return {
    step: null,
    intent: 'view',
    view: 'profile',
    options: { tab: DEFAULT_ACCOUNT_TAB },
    actionKey: 'credential',
  }
}
