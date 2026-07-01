import AdminFilterBar from '../../components/admin/AdminFilterBar.jsx'
import AdminPageHeader from '../../components/admin/AdminPageHeader.jsx'
import DataTable, { StatusBadge } from '../../components/ui/DataTable.jsx'
import ExportButton from '../../components/ui/ExportButton.jsx'
import { REGISTRATION_FILTER_STATUSES } from '../../lib/constants.js'
import { money } from '../../lib/format.js'

export default function RegistrationsSection({
  canEdit,
  filters,
  filteredRegistrations,
  payments,
  onApprovePayment,
  onExportAdmin,
  onExportPluUsa,
  onSetFilters,
}) {
  const registrationRows = filteredRegistrations.map((reg) => {
    const payment = payments.find((item) => item.athleteId === reg.athleteId)
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

  return (
    <>
      <AdminPageHeader
        title="Inscripciones"
        subtitle="Atletas, eventos, pagos y estados"
        actions={
          <>
            <ExportButton label="CSV admin" onClick={onExportAdmin} disabled={!canEdit} />
            <ExportButton label="PLU USA" onClick={onExportPluUsa} variant="gold" />
          </>
        }
      />
      <AdminFilterBar
        query={filters.query}
        onQueryChange={(value) => onSetFilters((current) => ({ ...current, query: value }))}
        placeholder="Buscar atleta, DNI o categoría"
        filters={[
          {
            id: 'status',
            value: filters.status,
            onChange: (value) => onSetFilters((current) => ({ ...current, status: value })),
            options: REGISTRATION_FILTER_STATUSES,
          },
        ]}
      />
      <DataTable columns={columns} rows={registrationRows} emptyMessage="No hay inscripciones" />
    </>
  )
}
