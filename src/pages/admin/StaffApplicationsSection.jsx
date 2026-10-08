import { useEffect, useState } from 'react'
import { MessageCircle } from 'lucide-react'
import AdminDataTable from '../../components/admin/AdminDataTable.jsx'
import { notifyError, notifySuccess } from '../../lib/adminToast.js'
import { formatShortDate } from '../../lib/format.js'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { listStaffApplications, reviewStaffApplication } from '../../services/staffApplicationService.js'

const STATUS_FILTERS = [
  ['pendiente', 'Pendientes'],
  ['aprobada', 'Aprobadas'],
  ['rechazada', 'Rechazadas'],
  ['', 'Todas'],
]

const STAFF_BODY_LABEL = { operativo: 'Operativo', tecnico: 'Técnico' }
const TRAINING_LABEL = {
  aprobada: 'PDCA aprobada',
  en_curso: 'PDCA en curso',
  no_realizada: 'PDCA no realizada',
}

/** `wa.me` exige solo dígitos, con código de país. Asume Argentina si falta. */
function whatsAppHref(phone) {
  const digits = String(phone ?? '').replace(/\D/g, '')
  if (!digits) return null
  const withCountry = digits.startsWith('54') ? digits : `54${digits.replace(/^0/, '')}`
  return `https://wa.me/${withCountry}`
}

function DocumentLink({ applicationId, children, kind }) {
  return (
    <a
      className="admin-staff-applications__doc-link"
      href={`/api/athletes/admin/staff-applications/${applicationId}/${kind}`}
      rel="noreferrer"
      target="_blank"
    >
      {children}
    </a>
  )
}

function ReviewActions({ application, canEdit, onReviewed }) {
  const [rejecting, setRejecting] = useState(false)
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)

  if (application.status !== 'pendiente') {
    return (
      <span className="admin-staff-applications__reviewed-note">
        {application.review_notes || '—'}
      </span>
    )
  }
  if (!canEdit) return null

  async function review(status, reviewNotes) {
    setBusy(true)
    try {
      await onReviewed(application.id, { status, notes: reviewNotes })
      notifySuccess(status === 'aprobada' ? 'Postulación aprobada.' : 'Postulación rechazada.')
    } catch (error) {
      notifyError(error?.message ?? 'No se pudo registrar la revisión.')
    } finally {
      setBusy(false)
      setRejecting(false)
    }
  }

  if (rejecting) {
    return (
      <div className="admin-staff-applications__reject">
        <textarea
          placeholder="Motivo del rechazo (opcional)"
          rows={2}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
        <div>
          <button type="button" disabled={busy} onClick={() => setRejecting(false)}>
            Cancelar
          </button>
          <button
            type="button"
            className="is-danger"
            disabled={busy}
            onClick={() => review('rechazada', notes)}
          >
            Confirmar rechazo
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="admin-staff-applications__actions">
      <button type="button" disabled={busy} onClick={() => review('aprobada', '')}>
        Aprobar
      </button>
      <button type="button" disabled={busy} onClick={() => setRejecting(true)}>
        Rechazar
      </button>
    </div>
  )
}

export default function StaffApplicationsSection({ canEdit = false }) {
  const { locale } = useI18n()
  const [applications, setApplications] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('pendiente')
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const result = await listStaffApplications({ status: statusFilter || null, limit: 100 })
      setApplications(result)
    } catch (loadError) {
      setError(loadError?.message ?? 'No se pudieron cargar las postulaciones.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter])

  async function handleReviewed(applicationId, { status, notes }) {
    const updated = await reviewStaffApplication(applicationId, { status, notes })
    setApplications((current) =>
      statusFilter && updated.status !== statusFilter
        ? current.filter((item) => item.id !== applicationId)
        : current.map((item) => (item.id === applicationId ? { ...item, ...updated } : item)),
    )
  }

  const columns = [
    {
      key: 'applicant',
      label: 'Postulante',
      render: (row) => (
        <div className="admin-staff-applications__applicant">
          <strong>
            {row.first_name} {row.last_name}
          </strong>
          <span>{row.document_id}</span>
        </div>
      ),
    },
    {
      key: 'contact',
      label: 'Contacto',
      render: (row) => (
        <div className="admin-staff-applications__contact">
          <span>{row.email}</span>
          <span>{row.phone}</span>
          {whatsAppHref(row.phone) ? (
            <a
              className="admin-staff-applications__whatsapp"
              href={whatsAppHref(row.phone)}
              rel="noreferrer"
              target="_blank"
            >
              <MessageCircle size={14} aria-hidden />
              WhatsApp
            </a>
          ) : null}
        </div>
      ),
    },
    {
      key: 'staffBody',
      label: 'Cuerpo',
      render: (row) => (
        <div>
          <span>{STAFF_BODY_LABEL[row.staff_body] ?? row.staff_body}</span>
          {row.technical_training_status ? (
            <small>{TRAINING_LABEL[row.technical_training_status]}</small>
          ) : null}
        </div>
      ),
    },
    { key: 'shirtSize', label: 'Talle', render: (row) => row.shirt_size },
    {
      key: 'documents',
      label: 'Documentación',
      render: (row) => (
        <div className="admin-staff-applications__docs">
          <DocumentLink applicationId={row.id} kind="photo">
            Foto
          </DocumentLink>
          <DocumentLink applicationId={row.id} kind="certificate">
            Certificado
          </DocumentLink>
        </div>
      ),
    },
    {
      key: 'createdAt',
      label: 'Fecha',
      render: (row) => formatShortDate(String(row.created_at).slice(0, 10), locale),
    },
    {
      key: 'status',
      label: 'Estado',
      render: (row) => (
        <span className={`admin-staff-applications__status is-${row.status}`}>
          {row.status === 'pendiente'
            ? 'Pendiente'
            : row.status === 'aprobada'
              ? 'Aprobada'
              : 'Rechazada'}
        </span>
      ),
    },
    {
      key: 'action',
      label: 'Acción',
      render: (row) => (
        <ReviewActions application={row} canEdit={canEdit} onReviewed={handleReviewed} />
      ),
    },
  ]

  return (
    <section className="admin-staff-applications">
      <header className="admin-staff-applications__header">
        <h2>Postulaciones al Cuerpo de Staff</h2>
        <div className="admin-staff-applications__filters" role="tablist">
          {STATUS_FILTERS.map(([value, label]) => (
            <button
              key={value || 'all'}
              type="button"
              role="tab"
              aria-selected={statusFilter === value}
              className={statusFilter === value ? 'is-active' : ''}
              onClick={() => setStatusFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </header>
      {error ? (
        <p className="admin-staff-applications__error" role="alert">
          {error}
        </p>
      ) : null}
      <AdminDataTable
        columns={columns}
        rows={applications}
        loading={loading}
        emptyMessage="No hay postulaciones para este filtro."
      />
    </section>
  )
}
