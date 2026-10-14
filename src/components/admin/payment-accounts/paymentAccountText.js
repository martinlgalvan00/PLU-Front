/**
 * Textos derivados de una cuenta de cobro (payment_profile). Viven aparte para
 * que el selector del editor de eventos y el panel de cuentas digan lo mismo.
 */

/** "Quién cobra": la cuenta de MP con la que se inició sesión, o el alias. */
export function paymentAccountHolder(profile) {
  const config = profile?.config ?? {}
  if (profile?.kind === 'mercado_pago') {
    return (
      config.accountNickname ||
      config.accountEmail ||
      config.accountName ||
      (config.collectorId ? `#${config.collectorId}` : '') ||
      (config.publicKey ? `${String(config.publicKey).slice(0, 14)}…` : '')
    )
  }
  return [config.alias, config.holder].filter(Boolean).join(' · ')
}

/**
 * Estado de una cuenta de MP. El servidor ya lo calcula (`connectionStatus`);
 * se recalcula si falta para no depender de una respuesta vieja.
 */
export function mercadoPagoAccountStatus(profile, now = new Date()) {
  if (profile?.connectionStatus) return profile.connectionStatus
  const config = profile?.config ?? {}
  if (config.connection !== 'oauth') return 'manual'
  if (config.status === 'needs_reconnect') return 'needs_reconnect'
  const expiresAt = config.expiresAt ? Date.parse(config.expiresAt) : NaN
  if (Number.isFinite(expiresAt)) {
    if (expiresAt <= now.getTime()) return 'needs_reconnect'
    if (expiresAt - now.getTime() <= 15 * 86_400_000) return 'expiring'
  }
  return 'connected'
}

/** Opción del selector: "Nombre · cuenta". */
export function paymentAccountOptionLabel(profile) {
  const holder = paymentAccountHolder(profile)
  return holder && holder !== profile?.name ? `${profile.name} · ${holder}` : profile?.name
}

const OAUTH_ERROR_KEYS = {
  MP_OAUTH_NOT_CONFIGURED: 'oauthErrorNotConfigured',
  MP_OAUTH_STATE_EXPIRED: 'oauthErrorExpired',
  MP_OAUTH_STATE_INVALID: 'oauthErrorInvalid',
  MP_OAUTH_ACCOUNT_MISMATCH: 'oauthErrorMismatch',
  MP_OAUTH_ALREADY_LINKED: 'oauthErrorAlreadyLinked',
  MP_OAUTH_INVALID_GRANT: 'oauthErrorInvalidGrant',
  POPUP_BLOCKED: 'oauthErrorPopupBlocked',
}

/** Mensaje para el resultado fallido de una vinculación. */
export function mercadoPagoOAuthErrorMessage(t, error) {
  if (!error) return ''
  if (error.status === 'cancelled') return t('admin.paymentAccounts.oauthCancelled')
  const key = OAUTH_ERROR_KEYS[error.code]
  if (key) return t(`admin.paymentAccounts.${key}`)
  return error.message || t('admin.paymentAccounts.oauthErrorGeneric')
}
