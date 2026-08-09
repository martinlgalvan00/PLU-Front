import { BadgeCheck } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'

/**
 * Banner de cuenta: inscripción confirmada pero el ingreso del meet exige
 * afiliación activa. Empuja a completar el pago de membresía.
 */
export default function GateMembershipBanner({ pendingEvents = [], onCompleteMembership }) {
  const { t } = useI18n()

  if (!pendingEvents.length) return null

  const eventNames = pendingEvents
    .map((item) => item.event)
    .filter(Boolean)
    .slice(0, 2)
    .join(', ')

  return (
    <aside className="account-verify account-verify--gate" role="status" aria-live="polite">
      <span className="account-verify__icon" aria-hidden>
        <BadgeCheck size={18} />
      </span>
      <div className="account-verify__copy">
        <p className="account-verify__title">{t('account.gateBanner.title')}</p>
        <p className="account-verify__lead">
          {eventNames
            ? t('account.gateBanner.leadWithEvents', { events: eventNames })
            : t('account.gateBanner.lead')}
        </p>
      </div>
      {onCompleteMembership ? (
        <button type="button" className="account-verify__action" onClick={onCompleteMembership}>
          {t('account.gateBanner.action')}
        </button>
      ) : null}
    </aside>
  )
}
