import { useMemo, useState } from 'react'
import AdminFilterBar from '../../components/admin/AdminFilterBar.jsx'
import AdminPageHeader from '../../components/admin/AdminPageHeader.jsx'
import DataTable, { StatusBadge } from '../../components/ui/DataTable.jsx'
import { MEMBERSHIP_FILTER_STATUSES } from '../../lib/constants.js'
import { filterMemberships } from '../../services/membershipService.js'

export default function MembershipsSection({ memberships, onSelectAthlete }) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [expiring, setExpiring] = useState('all')

  const rows = useMemo(
    () =>
      filterMemberships(memberships, { query, status, expiring }).map((item) => ({
        id: item.id,
        athlete: item.athlete?.fullName ?? '—',
        athleteId: item.athleteId,
        document: item.athlete?.documentId ?? '—',
        memberCode: item.memberCode,
        year: item.year,
        status: item.status,
        startDate: item.startDate,
        expirationDate: item.expirationDate,
      })),
    [memberships, query, status, expiring],
  )

  return (
    <>
      <AdminPageHeader
        title="Afiliaciones"
        subtitle="Códigos, vencimientos y estado de membresías"
      />
      <AdminFilterBar
        query={query}
        onQueryChange={setQuery}
        placeholder="Buscar atleta, DNI o código"
        filters={[
          { id: 'status', value: status, onChange: setStatus, options: MEMBERSHIP_FILTER_STATUSES },
          {
            id: 'expiring',
            value: expiring,
            onChange: setExpiring,
            options: [
              ['all', 'Todos los vencimientos'],
              ['soon', 'Vencen en 30 días'],
            ],
          },
        ]}
      />
      <DataTable
        columns={[
          {
            key: 'athlete',
            label: 'Atleta',
            render: (row) => (
              <>
                <strong>{row.athlete}</strong>
                <span className="data-table__sub">{row.document}</span>
              </>
            ),
          },
          { key: 'memberCode', label: 'Código' },
          { key: 'year', label: 'Año' },
          {
            key: 'status',
            label: 'Estado',
            render: (row) => <StatusBadge value={row.status} />,
          },
          { key: 'startDate', label: 'Inicio' },
          { key: 'expirationDate', label: 'Vencimiento' },
        ]}
        rows={rows}
        emptyMessage="No hay afiliaciones que coincidan con los filtros"
        onRowClick={(row) => row.athleteId && onSelectAthlete?.(row.athleteId)}
        rowClassName="data-table__row--clickable"
      />
    </>
  )
}
