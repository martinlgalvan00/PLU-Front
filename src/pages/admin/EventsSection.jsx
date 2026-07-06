import { useMemo, useState } from 'react'
import { Pencil, Plus } from 'lucide-react'
import AdminEventEditor, { AdminEventLivePreview } from '../../components/admin/AdminEventEditor.jsx'
import AdminEventTicketInsights from '../../components/admin/AdminEventTicketInsights.jsx'
import AdminIconButton from '../../components/admin/AdminIconButton.jsx'
import AdminListSection from '../../components/admin/AdminListSection.jsx'
import { AdminTableActions } from '../../components/admin/AdminTableCells.jsx'
import Button from '../../components/ui/Button.jsx'
import DataTable, { StatusBadge } from '../../components/ui/DataTable.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { formatRecordCount, translateFilterOptions } from '../../i18n/adminHelpers.js'
import {
  ADMIN_EVENT_FORM_DEFAULT,
  ADMIN_EVENT_STATUS_OPTIONS,
  filterAdminEvents,
} from '../../services/eventAdminService.js'

export default function EventsSection({ adminEvents, canEdit, onSaveEvent, tickets = [] }) {
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
      id: event.id,
      title: event.title,
      dateISO: event.dateISO,
      venue: event.venue,
      location: event.location,
      status: event.status,
      featured: event.featured,
      slots: event.slots,
      pricing: event.pricing,
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
          variant: 'select',
        },
      ]}
      onQueryChange={setQuery}
    >
      {formOpen ? (
        <AdminEventEditor
          canEdit={canEdit}
          draft={draft}
          sourceEvent={editingSource}
          onCancel={closeForm}
          onChange={setDraft}
          onSubmit={handleSubmit}
        />
      ) : (
        <div className="admin-events-workspace">
          <div className="admin-events-workspace__main">
            <DataTable
              variant="admin"
              getRowClassName={(row) => (row.id === selectedEvent?.id ? 'data-table__row--selected' : '')}
              columns={[
                {
                  key: 'title',
                  label: t('admin.columns.event'),
                  render: (row) => (
                    <>
                      <strong>{row.title}</strong>
                      <span className="data-table__sub">{row.slug}</span>
                    </>
                  ),
                },
                { key: 'date', label: t('admin.columns.date') },
                {
                  key: 'venue',
                  label: t('admin.columns.venue'),
                  render: (row) => (
                    <>
                      {row.venue}
                      <span className="data-table__sub">{row.location}</span>
                    </>
                  ),
                },
                {
                  key: 'status',
                  label: t('admin.columns.status'),
                  render: (row) => <StatusBadge value={row.status} />,
                },
                {
                  key: 'slots',
                  label: t('admin.columns.slots'),
                  render: (row) => `${row.registered}/${row.slots}`,
                },
                {
                  key: 'actions',
                  label: t('admin.columns.action'),
                  render: (row) => (
                    <AdminTableActions>
                      <AdminIconButton
                        disabled={!canEdit}
                        icon={Pencil}
                        label={t('admin.sections.events.edit')}
                        onClick={(event) => {
                          event.stopPropagation()
                          openEditForm(row)
                        }}
                        variant="ghost"
                      />
                    </AdminTableActions>
                  ),
                },
              ]}
              rows={rows.map((row) => ({ ...row, id: row.id }))}
              emptyMessage={t('admin.sections.events.empty')}
              onRowClick={(row) => setSelectedId(row.id)}
              rowClassName="data-table__row--clickable"
            />
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
            </aside>
          )}
        </div>
      )}
    </AdminListSection>
  )
}
