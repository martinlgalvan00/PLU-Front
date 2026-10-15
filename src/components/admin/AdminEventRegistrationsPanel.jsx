import { useMemo, useState } from 'react'
import { ClipboardList, ExternalLink, PencilLine } from 'lucide-react'
import AdminEmptyState from './AdminEmptyState.jsx'
import AdminFilterChipGroup from './AdminFilterChipGroup.jsx'
import AdminIconButton from './AdminIconButton.jsx'
import RegistrationStatusDialog from './RegistrationStatusDialog.jsx'
import StatusPill from '../ui/StatusPill.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { translateFilterOptions } from '../../i18n/adminHelpers.js'
import { isRegistrationForEvent } from '../../lib/athleteEventStatus.js'
import { REGISTRATION_FILTER_STATUSES } from '../../lib/constants.js'
import { notifyError, notifySuccess } from '../../lib/adminToast.js'
import { matchesRegistrationStatusFilter } from '../../services/registrationAdminService.js'
import '../../styles/pages/admin-event-registrations.css'

const EMPTY_GATE = new Set()

/**
 * Padrón de inscripciones del meet dentro del workspace.
 * Filtro local por slug (vía `isRegistrationForEvent`); no abre el admin global.
 * Con `canSetStatus` permite corregir estado sin salir del meet.
 */
