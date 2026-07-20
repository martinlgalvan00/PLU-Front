import { useMemo, useState } from 'react'
import { CalendarDays, MapPin, Pencil, Plus, ShieldCheck, Star, Users } from 'lucide-react'
import AdminCopyLinkMenu from '../../components/admin/AdminCopyLinkMenu.jsx'
import AdminEventEditor, { AdminEventLivePreview } from '../../components/admin/AdminEventEditor.jsx'
import AdminEventTicketAddonReport from '../../components/admin/AdminEventTicketAddonReport.jsx'
import AdminEventTicketInsights from '../../components/admin/AdminEventTicketInsights.jsx'
import AdminIconButton from '../../components/admin/AdminIconButton.jsx'
import AdminListSection from '../../components/admin/AdminListSection.jsx'
import Button from '../../components/ui/Button.jsx'
import StatusPill from '../../components/ui/StatusPill.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { formatRecordCount, translateFilterOptions } from '../../i18n/adminHelpers.js'
import { buildEventPagePath } from '../../lib/eventPageRoute.js'
import { buildSecurityGatePath } from '../../lib/securityGateRoute.js'
import { getStatusMeta } from '../../lib/status.js'
import { TICKETS_PATH } from '../../lib/ticketsRoute.js'
import {
  ADMIN_EVENT_FORM_DEFAULT,
  ADMIN_EVENT_STATUS_OPTIONS,
  filterAdminEvents,
} from '../../services/eventAdminService.js'

