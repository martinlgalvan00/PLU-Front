import { useState } from 'react'
import AdminFilterBar from './AdminFilterBar.jsx'
import { AppConfigProvider } from '../../providers/AppConfigProvider.jsx'
import '../../styles/pages/admin-minimal.css'

/** Mismas 6 facetas que arma AuditSection: fuente/estado/categoría a la vista,
 * acción/actor/entidad detrás de "Más filtros" -- el caso real con más
 * filtros avanzados del panel admin. */
function AuditLikeFilterBar({ initialAction = 'all' }) {
  const [query, setQuery] = useState('')
  const [source, setSource] = useState('all')
  const [status, setStatus] = useState('all')
  const [category, setCategory] = useState('all')
  const [action, setAction] = useState(initialAction)
  const [actorType, setActorType] = useState('all')
  const [entityType, setEntityType] = useState('all')

  const filters = [
    {
      id: 'source',
      label: 'Fuente',
      value: source,
      onChange: setSource,
      showLabel: true,
      allLabel: 'Todas',
      options: [
        ['all', 'Todas'],
        ['domain', 'Negocio'],
        ['payment', 'Pagos'],
        ['email', 'Email'],
      ],
    },
    {
      id: 'status',
      label: 'Estado',
      value: status,
      onChange: setStatus,
      variant: 'select',
      showLabel: true,
      options: [
        ['all', 'Todas'],
        ['failed', 'Fallido'],
        ['partial', 'Parcial'],
      ],
    },
    {
      id: 'category',
      label: 'Categoría',
      value: category,
      onChange: setCategory,
      variant: 'select',
      showLabel: true,
      options: [
        ['all', 'Todas'],
        ['cobro', 'Cobro'],
        ['webhook', 'Webhook'],
      ],
    },
    {
      id: 'action',
      label: 'Acción',
      value: action,
      onChange: setAction,
      variant: 'select',
      showLabel: true,
      advanced: true,
      options: [
        ['all', 'Todas'],
        ['payment.webhook_failed', 'Webhook fallido'],
        ['membership.activated', 'Afiliación activada'],
      ],
    },
    {
      id: 'actorType',
      label: 'Actor',
      value: actorType,
      onChange: setActorType,
      variant: 'select',
      showLabel: true,
      advanced: true,
      options: [
        ['all', 'Todas'],
        ['webhook', 'Webhook'],
        ['staff', 'Staff'],
      ],
    },
    {
      id: 'entityType',
      label: 'Entidad',
      value: entityType,
      onChange: setEntityType,
      variant: 'select',
      showLabel: true,
      advanced: true,
      options: [
        ['all', 'Todas'],
        ['membership', 'Afiliación'],
        ['athlete_payment_order', 'Orden de pago'],
      ],
    },
  ]

  return (
    <AppConfigProvider>
      <div className="admin-shell" style={{ minHeight: 0, background: 'var(--admin-canvas)', padding: '24px' }}>
        <div style={{ maxWidth: 1120 }}>
          <AdminFilterBar
            compact
            inline
            className="admin-filters--audit"
            query={query}
            onQueryChange={setQuery}
            filters={filters}
            placeholder="Buscar por entidad o responsable"
          />
        </div>
      </div>
    </AppConfigProvider>
  )
}

export default {
  title: 'Admin/AdminFilterBar',
  component: AdminFilterBar,
  tags: ['autodocs'],
}

/** Estado por defecto: los avanzados (Acción/Actor/Entidad) colapsados detrás de "Más filtros". */
export const Default = {
  render: () => <AuditLikeFilterBar />,
}

/** Con un filtro avanzado activo, el panel arranca abierto -- Acción/Actor/Entidad
 * bajan a su propio panel recesado en vez de sumarse a la fila de Fuente/Estado/Categoría. */
export const FiltrosAvanzadosAbiertos = {
  render: () => <AuditLikeFilterBar initialAction="payment.webhook_failed" />,
}
