/**
 * Mensaje de un preview de código rechazado.
 *
 * `not_applicable` trae el alcance real del código (`appliesTo`): sin eso la
 * pantalla solo dice "no aplica a este pago" y el atleta no sabe si el código
 * es de afiliación, de inscripción o del paquete combo.
 */
const NOT_APPLICABLE_SCOPES = new Set(['membership', 'registration', 'combo', 'both'])

export function describeDiscountPreviewError(t, preview, namespace) {
  if (preview?.reason === 'other_event' && preview?.eventTitle) {
    return t(`${namespace}.other_event_named`, { event: preview.eventTitle })
  }
  if (preview?.reason === 'not_applicable' && NOT_APPLICABLE_SCOPES.has(preview.appliesTo)) {
    return t(`${namespace}.not_applicable_${preview.appliesTo}`)
  }
  return t(`${namespace}.${preview?.reason ?? 'not_found'}`)
}
