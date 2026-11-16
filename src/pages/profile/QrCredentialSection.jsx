import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Box, Clock, Download, Lock, Share2 } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import CardPreviewModal from '../../components/ui/CardPreviewModal.jsx'
import ConfirmationSeal from '../../components/ui/ConfirmationSeal.jsx'
import CredentialCard from '../../components/ui/CredentialCard.jsx'
import CredentialMergeRitual from '../../components/ui/CredentialMergeRitual.jsx'
import EventPassList from './EventPassList.jsx'
import { supportsCredential3D } from '../../components/ui/credential3d/supportsCredential3D.js'
import { credentialDisplayCode } from '../../lib/credentialQr.js'
import { useAthleteCredentialQr } from '../../hooks/useAthleteCredentialQr.js'
import { hasCelebrated, markCelebrated } from '../../lib/celebration.js'
import { hasPlayedCredentialMerge } from '../../lib/credentialMerge.js'
import { describeAthleteCredential } from '../../lib/athleteCredential.js'
import { listEventPasses } from '../../lib/eventPass.js'
import { computeFinancingRemaining, formatFinancingCountdown } from '../../lib/financingCountdown.js'
import { formatShortDate, formatShortStamp } from '../../lib/format.js'
import { spokenMemberCode } from '../../../shared/spokenMemberCode.js'

// Three.js viaja en su propio chunk: solo se descarga al abrir la vista 3D.
const Credential3DViewer = lazy(
  () => import('../../components/ui/credential3d/Credential3DViewer.jsx'),
)

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

function CredentialStanding({
  createdAt,
  hasCredential,
  locale,
  memberCode,
  scans,
  t,
  waitingPayment,
}) {
  const createdLabel = createdAt ? formatShortStamp(createdAt, locale) : ''
  const lastScan = scans[0] ?? null
  const lastScanLabel = lastScan?.checkedInAt
    ? formatShortStamp(lastScan.checkedInAt, locale)
    : ''
  const habilitacion = hasCredential
    ? t('account.qr.standingEnabled')
    : waitingPayment
      ? t('account.qr.standingWaitingPayment')
      : t('account.qr.standingDisabled')
  const spoken = memberCode ? spokenMemberCode(memberCode, locale) : null

  return (
    <div className="account-qr__standing">
      {spoken ? (
        <p className="account-qr__verify">
          <span>{t('account.qr.verifyLabel')}</span>
          <strong>{spoken.display}</strong>
          <small>{t('account.qr.verifyHint', { words: spoken.utterance })}</small>
        </p>
      ) : memberCode ? (
        <p className="account-qr__verify">
          <span>{t('account.qr.verifyLabel')}</span>
          <strong>{memberCode}</strong>
          <small>{t('account.qr.verifyFallback')}</small>
        </p>
      ) : (
        <p className="account-qr__verify-pending">{t('account.qr.verifyPending')}</p>
      )}
      <dl>
        <div>
          <dt>{t('account.qr.standingAlta')}</dt>
          <dd>
            {createdLabel
              ? t('account.qr.standingAltaValue', { date: createdLabel })
              : t('account.qr.standingAltaReady')}
          </dd>
        </div>
        <div>
          <dt>{t('account.qr.standingAccess')}</dt>
          <dd>{habilitacion}</dd>
        </div>
        <div>
          <dt>{t('account.qr.standingScans')}</dt>
          <dd>
            {scans.length === 0
              ? t('account.qr.standingNoScans')
              : t(
                  `account.qr.standingScansValue_${scans.length === 1 ? 'one' : 'other'}`,
                  {
                    count: scans.length,
                    event: lastScan?.event ?? '',
                    date: lastScanLabel,
                  },
                )}
          </dd>
        </div>
      </dl>
    </div>
  )
}

