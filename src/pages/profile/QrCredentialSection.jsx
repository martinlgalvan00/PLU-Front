import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Lock, Share2 } from 'lucide-react'
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

function QrSectionHeading({ title, eyebrow }) {
  return (
    <div className="account-section__heading account-section__heading--simple">
      <div>
        {eyebrow ? <span>{eyebrow}</span> : null}
        <h2>{title}</h2>
      </div>
    </div>
  )
}

export default function QrCredentialSection({
  athlete,
  membership,
  latestMembership = null,
  registrations = [],
  onNavigateSection,
  onNavigate,
}) {
  const { t, locale } = useI18n()
  const [modalOpen, setModalOpen] = useState(false)
  const [cardInitialFormat, setCardInitialFormat] = useState('square')
  const [qrSrc, setQrSrc] = useState(null)
  const [qrFailed, setQrFailed] = useState(false)
  const [mergeDone, setMergeDone] = useState(false)

  const memberCode = membership?.memberCode ?? latestMembership?.memberCode
  const credentialCode =
    athlete?.credentialToken ?? membership?.qrToken ?? latestMembership?.qrToken ?? memberCode
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

  const hasCredential =
    Boolean(credentialCode) && (membershipCurrent || admittedRegistrations.length > 0)
  const showDual = hasCredential && Boolean(primaryMeet) && !membershipCurrent
  const shouldPlayMerge =
    hasCredential &&
    membershipCurrent &&
    Boolean(membership?.id) &&
    Boolean(primaryMeet) &&
    !hasPlayedCredentialMerge(athlete?.id, membership.id) &&
    !mergeDone
  const qrBusy = hasCredential && !qrSrc && !qrFailed

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
      setQrFailed(false)
      return undefined
    }
    let cancelled = false
    setQrFailed(false)
    generateCredentialQr(buildAthleteCredentialUrl(credentialCode))
      .then((dataUrl) => {
        if (!cancelled) {
          setQrSrc(dataUrl)
          setQrFailed(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setQrSrc(null)
          setQrFailed(true)
        }
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
        variant:
          membershipCurrent && primaryMeet ? 'unified' : membershipCurrent ? 'membership' : 'event',
        eventSlug: primaryMeet?.eventSlug ?? 'afiliacion',
        eventTitle: primaryMeet?.event,
      }
    : null

  const credentialCard = (
    <CredentialCard
      eyebrow={t('account.credential.athlete')}
      name={athlete.fullName}
      code={memberCode ?? credentialCode}
      codeLabel={t('account.qr.cardCodeLabel')}
      season={t('account.qr.cardSeason', { year: credentialSeasonYear })}
      status={
        membershipCurrent && primaryMeet
          ? t('account.qr.unifiedStatus')
          : membershipCurrent
            ? t('account.membershipActive')
            : gateLabelKey
              ? t(gateLabelKey)
              : t('account.qr.meetPassMeta')
      }
      qrSrc={qrSrc}
      qrAlt={t('account.qr.imageAlt')}
      qrFailed={qrFailed}
      qrCaption={t('account.qr.cardScanHint')}
      validUntil={validUntil ? t('account.qr.validUntil', { date: validUntil }) : null}
      flipToBackLabel={t('account.qr.cardFlipToBack')}
      flipToFrontLabel={t('account.qr.cardFlipToFront')}
      flipAriaLabel={t('account.qr.cardFlipAria')}
    />
  )

  if (shouldPlayMerge) {
    return (
      <section id="account-qr" className="account-section account-section--celeste">
        <QrSectionHeading eyebrow={t('account.qr.eyebrow')} title={t('account.qr.title')} />
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
      <QrSectionHeading eyebrow={t('account.qr.eyebrow')} title={t('account.qr.title')} />

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
            <div className="account-qr account-qr--split account-qr--with-credential">
              <div className="account-qr__credential-col" aria-busy={qrBusy || undefined}>
                {credentialCard}
              </div>
              <div className="account-qr__preview-col">
                <p className="account-qr__preview-caption">{t('account.qr.membershipPassTitle')}</p>
                <aside
                  className="account-qr__convert"
                  aria-label={t('account.qr.membershipPassTitle')}
                >
                  {gateLabelKey ? (
                    <p
                      className={`account-qr__convert-status ${
                        gateReady
                          ? 'account-qr__convert-status--ready'
                          : 'account-qr__convert-status--reserved'
                      }`}
                    >
                      {t(gateLabelKey)}
                    </p>
                  ) : null}
                  <h3 className="account-qr__convert-event">
                    {primaryMeet?.event ?? t('account.qr.meetPassMeta')}
                  </h3>
                  <p className="account-qr__convert-meta">
                    {membershipForPass?.status === 'pendiente_pago'
                      ? t('account.qr.membershipPassPending')
                      : t('account.qr.scanPreviewNoMembership')}
                  </p>
                  {!gateReady && meetRequiresMembership ? (
                    <p className="account-qr__convert-note">{t('account.qr.gateBlockedNote')}</p>
                  ) : null}
                  {qrFailed ? (
                    <p className="account-qr__error">{t('account.qr.generateError')}</p>
                  ) : null}
                  <button
                    type="button"
                    className="account-primary-action"
                    onClick={() => onNavigateSection('account-membership')}
                  >
                    {t('pages.register.membershipRequiredAction')}
                  </button>
                </aside>
              </div>
            </div>
          ) : (
            <div className="account-qr account-qr--split account-qr--with-credential">
              <div className="account-qr__credential-col" aria-busy={qrBusy || undefined}>
                {credentialCard}
              </div>

              <div className="account-qr__preview-col">
                <p className="account-qr__preview-caption">{t('account.qr.scanPreviewCaption')}</p>
                <aside
                  className="account-qr__preview"
                  aria-label={t('account.qr.scanPreviewCaption')}
                >
                  <div className="account-qr__preview-verdict">
                    <CheckCircle2 size={16} aria-hidden />
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
                {qrFailed ? (
                  <p className="account-qr__error">{t('account.qr.generateError')}</p>
                ) : null}
                <button
                  type="button"
                  className="account-primary-action"
                  onClick={() => {
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
          <div className="account-qr__plate" aria-hidden="true">
            <span className="account-qr__plate-stripe" />
            <span className="account-qr__plate-grain" />
            <span className="account-qr__plate-watermark">PLU</span>
            <span className="account-qr__plate-frame" />
            <div className="account-qr__plate-body">
              <header className="account-qr__plate-head">
                <span className="account-qr__plate-mark">PLU</span>
                <span className="account-qr__plate-sub">Argentina</span>
              </header>
              <p className="account-qr__plate-status">
                <Lock size={14} strokeWidth={1.75} />
                {t('account.qr.emptyStatus')}
              </p>
            </div>
          </div>
          <div className="account-qr__issue">
            <h3 className="account-qr__issue-title">{t('account.qr.emptyTitle')}</h3>
            <p className="account-qr__issue-lead">{t('account.qr.empty')}</p>
            <button
              type="button"
              className="account-primary-action"
              onClick={() => onNavigateSection('account-membership')}
            >
              {t('account.qr.emptyAction')}
            </button>
            {onNavigate ? (
              <button
                type="button"
                className="account-empty__action"
                onClick={() => onNavigate('events')}
              >
                {t('account.qr.emptyCalendarAction')}
              </button>
            ) : null}
          </div>
        </div>
      )}
    </section>
  )
}
