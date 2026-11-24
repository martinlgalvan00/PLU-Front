import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, CircleSlash, XCircle } from 'lucide-react'
import { useI18n } from '../i18n/I18nProvider.jsx'
import {
  publishMercadoPagoOAuthResult,
  readMercadoPagoOAuthLanding,
} from '../lib/mercadoPagoOAuthChannel.js'
import { mercadoPagoOAuthErrorMessage } from '../components/admin/payment-accounts/paymentAccountText.js'
import '../styles/components/admin-payment-accounts.css'

/**
 * Vuelta de la vinculación con Mercado Pago (/admin/mercado-pago/vinculacion).
 *
 * El servidor ya guardó (o no) la cuenta antes de redirigir acá: esta pantalla
 * solo le avisa al panel que abrió la ventana y le dice al staff qué pasó. No
 * muestra datos de la cuenta ni necesita sesión.
 */
export default function MercadoPagoLinkResultPage() {
  const { t } = useI18n()
  const result = useMemo(() => readMercadoPagoOAuthLanding(), [])
  const [closeFailed, setCloseFailed] = useState(false)

  useEffect(() => {
    publishMercadoPagoOAuthResult(result)
    if (result.status !== 'connected') return undefined
    // Una ventana abierta por el panel se cierra sola; si el navegador no lo
    // permite (abierta a mano, historial largo), queda el botón.
    const timer = window.setTimeout(() => {
      window.close()
      window.setTimeout(() => setCloseFailed(true), 300)
    }, 1200)
    return () => window.clearTimeout(timer)
  }, [result])

  const connected = result.status === 'connected'
  const cancelled = result.status === 'cancelled'
  const Icon = connected ? CheckCircle2 : cancelled ? CircleSlash : XCircle
  const title = connected
    ? t('admin.paymentAccounts.landingTitleConnected')
    : cancelled
      ? t('admin.paymentAccounts.landingTitleCancelled')
      : t('admin.paymentAccounts.landingTitleError')
  const body = connected
    ? t('admin.paymentAccounts.landingBodyConnected')
    : mercadoPagoOAuthErrorMessage(t, { status: result.status, code: result.code })

  return (
    <main className={`payment-account-landing payment-account-landing--${result.status}`}>
      <section className="payment-account-landing__panel" aria-labelledby="mp-link-result-title">
        <Icon className="payment-account-landing__icon" size={28} aria-hidden />
        <h1 id="mp-link-result-title">{title}</h1>
        <p role={connected ? 'status' : 'alert'}>{body}</p>
        <div className="payment-account-landing__actions">
          {connected && !closeFailed ? null : (
            <button type="button" className="button button--ghost" onClick={() => window.close()}>
              {t('admin.paymentAccounts.landingClose')}
            </button>
          )}
          <a className="button button--primary" href="/admin">
            {t('admin.paymentAccounts.landingBack')}
          </a>
        </div>
      </section>
    </main>
  )
}
