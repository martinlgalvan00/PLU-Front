import { mercadoPagoAccountStatus, paymentAccountHolder } from './paymentAccountText.js'
import '../../../styles/components/admin-payment-accounts.css'

function formatDate(value, locale) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(locale === 'en' ? 'en-US' : 'es-AR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/**
 * Una línea que dice en qué cuenta entra la plata y si puede seguir cobrando.
 * El estado viaja en el texto; el punto y el color solo lo refuerzan.
 */
export default function MercadoPagoAccountStatus({ t, locale = 'es', profile, action = null }) {
  if (!profile) return null
  const status = mercadoPagoAccountStatus(profile)
  const holder = paymentAccountHolder(profile) || profile.name
  const expiresOn = formatDate(profile.config?.expiresAt, locale)
  const text =
    status === 'manual'
      ? t('admin.paymentAccounts.statusManual', { holder })
      : status === 'needs_reconnect'
        ? t('admin.paymentAccounts.statusNeedsReconnect', { holder })
        : status === 'expiring'
          ? t('admin.paymentAccounts.statusExpiring', { holder, date: expiresOn })
          : t('admin.paymentAccounts.statusConnected', { holder })

  return (
    <div
      className={`payment-account-status payment-account-status--${status}`}
      role={status === 'needs_reconnect' ? 'alert' : 'status'}
    >
      <span className="payment-account-status__dot" aria-hidden />
      <span className="payment-account-status__text">
        {text}
        {status !== 'manual' && profile.config?.liveMode === false ? (
          <span className="payment-account-status__test">
            {' '}
            {t('admin.paymentAccounts.statusTestMode')}
          </span>
        ) : null}
      </span>
      {action}
    </div>
  )
}
