import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Lock, QrCode, Share2 } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import CardPreviewModal from '../../components/ui/CardPreviewModal.jsx'
import CredentialCard from '../../components/ui/CredentialCard.jsx'
import CredentialMergeRitual from '../../components/ui/CredentialMergeRitual.jsx'
import { buildAthleteCredentialUrl, generateCredentialQr } from '../../lib/credentialQr.js'
import { hasPlayedCredentialMerge } from '../../lib/credentialMerge.js'
import { formatShortDate } from '../../lib/format.js'
import {
  getRegistrationGateLabelKey,
  isGateAccessReady,
  resolveRequiresMembership,
} from '../../lib/gateAccess.js'
import { isRegistrationAdmitted } from '../../lib/status.js'
import { isMembershipCurrent } from '../../services/membershipService.js'

export default function QrCredentialSection({
  athlete,
  membership,
  latestMembership = null,
  registrations = [],
  onNavigateSection,
}) {
  const { t, locale } = useI18n()
  const [modalOpen, setModalOpen] = useState(false)
  const [cardInitialFormat, setCardInitialFormat] = useState('square')
  const [qrSrc, setQrSrc] = useState(null)
  const [mergeDone, setMergeDone] = useState(false)

  const memberCode = membership?.memberCode ?? latestMembership?.memberCode
  const credentialCode = athlete?.credentialToken ?? membership?.qrToken ?? latestMembership?.qrToken ?? memberCode
  const membershipCurrent = isMembershipCurrent(membership)
  const membershipForPass = membershipCurrent ? membership : latestMembership

  const admittedRegistrations = useMemo(
    () => registrations.filter((item) => isRegistrationAdmitted(item.status)),
    [registrations],
  )
  const primaryMeet = admittedRegistrations[0] ?? null
  const meetRequiresMembership = primaryMeet ? resolveRequiresMembership(primaryMeet) : false
  const gateReady = primaryMeet
    ? isGateAccessReady({
        registrationStatus: primaryMeet.status,
        requiresMembership: meetRequiresMembership,
        membershipCurrent,
      })
    : membershipCurrent
  const gateLabelKey = primaryMeet
    ? getRegistrationGateLabelKey(primaryMeet, { membershipCurrent })
    : null

  const hasCredential = Boolean(credentialCode) && (membershipCurrent || admittedRegistrations.length > 0)
  const showDual = hasCredential && Boolean(primaryMeet) && !membershipCurrent
  const shouldPlayMerge =
    hasCredential &&
    membershipCurrent &&
    Boolean(membership?.id) &&
    Boolean(primaryMeet) &&
    !hasPlayedCredentialMerge(athlete?.id, membership.id) &&
    !mergeDone

  const validUntil = membership?.expirationDate
    ? formatShortDate(membership.expirationDate, locale)
    : null
  const credentialSeasonYear =
    membership?.year ??
    membership?.startDate?.slice(0, 4) ??
    membership?.expirationDate?.slice(0, 4) ??
    String(new Date().getFullYear())

  useEffect(() => {
    if (!hasCredential) {
      setQrSrc(null)
      return undefined
    }
    let cancelled = false
    generateCredentialQr(buildAthleteCredentialUrl(credentialCode))
      .then((dataUrl) => {
        if (!cancelled) setQrSrc(dataUrl)
      })
      .catch(() => {
        if (!cancelled) setQrSrc(null)
      })
    return () => {
      cancelled = true
    }
  }, [credentialCode, hasCredential])

  const cardData = hasCredential
    ? {
        athleteName: athlete.fullName,
        athleteCode: memberCode,
        athletePhotoUrl: athlete.photoUrl,
        qrCode: credentialCode,
        membershipExpiration: validUntil,
        variant: membershipCurrent && primaryMeet
          ? 'unified'
          : membershipCurrent
            ? 'membership'
            : 'event',
        eventSlug: primaryMeet?.eventSlug ?? 'afiliacion',
        eventTitle: primaryMeet?.event,
      }
    : null

  if (shouldPlayMerge) {
    return (
      <section id="account-qr" className="account-section account-section--celeste">
        <div className="account-section__heading">
          <div className="account-section__icon account-section__icon--celeste"><QrCode size={21} /></div>
          <div><span>{t('account.qr.eyebrow')}</span><h2>{t('account.qr.title')}</h2></div>
        </div>
        <CredentialMergeRitual
          athleteId={athlete.id}
          membershipId={membership.id}
          meetLabel={t('account.qr.meetPassTitle')}
          membershipLabel={t('account.qr.membershipPassTitle')}
          qrSrc={qrSrc}
          onComplete={() => setMergeDone(true)}
        />
      </section>
    )
  }

  return (
    <section id="account-qr" className="account-section account-section--celeste">
      <div className="account-section__heading">
        <div className="account-section__icon account-section__icon--celeste"><QrCode size={21} /></div>
        <div><span>{t('account.qr.eyebrow')}</span><h2>{t('account.qr.title')}</h2></div>
      </div>

      {hasCredential ? (
        <>
          <p className="account-section__lead">
            {showDual
              ? t('account.qr.leadDual')
              : membershipCurrent
                ? t('account.qr.leadUnified')
                : t('account.qr.lead')}
          </p>

          {showDual ? (
            <div className="account-qr-dual">
              <article className="account-qr-pass">
                <h3>{t('account.qr.meetPassTitle')}</h3>
                <p className="account-qr-pass__meta">
                  {primaryMeet?.event ?? t('account.qr.meetPassMeta')}
                </p>
                {gateLabelKey ? (
                  <p
                    className={`account-qr-pass__gate ${
                      gateReady ? 'account-qr-pass__gate--ready' : 'account-qr-pass__gate--reserved'
                    }`}
                  >
                    {t(gateLabelKey)}
                  </p>
                ) : null}
                <div className="account-qr__chip">
                  {qrSrc && <img src={qrSrc} alt={t('account.qr.imageAlt')} />}
                </div>
                {!gateReady && meetRequiresMembership ? (
                  <p className="account-qr-pass__note">{t('account.qr.gateBlockedNote')}</p>
                ) : null}
              </article>

              <article className="account-qr-pass account-qr-pass--pending">
                <h3>{t('account.qr.membershipPassTitle')}</h3>
                <p className="account-qr-pass__meta">
                  {membershipForPass?.status === 'pendiente_pago'
                    ? t('account.qr.membershipPassPending')
                    : t('account.qr.scanPreviewNoMembership')}
                </p>
                <div className="account-qr__chip account-qr__chip--muted">
                  {qrSrc && <img src={qrSrc} alt="" />}
                </div>
                <button
                  type="button"
                  className="account-primary-action"
                  onClick={() => onNavigateSection('account-membership')}
                >
                  {t('pages.register.membershipRequiredAction')}
                </button>
              </article>
            </div>
          ) : (
            <div className="account-qr account-qr--split account-qr--with-credential">
              <div className="account-qr__credential-col">
                <CredentialCard
                  eyebrow={t('account.credential.athlete')}
                  name={athlete.fullName}
                  code={memberCode ?? credentialCode}
                  codeLabel={t('account.qr.cardCodeLabel')}
                  season={t('account.qr.cardSeason', { year: credentialSeasonYear })}
                  status={
                    membershipCurrent && primaryMeet
                      ? t('account.qr.unifiedStatus')
                      : t('account.membershipActive')
                  }
                  qrSrc={qrSrc}
                  qrAlt={t('account.qr.imageAlt')}
                  qrCaption={t('account.qr.cardScanHint')}
                  validUntil={validUntil ? t('account.qr.validUntil', { date: validUntil }) : null}
                  flipToBackLabel={t('account.qr.cardFlipToBack')}
                  flipToFrontLabel={t('account.qr.cardFlipToFront')}
                  flipAriaLabel={t('account.qr.cardFlipAria')}
                />
              </div>

              <div className="account-qr__preview-col">
                <p className="account-qr__preview-caption">{t('account.qr.scanPreviewCaption')}</p>
                <aside className="account-qr__preview" aria-label={t('account.qr.scanPreviewCaption')}>
                  <div className="account-qr__preview-verdict">
                    <CheckCircle2 size={18} aria-hidden />
                    <span>
                      {gateLabelKey ? t(gateLabelKey) : t('account.qr.scanPreviewVerdict')}
                    </span>
                  </div>
                  <p className="account-qr__preview-name">{athlete.fullName}</p>
                  {memberCode && <p className="account-qr__preview-code">{memberCode}</p>}
                  <dl className="account-qr__preview-rows">
                    <div>
                      <dt>{t('account.qr.scanPreviewMembership')}</dt>
                      <dd>
                        {membershipCurrent
                          ? t('account.membershipActive')
                          : t('account.qr.scanPreviewNoMembership')}
                      </dd>
                    </div>
                    {membershipCurrent && validUntil && (
                      <div>
                        <dt>{t('account.credential.expiration')}</dt>
                        <dd>{validUntil}</dd>
                      </div>
                    )}
                    {admittedRegistrations.map((registration) => (
                      <div key={registration.id ?? registration.eventSlug ?? registration.event}>
                        <dt>{t('account.qr.scanPreviewRegistration')}</dt>
                        <dd>
                          {registration.event
                            ? `${registration.event} · ${t('account.qr.scanPreviewRegistered')}`
                            : t('account.qr.scanPreviewRegistered')}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </aside>
                <button
                  type="button"
                  className="account-qr__share"
                  onClick={() => {
                    // En mobile el destino natural es una historia de
                    // Instagram; en desktop, el post cuadrado. El usuario
                    // puede cambiarlo dentro del modal.
                    const prefersStory =
                      typeof window !== 'undefined' &&
                      window.matchMedia('(max-width: 720px)').matches
                    setCardInitialFormat(prefersStory ? 'story' : 'square')
                    setModalOpen(true)
                  }}
                >
                  <Share2 size={15} aria-hidden />
                  {t('account.qr.shareAction')}
                </button>
                <p className="account-qr__share-hint">{t('account.qr.shareHint')}</p>
              </div>
            </div>
          )}

          {!showDual && (
            <CardPreviewModal
              open={modalOpen}
              onClose={() => setModalOpen(false)}
              cardData={cardData}
              initialFormat={cardInitialFormat}
            />
          )}
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