export default function AdminEventRegistrationsPanel({
  athletes = [],
  canSetStatus = false,
  event,
  gatePendingIds = EMPTY_GATE,
  onOpenFullList,
  onSetRegistrationStatus,
  registrations = [],
}) {
  const { t } = useI18n()
  const [statusFilter, setStatusFilter] = useState('all')
  const [statusTarget, setStatusTarget] = useState(null)
  const [statusBusy, setStatusBusy] = useState(false)
  const [statusError, setStatusError] = useState('')

  const athletesById = useMemo(() => {
    const map = new Map()
    for (const athlete of athletes) {
      if (athlete?.id) map.set(athlete.id, athlete)
    }
    return map
  }, [athletes])

  const eventRegistrations = useMemo(() => {
    if (!event) return []
    return registrations
      .filter((registration) => isRegistrationForEvent(registration, event))
      .map((registration) => ({
        ...registration,
        athlete: registration.athlete ?? athletesById.get(registration.athleteId) ?? null,
      }))
  }, [athletesById, event, registrations])

  const statusCounts = useMemo(() => {
    const counts = Object.fromEntries(REGISTRATION_FILTER_STATUSES.map(([value]) => [value, 0]))
    for (const registration of eventRegistrations) {
      for (const [value] of REGISTRATION_FILTER_STATUSES) {
        if (matchesRegistrationStatusFilter(registration, null, value, gatePendingIds)) {
          counts[value] += 1
        }
      }
    }
    return counts
  }, [eventRegistrations, gatePendingIds])

  const visible = useMemo(
    () =>
      eventRegistrations.filter((registration) =>
        matchesRegistrationStatusFilter(registration, null, statusFilter, gatePendingIds),
      ),
    [eventRegistrations, gatePendingIds, statusFilter],
  )

  const filterOptions = useMemo(
    () =>
      translateFilterOptions(REGISTRATION_FILTER_STATUSES, t).map(([value, label]) => [
        value,
        label,
        statusCounts[value] ?? 0,
      ]),
    [statusCounts, t],
  )

  async function handleConfirmStatus(status, reason) {
    if (!statusTarget || !onSetRegistrationStatus) return
    setStatusBusy(true)
    setStatusError('')
    try {
      const result = await onSetRegistrationStatus(statusTarget.id, status, reason)
      if (result?.error) {
        setStatusError(result.error)
        notifyError(result.error)
        return
      }
      notifySuccess(t('admin.toasts.registrationStatusUpdated'))
      setStatusTarget(null)
    } catch (error) {
      const message = error?.message ?? t('admin.eventRegistrations.statusError')
      setStatusError(message)
      notifyError(message)
    } finally {
      setStatusBusy(false)
    }
  }

  if (!event) return null

  return (
    <section className="admin-event-regs" aria-labelledby="admin-event-regs-title">
      <header className="admin-event-regs__head">
        <div>
          <h2 id="admin-event-regs-title" className="admin-event-regs__title">
            {t('admin.eventConsole.registrations')}
          </h2>
          <p className="admin-event-regs__lead">
            {t('admin.eventRegistrations.lead', { count: eventRegistrations.length })}
          </p>
        </div>
        {onOpenFullList ? (
          <button type="button" className="admin-event-regs__open-full" onClick={onOpenFullList}>
            <ExternalLink size={14} aria-hidden />
            {t('admin.eventRegistrations.openFullList')}
          </button>
        ) : null}
      </header>

      <AdminFilterChipGroup
        id="event-regs-status"
        ariaLabel={t('admin.filters.status')}
        value={statusFilter}
        onChange={setStatusFilter}
        compact
        defaultValue="all"
        clearable
        hideEmpty
        options={filterOptions}
      />

      {visible.length === 0 ? (
        <AdminEmptyState
          icon={ClipboardList}
          filtered={statusFilter !== 'all'}
          title={
            statusFilter === 'all'
              ? t('admin.eventRegistrations.empty')
              : t('admin.eventRegistrations.emptyFiltered')
          }
          actionLabel={statusFilter === 'all' ? undefined : t('admin.eventRegistrations.clearFilter')}
          onAction={statusFilter === 'all' ? undefined : () => setStatusFilter('all')}
        />
      ) : (
        <ul className="admin-event-regs__list">
          {visible.map((registration) => {
            const athleteName =
              registration.athlete?.fullName ||
              registration.athlete?.email ||
              t('admin.eventRegistrations.unknownAthlete')
            const detail = [registration.category, registration.division].filter(Boolean).join(' · ')
            return (
              <li key={registration.id} className="admin-event-regs__row">
                <div className="admin-event-regs__identity">
                  <strong>{athleteName}</strong>
                  {detail ? <span>{detail}</span> : null}
                  {registration.athlete?.documentId ? (
                    <span className="admin-event-regs__doc">{registration.athlete.documentId}</span>
                  ) : null}
                </div>
                <div className="admin-event-regs__actions">
                  <StatusPill value={registration.status} />
                  {canSetStatus && onSetRegistrationStatus ? (
                    <AdminIconButton
                      icon={PencilLine}
                      label={t('admin.eventRegistrations.editStatus')}
                      onClick={() => {
                        setStatusError('')
                        setStatusTarget({
                          ...registration,
                          athlete: athleteName,
                          event: event.title || event.slug || '',
                        })
                      }}
                      variant="ghost"
                    />
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {statusTarget ? (
        <RegistrationStatusDialog
          busy={statusBusy}
          error={statusError}
          registration={statusTarget}
          onCancel={() => {
            if (statusBusy) return
            setStatusTarget(null)
            setStatusError('')
          }}
          onConfirm={handleConfirmStatus}
        />
      ) : null}
    </section>
  )
}

/**
 * Conteos de estado para el dashboard del evento (misma identidad por slug).
 */
export function buildEventRegistrationStatusCounts(registrations = [], event, gatePendingIds = EMPTY_GATE) {
  const scoped = event
    ? registrations.filter((registration) => isRegistrationForEvent(registration, event))
    : []
  const byStatus = {
    total: scoped.length,
    confirmada: 0,
    pendiente_pago: 0,
    observada: 0,
    cancelada: 0,
    gate_pending: 0,
  }
  for (const registration of scoped) {
    const status = String(registration.status ?? '').toLowerCase()
    if (status === 'confirmada' || status === 'pagada') byStatus.confirmada += 1
    else if (status === 'pendiente_pago' || status === 'validacion_manual' || status === 'borrador') {
      byStatus.pendiente_pago += 1
    } else if (status === 'observada') byStatus.observada += 1
    else if (status === 'cancelada' || status === 'rechazado') byStatus.cancelada += 1
    if (gatePendingIds.has(registration.id)) byStatus.gate_pending += 1
  }
  return byStatus
}
