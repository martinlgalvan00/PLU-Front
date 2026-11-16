import { useId, useState } from 'react'
import { createPortal } from 'react-dom'
import { FileText } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { formatShortStamp } from '../../lib/format.js'
import {
  isDocumentPackComplete,
  OPTIONAL_ATHLETE_DOCUMENT_KINDS,
  requiredDocumentKinds,
} from '../../lib/athleteDocuments.js'
import { adminAthleteDocumentUrl } from '../../services/athleteDocumentService.js'
import useModalDialog from '../../hooks/useModalDialog.js'

function isPdfDocument(row) {
  const type = String(row?.contentType ?? '').toLowerCase()
  if (type === 'application/pdf') return true
  return /\.pdf$/i.test(String(row?.originalName ?? ''))
}

function DocumentSlot({ athleteId, broken, kind, label, locale, onBroken, optional, row, t }) {
  const href =
    row && athleteId
      ? adminAthleteDocumentUrl(athleteId, kind, row.uploadedAt ?? row.uploaded_at)
      : null
  const pdf = Boolean(row) && isPdfDocument(row)
  const showImage = Boolean(href) && !pdf && !broken
  const uploadedAt = row?.uploadedAt ?? row?.uploaded_at

  return (
    <li className={`athlete-documents-admin__row${row ? ' is-uploaded' : ''}${showImage ? ' has-thumb' : ''}`}>
      {showImage ? (
        <a
          className="athlete-documents-admin__thumb"
          href={href}
          target="_blank"
          rel="noreferrer"
          aria-label={t('admin.athleteDetail.documents.openNamed', { kind: label })}
        >
          <img src={href} alt="" loading="lazy" decoding="async" onError={() => onBroken(kind)} />
        </a>
      ) : null}
      <div className="athlete-documents-admin__copy">
        <span className="athlete-documents-admin__kind">{label}</span>
        {uploadedAt ? (
          <span className="athlete-documents-admin__meta">
            {t('admin.athleteDetail.documents.uploadedAt', {
              date: formatShortStamp(uploadedAt, locale),
            })}
            {row?.originalName ? ` · ${row.originalName}` : ''}
          </span>
        ) : (
          <span className="athlete-documents-admin__meta">
            {optional
              ? t('admin.athleteDetail.documents.optional')
              : t('admin.athleteDetail.documents.missing')}
          </span>
        )}
      </div>
      {href ? (
        <a className="athlete-documents-admin__open" href={href} target="_blank" rel="noreferrer">
          {pdf ? <FileText size={14} aria-hidden /> : null}
          {pdf ? t('admin.athleteDetail.documents.viewPdf') : t('admin.athleteDetail.documents.open')}
        </a>
      ) : null}
    </li>
  )
}

export default function AdminAthleteDocuments({ athlete, heading = true }) {
  const { locale, t } = useI18n()
  const titleId = useId()
  const [brokenKinds, setBrokenKinds] = useState(() => new Set())
  if (!athlete) return null

  const pack = isDocumentPackComplete(athlete, athlete.documents)
  const uploaded = new Map((athlete.documents ?? []).map((row) => [row.kind, row]))
  const required = requiredDocumentKinds(athlete)
  const title = t('admin.athleteDetail.documents.title')

  function markBroken(kind) {
    setBrokenKinds((current) => {
      if (current.has(kind)) return current
      const next = new Set(current)
      next.add(kind)
      return next
    })
  }

  function renderSlot(kind, optional = false) {
    return (
      <DocumentSlot
        key={kind}
        athleteId={athlete.id}
        broken={brokenKinds.has(kind)}
        kind={kind}
        label={t(`admin.athleteDetail.documents.kinds.${kind}`)}
        locale={locale}
        onBroken={markBroken}
        optional={optional}
        row={uploaded.get(kind)}
        t={t}
      />
    )
  }

  const status = pack.unavailable
    ? t('admin.athleteDetail.documents.unavailable')
    : pack.complete
      ? t('admin.athleteDetail.documents.complete')
      : t('admin.athleteDetail.documents.pending')

  return (
    <section
      className="athlete-detail__documents athlete-documents-admin"
      aria-labelledby={heading ? titleId : undefined}
      aria-label={heading ? undefined : title}
    >
      {heading ? (
        <h3 id={titleId} className="athlete-detail__group-title">
          {title}
        </h3>
      ) : null}
      <p className="athlete-detail__notice-status">{status}</p>
      {athlete.documentsGrandfathered ? (
        <p className="athlete-documents-admin__note">{t('admin.athleteDetail.documents.grandfathered')}</p>
      ) : null}
      {pack.unavailable ? null : (
        <ul className="athlete-documents-admin__list">
          {required.map((kind) => renderSlot(kind))}
          {OPTIONAL_ATHLETE_DOCUMENT_KINDS.map((kind) => renderSlot(kind, true))}
        </ul>
      )}
    </section>
  )
}

export function AdminAthleteDocumentsDialog({ athlete, onClose }) {
  const { t } = useI18n()
  const titleId = useId()
  const { panelRef, initialFocusRef, onKeyDown } = useModalDialog({ onClose })
  if (!athlete || typeof document === 'undefined') return null

  const name = athlete.fullName || '—'

  return createPortal(
    <div className="admin-user-delete-dialog athlete-documents-dialog">
      <button
        type="button"
        className="admin-user-delete-dialog__backdrop"
        aria-label={t('admin.athleteDetail.documents.close')}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="athlete-documents-dialog__panel"
        onKeyDown={onKeyDown}
      >
        <header className="athlete-documents-dialog__header">
          <h2 id={titleId}>{t('admin.athleteDetail.documents.dialogTitle', { name })}</h2>
          <button
            ref={initialFocusRef}
            type="button"
            className="athlete-documents-dialog__close"
            onClick={onClose}
          >
            {t('admin.athleteDetail.documents.close')}
          </button>
        </header>
        <AdminAthleteDocuments athlete={athlete} heading={false} />
      </div>
    </div>,
    document.body,
  )
}