export default function QrCredentialSection({
  athlete,
  membership,
  latestMembership = null,
  registrations = [],
  events = [],
  focusEventSlug = null,
  pendingFinancedPayment = null,
  onNavigateSection,
  onNavigate,
}) {
  const { t, locale } = useI18n()
  const [modalOpen, setModalOpen] = useState(false)
  const [cardInitialFormat, setCardInitialFormat] = useState('square')
  const [mergeDone, setMergeDone] = useState(false)
  const [can3d] = useState(supportsCredential3D)
  const [view3dOpen, setView3dOpen] = useState(false)
  // La decisión de mostrar el acuse de emisión se toma una sola vez, cuando el
  // código existe: la ráfaga marca la clave al dispararse, así que releer
  // `hasCelebrated` en cada render haría desaparecer el sello a mitad del
  // gesto que acaba de encender.
  const issueSealRef = useRef(null)

  const memberCode = membership?.memberCode ?? latestMembership?.memberCode
  const credential = describeAthleteCredential({
    athlete,
    membership,
    latestMembership,
    registrations,
    events,
    focusEventSlug,
  })
  const credentialCode = credential.credentialCode
  const displayCode = credentialDisplayCode(memberCode ?? credentialCode)
  const membershipCurrent = credential.membershipCurrent
  const membershipForPass = membershipCurrent ? membership : latestMembership
  const primaryMeet = credential.primaryMeet
  const admittedRegistrations = credential.admittedRegistrations
  const meetRequiresMembership = credential.meetRequiresMembership
  const gateReady = credential.gateReady
  const hasCredential = credential.hasCredential
  // Un renglón por evento con lo que va a decir la puerta (incluye pagos
  // pendientes, que antes caían en "Activá tu credencial" con un botón a la
  // afiliación aunque el evento no la pidiera).
  const passes = useMemo(
    () => listEventPasses(registrations, { membershipCurrent, events }),
    [events, membershipCurrent, registrations],
  )
  const scans = useMemo(
    () =>
      registrations
        .filter((item) => item.checkedInAt)
        .slice()
        .sort((a, b) => String(b.checkedInAt).localeCompare(String(a.checkedInAt))),
    [registrations],
  )
  const waitingPayment = passes.some(
    (pass) => pass.state === 'payment_pending' || pass.state === 'observed',
  )
  const qrFileName = `credencial-plu-${memberCode ?? 'atleta'}.png`
  const showDual = hasCredential && Boolean(primaryMeet) && !membershipCurrent
  const dualNote =
    membershipForPass?.status === 'pendiente_pago'
      ? t('account.qr.dualPendingNote')
      : gateReady
        ? t('account.qr.dualReadyNote')
        : meetRequiresMembership
          ? t('account.qr.gateBlockedNote')
          : t('account.qr.dualReservedNote')
  const shouldPlayMerge =
    hasCredential &&
    membershipCurrent &&
    Boolean(membership?.id) &&
    Boolean(primaryMeet) &&
    !hasPlayedCredentialMerge(athlete?.id, membership.id) &&
    !mergeDone
  const { qrSrc, qrFailed, qrBusy } = useAthleteCredentialQr(
    hasCredential ? credentialCode : null,
  )

  // La credencial ya sale habilitada por financiamiento (afiliación 'activa',
  // inscripción 'confirmada'), pero ese derecho sigue provisorio mientras
  // Finanzas no acredite el pago: sin este cartel la pantalla prometía un
  // beneficio incondicional que el cron puede dar de baja solo si vence el
  // plazo (`expire_financed_payment_orders`, 20260922100000).
  const financingRemaining = pendingFinancedPayment
    ? computeFinancingRemaining(pendingFinancedPayment.financedPaymentDueAt)
    : null
  const financingCountdownLabel = financingRemaining
    ? formatFinancingCountdown(financingRemaining, t)
    : ''

  /* ── El momento en que la credencial existe ──
     Antes la persona pagaba la afiliación, volvía a su cuenta y encontraba el
     QR ya puesto, como si siempre hubiera estado ahí: el trámite más
     importante de la temporada no tenía acuse en la pantalla donde queda el
     objeto. Acá la emisión se sella una vez —clave por atleta y por código,
     así que una renovación con código nuevo vuelve a sellarse— y el papel sale
     recién cuando el QR está dibujado de verdad, no mientras se genera. */
  const credentialIssueKey =
    athlete?.id && credentialCode ? `credential.${athlete.id}.${credentialCode}` : null

  if (issueSealRef.current === null && credentialIssueKey) {
    issueSealRef.current = !hasCelebrated(credentialIssueKey)
  }

  const showIssueSeal = hasCredential && Boolean(qrSrc) && issueSealRef.current === true

  const validUntil = membership?.expirationDate
    ? formatShortDate(membership.expirationDate, locale)
    : null
  const credentialSeasonYear =
    membership?.year ??
    membership?.startDate?.slice(0, 4) ??
    membership?.expirationDate?.slice(0, 4) ??
    String(new Date().getFullYear())

  /* El ritual de unificación ya es el festejo de esta credencial: sin esto, al
     terminar la fusión el componente volvía a la vista normal y el sello de
     emisión disparaba una segunda ráfaga a los dos segundos de la primera. */
  useEffect(() => {
    if (!shouldPlayMerge || !credentialIssueKey) return
    issueSealRef.current = false
    markCelebrated(credentialIssueKey)
  }, [credentialIssueKey, shouldPlayMerge])

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

  const cardStatus = t(credential.statusKey)
  // Lo mismo que la credencial plana, para la vista 3D (memo: la escena se
  // vuelve a armar si cambia el objeto).
  const card3d = useMemo(
    () => ({
      eyebrow: t('account.credential.athlete'),
      name: athlete?.fullName ?? '',
      code: displayCode ?? '',
      codeLabel: t('account.qr.cardCodeLabel'),
      season: t('account.qr.cardSeason', { year: credentialSeasonYear }),
      status: cardStatus,
      qrSrc,
      qrCaption: t('account.qr.cardScanHint'),
    }),
    [athlete?.fullName, cardStatus, credentialSeasonYear, displayCode, qrSrc, t],
  )
  const view3dButton =
    can3d && qrSrc ? (
      <button className="account-qr__view3d" type="button" onClick={() => setView3dOpen(true)}>
        <Box aria-hidden size={15} strokeWidth={1.8} />
        {t('account.qr.view3d')}
      </button>
    ) : null

  const credentialCard = (
    <CredentialCard
      eyebrow={t('account.credential.athlete')}
      name={athlete.fullName}
      code={displayCode}
      codeLabel={t('account.qr.cardCodeLabel')}
      season={t('account.qr.cardSeason', { year: credentialSeasonYear })}
      status={cardStatus}
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
                  {view3dButton}
                </div>
                <aside
                  className="account-qr__aside"
                  aria-label={t('account.qr.membershipPassTitle')}
                >
                  <h3 className="account-qr__aside-title">
                    {primaryMeet?.event ?? t('account.qr.meetPassMeta')}
                  </h3>
                  <p className="account-qr__aside-note">{dualNote}</p>
                  <CredentialStanding
                    createdAt={athlete?.createdAt}
                    hasCredential
                    locale={locale}
                    memberCode={memberCode ?? ''}
                    scans={scans}
                    t={t}
                    waitingPayment={false}
                  />
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
            ) : (
              <div className="account-qr account-qr--split account-qr--with-credential">
                <div className="account-qr__credential-col" aria-busy={qrBusy || undefined}>
                  {credentialCard}
                  {view3dButton}
                </div>

                <div className="account-qr__preview-col">
                  <CredentialStanding
                    createdAt={athlete?.createdAt}
                    hasCredential
                    locale={locale}
                    memberCode={memberCode ?? displayCode ?? ''}
                    scans={scans}
                    t={t}
                    waitingPayment={false}
                  />
                  <p className="account-qr__aside-note">{t('account.qr.scanPreviewCaption')}</p>
                  <dl className="account-qr__facts">
                    <div>
                      <dt>{t('account.qr.scanPreviewMembership')}</dt>
                      <dd>
                        {membershipCurrent
                          ? t('account.membershipActive')
                          : t('account.qr.scanPreviewNoMembership')}
                      </dd>
                    </div>
                    {membershipCurrent && validUntil ? (
                      <div>
                        <dt>{t('account.credential.expiration')}</dt>
                        <dd>{validUntil}</dd>
                      </div>
                    ) : null}
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
                  {qrSrc ? (
                    <>
                      <a className="account-qr__share" download={qrFileName} href={qrSrc}>
                        <Download size={15} aria-hidden />
                        {t('account.qr.saveQr')}
                      </a>
                      <p className="account-qr__share-hint">{t('account.qr.saveQrHint')}</p>
                    </>
                  ) : null}
                </div>
              </div>
            )}

            {showIssueSeal ? (
              <ConfirmationSeal
                className="account-qr__issued-seal"
                variant="membership"
                celebrate
                celebrateKey={credentialIssueKey ?? undefined}
                haptic={false}
                eyebrow={t('account.qr.sealIssuedEyebrow')}
                seal={memberCode ?? undefined}
                title={t('account.qr.sealIssuedTitle')}
                detail={
                  validUntil
                    ? t('account.qr.validUntil', { date: validUntil })
                    : t('account.qr.sealIssuedDetail')
                }
              />
            ) : null}

            {!showDual && (
              <CardPreviewModal
                open={modalOpen}
                onClose={() => setModalOpen(false)}
                cardData={cardData}
                initialFormat={cardInitialFormat}
              />
            )}

            {view3dOpen ? (
              <Suspense fallback={null}>
                <Credential3DViewer card={card3d} onClose={() => setView3dOpen(false)} />
              </Suspense>
            ) : null}

            <EventPassList
              events={events}
              memberCode={memberCode ?? ''}
              onNavigateSection={onNavigateSection}
              passes={
                showDual
                  ? passes.filter((pass) => pass.registration !== primaryMeet)
                  : passes
              }
            />

            {financingCountdownLabel ? (
              <p className="account-qr__financing-note" role="status">
                <Clock size={15} aria-hidden />
                <span>{financingCountdownLabel}</span>
              </p>
            ) : null}
        </>
      ) : (
        <>
        <div className="account-qr account-qr--locked">
          <div
            className={`account-qr__plate${waitingPayment ? '' : ' account-qr__plate--draft'}`}
            aria-hidden="true"
          >
            <span className="account-qr__plate-stripe" />
            <span className="account-qr__plate-grain" />
            <span className="account-qr__plate-watermark">PLU</span>
            <span className="account-qr__plate-frame" />
            <div className="account-qr__plate-body">
              <header className="account-qr__plate-head">
                <span className="account-qr__plate-mark">PLU</span>
                {waitingPayment ? (
                  <span className="account-qr__plate-sub">Argentina</span>
                ) : (
                  <span className="account-qr__plate-badge">{t('account.qr.emptyPlateBadge')}</span>
                )}
              </header>
              {waitingPayment ? (
                <p className="account-qr__plate-status">
                  <Lock size={14} strokeWidth={1.75} />
                  {t('account.qr.pendingPlateStatus')}
                </p>
              ) : (
                <div className="account-qr__plate-identity">
                  <p className="account-qr__plate-name">{athlete?.fullName}</p>
                  <p className="account-qr__plate-status">{t('account.qr.emptyStatus')}</p>
                </div>
              )}
            </div>
          </div>
          <div className="account-qr__issue">
            <h3 className="account-qr__issue-title">
              {waitingPayment ? t('account.qr.pendingTitle') : t('account.qr.emptyTitle')}
            </h3>
            <p className="account-qr__issue-lead">
              {waitingPayment ? t('account.qr.pendingLead') : t('account.qr.empty')}
            </p>
            <button
              type="button"
              className="account-primary-action"
              onClick={() =>
                onNavigateSection(waitingPayment ? 'account-payments' : 'account-membership')
              }
            >
              {waitingPayment ? t('account.qr.pendingAction') : t('account.qr.emptyAction')}
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
          <CredentialStanding
            createdAt={athlete?.createdAt}
            hasCredential={false}
            locale={locale}
            memberCode={memberCode ?? ''}
            scans={scans}
            t={t}
            waitingPayment={waitingPayment}
          />
        </div>
        <EventPassList
          events={events}
          memberCode={memberCode ?? ''}
          onNavigateSection={onNavigateSection}
          passes={passes}
        />
        </>
      )}
    </section>
  )
}
