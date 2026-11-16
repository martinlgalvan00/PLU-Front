import { useEffect, useRef, useState } from 'react'
import { FileText, Printer } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { ApiError } from '../../lib/api.js'
import { formatShortDate, formatShortStamp } from '../../lib/format.js'
import { generateCredentialQr } from '../../lib/credentialQr.js'
import { fetchMembershipCertificate } from '../../services/membershipCertificateService.js'
import '../../styles/components/membership-certificate.css'

function validityLabel(certificate, locale) {
  const start = formatShortDate(certificate.startDate, locale)
  const end = formatShortDate(certificate.expirationDate, locale)
  if (start && end) return `${start} — ${end}`
  return end || start
}

export default function MembershipCertificateRequest({ canIssue = false }) {
  const { locale, t } = useI18n()
  const sheetRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [blocked, setBlocked] = useState(false)
  const [certificate, setCertificate] = useState(null)
  const [qrUrl, setQrUrl] = useState('')

  useEffect(() => {
    if (!certificate?.credentialUrl) return undefined
    let cancelled = false
    generateCredentialQr(certificate.credentialUrl)
      .then((url) => {
        if (!cancelled) setQrUrl(url)
      })
      .catch(() => {
        if (!cancelled) setQrUrl('')
      })
    return () => {
      cancelled = true
    }
  }, [certificate?.credentialUrl])

  useEffect(() => {
    if (!certificate) return
    sheetRef.current?.focus()
  }, [certificate])

  async function requestCertificate() {
    setBusy(true)
    setError('')
    setBlocked(false)
    try {
      const next = await fetchMembershipCertificate()
      setQrUrl('')
      setCertificate(next)
    } catch (requestError) {
      setCertificate(null)
      if (
        requestError instanceof ApiError &&
        requestError.body?.code === 'MEMBERSHIP_NOT_CURRENT'
      ) {
        setBlocked(true)
      } else {
        setError(
          requestError instanceof ApiError
            ? requestError.message
            : t('account.membership.certificate.error'),
        )
      }
    } finally {
      setBusy(false)
    }
  }

  if (!canIssue || blocked) {
    return (
      <p
        className="membership-certificate-request__note membership-certificate-request--standalone"
        role="status"
      >
        {t('account.membership.certificate.unavailable')}
      </p>
    )
  }

  const validity = certificate ? validityLabel(certificate, locale) : ''

  return (
    <div className="membership-certificate-request">
      <p className="membership-certificate-request__lead">
        {t('account.membership.certificate.lead')}
      </p>
      <button
        type="button"
        className="card-trigger-btn"
        disabled={busy}
        aria-busy={busy}
        onClick={() => void requestCertificate()}
      >
        <FileText className="card-trigger-btn__icon" size={16} aria-hidden />
        {busy
          ? t('account.membership.certificate.loading')
          : t('account.membership.certificate.action')}
      </button>
      {error ? (
        <p className="membership-certificate-request__error" role="alert">
          {error}
        </p>
      ) : null}
      {certificate ? (
        <article
          ref={sheetRef}
          className="membership-certificate"
          data-print="open"
          tabIndex={-1}
          aria-labelledby="membership-certificate-title"
        >
          <p className="membership-certificate__kicker">PLU Argentina</p>
          <h3 id="membership-certificate-title" className="membership-certificate__title">
            {t('account.membership.certificate.title')}
          </h3>
          <dl className="membership-certificate__facts">
            <div>
              <dt>{t('account.membership.certificate.name')}</dt>
              <dd>{certificate.fullName}</dd>
            </div>
            {certificate.documentId ? (
              <div>
                <dt>{t('account.membership.certificate.document')}</dt>
                <dd>{certificate.documentId}</dd>
              </div>
            ) : null}
            {certificate.memberCode ? (
              <div>
                <dt>{t('account.membership.certificate.memberCode')}</dt>
                <dd>{certificate.memberCode}</dd>
              </div>
            ) : null}
            {validity ? (
              <div>
                <dt>{t('account.membership.certificate.validity')}</dt>
                <dd>{validity}</dd>
              </div>
            ) : null}
          </dl>
          {qrUrl ? (
            <img
              className="membership-certificate__qr"
              src={qrUrl}
              alt={t('account.membership.certificate.qrAlt')}
            />
          ) : null}
          <p className="membership-certificate__verify">
            {t('account.membership.certificate.verify')}
          </p>
          <p className="membership-certificate__url">{certificate.credentialUrl}</p>
          <p className="membership-certificate__verify">
            {t('account.membership.certificate.issued', {
              date: formatShortStamp(certificate.issuedAt, locale),
            })}
          </p>
          <div className="membership-certificate__actions">
            <button type="button" className="card-trigger-btn" onClick={() => window.print()}>
              <Printer className="card-trigger-btn__icon" size={16} aria-hidden />
              {t('account.membership.certificate.print')}
            </button>
            <button type="button" className="card-trigger-btn" onClick={() => setCertificate(null)}>
              {t('account.membership.certificate.close')}
            </button>
          </div>
        </article>
      ) : null}
    </div>
  )
}
