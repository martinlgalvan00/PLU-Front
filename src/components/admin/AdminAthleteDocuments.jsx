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

function DocumentStage({ athleteId, broken, kind, label, locale, onBroken, optional, row, t }) {
  const href =
    row && athleteId
      ? adminAthleteDocumentUrl(athleteId, kind, row.uploadedAt ?? row.uploaded_at)
      : null
  const pdf = Boolean(row) && isPdfDocument(row)
  const showImage = Boolean(href) && !pdf && !broken
  const uploadedAt = row?.uploadedAt ?? row?.uploaded_at
  const caption = [
    uploadedAt ? t('admin.athleteDetail.documents.uploadedAt', { date: formatShortStamp(uploadedAt, locale) }) : '',
    row?.originalName ?? '',
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="athlete-documents-admin__viewer">
      <div className={`athlete-documents-admin__stage${showImage ? '' : ' is-empty'}`}>
        {showImage ? (
          <a
            className="athlete-documents-admin__stage-link"
            href={href}
            target="_blank"
            rel="noreferrer"
            aria-label={t('admin.athleteDetail.documents.openNamed', { kind: label })}
          >
            <img src={href} alt="" onError={() => onBroken(kind)} />
          </a>
        ) : href ? (
          <a className="athlete-documents-admin__open" href={href} target="_blank" rel="noreferrer">
            {pdf ? <FileText size={16} aria-hidden /> : null}
            {pdf ? t('admin.athleteDetail.documents.viewPdf') : t('admin.athleteDetail.documents.open')}
          </a>
        ) : (
          <p className="athlete-documents-admin__meta">
            {optional
              ? t('admin.athleteDetail.documents.optional')
              : t('admin.athleteDetail.documents.missing')}
          </p>
        )}
      </div>
      {caption ? <p className="athlete-documents-admin__caption">{caption}</p> : null}
    </div>
  )
}

export default function AdminAthleteDocuments({ athlete, heading = true }) {
  const { locale, t } = useI18n()
  const titleId = useId()
  const [brokenKinds, setBrokenKinds] = useState(() => new Set())
  const [selectedKind, setSelectedKind] = useState(null)
  if (!athlete) return null

  const pack = isDocumentPackComplete(athlete, athlete.documents)
  const uploaded = new Map((athlete.documents ?? []).map((row) => [row.kind, row]))
  const required = requiredDocumentKinds(athlete)
  const kinds = [...required, ...OPTIONAL_ATHLETE_DOCUMENT_KINDS]
  const activeKind = kinds.includes(selectedKind)
    ? selectedKind
    : (kinds.find((kind) => uploaded.has(kind)) ?? kinds[0])
  const title = t('admin.athleteDetail.documents.title')

  function markBroken(kind) {
    setBrokenKinds((current) => {
      if (current.has(kind)) return current
      const next = new Set(current)
      next.add(kind)
      return next
    })
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
        <>
          <ul className="athlete-documents-admin__index">
            {kinds.map((kind) => {
              const row = uploaded.get(kind)
              const optional = !required.includes(kind)
              const label = t(`admin.athleteDetail.documents.kinds.${kind}`)
              const meta = row
                ? row.originalName || label
                : optional
                  ? t('admin.athleteDetail.documents.optional')
                  : t('admin.athleteDetail.documents.missing')
              return (
                <li key={kind}>
                  <button
                    type="button"
                    className={`athlete-documents-admin__pick${kind === activeKind ? ' is-selected' : ''}`}
                    aria-pressed={kind === activeKind}
                    aria-label={label}
                    onClick={() => setSelectedKind(kind)}
                  >
                    <span className="athlete-documents-admin__pick-kind">{label}</span>
                    <span className="athlete-documents-admin__pick-meta">{meta}</span>
                  </button>
                </li>
              )
            })}
          </ul>
          <DocumentStage
            athleteId={athlete.id}
            broken={brokenKinds.has(activeKind)}
            kind={activeKind}
            label={t(`admin.athleteDetail.documents.kinds.${activeKind}`)}
            locale={locale}
            onBroken={markBroken}
            optional={!required.includes(activeKind)}
            row={uploaded.get(activeKind)}
            t={t}
          />
        </>
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