export default function EventsSection({
  adminEvents,
  canEdit,
  canManageUsers,
  onCreateSecurityUser,
  onCreateSecurityUsersBulk,
  onCreateSecurityAccessLink,
  onDeactivateAllSecurityUsers,
  onListSecurityUsers,
  onSaveEvent,
  onUpdateSecurityUserStatus,
  tickets = [],
}) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [selectedId, setSelectedId] = useState(adminEvents[0]?.id ?? null)
  const [formOpen, setFormOpen] = useState(false)
  const [draft, setDraft] = useState(ADMIN_EVENT_FORM_DEFAULT)
  const [editorFocus, setEditorFocus] = useState('details')

  const statusOptions = useMemo(
    () => translateFilterOptions(ADMIN_EVENT_STATUS_OPTIONS, t),
    [t],
  )

  const rows = useMemo(
    () => filterAdminEvents(adminEvents, { query, status }),
    [adminEvents, query, status],
  )

  const resultMeta = formatRecordCount(t, rows.length, adminEvents.length)
  const selectedEvent = adminEvents.find((event) => event.id === selectedId) ?? rows[0] ?? null
  const editingSource = draft.id ? adminEvents.find((event) => event.id === draft.id) ?? selectedEvent : null

  function openCreateForm() {
    setDraft(ADMIN_EVENT_FORM_DEFAULT)
    setEditorFocus('details')
    setFormOpen(true)
  }

  function openEditForm(event, focus = 'details') {
    if (!event) return
    setSelectedId(event.id)
    setEditorFocus(focus)
    setDraft({
      ...ADMIN_EVENT_FORM_DEFAULT,
      id: event.id,
      title: event.title,
      dateISO: event.dateISO,
      venue: event.venue,
      location: event.location,
      status: event.status,
      featured: event.featured,
      slots: event.slots,
      pricing: event.pricing,
      startsAt: event.startsAt ?? '',
      endsAt: event.endsAt ?? '',
      registrationOpensAt: event.registrationOpensAt ?? '',
      registrationClosesAt: event.registrationClosesAt ?? '',
      ticketSalesOpensAt: event.ticketSalesOpensAt ?? '',
      ticketSalesClosesAt: event.ticketSalesClosesAt ?? '',
      eventDays: event.eventDays ?? [],
      ticketTypes: event.ticketTypes ?? [],
      liveStreamUrl: event.liveStreamUrl ?? '',
      liveStreamProvider: event.liveStreamProvider ?? 'youtube',
      liveStatus: event.liveStatus ?? 'offline',
      published: event.published !== false,
    })
    setFormOpen(true)
  }

  function closeForm() {
    setFormOpen(false)
    setDraft(ADMIN_EVENT_FORM_DEFAULT)
  }

  function handleSubmit(event) {
    event.preventDefault()
    const saved = onSaveEvent?.(draft)
    if (saved?.error) return
    closeForm()
    if (saved?.event?.id) setSelectedId(saved.event.id)
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

  return (
    <AdminListSection
      filteredCount={rows.length}
      meta={resultMeta}
      placeholder={t('admin.search.event')}
      query={query}
      showHeader
      showStats={false}
      eyebrow={t('admin.sections.events.eyebrow')}
      title={t('admin.sections.events.title')}
      subtitle={t('admin.sections.events.subtitle')}
      totalCount={adminEvents.length}
      variant="events"
      actions={
        canEdit ? (
          <Button className="btn--small" onClick={openCreateForm}>
            <Plus size={15} aria-hidden />
            {t('admin.actions.newEvent')}
          </Button>
        ) : null
      }
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
      <div className="admin-events-workspace">
        <div className="admin-events-workspace__main">
          {rows.length === 0 ? (
            <div className="data-table__empty-wrap data-table__empty-wrap--admin">
              <span className="data-table__empty-icon" aria-hidden>
                <CalendarDays size={20} strokeWidth={1.5} />
              </span>
              <p className="data-table__empty data-table__empty--admin admin-event-list__empty">
                {t('admin.sections.events.empty')}
              </p>
            </div>
          ) : (
            <ul className="admin-event-list" aria-label={t('admin.columns.event')}>
              {rows.map((row) => {
                const rawFill = row.slots > 0 ? Math.round((row.registered / row.slots) * 100) : 0
                const fill = Math.min(rawFill, 100)
                const capacityTone = rawFill >= 100 ? 'full' : rawFill >= 80 ? 'high' : 'available'
                const { tone } = getStatusMeta(row.status)
                const isSelected = row.id === selectedEvent?.id
                return (
                  <li
                    key={row.id}
                    className={[
                      'admin-event-row',
                      `admin-event-row--${tone}`,
                      isSelected ? 'admin-event-row--selected' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    role="button"
                    tabIndex={0}
                    aria-current={isSelected ? 'true' : undefined}
                    onClick={() => setSelectedId(row.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setSelectedId(row.id)
                      }
                    }}
                  >
                    <div className="admin-event-row__body">
                      <div className="admin-event-row__title-wrap">
                        {row.featured ? (
                          <span
                            className="admin-event-row__featured-badge"
                            title={t('admin.sections.events.featuredBadge')}
                          >
                            <Star size={11} aria-hidden />
                            {t('admin.sections.events.featuredBadge')}
                          </span>
                        ) : null}
                        <strong className="admin-event-row__title">{row.title}</strong>
                        <code className="admin-event-row__slug">{row.slug}</code>
                      </div>

                      <div className="admin-event-row__meta">
                        <span className="admin-event-row__meta-item">
                          <CalendarDays size={12} aria-hidden />
                          {row.date}
                        </span>
                        <span className="admin-event-row__meta-item">
                          <MapPin size={12} aria-hidden />
                          {row.venue}
                          {row.location ? `, ${row.location}` : ''}
                        </span>
                      </div>
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
                        <div
                          className="admin-event-row__capacity-fill"
                          style={{ width: `${fill}%` }}
                        />
                      </div>
                      <span className="admin-event-row__capacity-label">
                        <Users size={11} aria-hidden />
                        {row.registered}/{row.slots}
                      </span>
                    </div>

                    <div className="admin-event-row__badge">
                      <StatusPill value={row.status} />
                    </div>

                    <div
                      className="admin-event-row__actions"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <AdminCopyLinkMenu links={buildEventLinks(row)} />
                      <AdminIconButton
                        disabled={!canEdit}
                        icon={ShieldCheck}
                        label={t('admin.eventEditor.security.title')}
                        onClick={() => openEditForm(row, 'security')}
                        variant="ghost"
                      />
                      <AdminIconButton
                        disabled={!canEdit}
                        icon={Pencil}
                        label={t('admin.sections.events.edit')}
                        onClick={() => openEditForm(row)}
                        variant="ghost"
                      />
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {selectedEvent && (
          <aside
            className="admin-event-preview admin-event-preview--panel"
            aria-label={t('admin.sections.events.previewLabel')}
          >
            <div className="admin-event-preview__head">
              <span className="admin-event-preview__label">{t('admin.sections.events.previewLabel')}</span>
              <div className="admin-event-preview__head-actions">
                <AdminCopyLinkMenu links={buildEventLinks(selectedEvent)} />
                {canEdit && (
                  <>
                    <AdminIconButton
                      icon={ShieldCheck}
                      label={t('admin.eventEditor.security.title')}
                      onClick={() => openEditForm(selectedEvent, 'security')}
                      variant="celeste"
                    />
                    <AdminIconButton
                      icon={Pencil}
                      label={t('admin.sections.events.customize')}
                      onClick={() => openEditForm(selectedEvent)}
                      variant="ghost"
                    />
                  </>
                )}
              </div>
            </div>
            <AdminEventLivePreview embedded draft={selectedEvent} sourceEvent={selectedEvent} />
            <AdminEventTicketInsights event={selectedEvent} tickets={tickets} />
            <AdminEventTicketAddonReport event={selectedEvent} tickets={tickets} />
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
