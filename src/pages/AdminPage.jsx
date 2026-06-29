import { useState } from 'react'
import { Filter, Search } from 'lucide-react'
import AdminShell from '../components/layout/AdminShell.jsx'
import AdminTopBar from '../components/layout/AdminTopBar.jsx'
import DataTable, { StatusBadge } from '../components/ui/DataTable.jsx'
import EmptyState from '../components/ui/EmptyState.jsx'
import ExportButton from '../components/ui/ExportButton.jsx'
import StatBlock from '../components/ui/StatBlock.jsx'
import { REGISTRATION_FILTER_STATUSES } from '../lib/constants.js'
import { money } from '../lib/format.js'

export default function AdminPage({
  canEdit,
  dashboard,
  filters,
  filteredRegistrations,
  onApprovePayment,
  onExportAdmin,
  onExportPluUsa,
  onSetFilters,
  payments,
  athletes,
  role,
  setRole,
  onExit,
}) {
  const [section, setSection] = useState('dashboard')
  const [globalSearch, setGlobalSearch] = useState('')

  const pendingPayments = payments.filter((p) => p.status === 'pendiente' || p.status === 'pendiente_pago').length

  const registrationRows = filteredRegistrations.map((reg) => {
    const payment = payments.find((p) => p.athleteId === reg.athleteId)
    return {
      id: reg.id,
      athlete: reg.athlete?.fullName,
      document: reg.athlete?.documentId,
      event: reg.event,
      category: `${reg.category} · ${reg.division}`,
      status: reg.status,
      paymentStatus: payment?.status,
      amount: payment ? money(payment.amount) : '—',
      paymentId: payment?.id,
    }
  })

  const columns = [
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
    { key: 'event', label: 'Evento' },
    { key: 'category', label: 'Categoría' },
    {
      key: 'status',
      label: 'Estado',
      render: (row) => <StatusBadge value={row.status} />,
    },
    {
      key: 'payment',
      label: 'Pago',
      render: (row) => (
        <>
          <StatusBadge value={row.paymentStatus} />
          <span className="data-table__sub">{row.amount}</span>
        </>
      ),
    },
    {
      key: 'action',
      label: 'Acción',
      render: (row) => (
        <button
          type="button"
          className="btn btn--small"
          onClick={() => onApprovePayment(row.paymentId)}
          disabled={!canEdit || row.paymentStatus === 'aprobado'}
        >
          Validar
        </button>
      ),
    },
  ]

  function renderSection() {
    if (section === 'dashboard') {
      return (
        <>
          <AdminTopBar
            title="Dashboard"
            subtitle="Resumen operativo de PLU ARG"
            searchValue={globalSearch}
            onSearchChange={setGlobalSearch}
            alertCount={pendingPayments}
          />
          <div className="admin-stats">
            {dashboard.map((item) => (
              <StatBlock key={item.label} value={item.value} label={item.label} />
            ))}
          </div>
        </>
      )
    }

    if (section === 'registrations') {
      return (
        <>
          <header className="admin-page__header admin-page__header--row">
            <div>
              <h1>Inscripciones</h1>
              <p>Atletas, eventos, pagos y estados</p>
            </div>
            <div className="admin-page__actions">
              <ExportButton label="CSV admin" onClick={onExportAdmin} disabled={!canEdit} />
              <ExportButton label="PLU USA" onClick={onExportPluUsa} variant="gold" />
            </div>
          </header>
          <div className="admin-filters">
            <label>
              <Search size={16} />
              <input
                placeholder="Buscar atleta, DNI o categoría"
                value={filters.query}
                onChange={(e) => onSetFilters((c) => ({ ...c, query: e.target.value }))}
              />
            </label>
            <label>
              <Filter size={16} />
              <select
                value={filters.status}
                onChange={(e) => onSetFilters((c) => ({ ...c, status: e.target.value }))}
              >
                {REGISTRATION_FILTER_STATUSES.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <DataTable columns={columns} rows={registrationRows} emptyMessage="No hay inscripciones" />
        </>
      )
    }

    if (section === 'athletes') {
      return (
        <>
          <header className="admin-page__header">
            <h1>Atletas</h1>
            <p>{athletes.length} registros en base</p>
          </header>
          <DataTable
            columns={[
              { key: 'fullName', label: 'Nombre' },
              { key: 'documentId', label: 'Documento' },
              { key: 'email', label: 'Email' },
              {
                key: 'status',
                label: 'Estado',
                render: (row) => <StatusBadge value={row.status} />,
              },
            ]}
            rows={athletes.map((a) => ({ ...a, id: a.id }))}
          />
        </>
      )
    }

    const placeholders = {
      memberships: ['Afiliaciones', 'Gestión de códigos, vencimientos y renovaciones.'],
      events: ['Eventos', 'Calendario, cupos y configuración de meets.'],
      payments: ['Pagos', 'Órdenes, Mercado Pago y validaciones manuales.'],
      results: ['Resultados', 'Importación LiftingCast y publicación de planillas.'],
      exports: ['Exportaciones', 'CSV/XLSX para operación y PLU USA.'],
      users: ['Usuarios', 'Roles, accesos y permisos del panel.'],
      audit: ['Auditoría', 'Historial de cambios sensibles del sistema.'],
    }

    const [title, desc] = placeholders[section] ?? ['Sección', '']
    return (
      <>
        <header className="admin-page__header">
          <h1>{title}</h1>
          <p>{desc}</p>
        </header>
        <EmptyState title="Módulo en desarrollo" description={desc} />
      </>
    )
  }

  return (
    <AdminShell
      activeSection={section}
      onSectionChange={setSection}
      onExit={onExit}
      role={role}
      onRoleChange={setRole}
    >
      <div className="admin-page admin-section-enter" key={section}>
        {renderSection()}
      </div>
    </AdminShell>
  )
}
