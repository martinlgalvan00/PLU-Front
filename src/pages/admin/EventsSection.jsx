import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CalendarDays,
  ChevronDown,
  ClipboardList,
  CreditCard,
  EyeOff,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  Star,
  Ticket,
  Users,
} from 'lucide-react'
import AdminCopyLinkMenu from '../../components/admin/AdminCopyLinkMenu.jsx'
import AdminEventEditor, {
  AdminEventLivePreview,
} from '../../components/admin/AdminEventEditor.jsx'
import AdminEventStateControl from '../../components/admin/AdminEventStateControl.jsx'
import AdminEventTicketAddonReport from '../../components/admin/AdminEventTicketAddonReport.jsx'
import AdminEventTicketInsights from '../../components/admin/AdminEventTicketInsights.jsx'
import AdminIconButton from '../../components/admin/AdminIconButton.jsx'
import AdminListSection from '../../components/admin/AdminListSection.jsx'
import Button from '../../components/ui/Button.jsx'
import StatusPill from '../../components/ui/StatusPill.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { translateFilterOptions } from '../../i18n/adminHelpers.js'
import { formatDayMonth, formatMonthYear } from '../../lib/format.js'
import { buildEventPagePath } from '../../lib/eventPageRoute.js'
import { buildSecurityGatePath } from '../../lib/securityGateRoute.js'
import { getStatusMeta } from '../../lib/status.js'
import { TICKETS_PATH } from '../../lib/ticketsRoute.js'
import {
  ADMIN_EVENT_STATUS_OPTIONS,
  buildAdminEventDraft,
  createAdminEventDraft,
  filterAdminEvents,
} from '../../services/eventAdminService.js'

function isFinishedEvent(event) {
  return event?.status === 'finalizado'
}

function sortByDate(list, direction) {
  return [...list].sort((a, b) => {
    const left = a.dateISO ?? ''
    const right = b.dateISO ?? ''
    return direction === 'asc' ? left.localeCompare(right) : right.localeCompare(left)
  })
}

function groupByMonthKey(list) {
  const byMonth = new Map()
  for (const row of list) {
    const key = row.dateISO?.slice(0, 7) || 'sin-fecha'
    if (!byMonth.has(key)) byMonth.set(key, [])
    byMonth.get(key).push(row)
  }
  return byMonth
}

