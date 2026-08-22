import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  EyeOff,
  MapPin,
  Plus,
  RefreshCw,
  Star,
  Unlock,
  Users,
} from 'lucide-react'
import AdminDeleteConfirmDialog from '../../components/admin/AdminDeleteConfirmDialog.jsx'
import AdminEventConsoleModal, {
  formatEventVenueLine,
} from '../../components/admin/AdminEventConsoleModal.jsx'
import AdminEventEditor from '../../components/admin/AdminEventEditor.jsx'
import AdminEventQuickCreate from '../../components/admin/AdminEventQuickCreate.jsx'
import AdminEventSecuritySection from '../../components/admin/AdminEventSecuritySection.jsx'
import AdminEventSessionsEditor from '../../components/admin/AdminEventSessionsEditor.jsx'
import AdminEventZonesSection from '../../components/admin/AdminEventZonesSection.jsx'
import AdminIconButton from '../../components/admin/AdminIconButton.jsx'
import AdminListSection from '../../components/admin/AdminListSection.jsx'
import Button from '../../components/ui/Button.jsx'
import StatusPill from '../../components/ui/StatusPill.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { translateFilterOptions } from '../../i18n/adminHelpers.js'
import { useAdminTour } from '../../providers/AdminTourProvider.jsx'
import { getEventsTourSteps } from '../../lib/adminTourSteps.js'
import { formatDayMonth, formatMonthYear } from '../../lib/format.js'
import { getStatusMeta } from '../../lib/status.js'
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

