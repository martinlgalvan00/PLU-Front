import { useMemo, useState } from 'react'
import { ClipboardList, Download, ExternalLink, FileSpreadsheet, PencilLine, Upload } from 'lucide-react'
import AdminEmptyState from './AdminEmptyState.jsx'
import AdminFilterChipGroup from './AdminFilterChipGroup.jsx'
import AdminFilterSearch from './AdminFilterSearch.jsx'
import AdminFilterSelect from './AdminFilterSelect.jsx'
import AdminEventCredentialSend from './AdminEventCredentialSend.jsx'
import AdminIconButton from './AdminIconButton.jsx'
import RegistrationSheetImportDialog from './RegistrationSheetImportDialog.jsx'
import RegistrationStatusDialog from './RegistrationStatusDialog.jsx'
import StatusPill from '../ui/StatusPill.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { translateFilterOptions } from '../../i18n/adminHelpers.js'
import { isRegistrationForEvent } from '../../lib/athleteEventStatus.js'
import { REGISTRATION_FILTER_STATUSES } from '../../lib/constants.js'
import { notifyError, notifySuccess } from '../../lib/adminToast.js'
import { money } from '../../lib/format.js'
import { getStatusMeta } from '../../lib/status.js'
import { createCsv } from '../../services/exportService.js'
import { downloadRegistrationSheet } from '../../services/registrationSheetService.js'
import {
  buildEventRegistrationRows,
  EMPTY_TRACKING_FILTERS,
  eventRegistrationCsvRows,
  eventRegistrationFacets,
  filterEventRegistrationRows,
  hasActiveTrackingFilters,
  summarizeEventRegistrations,
} from '../../services/eventRegistrationTracking.js'
import { matchesRegistrationStatusFilter } from '../../services/registrationAdminService.js'
import '../../styles/pages/admin-payments.css'
import '../../styles/pages/admin-event-registrations.css'

const EMPTY_GATE = new Set()
const NO_PAYMENTS = []

/** Montos por moneda en una línea: "$ 210.000 · US$ 135". */
function formatTotals(totals, locale) {
  const entries = Object.entries(totals).filter(([, amount]) => amount > 0)
  if (entries.length === 0) return money(0, locale)
  return entries.map(([currency, amount]) => money(amount, locale, currency)).join(' · ')
}

/**
 * Seguimiento de las inscripciones del meet dentro del workspace: cuántos van
 * contra el cupo, cuánto se cobró y cuánto falta, y el padrón filtrable por
 * estado, división, categoría, modalidad y medio de pago, con su CSV.
 * La cuenta vive en `eventRegistrationTracking.js`; acá solo se compone.
 * Con `canSetStatus` permite corregir estado sin salir del meet.
 */
