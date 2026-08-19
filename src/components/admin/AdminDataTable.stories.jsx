import { useState } from 'react'
import AdminDataTable, { StatusBadge } from './AdminDataTable.jsx'
import AdminAthletesBulkBar from './AdminAthletesBulkBar.jsx'
import { AdminIdentityCell, AdminMonoCell } from './AdminTableCells.jsx'
import { AppConfigProvider } from '../../providers/AppConfigProvider.jsx'
import '../../styles/pages/admin.css'
import '../../styles/pages/admin-minimal.css'

const ROWS = [
  { id: '1', fullName: 'Julián Aguirre', documentId: '34556781', gym: 'Barracas Barbell', division: 'Open', status: 'afiliado_activo' },
  { id: '2', fullName: 'Camila Ferreyra', documentId: '38221190', gym: 'Fuerza Rosario', division: 'Junior', status: 'afiliado_activo' },
  { id: '3', fullName: 'Bruno Cabrera', documentId: '30112456', gym: 'Iron Cuyo', division: 'Master 1', status: 'afiliado_vencido' },
  { id: '4', fullName: 'Ana Belén Toledo', documentId: '41987654', gym: 'Barracas Barbell', division: 'Open', status: 'bloqueado' },
  { id: '5', fullName: 'Marcos Lencina', documentId: '29874512', gym: 'Fuerza Rosario', division: 'Sub Junior', status: 'afiliado_activo' },
]

const COLUMNS = [
  {
    key: 'fullName',
    label: 'Atleta',
    mobile: 'primary',
    desktop: 'primary',
    sortable: true,
    render: (row) => <AdminIdentityCell name={row.fullName} sub={row.gym} />,
  },
  {
    key: 'documentId',
    label: 'Documento',
    className: 'data-table__column--mono',
    render: (row) => <AdminMonoCell>{row.documentId}</AdminMonoCell>,
  },
  { key: 'gym', label: 'Gimnasio', className: 'data-table__column--meta' },
  { key: 'division', label: 'División', className: 'data-table__column--meta' },
  {
    key: 'status',
    label: 'Estado',
    mobile: 'badge',
    desktop: 'status',
    render: (row) => <StatusBadge value={row.status} />,
  },
]

function AdminDataTableDemo({ selectable = true }) {
  const [selectedRowKeys, setSelectedRowKeys] = useState([])

  return (
    <AppConfigProvider>
    <div className="admin-shell" style={{ minHeight: '100vh' }}>
      <div className="admin-list-shell admin-list-shell--athletes" style={{ maxWidth: 1040, margin: '0 auto' }}>
        {selectable ? (
          <AdminAthletesBulkBar
            selectedIds={selectedRowKeys}
            statusFieldOptions={[
              ['afiliado_activo', 'Activo'],
              ['afiliado_vencido', 'Vencido'],
              ['bloqueado', 'Bloqueado'],
            ]}
            onBulkUpdate={async (ids, patch) => {
              // eslint-disable-next-line no-console -- demo de Storybook, no hay backend real
              console.log('bulk update', ids, patch)
              return { updated: ids, failed: [] }
            }}
            onClearSelection={() => setSelectedRowKeys([])}
          />
        ) : null}
        <AdminDataTable
          columns={COLUMNS}
          rows={ROWS}
          rowSelection={
            selectable
              ? { selectedRowKeys, onChange: setSelectedRowKeys, preserveSelectedRowKeys: true }
              : undefined
          }
          rowClassName="data-table__row--clickable"
        />
      </div>
    </div>
    </AppConfigProvider>
  )
}

export default {
  title: 'Admin/AdminDataTable',
  component: AdminDataTable,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
}

/** Tabla estándar con selección de fila habilitada — tildá 2+ filas para ver el modo lote. */
export const ConSeleccion = {
  render: () => <AdminDataTableDemo selectable />,
}

/** Misma tabla sin selección (ej. Finanzas, pestañas de ficha de atleta). */
export const SinSeleccion = {
  render: () => <AdminDataTableDemo selectable={false} />,
}
