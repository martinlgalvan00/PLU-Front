import { useEffect, useState } from 'react'
import { Clock, ScanLine, XCircle } from 'lucide-react'
import AdminTicketAddonRedemption from './AdminTicketAddonRedemption.jsx'
import { StatusBadge } from '../ui/DataTable.jsx'
import { formatScheduleSummary, formatSessionDetail } from '../../lib/eventSchedule.js'
import { formatDocumentWithKind } from '../../lib/format.js'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { checkinTypeLabel } from '../../services/checkinScanService.js'
import { TICKET_VALIDITY_STATUS, ticketValidityTiming } from '../../lib/ticketValidity.js'

function formatRelativeValidityTime(milliseconds, direction, locale) {
  const absolute = Math.max(0, Number(milliseconds) || 0)
  const unit = absolute < 60_000 ? ['second', 1_000] : absolute < 60 * 60_000 ? ['minute', 60_000] : ['hour', 60 * 60_000]
  const amount = Math.max(1, Math.ceil(absolute / unit[1]))
  return new Intl.RelativeTimeFormat(locale, { numeric: 'always' }).format(
    direction === 'future' ? amount : -amount,
    unit[0],
  )
}

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
  const [clockNow, setClockNow] = useState(() => Date.now())
  const hasTicketWindow = Boolean(
    scanResult?.kind === 'ticket' && scanResult.row?.validFrom && scanResult.row?.validUntil,
  )

  useEffect(() => {
    if (!hasTicketWindow) return undefined
    setClockNow(Date.now())
    const intervalId = window.setInterval(() => setClockNow(Date.now()), 1_000)
    return () => window.clearInterval(intervalId)
  }, [hasTicketWindow, scanResult?.row?.validFrom, scanResult?.row?.validUntil])

  if (!scanResult || !scanVerdict) return null

  const isTicket = scanResult.kind === 'ticket'
  const timing = isTicket && hasTicketWindow ? ticketValidityTiming(scanResult.row, new Date(clockNow)) : null
  const timingOverridesReady =
    scanResult.outcome === 'ready' &&
    [TICKET_VALIDITY_STATUS.UPCOMING, TICKET_VALIDITY_STATUS.EXPIRED].includes(timing?.status)
  const effectiveOutcome = timingOverridesReady
    ? timing.status === TICKET_VALIDITY_STATUS.EXPIRED
      ? 'expired'
      : 'not_yet_valid'
    : scanResult.outcome
  const effectiveVerdict = timingOverridesReady
    ? {
        Icon: effectiveOutcome === 'expired' ? XCircle : Clock,
        tone: effectiveOutcome === 'expired' ? 'danger' : 'warning',
      }
    : scanVerdict

  const ScanVerdictIcon = effectiveVerdict.Icon
  const isAthleteScan = scanResult.kind === 'registration' && scanResult.row?.type === 'atleta'
  const scheduleSummary = formatScheduleSummary(scanResult.row?.schedule, locale)
  const sessionDetail = formatSessionDetail(scanResult.row?.schedule, locale, {
    weighIn: t('admin.checkin.weighIn'),
    starts: t('admin.checkin.sessionStarts'),
  })
  const validityFormatter = new Intl.DateTimeFormat(locale, {
    dateStyle: 'short',
    timeStyle: 'short',
  })

  const liveValidityLabel =
    timing?.status === TICKET_VALIDITY_STATUS.VALID
      ? timing.isExpiringSoon
        ? t('admin.checkin.validity.expiresIn', {
            time: formatRelativeValidityTime(timing.remainingMs, 'future', locale),
          })
        : t('admin.checkin.validity.validUntil', {
            time: validityFormatter.format(new Date(scanResult.row.validUntil)),
          })
      : timing?.status === TICKET_VALIDITY_STATUS.EXPIRED
        ? t('admin.checkin.validity.expiredAgo', {
            time: formatRelativeValidityTime(timing.expiredForMs, 'past', locale),
          })
        : timing?.status === TICKET_VALIDITY_STATUS.UPCOMING
          ? t('admin.checkin.validity.startsIn', {
              time: formatRelativeValidityTime(timing.startsInMs, 'future', locale),
            })
          : null

  // La fecha se resuelve pegada a la decisión sólo cuando el motivo del
  // veredicto ES la vigencia -- si no, sigue como un dato más entre los
  // metadatos generales de la entrada.
  const validityReason =
    scanResult.kind === 'ticket' && effectiveOutcome === 'expired' && scanResult.row?.validUntil
      ? t('admin.checkin.expiredOn', {
          date: validityFormatter.format(new Date(scanResult.row.validUntil)),
        })
      : scanResult.kind === 'ticket' &&
          effectiveOutcome === 'not_yet_valid' &&
          scanResult.row?.validFrom
        ? t('admin.checkin.validFromOn', {
            date: validityFormatter.format(new Date(scanResult.row.validFrom)),
          })
        : null

  return (
    <div
      className={`admin-checkin-result admin-checkin-result--${effectiveVerdict.tone}${scanResult.offline ? ' admin-checkin-result--offline' : ''}`}
      role="status"
      aria-live="polite"
    >
      <div className="admin-checkin-result__header">
        <ScanVerdictIcon size={22} aria-hidden />
        <div>
          <strong>{t(`admin.checkin.scanner.outcome.${effectiveOutcome}`)}</strong>
          {validityReason ? (
            <span className="admin-checkin-result__reason">{validityReason}</span>
          ) : null}
        </div>
      </div>

      {scanPersonName ? (
        <p className="admin-checkin-result__person">
          <strong className="admin-checkin-result__person-name">{scanPersonName}</strong>
          {scanPersonDoc ? (
            <span className="admin-checkin-result__person-doc">
              {formatDocumentWithKind(scanPersonDoc)}
            </span>
          ) : null}
        </p>
      ) : null}

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
              {checkinTypeLabel(scanResult.row, t)}
            </dd>
          </div>
          {scanResult.kind === 'ticket' &&
          (scanResult.row.ticketTypeName || scanResult.row.meta) ? (
            <div>
              <dt>{t('admin.checkin.ticketTypeLabel')}</dt>
              <dd>{scanResult.row.ticketTypeName || scanResult.row.meta}</dd>
            </div>
          ) : null}
          {scanResult.kind === 'ticket' && scanResult.row.ticketTypeDescription ? (
            <div>
              <dt>{t('admin.eventEditor.supabase.ticketTypeDescription')}</dt>
              <dd>{scanResult.row.ticketTypeDescription}</dd>
            </div>
          ) : null}
          {isAthleteScan && scanResult.row?.meta ? (
            <div>
              <dt>{t('admin.columns.category')}</dt>
              <dd>{scanResult.row.meta}</dd>
            </div>
          ) : null}
          {scanResult.status && (
            <div>
              <dt>{t('admin.columns.status')}</dt>
              <dd>
                <StatusBadge value={scanResult.status} />
              </dd>
            </div>
          )}
          {scanResult.kind === 'ticket' && scanResult.row?.validFrom && !validityReason ? (
            <div>
              <dt>{t('admin.checkin.validFrom')}</dt>
              <dd>{validityFormatter.format(new Date(scanResult.row.validFrom))}</dd>
            </div>
          ) : null}
          {scanResult.kind === 'ticket' && scanResult.row?.validUntil && !validityReason ? (
            <div>
              <dt>{t('admin.checkin.validUntil')}</dt>
              <dd>{validityFormatter.format(new Date(scanResult.row.validUntil))}</dd>
            </div>
          ) : null}
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

      {liveValidityLabel ? (
        <p
          className={`admin-checkin-result__live-validity${timing?.isExpiringSoon ? ' is-expiring' : ''}${
            timing?.status === TICKET_VALIDITY_STATUS.EXPIRED ? ' is-expired' : ''
          }`}
          role="status"
        >
          <Clock size={16} aria-hidden />
          <span>{liveValidityLabel}</span>
        </p>
      ) : null}

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
            disabled={!canCheckIn || scanBusy || timingOverridesReady}
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
