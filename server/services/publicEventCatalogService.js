function firstEmbeddedRow(value) {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null)
}

/**
 * Submission puede prepararse con el evento ya configurado, sin exponerlo
 * todavía en catálogo, destacados ni navegación. La decisión vive en la misma
 * landing para no mezclarla con `published`, que también gobierna cobros.
 */
export function isPublicCatalogEvent(row) {
  const landing = row?.rules?.landing
  return !(
    String(landing?.templateId ?? '').toLowerCase() === 'submission' &&
    landing?.publicVisible === false
  )
}

/**
 * El service role ignora RLS, por eso el catalogo se depura explicitamente.
 * Lo apagado, vencido, programado o restringido no deja ni precio ni pista en
 * la respuesta publica. La ruta privada de canje es la unica que lo revela.
 */
export function sanitizePublicCatalogEvent(row, now = new Date()) {
  const combo = firstEmbeddedRow(row?.comboOffer ?? row?.combo_offer)
  const startsAt = combo?.starts_at ? new Date(combo.starts_at) : null
  const endsAt = combo?.ends_at ? new Date(combo.ends_at) : null
  const visible =
    combo?.active === true &&
    combo?.audience === 'public' &&
    !combo?.archived_at &&
    (!startsAt || startsAt <= now) &&
    (!endsAt || endsAt >= now)
  const rules = { ...(row?.rules ?? {}) }
  if (!visible) delete rules.comboPrice
  // La URL ya es pública; la ruta interna del bucket no aporta nada al cliente.
  const { logo_path: _logoPath, ...event } = row ?? {}
  return {
    ...event,
    rules,
    comboOffer: visible ? combo : null,
  }
}
