import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, FileText, IdCard, Stethoscope } from 'lucide-react'
import FileUploadField from '../../components/ui/FileUploadField.jsx'
import useModalDialog from '../../hooks/useModalDialog.js'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import {
  documentPackFocus,
  isDocumentPackComplete,
  OPTIONAL_ATHLETE_DOCUMENT_KINDS,
  requiredDocumentKinds,
} from '../../lib/athleteDocuments.js'
import {
  athleteDocumentUrl,
  validateAthleteDocumentFile,
} from '../../services/athleteDocumentService.js'
import '../../styles/components/athlete-documents.css'

const KIND_ICONS = {
  dni_front: IdCard,
  dni_back: IdCard,
  medical_certificate: Stethoscope,
  minor_authorization: FileText,
}

function filePreviewUrl(file) {
  try {
    if (typeof URL?.createObjectURL !== 'function') return ''
    return URL.createObjectURL(file)
  } catch {
    return ''
  }
}

function formatFileSize(size) {
  const bytes = Number(size)
  if (!Number.isFinite(bytes) || bytes < 0) return ''
  if (bytes < 1024) return `${Math.round(bytes)} B`
  const kb = bytes / 1024
  const text = kb >= 10 ? String(Math.round(kb)) : kb.toFixed(1).replace('.', ',')
  return `${text} KB`
}

function DocumentPreview({ label, pdf, src }) {
  const [broken, setBroken] = useState(false)
  if (!src || broken) {
    return <p className="account-documents-dialog__meta">{label}</p>
  }
  if (pdf) {
    return <iframe title={label} src={src} />
  }
  return <img src={src} alt={label} onError={() => setBroken(true)} />
}

