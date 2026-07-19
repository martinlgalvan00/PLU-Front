import DataTable, { StatusBadge } from '../ui/DataTable.jsx'

/**
 * Tabla operativa estándar del administrador.
 * Centraliza densidad, primera columna anclable y adaptación a cards mobile.
 */
export default function AdminDataTable({ className = '', density = 'balanced', ...props }) {
  return (
    <DataTable
      {...props}
      className={['admin-data-table', className].filter(Boolean).join(' ')}
      density={density}
      stickyPrimary
      variant="admin"
    />
  )
}

export { StatusBadge }
