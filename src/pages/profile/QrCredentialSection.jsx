import { useEffect, useState } from 'react'
import { CheckCircle2, Lock, QrCode, Share2 } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import CardPreviewModal from '../../components/ui/CardPreviewModal.jsx'
import { buildCredentialUrl, generateCredentialQr } from '../../lib/credentialQr.js'
import { formatShortDate } from '../../lib/format.js'

export default function QrCredentialSection({
  athlete,
  membership,
  registrations = [],
  onNavigateSection,
}) {
  const { t, locale } = useI18n()
  const [modalOpen, setModalOpen] = useState(false)
  const [qrSrc, setQrSrc] = useState(null)
  const memberCode = membership?.memberCode
  // El QR sale del token de la persona, que es estable de por vida: renovar la
  // afiliación ya no invalida la card impresa. Los otros dos quedan de fallback
  // para una cuenta cuyo snapshot todavía no trae el token nuevo.
  const credentialCode = athlete?.credentialToken ?? membership?.qrToken ?? memberCode
  const isMemberActive = membership?.status === 'activa'
  // Un inscripto a un evento que no exige afiliación también necesita su
  // credencial en la puerta; antes esa persona no tenía ninguna.
  const hasCredential = Boolean(credentialCode) && (isMemberActive || registrations.length > 0)
  const validUntil = membership?.expirationDate
    ? formatShortDate(membership.expirationDate, locale)
    : null

  useEffect(() => {
    if (!hasCredential) {
      setQrSrc(null)
      return undefined
    }
    let cancelled = false
    generateCredentialQr(buildCredentialUrl({ code: credentialCode }))
      .then((dataUrl) => { if (!cancelled) setQrSrc(dataUrl) })
      .catch(() => { if (!cancelled) setQrSrc(null) })
    return () => { cancelled = true }
  }, [credentialCode, hasCredential])

  const cardData = hasCredential
    ? {
        athleteName: athlete.fullName,
        athleteCode: memberCode,
        athletePhotoUrl: athlete.photoUrl,
        qrCode: credentialCode,
        membershipExpiration: validUntil,
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

      {hasCredential ? (
        <>
          <p className="account-section__lead">{t('account.qr.lead')}</p>

          <div className="account-qr account-qr--split">
            <div className="account-qr__code-col">
              <div className="account-qr__chip">
                {qrSrc && <img src={qrSrc} alt={t('account.qr.imageAlt')} />}
              </div>
              <p className="account-qr__code-label">{memberCode ?? athlete.fullName}</p>
              {isMemberActive && validUntil && (
                <p className="account-qr__code-meta">{t('account.qr.validUntil', { date: validUntil })}</p>
              )}
            </div>

            <div className="account-qr__preview-col">
              <p className="account-qr__preview-caption">{t('account.qr.scanPreviewCaption')}</p>
              <aside className="account-qr__preview" aria-label={t('account.qr.scanPreviewCaption')}>
                <div className="account-qr__preview-verdict">
                  <CheckCircle2 size={18} aria-hidden />
                  <span>{t('account.qr.scanPreviewVerdict')}</span>
                </div>
                <p className="account-qr__preview-name">{athlete.fullName}</p>
                {memberCode && <p className="account-qr__preview-code">{memberCode}</p>}
                <dl className="account-qr__preview-rows">
                  <div>
                    <dt>{t('account.qr.scanPreviewMembership')}</dt>
                    <dd>
                      {isMemberActive
                        ? t('account.membershipActive')
                        : t('account.qr.scanPreviewNoMembership')}
                    </dd>
                  </div>
                  {isMemberActive && validUntil && (
                    <div>
                      <dt>{t('account.credential.expiration')}</dt>
                      <dd>{validUntil}</dd>
                    </div>
                  )}
                  {/* Sin afiliación, lo que habilita el ingreso es la
                      inscripción: es el dato que el operador necesita ver. */}
                  {!isMemberActive && registrations.length > 0 && (
                    <div>
                      <dt>{t('account.qr.scanPreviewRegistration')}</dt>
                      <dd>{registrations[0].event ?? t('account.qr.scanPreviewRegistered')}</dd>
                    </div>
                  )}
                </dl>
              </aside>
              <button type="button" className="account-qr__share" onClick={() => setModalOpen(true)}>
                <Share2 size={15} aria-hidden />
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
