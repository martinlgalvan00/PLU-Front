import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import DetailTabs from '../../components/admin/DetailTabs.jsx'
import AuditTimeline from '../../components/ui/AuditTimeline.jsx'
import DataTable, { StatusBadge } from '../../components/ui/DataTable.jsx'
import MemberProfileCard from '../../components/ui/MemberProfileCard.jsx'
import { money } from '../../lib/format.js'

export default function AthleteDetailSection({ detail, onBack, canEdit, onApprovePayment }) {
  const [activeTab, setActiveTab] = useState('profile')

  if (!detail) {
    return null
  }

  const { athlete, memberships, registrations, payments, auditLogs } = detail
  const activeMembership = memberships.find((item) => item.status === 'activa')

  const tabs = [
    { id: 'profile', label: 'Perfil' },
    { id: 'memberships', label: 'Afiliaciones', count: memberships.length },
    { id: 'registrations', label: 'Inscripciones', count: registrations.length },
    { id: 'payments', label: 'Pagos', count: payments.length },
    { id: 'activity', label: 'Actividad', count: auditLogs.length },
  ]

  return (
    <div className="athlete-detail">
      <button type="button" className="btn btn--ghost athlete-detail__back" onClick={onBack}>
        <ArrowLeft size={16} />
        Volver a atletas
      </button>

      <MemberProfileCard
        name={athlete.fullName}
        documentId={athlete.documentId}
        email={athlete.email}
        gym={athlete.gym}
        status={athlete.status}
        memberCode={activeMembership?.memberCode}
      />

      <DetailTabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === 'profile' && (
        <dl className="athlete-detail__grid surface-card">
          <dt>Documento</dt>
          <dd>{athlete.documentId}</dd>
          <dt>Email</dt>
          <dd>{athlete.email}</dd>
          <dt>Teléfono</dt>
          <dd>{athlete.phone}</dd>
          <dt>Ubicación</dt>
          <dd>
            {athlete.city}, {athlete.province}
          </dd>
          <dt>Gimnasio</dt>
          <dd>{athlete.gym}</dd>
          <dt>División</dt>
          <dd>{athlete.division}</dd>
          <dt>Categoría</dt>
          <dd>{athlete.category}</dd>
          <dt>Peso estimado</dt>
          <dd>{athlete.estimatedWeight ? `${athlete.estimatedWeight} kg` : '—'}</dd>
        </dl>
      )}

      {activeTab === 'memberships' && (
        <DataTable
          columns={[
            { key: 'year', label: 'Año' },
            { key: 'memberCode', label: 'Código' },
            {
              key: 'status',
              label: 'Estado',
              render: (row) => <StatusBadge value={row.status} />,
            },
            { key: 'startDate', label: 'Inicio' },
            { key: 'expirationDate', label: 'Vencimiento' },
          ]}
          rows={memberships}
          emptyMessage="Sin afiliaciones registradas"
        />
      )}

      {activeTab === 'registrations' && (
        <DataTable
          columns={[
            { key: 'event', label: 'Evento' },
            { key: 'category', label: 'Categoría' },
            { key: 'division', label: 'División' },
            {
              key: 'status',
              label: 'Estado',
              render: (row) => <StatusBadge value={row.status} />,
            },
          ]}
          rows={registrations}
          emptyMessage="Sin inscripciones"
        />
      )}

      {activeTab === 'payments' && (
        <DataTable
          columns={[
            { key: 'concept', label: 'Concepto' },
            {
              key: 'amount',
              label: 'Monto',
              render: (row) => money(row.amount),
            },
            {
              key: 'status',
              label: 'Estado',
              render: (row) => <StatusBadge value={row.status} />,
            },
            { key: 'method', label: 'Método' },
            {
              key: 'action',
              label: 'Acción',
              render: (row) => (
                <button
                  type="button"
                  className="btn btn--small"
                  onClick={() => onApprovePayment?.(row.id)}
                  disabled={!canEdit || row.status === 'aprobado'}
                >
                  Validar
                </button>
              ),
            },
          ]}
          rows={payments}
          emptyMessage="Sin pagos"
        />
      )}

      {activeTab === 'activity' && (
        <div className="surface-card athlete-detail__timeline">
          <AuditTimeline items={auditLogs} />
        </div>
      )}
    </div>
  )
}
