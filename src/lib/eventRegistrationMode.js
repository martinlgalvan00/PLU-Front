/**
 * Modo de inscripción de un borrador de evento — PLU ARG
 *
 * El estado guardado de la inscripción no se elige a mano: el staff decide un
 * modo y el borrador queda con el estado y la ventana que le corresponden. Es
 * la misma decisión que el control de venta del workspace
 * (`shared/registrationSaleState.js`), escrita sobre los campos del editor
 * (fechas en formato `datetime-local`).
 *
 *   - `soon`       todavía no abre: se anuncia como próximo.
 *   - `scheduled`  abre sola en `registrationOpensAt`.
 *   - `open`       abierta ya.
 *   - `closed`     cerrada por el staff.
 *   - `ended`      el evento terminó.
 */

export const EVENT_REGISTRATION_MODES = Object.freeze(['soon', 'scheduled', 'open', 'closed', 'ended'])

const OPEN_STATUSES = new Set(['inscripcion_abierta', 'cupos_limitados', 'agotado'])

function isFuture(value, now) {
  if (!value) return false
  const date = new Date(value)
  return !Number.isNaN(date.getTime()) && date > now
}

/** El modo que representa el borrador tal como está. */
export function registrationModeOfDraft(draft, now = new Date()) {
  const status = draft?.status ?? 'proximamente'
  if (status === 'finalizado') return 'ended'
  if (status === 'cerrado') return 'closed'
  if (OPEN_STATUSES.has(status)) {
    return isFuture(draft?.registrationOpensAt, now) ? 'scheduled' : 'open'
  }
  return 'soon'
}

/** El borrador con el estado y la ventana del modo elegido. */
export function applyRegistrationModeToDraft(draft, mode, now = new Date()) {
  switch (mode) {
    case 'scheduled':
      // La fecha la elige el staff en el campo que aparece debajo.
      return { ...draft, status: 'inscripcion_abierta' }
    case 'open':
      return {
        ...draft,
        status: 'inscripcion_abierta',
        // Una apertura pendiente la dejaría "abierta" pero sin poder usarse.
        registrationOpensAt: isFuture(draft?.registrationOpensAt, now) ? '' : (draft?.registrationOpensAt ?? ''),
      }
    case 'closed':
      return { ...draft, status: 'cerrado' }
    case 'ended':
      return { ...draft, status: 'finalizado' }
    default:
      return { ...draft, status: 'proximamente', registrationOpensAt: '' }
  }
}