function EventListRow({ row, selected, locale, onSelect, t }) {
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
          {/* Se marca la excepción, no la regla: casi todos los meets piden
              afiliación, así que un sello en la mayoría sería ruido. El que
              está abierto es el que cambia cómo se lo controla en la puerta, y
              hasta acá eso solo se veía entrando al editor. */}
          {row.requiresMembership === false ? (
            <span
              className="admin-event-row__open-mark"
              title={t('admin.eventState.openBadge')}
              aria-label={t('admin.eventState.openBadge')}
            >
              <Unlock size={12} aria-hidden />
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

    </li>
  )
}

export default function EventsSection({
  adminEvents,
  canEdit,
  canDeleteEvents = false,
  canManageUsers,
  isLoading = false,
  loadError = null,
  onAssignSecurityZone,
  onCreateSecurityUser,
  onCreateSecurityUsersBulk,
  onCreateSecurityAccessLink,
  onCreateSecurityZone,
  onDeactivateAllSecurityUsers,
  onDeleteEvent,
  onDeleteSecurityZone,
  onFetchDeleteImpact,
  onListSecurityUsers,
  onListSecurityZones,
  onManageCheckin,
  onManagePayments,
  onManageRegistrations,
  onPresetSecurityZones,
  onRefresh,
  onSaveEvent,
  onSetEventState,
  onUpdateSecurityUserStatus,
  onUpdateSecurityZone,
  tickets = [],
}) {
  const { locale, t } = useI18n()
  const { startTour } = useAdminTour()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [selectedId, setSelectedId] = useState(adminEvents[0]?.id ?? null)

  useEffect(() => {
    startTour('admin-events', getEventsTourSteps(t))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al montar
  }, [])
  const [formOpen, setFormOpen] = useState(false)
  // Alta rápida y editor completo son dos superficies distintas: crear no pide
  // las mismas decisiones que editar (ver AdminEventQuickCreate).
  const [quickCreateOpen, setQuickCreateOpen] = useState(false)
  /** Consola del evento seleccionado, abierta como modal al tocar la fila. */
  const [consoleOpen, setConsoleOpen] = useState(false)
  /**
   * Vista de la consola del evento. La configuración que se guarda sola --
   * grilla y zonas -- se abre acá, a ancho completo y sin modal: el editor
   * reescribe el evento entero al guardar, y usarlo para agregar una tanda o
   * mover a alguien de zona costaba ese precio.
   */
  const [consoleView, setConsoleView] = useState('list')
  const [zonesReloadToken, setZonesReloadToken] = useState(0)
  const [draft, setDraft] = useState(createAdminEventDraft)
  const [editorFocus, setEditorFocus] = useState('details')
  const [message, setMessage] = useState(null)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [deleteImpact, setDeleteImpact] = useState(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [requiresForce, setRequiresForce] = useState(false)
  // Slug del diálogo abierto: el impacto llega por red y no puede pisar el
  // estado si mientras tanto se cerró o se abrió el de otro evento.
  const deleteTargetRef = useRef(null)

  function handleSelectEvent(id) {
    setSelectedId(id)
    setConsoleOpen(true)
  }

  function closeEventConsole() {
    setConsoleOpen(false)
  }

  /** Grilla y zonas reemplazan al listado: la consola se cierra para dejar
   *  el ancho completo a la tabla de operación. */
  function openDrillFromConsole(view) {
    setConsoleOpen(false)
    setConsoleView(view)
  }

  useEffect(() => {
    // Cambiar de evento vuelve a la lista: quedarse en "Zonas" mostrando otro
    // meet es la forma más rápida de asignar gente al operativo equivocado.
    setConsoleView('list')
  }, [selectedId])

  useEffect(() => {
    if (adminEvents.some((event) => event.id === selectedId)) return
    setSelectedId(adminEvents[0]?.id ?? null)
  }, [adminEvents, selectedId])

  const statusCounts = useMemo(() => {
    const counts = Object.create(null)
    for (const event of adminEvents) {
      const key = event.status
      if (!key) continue
      counts[key] = (counts[key] ?? 0) + 1
    }
    return counts
  }, [adminEvents])

  const statusOptions = useMemo(
    () =>
      translateFilterOptions(ADMIN_EVENT_STATUS_OPTIONS, t).map(([value, label]) => [
        value,
        label,
        value === 'all' ? adminEvents.length : (statusCounts[value] ?? 0),
      ]),
    [adminEvents.length, statusCounts, t],
  )

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
    setMessage(null)
    setQuickCreateOpen(true)
  }

  /** Salida del alta rápida hacia el formulario largo, sin perder lo tipeado. */
  function openFullEditorFromQuickCreate(quickDraft) {
    setQuickCreateOpen(false)
    setDraft({ ...createAdminEventDraft(), ...quickDraft })
    setEditorFocus('details')
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

  /**
   * Alta rápida: mismo endpoint que el editor, pero al terminar deja el evento
   * seleccionado y la consola abierta -- que es donde queda el trabajo que el
   * alta deliberadamente no pidió (entradas, grilla, zonas).
   */
  async function handleQuickCreate(submittedDraft) {
    const saved = await onSaveEvent?.(submittedDraft)
    if (saved?.error) throw new Error(saved.error)
    setQuickCreateOpen(false)
    if (saved?.event?.id) setSelectedId(saved.event.id)
    setConsoleView('list')
    setConsoleOpen(true)
    setMessage({ tone: 'success', text: t('admin.sections.events.created') })
    return saved
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

  /**
   * Borrado definitivo. El diálogo pide primero el impacto real (dry run en la
   * base) para que el operador vea qué se lleva puesto; si el evento ya movió
   * plata o gente, la API rechaza el primer intento y ahí se escala a escribir
   * el identificador del evento.
   */
  function openDeleteDialog(event) {
    if (!event) return
    setPendingDelete(event)
    setDeleteImpact(null)
    setDeleteError('')
    setRequiresForce(false)
    setMessage(null)

    deleteTargetRef.current = event.slug
    if (!onFetchDeleteImpact) return
    onFetchDeleteImpact(event.slug)
      .then((impact) => {
        if (deleteTargetRef.current !== event.slug) return
        setDeleteImpact(impact)
        setRequiresForce(impact?.requiresForce === true)
      })
      .catch((error) => {
        if (deleteTargetRef.current !== event.slug) return
        setDeleteError(error?.message ?? t('admin.sections.events.delete.error'))
      })
  }

  function closeDeleteDialog() {
    if (deleteBusy) return
    deleteTargetRef.current = null
    setPendingDelete(null)
    setDeleteImpact(null)
    setDeleteError('')
    setRequiresForce(false)
  }

  async function handleDelete() {
    if (!pendingDelete || !onDeleteEvent) return
    setDeleteError('')
    setDeleteBusy(true)
    try {
      const result = await onDeleteEvent(pendingDelete.slug, { force: requiresForce })
      if (result?.error) throw new Error(result.error)
      deleteTargetRef.current = null
      setPendingDelete(null)
      setDeleteImpact(null)
      setRequiresForce(false)
      setMessage({
        tone: 'success',
        text: t('admin.sections.events.delete.done', { title: pendingDelete.title }),
      })
    } catch (error) {
      // 409 sin force: la base pide consentimiento explícito porque el evento
      // tiene actividad real. No es un fallo, es el segundo paso.
      if (error?.status === 409 && !requiresForce) setRequiresForce(true)
      setDeleteError(error?.message ?? t('admin.sections.events.delete.error'))
    } finally {
      setDeleteBusy(false)
    }
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
              locale={locale}
              onSelect={handleSelectEvent}
              t={t}
            />
          ))}
        </ul>
      </li>
    )
  }

  const selectedVenueLine = selectedEvent
    ? formatEventVenueLine(selectedEvent.venue, selectedEvent.location)
    : ''
  const selectedDateLabel = selectedEvent
    ? selectedEvent.dateISO
      ? formatDayMonth(selectedEvent.dateISO, locale)
      : (selectedEvent.date ?? '')
    : ''

  const headerActions =
    onRefresh || canEdit ? (
      <div className="admin-events__header-actions">
        {onRefresh ? (
          <AdminIconButton
            className={
              isLoading ? 'admin-events__refresh-btn is-spinning' : 'admin-events__refresh-btn'
            }
            disabled={isLoading}
            icon={RefreshCw}
            label={
              isLoading ? t('admin.sections.events.refreshing') : t('admin.sections.events.refresh')
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
    ) : null

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
      actions={headerActions}
      filteredCount={rows.length}
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

      {/* Grilla y zonas se abren a ancho completo en lugar de la lista: son
          tablas de operación, no un panel de 340px. La lista no se destruye por
          gusto -- el evento seleccionado es el mismo cuando se vuelve. */}
      {consoleView !== 'list' && selectedEvent ? (
        <div className="admin-event-drill">
          <div className="admin-event-drill__crumbs">
            <button
              type="button"
              className="admin-event-drill__back"
              onClick={() => setConsoleView('list')}
              aria-label={t('admin.eventConsole.back')}
            >
              <ArrowLeft size={14} aria-hidden />
            </button>
            <strong>{selectedEvent.title}</strong>
            <span aria-hidden>·</span>
            <span>
              {[selectedDateLabel, selectedVenueLine].filter(Boolean).join(' · ')}
            </span>
          </div>

          {consoleView === 'structure' ? (
            <AdminEventSessionsEditor canEdit={canEdit} eventSlug={selectedEvent.slug} />
          ) : null}

          {consoleView === 'zones' ? (
            <>
              <AdminEventZonesSection
                canManageUsers={canManageUsers}
                eventId={selectedEvent.id}
                eventSlug={selectedEvent.slug}
                onAssignMember={onAssignSecurityZone}
                onCreateAccessLink={onCreateSecurityAccessLink}
                onCreateZone={onCreateSecurityZone}
                onDeleteZone={onDeleteSecurityZone}
                onListSecurityUsers={onListSecurityUsers}
                onListZones={onListSecurityZones}
                onPresetZones={onPresetSecurityZones}
                onUpdateZone={onUpdateSecurityZone}
                reloadToken={zonesReloadToken}
              />
              <AdminEventSecuritySection
                canManageUsers={canManageUsers}
                eventId={selectedEvent.id}
                eventSlug={selectedEvent.slug}
                eventEndsAt={selectedEvent.endsAt}
                onCreateSecurityUser={onCreateSecurityUser}
                onCreateSecurityUsersBulk={onCreateSecurityUsersBulk}
                onCreateSecurityAccessLink={onCreateSecurityAccessLink}
                onDeactivateAllSecurityUsers={onDeactivateAllSecurityUsers}
                onListSecurityUsers={onListSecurityUsers}
                onTeamChange={() => setZonesReloadToken((current) => current + 1)}
                onUpdateSecurityUserStatus={onUpdateSecurityUserStatus}
              />
            </>
          ) : null}
        </div>
      ) : (
        <div className="admin-events-workspace">
          <div className="admin-events-workspace__main">
            {isLoading && adminEvents.length === 0 ? (
              <div className="admin-events__loading" role="status">
                <span className="plu-spinner plu-spinner--lg" aria-hidden="true" />
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
                  <Button
                    type="button"
                    variant="gold"
                    className="btn--small"
                    onClick={openCreateForm}
                  >
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
        </div>
      )}

      {/* La consola del evento se abre al tocar la fila: el listado es la
          única superficie de la sección y respira a ancho completo. Editar y
          borrar se abren encima de la consola, no en lugar de ella. */}
      <AdminEventConsoleModal
        canDelete={canDeleteEvents && Boolean(onDeleteEvent)}
        canEdit={canEdit}
        canManageUsers={canManageUsers}
        event={selectedEvent}
        open={consoleOpen && consoleView === 'list' && Boolean(selectedEvent)}
        tickets={tickets}
        onClose={closeEventConsole}
        onDelete={openDeleteDialog}
        onEdit={openEditForm}
        onManageCheckin={onManageCheckin}
        onManagePayments={onManagePayments}
        onManageRegistrations={onManageRegistrations}
        onOpenStructure={() => openDrillFromConsole('structure')}
        onOpenZones={() => openDrillFromConsole('zones')}
        onSetEventState={onSetEventState}
      />

      {quickCreateOpen ? (
        <AdminEventQuickCreate
          canEdit={canEdit}
          onCancel={() => setQuickCreateOpen(false)}
          onOpenFullEditor={openFullEditorFromQuickCreate}
          onSubmit={handleQuickCreate}
        />
      ) : null}

      {formOpen ? (
        <AdminEventEditor
          canEdit={canEdit}
          draft={draft}
          initialFocus={editorFocus}
          sourceEvent={editingSource}
          onCancel={closeForm}
          onChange={setDraft}
          onSubmit={handleSubmit}
        />
      ) : null}

      {pendingDelete ? (
        <AdminDeleteConfirmDialog
          busy={deleteBusy}
          error={deleteError}
          onCancel={closeDeleteDialog}
          onConfirm={() => void handleDelete()}
          title={t('admin.sections.events.delete.confirmTitle')}
          description={
            deleteImpact
              ? t('admin.sections.events.delete.confirmDescription', {
                  title: pendingDelete.title,
                  slug: pendingDelete.slug,
                  registrations: deleteImpact.impact?.registrations ?? 0,
                  tickets: deleteImpact.impact?.tickets ?? 0,
                  orders: deleteImpact.impact?.ticketOrders ?? 0,
                  checkIns: deleteImpact.impact?.checkIns ?? 0,
                })
              : t('admin.sections.events.delete.loading')
          }
          warning={
            requiresForce
              ? t('admin.sections.events.delete.forceWarning', {
                  paidRegistrations: deleteImpact?.impact?.paidRegistrations ?? 0,
                  paidTickets: deleteImpact?.impact?.paidTickets ?? 0,
                  checkIns: deleteImpact?.impact?.checkIns ?? 0,
                })
              : t('admin.sections.events.delete.warning')
          }
          confirmPhrase={requiresForce ? pendingDelete.slug : null}
          confirmPhraseLabel={t('admin.sections.events.delete.phraseLabel')}
          confirmPhraseHint={t('admin.sections.events.delete.phraseHint', {
            slug: pendingDelete.slug,
          })}
          cancelLabel={t('admin.sections.events.delete.cancel')}
          confirmLabel={t('admin.sections.events.delete.confirm')}
          busyLabel={t('admin.sections.events.delete.deleting')}
        />
      ) : null}
    </AdminListSection>
  )
}
