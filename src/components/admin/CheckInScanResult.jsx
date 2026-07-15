import { ScanLine } from 'lucide-react'
import AdminTicketAddonRedemption from './AdminTicketAddonRedemption.jsx'
import { StatusBadge } from '../ui/DataTable.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'

export default function CheckInScanResult({
  canCheckIn,
  locale,
  onDismiss,
  onRedeemAddon,
  onScanCheckIn,
  redeemBusyId,
  redeemError,
  scanBusy,
  scanPersonDoc,
  scanPersonName,
  scanResult,
  scanTicketPaid,
  scanVerdict,
}) {
  const { t } = useI18n()
  if (!scanResult || !scanVerdict) return null

  const ScanVerdictIcon = scanVerdict.Icon

  return (
    <div
      className={`admin-checkin-result admin-checkin-result--${scanVerdict.tone}${scanResult.offline ? ' admin-checkin-result--offline' : ''}`}
      role="status"
      aria-live="polite"
    >
      <div className="admin-checkin-result__header">
        <ScanVerdictIcon size={22} aria-hidden />
        <div>
          <strong>{t(`admin.checkin.scanner.outcome.${scanResult.outcome}`)}</strong>
          {scanPersonName && (
            <p className="admin-checkin-result__person">
              {scanPersonName}
              {scanPersonDoc ? ` · ${scanPersonDoc}` : ''}
            </p>
          )}
        </div>
      </div>

      {scanResult.row && (
        <dl className="admin-checkin-result__meta">
          <div>
            <dt>{t('admin.checkin.type')}</dt>
            <dd>
              {scanResult.row.type === 'atleta'
                ? t('admin.checkin.athlete')
                : t('admin.checkin.spectator')}
            </dd>
          </div>
          {scanResult.status && (
            <div>
              <dt>{t('admin.columns.status')}</dt>
              <dd>
                <StatusBadge value={scanResult.status} />
              </dd>
            </div>
          )}
        </dl>
      )}

      {scanResult.kind === 'ticket' && (scanResult.ticket?.addons?.length ?? 0) > 0 ? (
        <AdminTicketAddonRedemption
          addons={scanResult.ticket.addons}
          canRedeem={canCheckIn}
          locale={locale}
          onRedeem={onRedeemAddon}
          redeemBusyId={redeemBusyId}
          redeemError={redeemError}
          ticketPaid={scanTicketPaid}
        />
      ) : null}

      <div className="admin-checkin-result__actions">
        {scanResult.canCheckIn && (
          <button
            type="button"
            className="btn btn--primary btn--sm"
            disabled={!canCheckIn || scanBusy}
            onClick={onScanCheckIn}
          >
            <ScanLine size={15} aria-hidden />
            {t('admin.checkin.markEntry')}
          </button>
        )}
        <button type="button" className="btn btn--ghost btn--sm" onClick={onDismiss}>
          {t('admin.checkin.scanner.dismiss')}
        </button>
      </div>
    </div>
  )
}