function DocumentConfirmDialog({ busy, kindLabel, onCancel, onConfirm, pending, replacing, t }) {
  const titleId = useId()
  const { panelRef, initialFocusRef, onKeyDown } = useModalDialog({ onClose: onCancel })
  const size = formatFileSize(pending.file?.size)
  const meta = [pending.file?.name, size].filter(Boolean).join(' · ')

  return createPortal(
    <div className="account-documents-dialog">
      <button
        type="button"
        className="account-documents-dialog__backdrop"
        aria-label={t('account.documents.confirmCancel')}
        onClick={onCancel}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="account-documents-dialog__panel"
        onKeyDown={onKeyDown}
      >
        <h2 id={titleId} className="account-documents-dialog__title">
          {t('account.documents.confirmTitle')}
        </h2>
        <p className="account-documents-dialog__kind">{kindLabel}</p>
        <p className="account-documents-dialog__lead">
          {replacing ? t('account.documents.confirmReplace') : t('account.documents.confirmLead')}
        </p>
        <div className="account-documents-dialog__frame">
          <DocumentPreview label={kindLabel} pdf={pending.pdf} src={pending.previewUrl} />
        </div>
        {meta ? <p className="account-documents-dialog__meta">{meta}</p> : null}
        <div className="account-documents-dialog__actions">
          <button
            ref={initialFocusRef}
            type="button"
            className="btn btn--secondary"
            onClick={onCancel}
            disabled={busy}
          >
            {t('account.documents.confirmCancel')}
          </button>
          <button type="button" className="btn" onClick={onConfirm} disabled={busy}>
            {busy ? t('account.documents.uploading') : t('account.documents.confirmAction')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function DocumentViewerDialog({ href, label, onClose, pdf, t }) {
  const titleId = useId()
  const { panelRef, initialFocusRef, onKeyDown } = useModalDialog({ onClose })

  return createPortal(
    <div className="account-documents-dialog">
      <button
        type="button"
        className="account-documents-dialog__backdrop"
        aria-label={t('account.documents.viewerClose')}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="account-documents-dialog__panel account-documents-dialog__panel--viewer"
        onKeyDown={onKeyDown}
      >
        <h2 id={titleId} className="account-documents-dialog__title">
          {label}
        </h2>
        <div className="account-documents-dialog__frame">
          <DocumentPreview label={label} pdf={pdf} src={href} />
        </div>
        <div className="account-documents-dialog__actions">
          <a className="btn btn--secondary" href={href} target="_blank" rel="noreferrer">
            {pdf ? t('account.documents.viewPdf') : t('account.documents.openOriginal')}
          </a>
          <button ref={initialFocusRef} type="button" className="btn" onClick={onClose}>
            {t('account.documents.viewerClose')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export default function DocumentPackSection({ athlete, onUploadDocument, variant = 'account' }) {
  const { t } = useI18n()
  const checkout = variant === 'checkout'
  const member = variant === 'member'
  const [busyKinds, setBusyKinds] = useState(() => new Set())
  const busyRef = useRef(new Set())
  const [errors, setErrors] = useState({})
  const [pending, setPending] = useState(null)
  const [viewing, setViewing] = useState(null)
  const required = requiredDocumentKinds(athlete)
  const optional = OPTIONAL_ATHLETE_DOCUMENT_KINDS
  const documentsByKind = useMemo(() => {
    const map = new Map()
    for (const row of athlete?.documents ?? []) {
      if (row?.kind) map.set(row.kind, row)
    }
    return map
  }, [athlete?.documents])
  const pack = isDocumentPackComplete(athlete, athlete?.documents)

  useEffect(() => {
    const previewUrl = pending?.previewUrl
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [pending])

  async function handleFile(kind, file) {
    if (!file || !onUploadDocument) return
    if (busyRef.current.has(kind)) return
    const validation = validateAthleteDocumentFile(file)
    if (validation.error) {
      setErrors((current) => ({ ...current, [kind]: validation.error }))
      return
    }
    busyRef.current.add(kind)
    setBusyKinds(new Set(busyRef.current))
    setErrors((current) => ({ ...current, [kind]: '' }))
    try {
      const result = await onUploadDocument(athlete.id, kind, file)
      if (result?.error) {
        setErrors((current) => ({ ...current, [kind]: result.error }))
      }
    } catch (error) {
      setErrors((current) => ({
        ...current,
        [kind]: error?.message || 'No se pudo subir el documento. Intentá de nuevo.',
      }))
    } finally {
      busyRef.current.delete(kind)
      setBusyKinds(new Set(busyRef.current))
    }
  }

  function stageFile(kind, file) {
    if (!file || !onUploadDocument) return
    if (busyRef.current.has(kind)) return
    const validation = validateAthleteDocumentFile(file)
    if (validation.error) {
      setErrors((current) => ({ ...current, [kind]: validation.error }))
      return
    }
    const contentType = validation.contentType || file.type || ''
    setErrors((current) => ({ ...current, [kind]: '' }))
    setViewing(null)
    setPending({
      kind,
      file,
      pdf: contentType === 'application/pdf' || /\.pdf$/i.test(file.name || ''),
      previewUrl: filePreviewUrl(file),
    })
  }

  async function confirmPending() {
    if (!pending || busyKinds.has(pending.kind)) return
    const { kind, file } = pending
    setPending(null)
    await handleFile(kind, file)
  }

  function renderKind(kind) {
    const uploaded = documentsByKind.get(kind)
    const Icon = KIND_ICONS[kind] ?? FileText
    const busy = busyKinds.has(kind)
    const previewUrl = uploaded
      ? athleteDocumentUrl(kind, uploaded.uploadedAt ?? uploaded.uploaded_at)
      : null
    const isPdf = uploaded?.contentType === 'application/pdf' || /\.pdf$/i.test(uploaded?.originalName || '')
    const label = t(`account.documents.kinds.${kind}`)
    return (
      <li key={kind} className={`account-documents__item${uploaded ? ' is-uploaded' : ''}`}>
        <span className="account-documents__icon" aria-hidden>
          {uploaded ? (
            <Check size={16} strokeWidth={2.25} />
          ) : (
            <Icon size={16} strokeWidth={1.75} />
          )}
        </span>
        <div className="account-documents__copy">
          <p className="account-documents__name">{label}</p>
          {member && uploaded ? null : (
            <p className="account-documents__hint">{t(`account.documents.hints.${kind}`)}</p>
          )}
          {previewUrl ? (
            member ? (
              <button
                type="button"
                className="account-documents__preview-link"
                aria-label={`${isPdf ? t('account.documents.viewPdf') : t('account.documents.view')} ${label}`}
                onClick={() => setViewing({ href: previewUrl, label, pdf: isPdf })}
              >
                {isPdf ? t('account.documents.viewPdf') : t('account.documents.view')}
              </button>
            ) : isPdf ? (
              <a
                className="account-documents__preview-link"
                href={previewUrl}
                target="_blank"
                rel="noreferrer"
              >
                {t('account.documents.viewPdf')}
              </a>
            ) : (
              <img
                className="account-documents__preview"
                src={previewUrl}
                alt=""
                loading="lazy"
                decoding="async"
                onError={(event) => {
                  event.currentTarget.hidden = true
                }}
              />
            )
          ) : null}
          {errors[kind] ? (
            <p className="account-documents__error" role="alert">
              {errors[kind]}
            </p>
          ) : null}
        </div>
        <FileUploadField
          variant="action"
          id={`account-document-${variant}-${kind}`}
          busy={busy}
          chooseLabel={uploaded ? t('account.documents.replace') : t('account.documents.upload')}
          uploadingLabel={t('account.documents.uploading')}
          onFile={(file) => (member ? stageFile(kind, file) : void handleFile(kind, file))}
        />
      </li>
    )
  }

  const focus = documentPackFocus(pack.missing)
  const checkoutTitleKey =
    focus === 'guardian'
      ? 'account.documents.checkoutGuardianTitle'
      : focus === 'dni_and_guardian'
        ? 'account.documents.checkoutDniGuardianTitle'
        : 'account.documents.checkoutTitle'
  const checkoutLeadKey =
    focus === 'guardian'
      ? 'account.documents.checkoutGuardianLead'
      : focus === 'dni_and_guardian'
        ? 'account.documents.checkoutDniGuardianLead'
        : 'account.documents.checkoutLead'
  const titleId = checkout
    ? 'account-documents-checkout-title'
    : member
      ? 'account-documents-member-title'
      : 'account-documents-title'
  const variantClass = checkout
    ? ' account-documents--checkout'
    : member
      ? ' account-documents--member'
      : ''
  const pendingLabel = pending ? t(`account.documents.kinds.${pending.kind}`) : ''

  return (
    <section
      className={`account-data-group account-documents${variantClass}`}
      aria-labelledby={titleId}
    >
      <div className="account-data-group__header">
        <div className="account-data-group__meta">
          <p className="account-data-group__label">{t('account.documents.eyebrow')}</p>
          <h3 id={titleId} className="account-data-group__title">
            {checkout
              ? t(checkoutTitleKey)
              : member
                ? t('account.documents.memberTitle')
                : t('account.documents.title')}
          </h3>
          <p className="account-data-group__note">
            {checkout
              ? t(checkoutLeadKey)
              : member
                ? t('account.documents.memberLead')
                : t('account.documents.lead')}
          </p>
        </div>
        <span className="account-data-group__required-note">
          {pack.complete
            ? t('account.documents.complete')
            : t(`account.documents.pending_${pack.missing.length === 1 ? 'one' : 'other'}`, {
                count: pack.missing.length,
              })}
        </span>
      </div>
      <ul className="account-documents__list">{required.map((kind) => renderKind(kind))}</ul>
      {optional.length > 0 ? (
        <>
          <p className="account-data-group__label account-documents__optional-label">
            {t('account.documents.optionalLabel')}
          </p>
          <ul className="account-documents__list account-documents__list--optional">
            {optional.map((kind) => renderKind(kind))}
          </ul>
        </>
      ) : null}
      {member && pending ? (
        <DocumentConfirmDialog
          busy={busyKinds.has(pending.kind)}
          kindLabel={pendingLabel}
          onCancel={() => setPending(null)}
          onConfirm={() => void confirmPending()}
          pending={pending}
          replacing={documentsByKind.has(pending.kind)}
          t={t}
        />
      ) : null}
      {member && viewing ? (
        <DocumentViewerDialog
          href={viewing.href}
          label={viewing.label}
          onClose={() => setViewing(null)}
          pdf={viewing.pdf}
          t={t}
        />
      ) : null}
    </section>
  )
}
