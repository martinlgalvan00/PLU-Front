import { ExternalLink, Link2 } from 'lucide-react'
import { useMercadoPagoConnect } from '../../../hooks/useMercadoPagoConnect.js'
import { mercadoPagoOAuthErrorMessage } from './paymentAccountText.js'
import '../../../styles/components/admin-payment-accounts.css'

/**
 * Botón "Conectar con Mercado Pago" con su espera y sus errores. La ventana
 * de MP se abre aparte: el editor no pierde lo que no se guardó.
 *
 * `profileId` reconecta esa cuenta (misma cuenta de MP); sin él vincula una
 * nueva. `onConnected` recibe `{ profileId, created }`.
 */
export default function MercadoPagoConnectControl({
  t,
  profileId = null,
  name = '',
  label,
  buttonClassName = 'btn--small btn--ghost',
  disabled = false,
  onConnected,
}) {
  const { connect, cancel, pending, error, authorizationUrl } = useMercadoPagoConnect({
    onConnected,
  })
  const blocked = error?.code === 'POPUP_BLOCKED'

  return (
    <div className="payment-account-connect">
      <button
        type="button"
        className={buttonClassName}
        disabled={disabled || (pending && !blocked)}
        aria-busy={pending && !blocked ? 'true' : undefined}
        onClick={() => void connect({ profileId, name })}
      >
        <Link2 size={14} aria-hidden />
        {label ?? t('admin.paymentAccounts.connect')}
      </button>

      {pending && !blocked ? (
        <p className="payment-account-connect__wait" role="status">
          {t('admin.paymentAccounts.connectWaiting')}{' '}
          <button type="button" className="payment-account-connect__link" onClick={cancel}>
            {t('admin.paymentAccounts.connectCancel')}
          </button>
        </p>
      ) : null}

      {blocked && authorizationUrl ? (
        <p className="payment-account-connect__wait" role="status">
          {t('admin.paymentAccounts.oauthErrorPopupBlocked')}{' '}
          <a
            className="payment-account-connect__link"
            href={authorizationUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('admin.paymentAccounts.connectOpenManually')}
            <ExternalLink size={12} aria-hidden />
          </a>
        </p>
      ) : null}

      {error && !blocked ? (
        <p className="payment-account-connect__error" role="alert">
          {mercadoPagoOAuthErrorMessage(t, error)}
        </p>
      ) : null}
    </div>
  )
}
