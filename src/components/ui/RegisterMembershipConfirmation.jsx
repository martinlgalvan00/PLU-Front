import { ArrowRight, ImageDown } from 'lucide-react'
import StatusPill from './StatusPill.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { money } from '../../lib/format.js'
import { getStatusMeta } from '../../lib/status.js'
import MercadoPagoEmbeddedCheckout from './MercadoPagoEmbeddedCheckout.jsx'
import TransferProofUpload from './TransferProofUpload.jsx'

export default function RegisterMembershipConfirmation({
  order,
  memberCode,
  membershipExpiration,
  onNavigate,
  onOpenCard,
  showCardAction = false,
}) {
  const { locale, t } = useI18n()
  const { tone } = getStatusMeta(order.status, t)
  const isActive = tone === 'success'
  const isManual = order.paymentMethod === 'manual_link'

  const nextStep = isManual
    ? t('pages.register.membershipNextStepManual')
    : t('pages.register.membershipNextStepMp')

  return (
    <section className="register-membership-confirmation" aria-labelledby="register-membership-confirmation-title">
      <header className="register-membership-confirmation__head">
        <h2 id="register-membership-confirmation-title">
          {isActive
            ? t('pages.register.membershipConfirmedActiveTitle')
            : t('pages.register.membershipConfirmedPendingTitle')}
        </h2>
        <p>
          {isActive
            ? t('pages.register.membershipConfirmedActiveDesc')
            : t('pages.register.membershipConfirmedPendingDesc')}
        </p>
        {!isActive && <p className="register-membership-confirmation__next-inline">{nextStep}</p>}
      </header>

      <div className="register-membership-confirmation__credential">
        <div className="register-membership-confirmation__credential-main">
          <div className="register-membership-confirmation__credential-meta">
            <span className="register-membership-confirmation__credential-label">
              {t('pages.register.membershipCredentialLabel')}
            </span>
            <strong className="register-membership-confirmation__credential-code">
              {memberCode ?? t('pages.register.membershipCredentialPendingCode')}
            </strong>
            <span className="register-membership-confirmation__credential-name">{order.athleteName}</span>
            {membershipExpiration && (
              <span className="register-membership-confirmation__credential-validity">
                {t('shareCard.membershipValidUntil', { date: membershipExpiration })}
              </span>
            )}
          </div>
          <StatusPill value={order.status} />
        </div>
      </div>

      <dl className="register-membership-confirmation__ledger">
        <div>
          <dt>{t('pages.register.membershipReferenceLabel')}</dt>
          <dd><code>{order.reference}</code></dd>
        </div>
        <div>
          <dt>{t('pages.register.membershipAmountLabel')}</dt>
          <dd>{money(order.amount, locale)}</dd>
        </div>
      </dl>

      {order.paymentMethod === 'mercado_pago' && !isActive && (
        <MercadoPagoEmbeddedCheckout order={order} />
      )}

      <div className="register-membership-confirmation__actions">
        {showCardAction && (
          <button
            type="button"
            className="register-membership-confirmation__cta register-membership-confirmation__cta--primary"
            onClick={onOpenCard}
          >
            <ImageDown size={16} aria-hidden />
            {t('pages.register.membershipViewCredential')}
          </button>
        )}

        {isManual && !isActive && (
          <>
            <p className="register-membership-confirmation__manual">{t('pages.register.manualNote')}</p>
            {/* Sin esto la pantalla daba los datos bancarios y terminaba ahí:
                el comprobante solo se podía adjuntar entrando después a la
                cuenta, y Finanzas aprobaba sin evidencia. */}
            {order.paymentId && <TransferProofUpload orderId={order.paymentId} />}
          </>
        )}

        {onNavigate && (
          <button
            type="button"
            className="register-membership-confirmation__cta register-membership-confirmation__cta--ghost"
            onClick={() => onNavigate('profile')}
          >
            {t('pages.register.membershipGoProfile')}
            <ArrowRight size={14} aria-hidden />
          </button>
        )}
      </div>
    </section>
  )
}
