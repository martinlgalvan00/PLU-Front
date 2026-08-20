function firstEmbeddedRow(value) {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null)
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
  return {
    ...row,
    rules,
    comboOffer: visible ? combo : null,
  }
}
