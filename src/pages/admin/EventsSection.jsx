import { useMemo, useState } from 'react'
import { CalendarDays, MapPin, Pencil, Plus, Users } from 'lucide-react'
import AdminEventEditor, { AdminEventLivePreview } from '../../components/admin/AdminEventEditor.jsx'
import AdminEventTicketAddonReport from '../../components/admin/AdminEventTicketAddonReport.jsx'
import AdminEventTicketInsights from '../../components/admin/AdminEventTicketInsights.jsx'
import AdminIconButton from '../../components/admin/AdminIconButton.jsx'
import AdminListSection from '../../components/admin/AdminListSection.jsx'
import Button from '../../components/ui/Button.jsx'
import StatusPill from '../../components/ui/StatusPill.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { formatRecordCount, translateFilterOptions } from '../../i18n/adminHelpers.js'
import { getStatusMeta } from '../../lib/status.js'
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
    setFormOpen(true)
  }

  function openEditForm(event) {
    if (!event) return
    setSelectedId(event.id)
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
      capacityDay1: event.capacityDay1 ?? '',
      capacityDay2: event.capacityDay2 ?? '',
      capacityBoth: event.capacityBoth ?? '',
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

  return (
    <AdminListSection
      filteredCount={rows.length}
      meta={resultMeta}
      placeholder={t('admin.search.event')}
      query={query}
      showHeader={false}
      showStats={false}
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
                const fill = row.slots > 0 ? Math.round((row.registered / row.slots) * 100) : 0
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
                    onClick={() => setSelectedId(row.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setSelectedId(row.id)
                      }
                    }}
                  >
                    <div className="admin-event-row__accent" aria-hidden />

                    <div className="admin-event-row__body">
                      <div className="admin-event-row__title-wrap">
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

                    <div className="admin-event-row__capacity">
                      <div className="admin-event-row__capacity-bar">
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
              {canEdit && (
                <AdminIconButton
                  icon={Pencil}
                  label={t('admin.sections.events.customize')}
                  onClick={() => openEditForm(selectedEvent)}
                  variant="ghost"
                />
              )}
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
          onCreateSecurityUser={onCreateSecurityUser}
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
