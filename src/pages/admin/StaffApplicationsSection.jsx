import { useEffect, useState } from 'react'
import { Copy, Download, FileText, ImageIcon, Link, MessageCircle, QrCode } from 'lucide-react'
import AdminDataTable from '../../components/admin/AdminDataTable.jsx'
import { notifyError, notifySuccess } from '../../lib/adminToast.js'
import { generateCredentialQr } from '../../lib/credentialQr.js'
import { formatShortDate } from '../../lib/format.js'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import {
  listStaffApplications,
  reviewStaffApplication,
} from '../../services/staffApplicationService.js'

const STATUS_FILTERS = ['pendiente', 'aprobada', 'rechazada', '']

function staffApplicationUrl() {
  // El QR se comparte fuera del panel: nunca debe codificar localhost ni un
  // preview temporal desde el que un administrador lo haya generado.
  return 'https://www.powerliftingunited.ar/sumate-al-staff'
}

function StaffApplicationShare() {
  const { t } = useI18n()
  const publicUrl = staffApplicationUrl()
  const [qrSrc, setQrSrc] = useState('')
  const [qrFailed, setQrFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    setQrSrc('')
    setQrFailed(false)
    generateCredentialQr(publicUrl)
      .then((dataUrl) => {
        if (!cancelled) setQrSrc(dataUrl)
      })
      .catch(() => {
        if (!cancelled) setQrFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [publicUrl])

  async function copyLink() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable')
      await navigator.clipboard.writeText(publicUrl)
      notifySuccess(t('admin.staffApplications.copied'))
    } catch {
      notifyError(t('admin.staffApplications.copyFailed'))
    }
  }

  function downloadQr() {
    if (!qrSrc) return
    const link = document.createElement('a')
    link.href = qrSrc
    link.download = 'postulacion-staff-plu-arg.png'
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  return (
    <aside className="admin-staff-applications__share" aria-label={t('admin.staffApplications.shareAria')}>
      <div className="admin-staff-applications__share-code" aria-busy={!qrSrc && !qrFailed}>
        {qrSrc ? (
          <img alt={t('admin.staffApplications.qrAlt')} src={qrSrc} />
        ) : (
          <QrCode aria-hidden size={28} strokeWidth={1.5} />
        )}
      </div>
      <div className="admin-staff-applications__share-copy">
        <a href={publicUrl} rel="noreferrer" target="_blank">
          <Link aria-hidden size={13} />
          <span>{publicUrl}</span>
        </a>
        <div className="admin-staff-applications__share-actions">
          <button type="button" onClick={copyLink}>
            <Copy aria-hidden size={14} />
            {t('admin.staffApplications.copyLink')}
          </button>
          <button disabled={!qrSrc} type="button" onClick={downloadQr}>
            <Download aria-hidden size={14} />
            {t('admin.staffApplications.downloadQr')}
          </button>
        </div>
      </div>
    </aside>
  )
}

/** `wa.me` exige solo dígitos, con código de país. Asume Argentina si falta. */
function whatsAppHref(phone) {
  const digits = String(phone ?? '').replace(/\D/g, '')
  if (!digits) return null
  const withCountry = digits.startsWith('54') ? digits : `54${digits.replace(/^0/, '')}`
  return `https://wa.me/${withCountry}`
}

function DocumentLink({ applicationId, children, kind }) {
  const Icon = kind === 'photo' ? ImageIcon : FileText
  return (
    <a
      className="admin-staff-applications__doc-link"
      href={`/api/athletes/admin/staff-applications/${applicationId}/${kind}`}
      rel="noreferrer"
      target="_blank"
    >
      <Icon size={13} aria-hidden />
      {children}
    </a>
  )
}

function ReviewActions({ application, canEdit, onReviewed }) {
  const { t } = useI18n()
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
      notifySuccess(
        status === 'aprobada'
          ? t('admin.staffApplications.approved')
          : t('admin.staffApplications.rejected'),
      )
    } catch (error) {
      notifyError(error?.message ?? t('admin.staffApplications.reviewFailed'))
    } finally {
      setBusy(false)
      setRejecting(false)
    }
  }

  if (rejecting) {
    return (
      <div className="admin-staff-applications__reject">
        <textarea
          placeholder={t('admin.staffApplications.rejectPlaceholder')}
          rows={2}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
        <div>
          <button type="button" disabled={busy} onClick={() => setRejecting(false)}>
            {t('admin.staffApplications.cancel')}
          </button>
          <button
            type="button"
            className="is-danger"
            disabled={busy}
            onClick={() => review('rechazada', notes)}
          >
            {t('admin.staffApplications.confirmReject')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="admin-staff-applications__actions">
      <button type="button" disabled={busy} onClick={() => review('aprobada', '')}>
        {t('admin.staffApplications.approve')}
      </button>
      <button type="button" disabled={busy} onClick={() => setRejecting(true)}>
        {t('admin.staffApplications.reject')}
      </button>
    </div>
  )
}

export default function StaffApplicationsSection({ canEdit = false }) {
  const { locale, t } = useI18n()
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
      setError(loadError?.message ?? t('admin.staffApplications.loadFailed'))
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
      label: t('admin.staffApplications.columns.applicant'),
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
      label: t('admin.staffApplications.columns.contact'),
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
              {t('admin.staffApplications.whatsapp')}
            </a>
          ) : null}
        </div>
      ),
    },
    {
      key: 'staffBody',
      label: t('admin.staffApplications.columns.body'),
      render: (row) => {
        const bodyKey = `admin.staffApplications.body.${row.staff_body}`
        const bodyLabel = t(bodyKey)
        const trainingKey = `admin.staffApplications.training.${row.technical_training_status}`
        const trainingLabel = row.technical_training_status ? t(trainingKey) : ''
        return (
          <div className="admin-staff-applications__meta">
            <span>{bodyLabel === bodyKey ? row.staff_body : bodyLabel}</span>
            {row.technical_training_status ? (
              <small>{trainingLabel === trainingKey ? row.technical_training_status : trainingLabel}</small>
            ) : null}
          </div>
        )
      },
    },
    {
      key: 'shirtSize',
      label: t('admin.staffApplications.columns.shirt'),
      render: (row) => <span className="admin-staff-applications__meta">{row.shirt_size}</span>,
    },
    {
      key: 'documents',
      label: t('admin.staffApplications.columns.documents'),
      render: (row) => (
        <div className="admin-staff-applications__docs">
          <DocumentLink applicationId={row.id} kind="photo">
            {t('admin.staffApplications.photo')}
          </DocumentLink>
          <DocumentLink applicationId={row.id} kind="certificate">
            {t('admin.staffApplications.certificate')}
          </DocumentLink>
        </div>
      ),
    },
    {
      key: 'createdAt',
      label: t('admin.staffApplications.columns.date'),
      render: (row) => (
        <span className="admin-staff-applications__meta">
          {formatShortDate(String(row.created_at).slice(0, 10), locale)}
        </span>
      ),
    },
    {
      key: 'status',
      label: t('admin.staffApplications.columns.status'),
      render: (row) => {
        const statusKey = `admin.staffApplications.statusLabel.${row.status}`
        const statusLabel = t(statusKey)
        return (
          <span className={`admin-staff-applications__status is-${row.status}`}>
            {statusLabel === statusKey ? row.status : statusLabel}
          </span>
        )
      },
    },
    {
      key: 'action',
      label: t('admin.staffApplications.columns.action'),
      render: (row) => (
        <ReviewActions application={row} canEdit={canEdit} onReviewed={handleReviewed} />
      ),
    },
  ]

  return (
    <section className="admin-staff-applications">
      <header className="admin-staff-applications__header">
        <div className="admin-staff-applications__title">
          <h2>{t('admin.staffApplications.title')}</h2>
          <p>{t('admin.staffApplications.lead')}</p>
        </div>
        <StaffApplicationShare />
      </header>
      <div className="admin-staff-applications__filters" role="tablist">
        {STATUS_FILTERS.map((value) => (
          <button
            key={value || 'all'}
            type="button"
            role="tab"
            aria-selected={statusFilter === value}
            className={statusFilter === value ? 'is-active' : ''}
            onClick={() => setStatusFilter(value)}
          >
            {t(`admin.staffApplications.filters.${value || 'all'}`)}
          </button>
        ))}
      </div>
      {error ? (
        <p className="admin-staff-applications__error" role="alert">
          {error}
        </p>
      ) : null}
      <AdminDataTable
        columns={columns}
        rows={applications}
        loading={loading}
        emptyMessage={t('admin.staffApplications.empty')}
      />
    </section>
  )
}