function EventListRow({
  row,
  selected,
  canEdit,
  links,
  locale,
  onSelect,
  onEdit,
  t,
}) {
  const rawFill = row.slots > 0 ? Math.round((row.registered / row.slots) * 100) : 0
  const fill = Math.min(rawFill, 100)
  const capacityTone = rawFill >= 100 ? 'full' : rawFill >= 80 ? 'high' : 'available'
  const { tone } = getStatusMeta(row.status)
  const venueLine = [row.venue, row.location].filter(Boolean).join(', ')
  const [day, month] = (row.dateISO ? formatDayMonth(row.dateISO, locale) : (row.date ?? '')).split(
    ' ',
  )

  return (
    <li
      className={[
        'admin-event-row',
        `admin-event-row--${tone}`,
        selected ? 'admin-event-row--selected' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      role="button"
      tabIndex={0}
      aria-current={selected ? 'true' : undefined}
      title={row.slug ? `${row.title} · ${row.slug}` : row.title}
      onClick={() => onSelect(row.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect(row.id)
        }
      }}
    >
      <div className={`admin-event-row__date admin-event-row__date--${tone}`}>
        <span className="admin-event-row__day">{day}</span>
        <span className="admin-event-row__month">{month}</span>
      </div>

      <div className="admin-event-row__body">
        <div className="admin-event-row__title-wrap">
          {row.featured ? (
            <span
              className="admin-event-row__featured-mark"
              title={t('admin.sections.events.featuredBadge')}
              aria-label={t('admin.sections.events.featuredBadge')}
            >
              <Star size={12} aria-hidden />
            </span>
          ) : null}
          <strong className="admin-event-row__title">{row.title}</strong>
          {/* Un evento despublicado se veía idéntico a uno visible: el único
              dato que lo distinguía vivía dentro del editor. */}
          {row.published === false ? (
            <span
              className="admin-event-row__hidden-mark"
              title={t('admin.eventState.hiddenBadge')}
              aria-label={t('admin.eventState.hiddenBadge')}
            >
              <EyeOff size={12} aria-hidden />
            </span>
          ) : null}
        </div>

        {venueLine ? (
          <div className="admin-event-row__meta">
            <span className="admin-event-row__meta-item">
              <MapPin size={12} aria-hidden />
              {venueLine}
            </span>
          </div>
        ) : null}
      </div>

      <div className={`admin-event-row__capacity admin-event-row__capacity--${capacityTone}`}>
        <div
          className="admin-event-row__capacity-bar"
          role="progressbar"
          aria-label={t('admin.dashboard.slots')}
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow={fill}
        >
          <div className="admin-event-row__capacity-fill" style={{ width: `${fill}%` }} />
        </div>
        <span className="admin-event-row__capacity-label">
          <Users size={11} aria-hidden />
          {row.registered}/{row.slots}
        </span>
      </div>

      <div className="admin-event-row__badge">
        <StatusPill value={row.status} />
      </div>

      <div className="admin-event-row__actions" onClick={(event) => event.stopPropagation()}>
        <AdminCopyLinkMenu links={links} />
        <AdminIconButton
          disabled={!canEdit}
          icon={Pencil}
          label={t('admin.sections.events.edit')}
          onClick={() => onEdit(row)}
          variant="ghost"
        />
      </div>
    </li>
  )
}

export default function EventsSection({
  adminEvents,
  canEdit,
  canManageUsers,
  isLoading = false,
  loadError = null,
  onCreateSecurityUser,
  onCreateSecurityUsersBulk,
  onCreateSecurityAccessLink,
  onDeactivateAllSecurityUsers,
  onListSecurityUsers,
  onManagePayments,
  onManageRegistrations,
  onRefresh,
  onSaveEvent,
  onSetEventState,
  onUpdateSecurityUserStatus,
  tickets = [],
}) {
  const { locale, t } = useI18n()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [selectedId, setSelectedId] = useState(adminEvents[0]?.id ?? null)
  const [formOpen, setFormOpen] = useState(false)
  const [draft, setDraft] = useState(createAdminEventDraft)
  const [editorFocus, setEditorFocus] = useState('details')
  const [previewExpanded, setPreviewExpanded] = useState(false)
  const [message, setMessage] = useState(null)

  useEffect(() => {
    setPreviewExpanded(false)
  }, [selectedId])

  useEffect(() => {
    if (adminEvents.some((event) => event.id === selectedId)) return
    setSelectedId(adminEvents[0]?.id ?? null)
  }, [adminEvents, selectedId])

  const statusOptions = useMemo(() => translateFilterOptions(ADMIN_EVENT_STATUS_OPTIONS, t), [t])

  const rows = useMemo(
    () => filterAdminEvents(adminEvents, { query, status }),
    [adminEvents, query, status],
  )

  const eventGroups = useMemo(() => {
    const upcoming = []
    const finished = []

    for (const row of rows) {
      if (isFinishedEvent(row)) finished.push(row)
      else upcoming.push(row)
    }

    const upcomingByMonth = [...groupByMonthKey(upcoming).entries()].sort(([left], [right]) =>
      left.localeCompare(right),
    )
    const finishedByMonth = [...groupByMonthKey(finished).entries()].sort(([left], [right]) =>
      right.localeCompare(left),
    )

    const finishedLabel = t('admin.sections.events.groupFinished')
    const upcomingGroups = upcomingByMonth.map(([monthKey, list]) => ({
      id: `upcoming-${monthKey}`,
      tone: 'upcoming',
      label:
        upcomingByMonth.length === 1
          ? t('admin.sections.events.groupUpcoming')
          : formatMonthYear(monthKey, locale),
      rows: sortByDate(list, 'asc'),
    }))

    const finishedGroups = finishedByMonth.map(([monthKey, list]) => ({
      id: `finished-${monthKey}`,
      tone: 'finished',
      label:
        monthKey === 'sin-fecha'
          ? finishedLabel
          : `${finishedLabel} · ${formatMonthYear(monthKey, locale)}`,
      rows: sortByDate(list, 'desc'),
    }))

    return [...upcomingGroups, ...finishedGroups].filter((group) => group.rows.length > 0)
  }, [locale, rows, t])

  const selectedEvent = adminEvents.find((event) => event.id === selectedId) ?? rows[0] ?? null
  const activeTicketTypeCount =
    selectedEvent?.ticketTypes?.filter((ticketType) => ticketType.active !== false).length ?? 0
  const editingSource = draft.id
    ? (adminEvents.find((event) => event.id === draft.id) ?? selectedEvent)
    : null

  const kpiStats = useMemo(() => {
    let totalRegistered = 0
    let totalSlots = 0
    let upcomingCount = 0

    for (const ev of adminEvents) {
      totalRegistered += ev.registered ?? 0
      totalSlots += ev.slots ?? 0
      if (!isFinishedEvent(ev)) {
        upcomingCount++
      }
    }

    const fillPercent = totalSlots > 0 ? Math.round((totalRegistered / totalSlots) * 100) : 0

    return {
      upcomingCount,
      totalRegistered,
      totalSlots,
      fillPercent,
    }
  }, [adminEvents])

  function openCreateForm() {
    setDraft(createAdminEventDraft())
    setEditorFocus('details')
    setMessage(null)
    setFormOpen(true)
  }

  function openEditForm(event, focus = 'details') {
    if (!event) return
    setSelectedId(event.id)
    setEditorFocus(focus)
    setDraft(buildAdminEventDraft(event))
    setMessage(null)
    setFormOpen(true)
  }

  function closeForm() {
    setFormOpen(false)
    setDraft(createAdminEventDraft())
  }

  async function handleSubmit(submittedDraft) {
    const saved = await onSaveEvent?.(submittedDraft)
    if (saved?.error) throw new Error(saved.error)
    closeForm()
    if (saved?.event?.id) setSelectedId(saved.event.id)
    setMessage({
      tone: 'success',
      text: submittedDraft.id
        ? t('admin.sections.events.updated')
        : t('admin.sections.events.created'),
    })
    return saved
  }

  function buildEventLinks(row) {
    if (!row?.slug) return []
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    return [
      {
        id: 'public',
        label: t('admin.copyLinkMenu.public'),
        url: `${origin}${buildEventPagePath(row.slug)}`,
      },
      {
        id: 'tickets',
        label: t('admin.copyLinkMenu.tickets'),
        url: `${origin}${TICKETS_PATH}?evento=${encodeURIComponent(row.slug)}`,
      },
      {
        id: 'security',
        label: t('admin.copyLinkMenu.security'),
        url: `${origin}${buildSecurityGatePath(row.slug)}`,
      },
    ]
  }

  function renderEventGroup(group) {
    const isFinishedGroup = group.tone === 'finished'
    return (
      <li
        className={['admin-event-group', isFinishedGroup ? 'admin-event-group--finished' : '']
          .filter(Boolean)
          .join(' ')}
        key={group.id}
      >
        <div className="admin-event-group__label">
          <span>{group.label}</span>
          <strong>{group.rows.length}</strong>
        </div>
        <ul className="admin-event-group__list">
          {group.rows.map((row) => (
            <EventListRow
              key={row.id}
              row={row}
              selected={row.id === selectedEvent?.id}
              canEdit={canEdit}
              links={buildEventLinks(row)}
              locale={locale}
              onSelect={setSelectedId}
              onEdit={openEditForm}
              t={t}
            />
          ))}
        </ul>
      </li>
    )
  }

  const selectedVenueLine = selectedEvent
    ? [selectedEvent.venue, selectedEvent.location].filter(Boolean).join(', ')
    : ''
  const selectedDateLabel = selectedEvent
    ? selectedEvent.dateISO
      ? formatDayMonth(selectedEvent.dateISO, locale)
      : (selectedEvent.date ?? '')
    : ''

  const filterActions = (
    <div className="admin-events__toolbar-actions">
      {onRefresh ? (
        <AdminIconButton
          className={
            isLoading ? 'admin-events__refresh-btn is-spinning' : 'admin-events__refresh-btn'
          }
          disabled={isLoading}
          icon={RefreshCw}
          label={
            isLoading
              ? t('admin.sections.events.refreshing')
              : t('admin.sections.events.refresh')
          }
          onClick={onRefresh}
          variant="ghost"
        />
      ) : null}
      {canEdit ? (
        <Button type="button" variant="gold" className="btn--small" onClick={openCreateForm}>
          <Plus size={15} aria-hidden />
          {t('admin.actions.newEvent')}
        </Button>
      ) : null}
    </div>
  )

  const eventsKpis = (
    <div
      className="admin-events-kpis"
      role="group"
      aria-label={t('admin.sections.events.kpisAria')}
    >
      <div className="admin-events-kpi">
        <span className="admin-events-kpi__label">{t('admin.sections.events.kpiUpcoming')}</span>
        <strong className="admin-events-kpi__value">{kpiStats.upcomingCount}</strong>
      </div>
      <div className="admin-events-kpi">
        <span className="admin-events-kpi__label">{t('admin.sections.events.kpiRegistered')}</span>
        <strong className="admin-events-kpi__value">{kpiStats.totalRegistered}</strong>
      </div>
      <div className="admin-events-kpi">
        <span className="admin-events-kpi__label">{t('admin.sections.events.kpiFill')}</span>
        <strong className="admin-events-kpi__value">{kpiStats.fillPercent}%</strong>
      </div>
      <div className="admin-events-kpi">
        <span className="admin-events-kpi__label">{t('admin.sections.events.kpiTotal')}</span>
        <strong className="admin-events-kpi__value">{adminEvents.length}</strong>
      </div>
    </div>
  )

  return (
    <AdminListSection
      eyebrow={t('admin.sections.events.eyebrow')}
      filteredCount={rows.length}
      filterActions={filterActions}
      placeholder={t('admin.search.event')}
      query={query}
      showHeader
      showStats={false}
      title={t('admin.sections.events.title')}
      totalCount={adminEvents.length}
      variant="events"
      beforeShell={eventsKpis}
      filters={[
        {
          id: 'status',
          label: t('admin.filters.status'),
          value: status,
          onChange: setStatus,
          options: statusOptions,
        },
      ]}
      onQueryChange={setQuery}
    >
      {loadError ? (
        <div className="admin-events__notice admin-events__notice--error" role="alert">
          <AlertTriangle size={16} aria-hidden />
          <div>
            <strong>{t('admin.sections.events.loadErrorTitle')}</strong>
            <p>{loadError}</p>
          </div>
          {onRefresh ? (
            <Button type="button" variant="outline" className="btn--small" onClick={onRefresh}>
              {t('admin.sections.events.retry')}
            </Button>
          ) : null}
        </div>
      ) : null}

      {message ? (
        <p className={`admin-events__message admin-events__message--${message.tone}`} role="status">
          {message.text}
        </p>
      ) : null}

      <div className="admin-events-workspace">
        <div className="admin-events-workspace__main">
          {isLoading && adminEvents.length === 0 ? (
            <div className="admin-events__loading" role="status">
              <span className="admin-events__loading-indicator" aria-hidden />
              <p>{t('admin.sections.events.loading')}</p>
            </div>
          ) : rows.length === 0 ? (
            <div className="data-table__empty-wrap data-table__empty-wrap--admin">
              <span className="data-table__empty-icon" aria-hidden>
                <CalendarDays size={20} strokeWidth={1.5} />
              </span>
              <p className="data-table__empty data-table__empty--admin admin-event-list__empty">
                {t('admin.sections.events.empty')}
              </p>
              {canEdit && adminEvents.length === 0 ? (
                <Button type="button" variant="gold" className="btn--small" onClick={openCreateForm}>
                  <Plus size={14} aria-hidden />
                  {t('admin.sections.events.createFirst')}
                </Button>
              ) : null}
            </div>
          ) : (
            <ul className="admin-event-list" aria-label={t('admin.columns.event')}>
              {eventGroups.map(renderEventGroup)}
            </ul>
          )}
        </div>

        {selectedEvent && (
          <aside
            className={[
              'admin-event-preview',
              'admin-event-preview--panel',
              previewExpanded ? 'is-expanded' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            aria-label={t('admin.sections.events.panelLabel')}
          >
            <div className="admin-event-preview__head">
              <div className="admin-event-preview__head-copy">
                <div className="admin-event-preview__title-row">
                  <p className="admin-event-preview__selected-title">{selectedEvent.title}</p>
                  <StatusPill value={selectedEvent.status} />
                </div>
                {(selectedDateLabel || selectedVenueLine) && (
                  <p className="admin-event-preview__meta-line">
                    {selectedDateLabel ? <span>{selectedDateLabel}</span> : null}
                    {selectedDateLabel && selectedVenueLine ? (
                      <span className="admin-event-preview__meta-sep" aria-hidden>
                        ·
                      </span>
                    ) : null}
                    {selectedVenueLine ? <span>{selectedVenueLine}</span> : null}
                  </p>
                )}
              </div>
              <div className="admin-event-preview__head-actions">
                <AdminCopyLinkMenu links={buildEventLinks(selectedEvent)} />
                {canEdit ? (
                  <>
                    <AdminIconButton
                      icon={ShieldCheck}
                      label={t('admin.eventEditor.security.title')}
                      onClick={() => openEditForm(selectedEvent, 'security')}
                      variant="ghost"
                    />
                    <Button
                      type="button"
                      variant="gold"
                      className="btn--small admin-event-preview__edit-btn"
                      onClick={() => openEditForm(selectedEvent)}
                    >
                      <Pencil size={14} aria-hidden />
                      {t('admin.sections.events.editEvent')}
                    </Button>
                  </>
                ) : null}
              </div>
            </div>

            {/* Abrir, cerrar y publicar son la operación diaria del evento:
                van antes que los accesos a entradas y pagos, y sin pasar por
                el editor -- que reescribe días y tipos de entrada enteros. */}
            {onSetEventState ? (
              <AdminEventStateControl
                canEdit={canEdit}
                event={selectedEvent}
                onSetState={onSetEventState}
              />
            ) : null}

            <div
              className="admin-event-preview__command-bar"
              aria-label={t('admin.eventEditor.managementAria')}
            >
              {canEdit ? (
                <button
                  type="button"
                  aria-label={t('admin.eventEditor.manageTicketsLabel', {
                    count: activeTicketTypeCount,
                  })}
                  onClick={() => openEditForm(selectedEvent, 'tickets')}
                >
                  <Ticket size={14} aria-hidden />
                  <span>{t('admin.eventEditor.manageTickets')}</span>
                  <strong>{activeTicketTypeCount}</strong>
                </button>
              ) : null}
              {onManageRegistrations ? (
                <button type="button" onClick={() => onManageRegistrations(selectedEvent)}>
                  <ClipboardList size={14} aria-hidden />
                  <span>{t('admin.eventEditor.manageRegistrations')}</span>
                  <strong>{selectedEvent.registered ?? 0}</strong>
                </button>
              ) : null}
              {onManagePayments ? (
                <button type="button" onClick={() => onManagePayments(selectedEvent)}>
                  <CreditCard size={14} aria-hidden />
                  <span>{t('admin.eventEditor.managePayments')}</span>
                </button>
              ) : null}
            </div>

            <button
              type="button"
              className="admin-event-preview__expand-toggle"
              aria-expanded={previewExpanded}
              onClick={() => setPreviewExpanded((current) => !current)}
            >
              <span>
                {previewExpanded
                  ? t('admin.sections.events.previewHide')
                  : t('admin.sections.events.previewShow')}
              </span>
              <ChevronDown size={14} aria-hidden className="admin-event-preview__expand-icon" />
            </button>

            <div className="admin-event-preview__detail">
              <p className="admin-event-preview__detail-label">
                {t('admin.sections.events.publicPreviewLabel')}
              </p>
              <AdminEventLivePreview embedded draft={selectedEvent} sourceEvent={selectedEvent} />
              <AdminEventTicketInsights event={selectedEvent} tickets={tickets} />
              <AdminEventTicketAddonReport event={selectedEvent} tickets={tickets} />
            </div>
          </aside>
        )}
      </div>

      {formOpen ? (
        <AdminEventEditor
          canEdit={canEdit}
          canManageUsers={canManageUsers}
          draft={draft}
          initialFocus={editorFocus}
          onCreateSecurityUser={onCreateSecurityUser}
          onCreateSecurityUsersBulk={onCreateSecurityUsersBulk}
          onCreateSecurityAccessLink={onCreateSecurityAccessLink}
          onDeactivateAllSecurityUsers={onDeactivateAllSecurityUsers}
          onListSecurityUsers={onListSecurityUsers}
          onUpdateSecurityUserStatus={onUpdateSecurityUserStatus}
          sourceEvent={editingSource}
          onCancel={closeForm}
          onChange={setDraft}
          onSubmit={handleSubmit}
        />
      ) : null}
    </AdminListSection>
  )
}
