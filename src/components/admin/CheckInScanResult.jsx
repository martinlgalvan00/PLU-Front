import { ScanLine } from 'lucide-react'
import AdminTicketAddonRedemption from './AdminTicketAddonRedemption.jsx'
import { StatusBadge } from '../ui/DataTable.jsx'
import { formatScheduleSummary, formatSessionDetail } from '../../lib/eventSchedule.js'
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
  const isAthleteScan = scanResult.kind === 'registration' && scanResult.row?.type === 'atleta'
  const scheduleSummary = formatScheduleSummary(scanResult.row?.schedule, locale)
  const sessionDetail = formatSessionDetail(scanResult.row?.schedule, locale, {
    weighIn: t('admin.checkin.weighIn'),
    starts: t('admin.checkin.sessionStarts'),
  })

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
            {/* La credencial concreta antes que la categoría: una compra de
                entrenador emite dos con el mismo nombre y el mismo DNI, y
                "Espectador" en las dos era justo lo que impedía diferenciarlas
                en la puerta.
                Cuando lo que se leyó ES una credencial nombrada, se marca para
                que el estilo la destaque: es el dato sobre el que actúa quien
                está en la puerta, y estaba siendo el más chico de la tarjeta. */}
            <dd
              className={
                scanResult.row.type !== 'atleta' && scanResult.row.credentialLabel
                  ? 'admin-checkin-result__credential'
                  : undefined
              }
            >
              {scanResult.row.type === 'atleta'
                ? t('admin.checkin.athlete')
                : (scanResult.row.credentialLabel ?? t('admin.checkin.spectator'))}
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
          {/* Qué día compite: es lo que seguridad necesita resolver en la
              puerta, y sin asignar se dice explícitamente en vez de omitirse. */}
          {isAthleteScan && (
            <div>
              <dt>{t('admin.checkin.scheduleLabel')}</dt>
              <dd>
                {scheduleSummary ? (
                  <>
                    <strong>{scheduleSummary}</strong>
                    {sessionDetail && (
                      <span className="admin-checkin-result__schedule-detail">{sessionDetail}</span>
                    )}
                  </>
                ) : (
                  t('admin.checkin.scheduleUnassigned')
                )}
              </dd>
            </div>
          )}

          {scanResult.kind === 'registration' && scanResult.row?.membershipStatus && (
            <div>
              <dt>{t('admin.checkin.membershipLabel')}</dt>
              <dd>
                <StatusBadge value={scanResult.row.membershipStatus} />
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
