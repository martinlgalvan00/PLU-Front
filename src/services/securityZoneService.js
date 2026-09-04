/**
 * Zonas de seguridad del evento — PLU ARG
 *
 * Una zona es un lugar físico del meet (puerta, pesaje, calentamiento,
 * plataforma) con un alcance de escaneo y un turno. Agrupa a las cuentas de
 * seguridad del evento, que antes eran una lista plana donde todas podían leer
 * cualquier credencial a cualquier hora.
 *
 * La lógica vive acá y no en el componente: el alcance decide qué se puede
 * escanear, y eso es una regla de negocio, no una decisión de presentación.
 */

export const ZONE_SCOPES = ['gate_tickets', 'athletes_only', 'athletes_coaches', 'staff_only']

export const ZONE_MEMBERS_MAX = 20

/**
 * Alcance → qué credenciales puede leer el grupo de esa zona.
 *
 * `athletes_coaches` (la entrada en calor) aceptaba `membership`, o sea que
 * entraba cualquier afiliado con credencial vigente: no había forma de que
 * seguridad distinguiera a un entrenador que pagó su lugar. Ahora lee la
 * credencial de ENTRENADOR, que es un `ticket` emitido por una entrada cuya
 * subcategoría declara este alcance, y deja de leer afiliaciones.
 *
 * Ojo que esto es una lista por TIPO de credencial: que una zona lea `ticket`
 * no quiere decir que lea cualquier entrada. Qué zonas abre cada credencial se
 * decide por `credential_scopes`, que viaja congelado en la entrada emitida y
 * lo valida `staff_check_in_ticket` en el servidor. Este mapa es el primer
 * filtro, no la autorización.
 */
const SCOPE_CREDENTIALS = {
  gate_tickets: ['ticket', 'registration', 'membership'],
  athletes_only: ['registration'],
  athletes_coaches: ['registration', 'ticket'],
  staff_only: [],
}

export function getZoneScopeCredentials(scope) {
  return SCOPE_CREDENTIALS[scope] ?? []
}

export function canZoneScanCredential(scope, credentialKind) {
  return getZoneScopeCredentials(scope).includes(credentialKind)
}

export function isValidZoneScope(scope) {
  return ZONE_SCOPES.includes(scope)
}

/** Opciones del selector de alcance, traducidas. */
export function getZoneScopeOptions(t) {
  return ZONE_SCOPES.map((scope) => [scope, t(`admin.eventZones.scope.${scope}`)])
}

/**
 * Turno de la zona en una línea. Sin turno cargado no se inventa uno: la zona
 * cubre todo el evento y eso se dice, porque un rango vacío se leía como
 * "falta un dato" cuando muchas veces es la intención.
 */
export function formatZoneShift(zone, locale, t) {
  if (!zone?.shiftStart && !zone?.shiftEnd) return t('admin.eventZones.shiftAllDay')

  const intlLocale = locale === 'es' ? 'es-AR' : 'en-US'
  const dayTime = new Intl.DateTimeFormat(intlLocale, {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
  const timeOnly = new Intl.DateTimeFormat(intlLocale, { hour: '2-digit', minute: '2-digit' })

  const start = zone.shiftStart ? new Date(zone.shiftStart) : null
  const end = zone.shiftEnd ? new Date(zone.shiftEnd) : null

  if (start && !end) return t('admin.eventZones.shiftFrom', { time: dayTime.format(start) })
  if (!start && end) return t('admin.eventZones.shiftUntil', { time: dayTime.format(end) })

  const sameDay = start.toDateString() === end.toDateString()
  return `${dayTime.format(start)}–${sameDay ? timeOnly.format(end) : dayTime.format(end)}`
}

/** Iniciales para el avatar del integrante. Una sola letra si no hay apellido. */
export function getMemberInitials(name, email = '') {
  const source = String(name ?? '').trim() || String(email ?? '').split('@')[0] || ''
  const parts = source
    .replace(/[._-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts.at(-1)[0]}`.toUpperCase()
}

/**
 * Reparte las cuentas de seguridad del evento entre sus zonas. Lo que no tiene
 * zona no se esconde: sale en `unassigned`, porque una cuenta creada y sin
 * puesto es justamente lo que hay que resolver antes del meet.
 */
export function groupSecurityTeamByZone(zones = [], users = []) {
  const byZone = new Map(zones.map((zone) => [zone.id, []]))
  const unassigned = []

  for (const user of users) {
    const bucket = user.securityZoneId ? byZone.get(user.securityZoneId) : null
    if (bucket) bucket.push(user)
    else unassigned.push(user)
  }

  return {
    zones: zones.map((zone) => {
      const members = byZone.get(zone.id) ?? []
      return {
        ...zone,
        members,
        activeCount: members.filter((member) => member.status === 'active').length,
      }
    }),
    unassigned,
  }
}

/** Resumen del operativo: lo que el operador necesita saber de un vistazo. */
export function buildZoneTeamSummary(grouped) {
  const zoneCount = grouped.zones.length
  const assigned = grouped.zones.reduce((total, zone) => total + zone.members.length, 0)
  const active = grouped.zones.reduce((total, zone) => total + zone.activeCount, 0)

  return {
    zoneCount,
    memberCount: assigned + grouped.unassigned.length,
    activeCount: active,
    unassignedCount: grouped.unassigned.length,
    emptyZoneCount: grouped.zones.filter((zone) => zone.members.length === 0).length,
  }
}

/** Payload del alta/edición de una zona a partir del borrador del formulario. */
export function buildZonePayload(form) {
  return {
    name: String(form?.name ?? '').trim(),
    scope: isValidZoneScope(form?.scope) ? form.scope : 'gate_tickets',
    shiftStart: form?.shiftStart ? form.shiftStart : null,
    shiftEnd: form?.shiftEnd ? form.shiftEnd : null,
  }
}

export function validateZoneForm(form) {
  const errors = {}
  const name = String(form?.name ?? '').trim()

  if (name.length < 2) errors.name = 'nameMin'
  else if (name.length > 60) errors.name = 'nameMax'
  if (!isValidZoneScope(form?.scope)) errors.scope = 'scopeInvalid'
  if (form?.shiftStart && form?.shiftEnd && form.shiftEnd <= form.shiftStart) {
    errors.shiftEnd = 'shiftOrder'
  }

  return { errors, isValid: Object.keys(errors).length === 0 }
}

export function createZoneForm(zone = null) {
  return {
    name: zone?.name ?? '',
    scope: zone?.scope ?? 'gate_tickets',
    shiftStart: toDateTimeLocal(zone?.shiftStart),
    shiftEnd: toDateTimeLocal(zone?.shiftEnd),
  }
}

function toDateTimeLocal(value) {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  const offset = parsed.getTimezoneOffset() * 60_000
  return new Date(parsed.getTime() - offset).toISOString().slice(0, 16)
}
