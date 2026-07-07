import { CheckCircle2, Gift } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { money } from '../../lib/format.js'
import { pendingTicketAddons, redeemedTicketAddons } from '../../lib/ticketAddons.js'

export default function AdminTicketAddonRedemption({
  addons = [],
  canRedeem,
  locale,
  onRedeem,
  redeemBusyId,
  redeemError,
  ticketPaid,
}) {
  const { t } = useI18n()
  const pending = pendingTicketAddons({ addons })
  const redeemed = redeemedTicketAddons({ addons })

  if (!addons?.length) return null

  return (
    <section className="admin-checkin-benefits" aria-label={t('admin.checkin.addons.title')}>
      <div className="admin-checkin-benefits__head">
        <Gift size={16} aria-hidden />
        <strong>{t('admin.checkin.addons.title')}</strong>
      </div>

      {!ticketPaid ? (
        <p className="admin-checkin-benefits__note">{t('admin.checkin.addons.notPaid')}</p>
      ) : null}

      {pending.length > 0 ? (
        <ul className="admin-checkin-benefits__list">
          {pending.map((addon) => (
            <li key={addon.id} className="admin-checkin-benefits__item">
              <div className="admin-checkin-benefits__copy">
                <strong>{addon.label}</strong>
                <span>{money(addon.price, locale)}</span>
                {addon.redeemLabel ? <small>{addon.redeemLabel}</small> : null}
              </div>
              <button
                type="button"
                className="btn btn--primary btn--sm"
                disabled={!canRedeem || !ticketPaid || redeemBusyId === addon.id}
                onClick={() => onRedeem?.(addon.id)}
              >
                {redeemBusyId === addon.id
                  ? t('admin.checkin.addons.redeeming')
                  : t('admin.checkin.addons.redeem')}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="admin-checkin-benefits__note admin-checkin-benefits__note--ok">
          <CheckCircle2 size={14} aria-hidden />
          {t('admin.checkin.addons.allRedeemed')}
        </p>
      )}

      {redeemed.length > 0 ? (
        <ul className="admin-checkin-benefits__redeemed" aria-label={t('admin.checkin.addons.redeemedTitle')}>
          {redeemed.map((addon) => (
            <li key={addon.id}>
              <CheckCircle2 size={13} aria-hidden />
              <span>
                {addon.label}
                {addon.redeemedAt
                  ? ` · ${t('admin.checkin.addons.redeemedAt', {
                      time: new Date(addon.redeemedAt).toLocaleTimeString('es-AR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      }),
                    })}`
                  : ''}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {redeemError ? <p className="admin-checkin-benefits__error">{redeemError}</p> : null}
    </section>
  )
}