export default function AdminEventRegistrationsPanel({
  athletes = [],
  canSendCredentials = false,
  canSetStatus = false,
  event,
  gatePendingIds = EMPTY_GATE,
  onOpenFullList,
  onRefreshRegistrations,
  onSetRegistrationStatus,
  payments = NO_PAYMENTS,
  registrations = [],
}) {
  const { t, locale } = useI18n()
  const [filters, setFilters] = useState(EMPTY_TRACKING_FILTERS)
  const [statusTarget, setStatusTarget] = useState(null)
  const [statusBusy, setStatusBusy] = useState(false)
  const [statusError, setStatusError] = useState('')
  const [sheetImportOpen, setSheetImportOpen] = useState(false)
  const [sheetExporting, setSheetExporting] = useState(false)
  const setFilter = (key) => (value) => setFilters((current) => ({ ...current, [key]: value }))

  const rows = useMemo(
    () => buildEventRegistrationRows({ registrations, athletes, payments, event }),
    [athletes, event, payments, registrations],
  )
  const summary = useMemo(() => summarizeEventRegistrations(rows, event), [event, rows])
  const facets = useMemo(() => eventRegistrationFacets(rows), [rows])
  const visible = useMemo(
    () => filterEventRegistrationRows(rows, filters, gatePendingIds),
    [filters, gatePendingIds, rows],
  )

  // Los conteos de estado respetan el resto de los filtros: así el chip dice
  // cuántos quedan si se lo toca, no cuántos hay en todo el meet.
  const statusCounts = useMemo(() => {
    const scoped = filterEventRegistrationRows(rows, { ...filters, status: 'all' }, gatePendingIds)
    const counts = Object.fromEntries(REGISTRATION_FILTER_STATUSES.map(([value]) => [value, 0]))
    for (const row of scoped) {
      for (const [value] of REGISTRATION_FILTER_STATUSES) {
        if (matchesRegistrationStatusFilter(row, row.payment, value, gatePendingIds))
          counts[value] += 1
      }
    }
    return counts
  }, [filters, gatePendingIds, rows])

  const statusOptions = useMemo(
    () =>
      translateFilterOptions(REGISTRATION_FILTER_STATUSES, t).map(([value, label]) => [
        value,
        label,
        statusCounts[value] ?? 0,
      ]),
    [statusCounts, t],
  )

  const text = (key, params) => t(`admin.eventRegistrations.${key}`, params)
  const modalityLabel = (key) => t(`pages.register.modalityOptions.${key}`)
  const channelLabel = (key) => t(`admin.eventEditor.paymentChannelShort.${key}`)
  const facetOptions = (entries, allKey, labelOf = (value) => value) => [
    ['all', text(allKey)],
    ...entries.map(([value, count]) => [value, `${labelOf(value)} (${count})`]),
  ]
  const filtered = hasActiveTrackingFilters(filters)

  function exportCsv() {
    const csvRows = eventRegistrationCsvRows(visible, {
      labels: {
        athlete: text('csv.athlete'),
        document: text('csv.document'),
        email: text('csv.email'),
        category: text('csv.category'),
        division: text('csv.division'),
        secondaryDivision: text('csv.secondaryDivision'),
        modalities: text('csv.modalities'),
        status: text('csv.status'),
        channel: text('csv.channel'),
        amount: text('csv.amount'),
        currency: text('csv.currency'),
        paymentStatus: text('csv.paymentStatus'),
        createdAt: text('csv.createdAt'),
      },
      format: {
        status: (value) => getStatusMeta(value, t).label,
        modality: modalityLabel,
        channel: channelLabel,
      },
    })
    createCsv(`inscripciones-${event.slug || event.id}.csv`, csvRows)
  }

  /** Planilla .xlsx de lo que muestra el padrón filtrado, para corregir y reimportar. */
  async function exportSheet() {
    setSheetExporting(true)
    try {
      const result = await downloadRegistrationSheet({
        registrations: visible,
        athletes,
        payments,
        events: [event],
        scope: event.slug || event.id,
      })
      if (result.ok) {
        notifySuccess(t('admin.registrationSheet.exportDone', { count: result.rows }))
      }
    } catch (error) {
      console.warn('No se pudo generar la planilla de inscripciones.', error)
      notifyError(t('admin.registrationSheet.exportError'))
    } finally {
      setSheetExporting(false)
    }
  }

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
      const message = error?.message ?? text('statusError')
      setStatusError(message)
      notifyError(message)
    } finally {
      setStatusBusy(false)
    }
  }

  if (!event) return null

  const capacityShare =
    summary.capacity != null ? Math.min(1, summary.active / summary.capacity) : null

  return (
    <section className="admin-event-regs" aria-labelledby="admin-event-regs-title">
      <header className="admin-event-regs__head">
        <div>
          <h2 id="admin-event-regs-title" className="admin-event-regs__title">
            {t('admin.eventConsole.registrations')}
          </h2>
          <p className="admin-event-regs__lead">{text('lead', { count: summary.active })}</p>
        </div>
        <div className="admin-event-regs__head-actions">
          <button
            type="button"
            className="admin-event-regs__export"
            disabled={visible.length === 0}
            onClick={exportCsv}
          >
            <Download size={14} aria-hidden />
            {filtered ? text('exportFiltered') : text('export')}
          </button>
          <button
            type="button"
            className="admin-event-regs__export"
            aria-label={t('admin.registrationSheet.exportAria', { count: visible.length })}
            disabled={visible.length === 0 || sheetExporting}
            onClick={() => void exportSheet()}
          >
            <FileSpreadsheet size={14} aria-hidden />
            {t('admin.registrationSheet.export')}
          </button>
          {canSetStatus ? (
            <button
              type="button"
              className="admin-event-regs__export"
              aria-label={t('admin.registrationSheet.importAria')}
              disabled={rows.length === 0}
              onClick={() => setSheetImportOpen(true)}
            >
              <Upload size={14} aria-hidden />
              {t('admin.registrationSheet.import')}
            </button>
          ) : null}
          {onOpenFullList ? (
            <button type="button" className="admin-event-regs__open-full" onClick={onOpenFullList}>
              <ExternalLink size={14} aria-hidden />
              {text('openFullList')}
            </button>
          ) : null}
        </div>
      </header>

      {canSendCredentials && summary.confirmed > 0 ? (
        <AdminEventCredentialSend eventSlug={event.slug} />
      ) : null}

      {rows.length > 0 ? (
        <dl className="admin-event-regs__summary">
          <div className="admin-event-regs__stat admin-event-regs__stat--capacity">
            <dt>{text('summaryActive')}</dt>
            <dd>
              {summary.active}
              {summary.capacity != null ? (
                <small>{text('summaryOfCapacity', { capacity: summary.capacity })}</small>
              ) : null}
            </dd>
            {capacityShare != null ? (
              <span
                className="admin-event-regs__meter"
                style={{ '--regs-share': capacityShare }}
                aria-hidden
              />
            ) : null}
          </div>
          <div className="admin-event-regs__stat">
            <dt>{text('summaryConfirmed')}</dt>
            <dd>{summary.confirmed}</dd>
          </div>
          <div className="admin-event-regs__stat">
            <dt>{text('summaryPending')}</dt>
            <dd>{summary.pending}</dd>
          </div>
          <div className="admin-event-regs__stat">
            <dt>{text('summaryCollected')}</dt>
            <dd className="admin-event-regs__money">{formatTotals(summary.collected, locale)}</dd>
          </div>
          <div className="admin-event-regs__stat">
            <dt>{text('summaryOutstanding')}</dt>
            <dd className="admin-event-regs__money">{formatTotals(summary.outstanding, locale)}</dd>
          </div>
        </dl>
      ) : null}

      {rows.length > 0 ? (
        <div className="admin-event-regs__filters">
          <AdminFilterSearch
            placeholder={text('search')}
            query={filters.query}
            onQueryChange={setFilter('query')}
          />
          <div className="admin-event-regs__facets">
            {facets.divisions.length > 1 ? (
              <AdminFilterSelect
                id="event-regs-division"
                label={text('filterDivision')}
                value={filters.division}
                onChange={setFilter('division')}
                defaultValue="all"
                options={facetOptions(facets.divisions, 'allDivisions')}
              />
            ) : null}
            {facets.categories.length > 1 ? (
              <AdminFilterSelect
                id="event-regs-category"
                label={text('filterCategory')}
                value={filters.category}
                onChange={setFilter('category')}
                defaultValue="all"
                options={facetOptions(facets.categories, 'allCategories')}
              />
            ) : null}
            {facets.modalities.length > 1 ? (
              <AdminFilterSelect
                id="event-regs-modality"
                label={text('filterModality')}
                value={filters.modality}
                onChange={setFilter('modality')}
                defaultValue="all"
                options={facetOptions(facets.modalities, 'allModalities', modalityLabel)}
              />
            ) : null}
            {facets.channels.length > 1 ? (
              <AdminFilterSelect
                id="event-regs-channel"
                label={text('filterChannel')}
                value={filters.channel}
                onChange={setFilter('channel')}
                defaultValue="all"
                options={facetOptions(facets.channels, 'allChannels', channelLabel)}
              />
            ) : null}
          </div>
          <AdminFilterChipGroup
            id="event-regs-status"
            ariaLabel={t('admin.filters.status')}
            value={filters.status}
            onChange={setFilter('status')}
            compact
            defaultValue="all"
            clearable
            hideEmpty
            options={statusOptions}
          />
          <p className="admin-event-regs__count" role="status">
            {filtered
              ? text('showing', { shown: visible.length, total: rows.length })
              : text('showingAll', { count: rows.length })}
            {filtered ? (
              <button
                type="button"
                className="admin-event-regs__clear"
                onClick={() => setFilters(EMPTY_TRACKING_FILTERS)}
              >
                {text('clearFilters')}
              </button>
            ) : null}
          </p>
        </div>
      ) : null}

      {visible.length === 0 ? (
        <AdminEmptyState
          icon={ClipboardList}
          filtered={filtered}
          title={filtered ? text('emptyFiltered') : text('empty')}
          actionLabel={filtered ? text('clearFilters') : undefined}
          onAction={filtered ? () => setFilters(EMPTY_TRACKING_FILTERS) : undefined}
        />
      ) : (
        <ul className="admin-event-regs__list">
          {visible.map((registration) => {
            const athleteName =
              registration.athlete?.fullName ||
              registration.athlete?.email ||
              text('unknownAthlete')
            const divisions = registration.secondaryDivision
              ? `${registration.division} ${text('secondDivision', { division: registration.secondaryDivision })}`
              : registration.division
            const detail = [
              registration.category,
              divisions,
              (registration.modalities ?? []).map(modalityLabel).join(' + '),
            ]
              .filter(Boolean)
              .join(' · ')
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
                  {registration.payment ? (
                    <span className="admin-event-regs__payment">
                      <strong>{money(registration.amount, locale, registration.currency)}</strong>
                      {registration.channel ? (
                        <span>{channelLabel(registration.channel)}</span>
                      ) : null}
                    </span>
                  ) : null}
                  <StatusPill value={registration.status} />
                  {canSetStatus && onSetRegistrationStatus ? (
                    <AdminIconButton
                      icon={PencilLine}
                      label={text('editStatus')}
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
      {sheetImportOpen ? (
        <RegistrationSheetImportDialog
          eventSlug={event.slug}
          eventLabel={event.title ?? event.slug}
          onClose={() => setSheetImportOpen(false)}
          onApplied={() => void onRefreshRegistrations?.()}
        />
      ) : null}
    </section>
  )
}

/**
 * Conteos de estado para el dashboard del evento (misma identidad por slug).
 */
export function buildEventRegistrationStatusCounts(
  registrations = [],
  event,
  gatePendingIds = EMPTY_GATE,
) {
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
    else if (
      status === 'pendiente_pago' ||
      status === 'validacion_manual' ||
      status === 'borrador'
    ) {
      byStatus.pendiente_pago += 1
    } else if (status === 'observada') byStatus.observada += 1
    else if (status === 'cancelada' || status === 'rechazado') byStatus.cancelada += 1
    if (gatePendingIds.has(registration.id)) byStatus.gate_pending += 1
  }
  return byStatus
}
