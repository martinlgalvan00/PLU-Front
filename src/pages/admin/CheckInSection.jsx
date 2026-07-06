import { useEffect, useMemo, useState } from 'react'
import { BadgeCheck, CheckCircle2, ScanLine } from 'lucide-react'
import AdminIconButton from '../../components/admin/AdminIconButton.jsx'
import AdminListSection from '../../components/admin/AdminListSection.jsx'
import { AdminIdentityCell, AdminTableActions } from '../../components/admin/AdminTableCells.jsx'
import DataTable, { StatusBadge } from '../../components/ui/DataTable.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'

const TYPE_FILTERS = [
  ['all', 'admin.checkin.filterAllTypes'],
  ['atleta', 'admin.checkin.athlete'],
  ['espectador', 'admin.checkin.spectator'],
]

const DAY_FILTERS = [
  ['all', 'admin.checkin.filterAllDays'],
  ['day1', 'admin.checkin.day1'],
  ['day2', 'admin.checkin.day2'],
  ['both', 'admin.checkin.bothDays'],
]

const STATUS_FILTERS = [
  ['all', 'admin.checkin.filterAllStatuses'],
  ['ready', 'admin.checkin.filterReady'],
  ['done', 'admin.checkin.filterDone'],
  ['pending', 'admin.checkin.filterPending'],
]

/** Estado sintético del check-in: registrations y tickets usan vocabularios
 * de status distintos (uno describe el pago, el otro el ciclo del ticket) —
 * acá se normalizan a algo comparable para una sola tabla. */
function registrationCheckinStatus(registration) {
  if (registration.checkedInAt) return 'usada'
  if (registration.status === 'confirmada') return 'pagada'
  return registration.status
}

export default function CheckInSection({
  athletes,
  canCheckIn,
  eventSlug = 'pitbull-classic-2026',
  onCheckInRegistration,
  onCheckInTicket,
  onRefreshTickets,
  registrations,
  tickets,
}) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [type, setType] = useState('all')
  const [day, setDay] = useState('all')
  const [checkinStatus, setCheckinStatus] = useState('all')

  // Las entradas viven en el backend real — al entrar al panel, traemos el
  // estado verdadero (compras hechas desde cualquier dispositivo), no solo
  // lo que ya haya en el cache local de esta pestaña.
  useEffect(() => {
    onRefreshTickets?.(eventSlug)
  }, [eventSlug, onRefreshTickets])

  const typeOptions = useMemo(() => TYPE_FILTERS.map(([value, key]) => [value, t(key)]), [t])
  const dayOptions = useMemo(() => DAY_FILTERS.map(([value, key]) => [value, t(key)]), [t])
  const statusOptions = useMemo(() => STATUS_FILTERS.map(([value, key]) => [value, t(key)]), [t])

  function matchesCheckinStatus(row, filter) {
    if (filter === 'all') return true
    if (filter === 'done') return row.status === 'usada'
    if (filter === 'ready') return row.status === 'pagada'
    return row.status !== 'usada' && row.status !== 'pagada'
  }

  const rows = useMemo(() => {
    const athleteRows = registrations
      .filter((registration) => registration.status !== 'cancelada')
      .map((registration) => {
        const athlete = athletes.find((item) => item.id === registration.athleteId)
        return {
          id: `reg-${registration.id}`,
          registrationId: registration.id,
          type: 'atleta',
          name: athlete?.fullName,
          document: athlete?.documentId,
          meta: [registration.category, registration.division].filter(Boolean).join(' · '),
          day: 'both',
          status: registrationCheckinStatus(registration),
          checkedInAt: registration.checkedInAt,
        }
      })

    const ticketRows = tickets.map((ticket) => ({
      id: `tkt-${ticket.id}`,
      ticketCode: ticket.ticketCode,
      qrToken: ticket.qrToken,
      type: 'espectador',
      name: ticket.attendeeName,
      document: ticket.attendeeDni,
      meta: ticket.ticketCode,
      day: ticket.dayPass,
      status: ticket.status,
      checkedInAt: ticket.checkedInAt,
    }))

    const normalizedQuery = query.trim().toLowerCase()

    return [...athleteRows, ...ticketRows].filter((row) => {
      const typeMatch = type === 'all' || row.type === type
      const dayMatch = day === 'all' || row.day === day
      const statusMatch = matchesCheckinStatus(row, checkinStatus)
      const queryMatch =
        !normalizedQuery ||
        row.name?.toLowerCase().includes(normalizedQuery) ||
        row.document?.includes(normalizedQuery)
      return typeMatch && dayMatch && statusMatch && queryMatch
    })
  }, [athletes, registrations, tickets, query, type, day, checkinStatus])

  async function handleCheckIn(row) {
    if (row.type === 'atleta') {
      onCheckInRegistration(row.registrationId)
      return
    }
    await onCheckInTicket(row.qrToken)
    // El backend es la autoridad — refrescamos para reflejar el estado real
    // (por si otro puesto de seguridad ya la había escaneado justo antes).
    onRefreshTickets?.(eventSlug)
  }

  return (
    <AdminListSection
      filteredCount={rows.length}
      placeholder={t('admin.checkin.searchPlaceholder')}
      query={query}
      showHeader={false}
      showStats={false}
      totalCount={registrations.length + tickets.length}
      filters={[
        { id: 'type', label: t('admin.checkin.type'), value: type, onChange: setType, options: typeOptions },
        { id: 'day', label: t('admin.checkin.dayLabel'), value: day, onChange: setDay, options: dayOptions },
        {
          id: 'checkinStatus',
          label: t('admin.filters.status'),
          value: checkinStatus,
          onChange: setCheckinStatus,
          options: statusOptions,
        },
      ]}
      onQueryChange={setQuery}
    >
      <DataTable
        variant="admin"
        columns={[
          {
            key: 'name',
            label: t('admin.columns.attendee'),
            render: (row) => <AdminIdentityCell name={row.name} sub={row.document} />,
          },
          {
            key: 'type',
            label: t('admin.checkin.type'),
            render: (row) => (row.type === 'atleta' ? t('admin.checkin.athlete') : t('admin.checkin.spectator')),
          },
          { key: 'meta', label: t('admin.columns.category') },
          {
            key: 'day',
            label: t('admin.checkin.dayLabel'),
            render: (row) => (row.day === 'both' ? t('admin.checkin.bothDays') : row.day === 'day1' ? t('admin.checkin.day1') : t('admin.checkin.day2')),
          },
          {
            key: 'status',
            label: t('admin.columns.status'),
            render: (row) => <StatusBadge value={row.status} />,
          },
          {
            key: 'action',
            label: t('admin.columns.action'),
            render: (row) => {
              if (row.status === 'usada') {
                const timeLabel = t('admin.checkin.checkedInAt', {
                  time: new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'short' }).format(
                    new Date(row.checkedInAt),
                  ),
                })

                return (
                  <span className="admin-checkin__done" title={timeLabel}>
                    <CheckCircle2 size={15} aria-hidden />
                    <span className="admin-checkin__done-time">
                      {new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(
                        new Date(row.checkedInAt),
                      )}
                    </span>
                  </span>
                )
              }

              return (
                <AdminTableActions>
                  <AdminIconButton
                    disabled={!canCheckIn || row.status !== 'pagada'}
                    icon={ScanLine}
                    label={t('admin.checkin.markEntry')}
                    onClick={() => handleCheckIn(row)}
                    variant="celeste"
                  />
                </AdminTableActions>
              )
            },
          },
        ]}
        rows={rows}
        emptyMessage={t('admin.checkin.empty')}
      />
    </AdminListSection>
  )
}
