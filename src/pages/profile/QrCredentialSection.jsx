import { useEffect, useState } from 'react'
import { Lock, QrCode } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import CardPreviewModal from '../../components/ui/CardPreviewModal.jsx'
import { buildCredentialUrl, generateCredentialQr } from '../../lib/credentialQr.js'
import { formatShortDate } from '../../lib/format.js'

export default function QrCredentialSection({ athlete, membership, onNavigateSection }) {
  const { t, locale } = useI18n()
  const [modalOpen, setModalOpen] = useState(false)
  const [qrSrc, setQrSrc] = useState(null)
  const memberCode = membership?.memberCode
  const hasActiveCredential = membership?.status === 'activa' && Boolean(memberCode)

  useEffect(() => {
    if (!hasActiveCredential) {
      setQrSrc(null)
      return undefined
    }
    let cancelled = false
    generateCredentialQr(buildCredentialUrl({ code: memberCode }))
      .then((dataUrl) => { if (!cancelled) setQrSrc(dataUrl) })
      .catch(() => { if (!cancelled) setQrSrc(null) })
    return () => { cancelled = true }
  }, [hasActiveCredential, memberCode])

  const cardData = hasActiveCredential
    ? {
        athleteName: athlete.fullName,
        athleteCode: memberCode,
        membershipExpiration: formatShortDate(membership.expirationDate, locale),
        variant: 'membership',
        eventSlug: 'afiliacion',
      }
    : null

  return (
    <section id="account-qr" className="account-section account-section--celeste">
      <div className="account-section__heading">
        <div className="account-section__icon account-section__icon--celeste"><QrCode size={21} /></div>
        <div><span>{t('account.qr.eyebrow')}</span><h2>{t('account.qr.title')}</h2></div>
      </div>

      {hasActiveCredential ? (
        <>
          <p className="account-section__lead">{t('account.qr.lead')}</p>
          <div className="account-qr">
            <div className="account-qr__chip">
              {qrSrc && <img src={qrSrc} alt={t('account.qr.imageAlt')} />}
            </div>
            <div className="account-qr__meta">
              <strong>{memberCode}</strong>
              <span>{t('account.qr.validUntil', { date: formatShortDate(membership.expirationDate, locale) })}</span>
              <button type="button" className="account-primary-action" onClick={() => setModalOpen(true)}>
                {t('account.qr.openAction')}
              </button>
            </div>
          </div>
          <CardPreviewModal open={modalOpen} onClose={() => setModalOpen(false)} cardData={cardData} />
        </>
      ) : (
        <div className="account-qr account-qr--locked">
          <div className="account-qr__chip account-qr__chip--locked" aria-hidden="true">
            <QrCode size={40} strokeWidth={1.2} />
            <span className="account-qr__lock"><Lock size={13} /></span>
          </div>
          <div className="account-qr__meta">
            <p className="account-section__empty">{t('account.qr.empty')}</p>
            <button type="button" className="account-primary-action" onClick={() => onNavigateSection('account-membership')}>
              {t('account.qr.emptyAction')}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
