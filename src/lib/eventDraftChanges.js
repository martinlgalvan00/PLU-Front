/**
 * Qué cambió en el borrador de un evento, por área — PLU ARG
 *
 * "Cambios sin guardar" a secas no dice nada: con cinco pestañas y cuatro
 * capítulos de ventas, quien edita no sabe si lo que quedó pendiente es el
 * título, un precio o el cobro, ni si lo que ve en pantalla ya se guardó. Esto
 * compara el borrador contra la firma guardada (la misma que usa el editor
 * para decidir si hay algo para guardar) y devuelve las áreas tocadas, en el
 * orden en que aparecen en el panel.
 *
 * Es sólo información: la decisión de si hay cambios sigue siendo la firma
 * completa, así que un campo que no figure acá no puede esconder un cambio.
 */

/** Área del panel a la que pertenece cada campo del borrador. */
const AREA_OF_FIELD = {
  slots: 'cupo',
  capacityProgressPublic: 'cupo',
  capacityTotalPublic: 'cupo',
  registrationOpensAt: 'cupo',
  registrationClosesAt: 'cupo',
  pricing: 'prices',
  ticketTypes: 'tickets',
  eventDays: 'tickets',
  ticketSalesOpensAt: 'tickets',
  ticketSalesClosesAt: 'tickets',
  paymentChannelOverrides: 'payment',
  bankTransfer: 'payment',
  bankTransferProfileId: 'payment',
  cashPayment: 'payment',
  mercadoPagoProfileId: 'payment',
  status: 'visibility',
  published: 'visibility',
  requiresMembership: 'visibility',
  featured: 'visibility',
  publicSurface: 'visibility',
  publicCopy: 'visibility',
  landing: 'visibility',
  liveStreamUrl: 'visibility',
  liveStreamProvider: 'visibility',
  liveStatus: 'visibility',
}

/** Orden de aparición en el panel. */
export const DRAFT_CHANGE_AREAS = ['basics', 'cupo', 'prices', 'tickets', 'payment', 'visibility']

/** Campos que se actualizan solos y no son una edición de quien usa el panel. */
const IGNORED_FIELDS = new Set(['expectedUpdatedAt'])

export function areaOfDraftField(key) {
  return AREA_OF_FIELD[key] ?? 'basics'
}

/**
 * @param {object} draft borrador actual
 * @param {string|null} baselineSignature `JSON.stringify` del borrador guardado
 * @returns {string[]} áreas con cambios, sin repetir y en orden de panel
 */
export function describeDraftChanges(draft, baselineSignature) {
  if (!draft || typeof baselineSignature !== 'string') return []
  let baseline
  try {
    baseline = JSON.parse(baselineSignature)
  } catch {
    return []
  }
  if (!baseline || typeof baseline !== 'object') return []

  const touched = new Set()
  const keys = new Set([...Object.keys(baseline), ...Object.keys(draft)])
  for (const key of keys) {
    if (IGNORED_FIELDS.has(key)) continue
    if (JSON.stringify(draft[key] ?? null) !== JSON.stringify(baseline[key] ?? null)) {
      touched.add(areaOfDraftField(key))
    }
  }
  return DRAFT_CHANGE_AREAS.filter((area) => touched.has(area))
}
