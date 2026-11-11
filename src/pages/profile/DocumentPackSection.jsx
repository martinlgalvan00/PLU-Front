import { useMemo, useState } from 'react'
import { Check, FileText, IdCard, Stethoscope } from 'lucide-react'
import FileUploadField from '../../components/ui/FileUploadField.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import {
  isDocumentPackComplete,
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

export default function DocumentPackSection({
  athlete,
  onUploadDocument,
  variant = 'account',
}) {
  const { t } = useI18n()
  const checkout = variant === 'checkout'
  const [busyKind, setBusyKind] = useState(null)
  const [errors, setErrors] = useState({})
  const required = requiredDocumentKinds(athlete)
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
    const validation = validateAthleteDocumentFile(file)
    if (validation.error) {
      setErrors((current) => ({ ...current, [kind]: validation.error }))
      return
    }
    setBusyKind(kind)
    setErrors((current) => ({ ...current, [kind]: '' }))
    const result = await onUploadDocument(athlete.id, kind, file)
    if (result?.error) {
      setErrors((current) => ({ ...current, [kind]: result.error }))
    }
    setBusyKind(null)
  }

  const titleId = checkout ? 'account-documents-checkout-title' : 'account-documents-title'

  return (
    <section
      className={`account-data-group account-documents${checkout ? ' account-documents--checkout' : ''}`}
      aria-labelledby={titleId}
    >
      <div className="account-data-group__header">
        <div className="account-data-group__meta">
          <p className="account-data-group__label">{t('account.documents.eyebrow')}</p>
          <h3 id={titleId} className="account-data-group__title">
            {checkout ? t('account.documents.checkoutTitle') : t('account.documents.title')}
          </h3>
          <p className="account-data-group__note">
            {checkout ? t('account.documents.checkoutLead') : t('account.documents.lead')}
          </p>
        </div>
        <span className="account-data-group__required-note">
          {pack.complete
            ? t('account.documents.complete')
            : t(
                `account.documents.pending_${pack.missing.length === 1 ? 'one' : 'other'}`,
                { count: pack.missing.length },
              )}
        </span>
      </div>
      <ul className="account-documents__list">
        {required.map((kind) => {
          const uploaded = documentsByKind.get(kind)
          const Icon = KIND_ICONS[kind] ?? FileText
          const busy = busyKind === kind
          const previewUrl = uploaded ? athleteDocumentUrl(kind) : null
          const isPdf = uploaded?.contentType === 'application/pdf'
          return (
            <li key={kind} className={`account-documents__item${uploaded ? ' is-uploaded' : ''}`}>
              <span className="account-documents__icon" aria-hidden>
                {uploaded ? <Check size={16} strokeWidth={2.25} /> : <Icon size={16} strokeWidth={1.75} />}
              </span>
              <div className="account-documents__copy">
                <p className="account-documents__name">{t(`account.documents.kinds.${kind}`)}</p>
                <p className="account-documents__hint">{t(`account.documents.hints.${kind}`)}</p>
                {previewUrl ? (
                  isPdf ? (
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
                id={`account-document-${kind}`}
                busy={busy}
                chooseLabel={
                  uploaded ? t('account.documents.replace') : t('account.documents.upload')
                }
                uploadingLabel={t('account.documents.uploading')}
                onFile={(file) => void handleFile(kind, file)}
              />
            </li>
          )
        })}
      </ul>
    </section>
  )
}
