import { useMemo, useRef, useState } from 'react'
import { Check, FileText, IdCard, Stethoscope } from 'lucide-react'
import FileUploadField from '../../components/ui/FileUploadField.jsx'
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

export default function DocumentPackSection({ athlete, onUploadDocument, variant = 'account' }) {
  const { t } = useI18n()
  const checkout = variant === 'checkout'
  const member = variant === 'member'
  const [busyKinds, setBusyKinds] = useState(() => new Set())
  const busyRef = useRef(new Set())
  const [errors, setErrors] = useState({})
  const [detailsOpen, setDetailsOpen] = useState(() => variant !== 'member')
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

  function renderKind(kind) {
    const uploaded = documentsByKind.get(kind)
    const Icon = KIND_ICONS[kind] ?? FileText
    const busy = busyKinds.has(kind)
    const previewUrl = uploaded
      ? athleteDocumentUrl(kind, uploaded.uploadedAt ?? uploaded.uploaded_at)
      : null
    const isPdf = uploaded?.contentType === 'application/pdf'
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
          <p className="account-documents__name">{t(`account.documents.kinds.${kind}`)}</p>
          <p className="account-documents__hint">{t(`account.documents.hints.${kind}`)}</p>
          {previewUrl ? (
            member || isPdf ? (
              <a
                className="account-documents__preview-link"
                href={previewUrl}
                target="_blank"
                rel="noreferrer"
              >
                {isPdf ? t('account.documents.viewPdf') : t('account.documents.view')}
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
          onFile={(file) => void handleFile(kind, file)}
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
      {member && pack.complete && !detailsOpen ? (
        <button
          type="button"
          className="account-documents__action account-documents__manage"
          onClick={() => setDetailsOpen(true)}
        >
          {t('account.documents.manage')}
        </button>
      ) : (
        <>
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
        </>
      )}
    </section>
  )
}
