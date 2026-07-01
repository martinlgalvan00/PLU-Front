import { useMemo, useState } from 'react'
import AdminFilterBar from '../../components/admin/AdminFilterBar.jsx'
import AdminPageHeader from '../../components/admin/AdminPageHeader.jsx'
import DataTable, { StatusBadge } from '../../components/ui/DataTable.jsx'

export default function AthletesSection({ athletes, onSelectAthlete }) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')

  const rows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    return athletes
      .filter((athlete) => {
        const statusMatch = status === 'all' || athlete.status === status
        const queryMatch =
          !normalizedQuery ||
          athlete.fullName.toLowerCase().includes(normalizedQuery) ||
          athlete.documentId.includes(normalizedQuery) ||
          athlete.email.toLowerCase().includes(normalizedQuery)
        return statusMatch && queryMatch
      })
      .map((athlete) => ({ ...athlete, id: athlete.id }))
  }, [athletes, query, status])

  const statusOptions = [
    ['all', 'Todos los estados'],
    ['afiliado_activo', 'Afiliado activo'],
    ['registrado', 'Registrado'],
    ['pre_registrado', 'Pre-registrado'],
    ['afiliado_vencido', 'Afiliado vencido'],
    ['bloqueado', 'Bloqueado'],
  ]

  return (
    <>
      <AdminPageHeader title="Atletas" subtitle={`${athletes.length} registros en base`} />
      <AdminFilterBar
        query={query}
        onQueryChange={setQuery}
        placeholder="Buscar por nombre, DNI o email"
        filters={[{ id: 'status', value: status, onChange: setStatus, options: statusOptions }]}
      />
      <DataTable
        columns={[
          {
            key: 'fullName',
            label: 'Atleta',
            render: (row) => (
              <>
                <strong>{row.fullName}</strong>
                <span className="data-table__sub">{row.email}</span>
              </>
            ),
          },
          { key: 'documentId', label: 'Documento' },
          { key: 'gym', label: 'Gimnasio' },
          { key: 'division', label: 'División' },
          {
            key: 'status',
            label: 'Estado',
            render: (row) => <StatusBadge value={row.status} />,
          },
        ]}
        rows={rows}
        emptyMessage="No hay atletas que coincidan con la búsqueda"
        onRowClick={(row) => onSelectAthlete?.(row.id)}
        rowClassName="data-table__row--clickable"
      />
    </>
  )
}
