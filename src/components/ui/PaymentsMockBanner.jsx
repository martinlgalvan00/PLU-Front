import { useState } from 'react'
import { X } from 'lucide-react'
import { env } from '../../config/env.js'
import { useI18n } from '../../i18n/I18nProvider.jsx'

const DISMISS_KEY = 'plu-payments-mock-banner-dismissed'

function wasDismissed() {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Strip de desarrollo: solo Vite DEV + provider mock.
 * Editorial y descartable por sesión para no molestar durante pruebas.
 */
export default function PaymentsMockBanner() {
  const { t } = useI18n()
  const [dismissed, setDismissed] = useState(wasDismissed)
  const visible = env.isDev && env.payments.isMock && !dismissed

  if (!visible) return null

  function dismiss() {
    try {
      sessionStorage.setItem(DISMISS_KEY, '1')
    } catch {
      // sessionStorage puede fallar en modo privado estricto
    }
    setDismissed(true)
  }

  return (
    <div className="payments-mock-banner" role="status">
      <p className="payments-mock-banner__copy">
        <span className="payments-mock-banner__mark" aria-hidden />
        <strong className="payments-mock-banner__title">{t('payments.mockAppTitle')}</strong>
      </p>
      <button
        type="button"
        className="payments-mock-banner__dismiss"
        onClick={dismiss}
        aria-label={t('payments.mockDismiss')}
      >
        <X size={14} aria-hidden />
      </button>
    </div>
  )
}
