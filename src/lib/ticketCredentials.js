/**
 * Subcategorías de entrada y credenciales — PLU ARG
 *
 * Una entrada no es una credencial: es lo que se compra. Las credenciales son
 * lo que esa compra emite, y pueden ser varias. El caso que lo motivó es el
 * entrenador, que paga una vez y recibe dos: la de espectador para la tribuna
 * y la de ENTRENADOR que le abre la entrada en calor, cada una con su QR y
 * cada una canjeable una sola vez en el puesto que le corresponde.
 *
 * Las subcategorías las define el admin, no un enum cerrado: cada credencial
 * es un nombre y un conjunto de zonas.
 *
 * La lógica vive acá y no en el editor porque decide qué se vende y qué abre
 * cada cosa, que es regla de negocio.
 *
 * Vive en `lib/` y no en `services/` porque la comparte el servidor: es la
 * misma convención que `permissions.js` o `gymNormalize.js`. Que el panel y la
 * RPC normalicen distinto sería la forma más silenciosa de vender una entrada
 * que no abre lo que dice abrir.
 */

import { ZONE_SCOPES, isValidZoneScope } from '../services/securityZoneService.js'

export const CREDENTIAL_LABEL_MAX = 40

/** Tope bajo a propósito: más de esto no es un caso real y sí una forma de
 *  inflar el aforo sin que se note. Igual al de la RPC. */
export const CREDENTIALS_PER_TYPE_MAX = 4

/** Lo que emite una entrada común: una credencial que abre la puerta. */
export function defaultTicketCredential() {
  return { label: 'Entrada general', zoneScopes: ['gate_tickets'] }
}

/**
 * El par del entrenador. No es una plantilla estética: es el reparto real
 * —tribuna + entrada en calor— y tenerlo en un botón evita que alguien arme
 * la mitad y venda una entrada de entrenador que no abre el calentamiento.
 */
export function coachTicketCredentials() {
  return [
    { label: 'Espectador', zoneScopes: ['gate_tickets'] },
    { label: 'ENTRENADOR', zoneScopes: ['athletes_coaches'] },
  ]
}

/** Normaliza una credencial suelta. No inventa: sin zonas válidas queda vacía. */
export function normalizeTicketCredential(source) {
  const value = source && typeof source === 'object' ? source : {}
  const scopes = Array.isArray(value.zoneScopes) ? value.zoneScopes : []
  return {
    label: String(value.label ?? '')
      .trim()
      .slice(0, CREDENTIAL_LABEL_MAX),
    zoneScopes: ZONE_SCOPES.filter((scope) => scopes.includes(scope)),
  }
}

/**
 * Credenciales de un tipo de entrada. Una lista vacía cae a la credencial de
 * siempre: un tipo sin credenciales vendería una entrada que no abre nada, y
 * preferimos el comportamiento anterior antes que eso.
 */
export function normalizeTicketCredentials(source) {
  const list = Array.isArray(source) ? source : []
  const normalized = list
    .map(normalizeTicketCredential)
    .filter((credential) => credential.label && credential.zoneScopes.length > 0)
    .slice(0, CREDENTIALS_PER_TYPE_MAX)
  return normalized.length > 0 ? normalized : [defaultTicketCredential()]
}

/**
 * Errores por credencial, para marcar el campo exacto en el editor en vez de
 * un cartel general arriba de todo.
 */
export function validateTicketCredentials(credentials) {
  const list = Array.isArray(credentials) ? credentials : []
  const errors = []

  if (list.length === 0) {
    return [{ index: -1, field: 'list', code: 'empty' }]
  }
  if (list.length > CREDENTIALS_PER_TYPE_MAX) {
    errors.push({ index: -1, field: 'list', code: 'tooMany' })
  }

  const seen = new Set()
  list.forEach((credential, index) => {
    const label = String(credential?.label ?? '').trim()
    const scopes = Array.isArray(credential?.zoneScopes) ? credential.zoneScopes : []

    if (!label) {
      errors.push({ index, field: 'label', code: 'required' })
    } else if (label.length > CREDENTIAL_LABEL_MAX) {
      errors.push({ index, field: 'label', code: 'tooLong' })
    } else if (seen.has(label.toLowerCase())) {
      // Dos credenciales con el mismo nombre en la misma entrada son
      // indistinguibles impresas, que es justo lo que seguridad tiene que poder
      // distinguir.
      errors.push({ index, field: 'label', code: 'duplicate' })
    }
    seen.add(label.toLowerCase())

    // `zonesRequired` y no `required`: un código tiene que identificar el
    // problema, no sólo decir que falta algo. Con el mismo código para el
    // nombre y las zonas, el editor mostraba "Poné un nombre." debajo de los
    // chips de zona.
    if (scopes.length === 0) {
      errors.push({ index, field: 'zoneScopes', code: 'zonesRequired' })
    } else if (scopes.some((scope) => !isValidZoneScope(scope))) {
      errors.push({ index, field: 'zoneScopes', code: 'invalid' })
    }
  })

  return errors
}

/**
 * Cuántas credenciales emite cada compra de este tipo. Es lo que se le muestra
 * al admin junto al cupo, porque "cupo 20" con dos credenciales son 20 lugares
 * y 40 QR, y esa diferencia se presta a confusión.
 */
export function credentialsPerPurchase(credentials) {
  return normalizeTicketCredentials(credentials).length
}

/**
 * Payload para `staff_merge_ticket_type_credentials`.
 *
 * Un tipo recién creado todavía no tiene id -- lo recibe durante el guardado
 * del evento, que no devuelve los tipos --, así que va con su `sortOrder` y la
 * RPC lo resuelve por posición. De lo contrario las credenciales de un tipo
 * nuevo recién se podrían cargar en un segundo guardado, que es justo cuando
 * el admin acaba de elegirlas.
 */
export function buildTicketCredentialsPayload(ticketTypes = []) {
  return ticketTypes.map((type, index) => ({
    ...(type?.id ? { ticketTypeId: type.id } : { sortOrder: type?.sortOrder ?? index }),
    credentials: normalizeTicketCredentials(type?.credentials),
  }))
}

/**
 * Agrupa las credenciales emitidas por compra, para mostrarle al comprador
 * "tu entrada de entrenador: 2 credenciales" en vez de dos filas sueltas que
 * parecen dos compras.
 */
export function groupCredentialsByBundle(tickets = []) {
  const bundles = new Map()
  for (const ticket of tickets) {
    const key = ticket?.bundleId ?? ticket?.bundle_id ?? ticket?.id
    if (!key) continue
    if (!bundles.has(key)) bundles.set(key, [])
    bundles.get(key).push(ticket)
  }
  return [...bundles.entries()].map(([bundleId, list]) => ({
    bundleId,
    // La primaria primero: es la que lleva el precio y los adicionales.
    credentials: [...list].sort(
      (a, b) =>
        Number(b.isPrimaryCredential ?? b.is_primary_credential ?? false) -
        Number(a.isPrimaryCredential ?? a.is_primary_credential ?? false),
    ),
  }))
}
