import AdminPageHeader from '../../components/admin/AdminPageHeader.jsx'
import EmptyState from '../../components/ui/EmptyState.jsx'

const PLACEHOLDERS = {
  events: ['Eventos', 'Calendario, cupos y configuración de meets.'],
  payments: ['Pagos', 'Órdenes, Mercado Pago y validaciones manuales.'],
  results: ['Resultados', 'Importación LiftingCast y publicación de planillas.'],
  exports: ['Exportaciones', 'CSV/XLSX para operación y PLU USA.'],
  users: ['Usuarios', 'Roles, accesos y permisos del panel.'],
  audit: ['Auditoría', 'Historial de cambios sensibles del sistema.'],
}

export default function PlaceholderSection({ section }) {
  const [title, description] = PLACEHOLDERS[section] ?? ['Sección', '']

  return (
    <>
      <AdminPageHeader title={title} subtitle={description} />
      <EmptyState title="Módulo en desarrollo" description={description} />
    </>
  )
}
