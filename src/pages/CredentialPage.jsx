import { useCallback, useState } from 'react'
import '../styles/pages/credential.css'
import { AlertTriangle, CheckCircle2, HelpCircle, RefreshCw, WifiOff, XCircle } from 'lucide-react'
import { BRAND } from '../lib/brand.js'
import { documentKind, formatShortDate, initials } from '../lib/format.js'
import { formatScheduleSummary, formatSessionDetail } from '../lib/eventSchedule.js'
import { getStatusMeta, isGateAccessReady, isRegistrationAdmitted } from '../lib/status.js'
import { isPreviewCredentialCode } from '../lib/credentialQr.js'
import { useCredentialVerification } from '../hooks/useCredentialVerification.js'
import { useContent } from '../hooks/useContent.js'
import { useI18n } from '../i18n/I18nProvider.jsx'
import { formatCacheAge } from '../services/credentialCache.js'
import { verifyTicketByQrToken } from '../services/ticketApi.js'
import { getMembershipByCodeOrToken } from '../services/athleteApi.js'
import { isMembershipCurrent } from '../services/membershipService.js'

const VERDICT_META = {
  valid: {
    Icon: CheckCircle2,
    label: 'Credencial válida',
    className: 'credential-page__verdict--valid',
  },
  warning: {
    Icon: HelpCircle,
    label: 'Revisar antes de ingresar',
    className: 'credential-page__verdict--warning',
  },
  unknown: {
    Icon: HelpCircle,
    label: 'Sin datos suficientes',
    className: 'credential-page__verdict--warning',
  },
  invalid: {
    Icon: XCircle,
    label: 'Credencial no válida',
    className: 'credential-page__verdict--invalid',
  },
  used: {
    Icon: AlertTriangle,
    label: 'Entrada ya utilizada',
    className: 'credential-page__verdict--invalid',
  },
  // Sin respuesta del backend. Deliberadamente NO es "inválida": el estado de
  // esta credencial es desconocido, y decir otra cosa hace que la puerta
  // rechace a alguien por un problema de red.
  offline: {
    Icon: WifiOff,
    label: 'No se pudo verificar',
    className: 'credential-page__verdict--offline',
  },
}

const dateTime = new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' })
const timeOnly = new Intl.DateTimeFormat('es-AR', { timeStyle: 'short' })

/**
 * Estructura fantasma del panel mientras se resuelve la primera verificación.
 * Estática a propósito: la fila ya está esperando y un skeleton animado no
 *informa nada que la fila necesite saber. Su trabajo es sostener el alto del
 * panel para que el veredicto no llegue con un salto de layout.
 */
function VerificationSkeleton() {
  return (
    <div className="credential-page__body credential-page__body--loading" aria-hidden>
      <div className="credential-page__identity-hero">
        <span className="credential-page__ghost credential-page__ghost--photo" />
        <div className="credential-page__identity-hero-copy">
          <span className="credential-page__ghost credential-page__ghost--name" />
          <span className="credential-page__ghost credential-page__ghost--code" />
        </div>
      </div>
      <div className="credential-page__ghost credential-page__ghost--schedule" />
      <span className="credential-page__ghost credential-page__ghost--row" />
      <span className="credential-page__ghost credential-page__ghost--row credential-page__ghost--row--short" />
      <span className="credential-page__ghost credential-page__ghost--row credential-page__ghost--row--mid" />
      <span className="credential-page__ghost credential-page__ghost--action" />
    </div>
  )
}

/** Edad civil a hoy, para cotejar el documento sin forzar cálculo mental. */
function ageFromBirthDate(iso) {
  if (!iso) return null
  const birth = new Date(`${String(iso).slice(0, 10)}T12:00:00`)
  if (Number.isNaN(birth.getTime())) return null
  const now = new Date()
  let age = now.getFullYear() - birth.getFullYear()
  const monthDelta = now.getMonth() - birth.getMonth()
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < birth.getDate())) age -= 1
  return age >= 0 && age < 130 ? age : null
}

/**
 * CredentialPage — PLU ARG
 *
 * Página pública de verificación: a donde apunta el QR impreso en la card de
 * inscripción/afiliación/entrada. Pensada para que el personal de un evento o
 * establecimiento la abra escaneando con la cámara del celular, sin apps ni
 * login, y vea de un vistazo si la credencial es válida — y, en el caso de
 * entradas o inscripciones, para marcar el ingreso ahí mismo y agilizar la
 * fila en la puerta.
 *
 * El orden de lectura está fijado por lo que se resuelve en la puerta:
 * veredicto → persona (foto) → identidad etiquetada → cuándo compite → estados →
 * acción. El bloque de grilla es el único con escala propia porque es el dato
 * por el que se escanea.
 *
 * Tanto las entradas (tickets) como las credenciales de socio/inscripción
 * hablan con el backend real (Supabase, ver athleteApi.js/ticketApi.js), así
 * que cualquier dispositivo que escanee el QR ve el estado verdadero. El
 * check-in en sí (marcar ingreso desde este botón) requiere que el
 * navegador que escanea tenga una sesión de staff activa — si quien escanea
 * no está logueado, esta página igual muestra el estado, solo que sin el
 * botón de acción (ver server/services/supabaseAuthBridge.js).
 *
 * Props:
 *   code                  string  — código leído del QR (memberCode/qrToken)
 *   eventSlug             string? — slug del evento, si el QR era de una inscripción
 *   type                  string? — 'ticket' para entradas generales; si no, se busca
 *                                   entre membresías/inscripciones
 *   onCheckIn             (qrToken: string) => Promise<{outcome, ticket?}> — entradas
 *   onCheckInRegistration (registrationId: string) => Promise<{outcome, registration?}>
 */
export default function CredentialPage({
  code,
  eventSlug,
  type,
  onCheckIn,
  onCheckInRegistration,
}) {
  if (isPreviewCredentialCode(code)) {
    return <PreviewCredentialEasterEgg code={code} />
  }

  if (type === 'ticket') {
    return <TicketCredential code={code} onCheckIn={onCheckIn} />
  }

  return (
    <MembershipCredential code={code} eventSlug={eventSlug} onCheckIn={onCheckInRegistration} />
  )
}

/**
 * Easter egg de showcase: códigos PREV-* (Members / Home / demos).
 * Misma cáscara que la verificación real, sin pegarle al backend ni ofrecer check-in.
 */
function PreviewCredentialEasterEgg({ code }) {
  const { t } = useI18n()
  const { MEMBERSHIP_CREDENTIAL_SAMPLE } = useContent()
  const athleteName = MEMBERSHIP_CREDENTIAL_SAMPLE.athlete
  const memberCode = MEMBERSHIP_CREDENTIAL_SAMPLE.affiliateCode
  const season = MEMBERSHIP_CREDENTIAL_SAMPLE.season
  const status =
    MEMBERSHIP_CREDENTIAL_SAMPLE.status || t('pages.credentialScan.previewMembershipStatus')

  return (
    <CredentialShell
      verdictIcon={CheckCircle2}
      verdictMeta={t('pages.credentialScan.previewVerdictMeta')}
      verdictLabel={t('pages.credentialScan.previewVerdictStatus')}
      verdictClass="credential-page__verdict--valid"
      brandMark={t('pages.credentialScan.brandMark')}
      backHomeLabel={t('pages.credentialScan.backHome')}
    >
      <div className="credential-page__body credential-page__body--preview">
        <aside className="credential-page__preview-banner" role="note">
          <p className="credential-page__preview-banner-title">
            {t('pages.credentialScan.previewBannerTitle')}
          </p>
          <p className="credential-page__preview-banner-body">
            {t('pages.credentialScan.previewBannerBody')}
          </p>
        </aside>

        <div className="credential-page__identity-hero">
          <AthletePortrait name={athleteName} photoUrl={null} />
          <div className="credential-page__identity-hero-copy">
            <p className="credential-page__athlete-eyebrow">
              {t('pages.credentialScan.previewAthleteLabel')}
            </p>
            <p className="credential-page__athlete-name">{athleteName}</p>
            <p className="credential-page__member-code">
              <span className="credential-page__member-code-label">
                {t('pages.credentialScan.previewMemberCodeLabel')}
              </span>
              <span className="credential-page__member-code-value">{memberCode}</span>
            </p>
          </div>
        </div>

        <dl className="credential-page__rows">
          <div className="credential-page__row">
            <dt>{t('pages.credentialScan.previewMembershipLabel')}</dt>
            <dd>
              <span className="status-pill status-pill--success">{status}</span>
              {season ? <span className="credential-page__row-meta">{season}</span> : null}
            </dd>
          </div>
        </dl>

        <p className="credential-page__preview-meta">
          <span className="credential-page__preview-meta-label">
            {t('pages.credentialScan.previewCodeLabel')}
          </span>
          <span className="credential-page__preview-meta-value">{code}</span>
        </p>

        <p className="credential-page__preview-footnote">
          {t('pages.credentialScan.previewNoCheckIn')}
        </p>
      </div>
    </CredentialShell>
  )
}

/**
 * Foto o iniciales para cotejar en la puerta. La foto solo llega cuando el QR
 * era un token y el atleta la cargó; si no, las iniciales sostienen la fila.
 */
function AthletePortrait({ name, photoUrl }) {
  return (
    <span className={`credential-page__photo${photoUrl ? ' has-photo' : ''}`} aria-hidden>
      {photoUrl ? <img src={photoUrl} alt="" /> : initials(name)}
    </span>
  )
}

/**
 * Hechos de identidad para cotejar contra el documento físico.
 * Cada dato va etiquetado en su propia fila: un DNI o un número de socio
 * metido en una línea mono no se lee bien con el celular a contraluz.
 * Documento y nacimiento solo llegan cuando el QR era un token no adivinable.
 */
function IdentityFacts({ facts }) {
  if (!facts.length) return null

  return (
    <dl className="credential-page__identity">
      {facts.map(({ label, value, hint, mono = true }) => (
        <div className="credential-page__identity-item" key={label}>
          <dt>{label}</dt>
          <dd>
            <span
              className={
                mono
                  ? 'credential-page__identity-value credential-page__identity-value--mono'
                  : 'credential-page__identity-value'
              }
            >
              {value}
            </span>
            {hint ? <span className="credential-page__identity-hint">{hint}</span> : null}
          </dd>
        </div>
      ))}
    </dl>
  )
}

function buildAthleteIdentityFacts(athlete) {
  const facts = []
  if (athlete?.documentId) {
    // El tipo va en la etiqueta para que el operador sepa qué documento
    // físico pedir: DNI para el padrón argentino, ID/pasaporte para el resto.
    const kind = documentKind(athlete.documentId)
    facts.push({ label: kind === 'DNI' ? 'DNI' : 'ID / Pasaporte', value: athlete.documentId })
  }
  if (athlete?.birthDate) {
    const age = ageFromBirthDate(athlete.birthDate)
    facts.push({
      label: 'Nacimiento',
      value: formatShortDate(String(athlete.birthDate).slice(0, 10)),
      hint: age != null ? `${age} años` : null,
      mono: false,
    })
  }
  return facts
}

/**
 * Cuándo compite esa persona — el dato por el que se escanea, así que es la
 * única pieza de la pantalla con escala propia.
 *
 * Mientras la organización no arma la grilla se dice explícitamente "a
 * confirmar" y se cae a la fecha del evento: dejar el renglón vacío haría
 * parecer que la credencial está incompleta cuando en realidad está al día.
 */
function ScheduleBlock({ registration, showEventTitle = false }) {
  const summary = formatScheduleSummary(registration.schedule)
  const eventDate = registration.eventStartsAt
    ? formatShortDate(String(registration.eventStartsAt).slice(0, 10))
    : ''
  const eventTitle = showEventTitle && registration.event ? registration.event : null
  const categoryLine = [registration.category, registration.division].filter(Boolean).join(' · ')

  if (!summary) {
    return (
      <div className="credential-page__schedule-block credential-page__schedule-block--pending">
        <span className="credential-page__schedule-eyebrow">Compite</span>
        {eventTitle ? <p className="credential-page__schedule-event">{eventTitle}</p> : null}
        <p className="credential-page__schedule-day">
          Día a confirmar{eventDate ? ` · ${eventDate}` : ''}
        </p>
        {categoryLine ? <p className="credential-page__schedule-detail">{categoryLine}</p> : null}
      </div>
    )
  }

  const detail = formatSessionDetail(registration.schedule)

  return (
    <div className="credential-page__schedule-block">
      <span className="credential-page__schedule-eyebrow">Compite</span>
      {eventTitle ? <p className="credential-page__schedule-event">{eventTitle}</p> : null}
      <p className="credential-page__schedule-day">{summary}</p>
      {(detail || categoryLine) && (
        <p className="credential-page__schedule-detail">
          {[detail, categoryLine].filter(Boolean).join(' · ')}
        </p>
      )}
    </div>
  )
}

function MembershipCredential({ code, eventSlug, onCheckIn }) {
  const [checkingIn, setCheckingIn] = useState(false)
  const [checkInError, setCheckInError] = useState(null)

  const verify = useCallback((value) => getMembershipByCodeOrToken(value, eventSlug), [eventSlug])
  const { phase, data, cache, retry, retrying, patchData, verifiedAt } = useCredentialVerification(
    verify,
    {
      code,
      eventSlug,
    },
  )

  if (phase === 'loading') {
    return (
      <CredentialShell
        verdictIcon={HelpCircle}
        verdictLabel="Verificando…"
        verdictClass="credential-page__verdict--warning"
      >
        <VerificationSkeleton />
      </CredentialShell>
    )
  }

  // Sin respuesta del backend y sin nada cacheado. No sabemos si la credencial
  // vale: decir "inválida" acá haría que la puerta rechace a alguien por un
  // problema de red, así que se ofrece el código para cotejar a mano.
  if (phase === 'unverifiable') {
    const { Icon, label, className } = VERDICT_META.offline
    return (
      <CredentialShell verdictIcon={Icon} verdictLabel={label} verdictClass={className}>
        <UnverifiableBody code={code} onRetry={retry} retrying={retrying} />
      </CredentialShell>
    )
  }

  // La afiliación ya no es condición para que la credencial exista: un atleta
  // inscripto a un evento que no la exige también tiene QR, y su veredicto lo
  // da la inscripción. Lo único imprescindible es que el código resuelva a
  // alguien.
  if (phase === 'not_found' || !data?.athlete) {
    const { Icon, label, className } = VERDICT_META.invalid
    return (
      <CredentialShell verdictIcon={Icon} verdictLabel={label} verdictClass={className}>
        <NotFoundBody code={code} />
      </CredentialShell>
    )
  }

  const isStale = phase === 'stale'
  const { athlete, membership, registration, registrations = [] } = data
  // El status de la membresía en la base puede estar desactualizado si el
  // cron que la pasa a "vencida" no corrió (ver expire_memberships()) --
  // no confiamos solo en el campo cacheado, comparamos la fecha en vivo
  // contra "ahora" para que el veredicto en la puerta sea siempre correcto.
  const membershipCurrent = isMembershipCurrent(membership)
  const membershipExpiredLive =
    Boolean(membership?.expirationDate) && new Date(membership.expirationDate) < new Date()
  const membershipMeta = membership
    ? getStatusMeta(membershipExpiredLive ? 'vencida' : membership.status)
    : null
  const registrationMeta = registration ? getStatusMeta(registration.status) : null
  // Inscripciones a mostrar cuando el QR se escaneó sin `?evento=`: antes ese
  // caso no traía ninguna y la puerta se quedaba sin nada que hacer.
  const otherRegistrations = eventSlug ? [] : registrations

  const registrationRequiresMembership = Boolean(registration?.requiresMembership)
  const gateReady = registration
    ? isGateAccessReady({
        registrationStatus: registration.status,
        requiresMembership: registrationRequiresMembership,
        membershipCurrent,
      })
    : false

  // Veredicto general que se muestra arriba de todo, grande, para un
  // vistazo rápido. Si el meet exige afiliación y todavía no está vigente,
  // baja a "revisar" aunque la inscripción figure confirmada.
  let verdict = 'unknown'
  if (eventSlug) {
    const registrationOk = registration && registrationMeta.tone === 'success'
    if (registrationOk && gateReady) {
      verdict = 'valid'
    } else if (registration) {
      verdict = 'warning'
    } else {
      verdict = 'unknown'
    }
  } else if (membershipMeta?.tone === 'success' && membershipCurrent) {
    verdict = 'valid'
  } else if (otherRegistrations.some((item) => getStatusMeta(item.status).tone === 'success')) {
    verdict = 'valid'
  } else {
    verdict = 'warning'
  }

  // Con datos diferidos el veredicto no puede presentarse como fresco: se
  // baja a "revisar" y la franja de arriba explica por qué.
  const {
    Icon,
    label: verdictLabel,
    className: verdictClass,
  } = isStale ? VERDICT_META.offline : VERDICT_META[verdict]

  // Marcar ingreso escribe en el backend. Sin verificación fresca no se ofrece:
  // aceptar el toque y perderlo es peor que decir que ahora no se puede.
  // Además, si el meet exige afiliación, no ofrecemos el botón hasta que esté
  // vigente — misma política que `staff_check_in_registration`.
  const isCheckInable = (item) =>
    Boolean(onCheckIn) &&
    !isStale &&
    Boolean(item) &&
    !item.checkedInAt &&
    isGateAccessReady({
      registrationStatus: item.status,
      requiresMembership: Boolean(item.requiresMembership),
      membershipCurrent,
    })
  const canCheckIn = isCheckInable(registration)

  const membershipMetaLine = membership
    ? [
        membership.year ? `Período ${membership.year}` : null,
        membership.startDate ? `Desde ${formatShortDate(membership.startDate)}` : null,
        membership.expirationDate ? `Hasta ${formatShortDate(membership.expirationDate)}` : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : ''

  async function handleCheckIn(target = registration) {
    setCheckingIn(true)
    setCheckInError(null)

    let result
    try {
      result = await onCheckIn(target.id)
    } catch {
      result = null
    }
    setCheckingIn(false)

    if (result?.outcome === 'ok') {
      patchData((current) => ({
        ...current,
        registration:
          current.registration?.id === target.id
            ? { ...current.registration, checkedInAt: result.registration.checkedInAt }
            : current.registration,
        registrations: (current.registrations ?? []).map((item) =>
          item.id === target.id ? { ...item, checkedInAt: result.registration.checkedInAt } : item,
        ),
      }))
      return
    }

    // El backend es la autoridad -- si otro dispositivo lo escaneó primero
    // (o cualquier otro desacuerdo), volvemos a pedir el estado real en vez
    // de asumir nada del lado del cliente. Si tampoco se puede releer, se dice:
    // un ingreso que quizá no quedó registrado tiene que verse.
    setCheckInError(
      result?.message ?? 'No se pudo confirmar el ingreso. Reintentá o anotalo a mano.',
    )
    void retry()
  }

  return (
    <CredentialShell
      verdictIcon={Icon}
      verdictLabel={verdictLabel}
      verdictClass={verdictClass}
      code={code}
      verifiedAt={verifiedAt}
    >
      <div className="credential-page__body">
        {isStale && <StaleNotice cache={cache} onRetry={retry} retrying={retrying} />}

        <div className="credential-page__identity-hero">
          <AthletePortrait name={athlete.fullName} photoUrl={athlete.photoUrl} />
          <div className="credential-page__identity-hero-copy">
            <p className="credential-page__athlete-name">{athlete.fullName}</p>
            {membership?.memberCode ? (
              <p className="credential-page__member-code">
                <span className="credential-page__member-code-label">Nº de socio</span>
                <span className="credential-page__member-code-value">{membership.memberCode}</span>
              </p>
            ) : null}
          </div>
        </div>

        <IdentityFacts facts={buildAthleteIdentityFacts(athlete)} />

        {/* Escaneo con evento: la grilla de esa inscripción manda. */}
        {eventSlug && registration && <ScheduleBlock registration={registration} showEventTitle />}

        <dl className="credential-page__rows">
          <div className="credential-page__row">
            <dt>Afiliación</dt>
            <dd>
              {membership ? (
                <>
                  <span className={`status-pill status-pill--${membershipMeta.tone}`}>
                    {membershipMeta.label}
                  </span>
                  {membershipMetaLine ? (
                    <span className="credential-page__row-meta">{membershipMetaLine}</span>
                  ) : null}
                </>
              ) : (
                <span className="credential-page__row-meta">Sin afiliación registrada</span>
              )}
            </dd>
          </div>

          {eventSlug && (
            <div className="credential-page__row">
              <dt>Inscripción</dt>
              <dd>
                {registration ? (
                  <>
                    <span className={`status-pill status-pill--${registrationMeta.tone}`}>
                      {registrationMeta.label}
                    </span>
                    <span className="credential-page__row-meta">
                      {[registration.event, registration.category, registration.division]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </>
                ) : (
                  <span className="credential-page__row-meta">
                    Sin inscripción registrada a este evento
                  </span>
                )}
              </dd>
            </div>
          )}

          {registration?.checkedInAt && (
            <div className="credential-page__row">
              <dt>Ingreso</dt>
              <dd>
                <span className="credential-page__row-value">
                  {dateTime.format(new Date(registration.checkedInAt))}
                </span>
              </dd>
            </div>
          )}
        </dl>

        {/* Escaneo sin evento en la URL: se listan las inscripciones vigentes
            para que el operador vea a cuál corresponde el ingreso. */}
        {otherRegistrations.length > 0 && (
          <>
            <p className="credential-page__section-label">
              {otherRegistrations.some((item) => item.upcoming) ? 'Participación' : 'Último torneo'}
            </p>
            <div className="credential-page__rows">
              {otherRegistrations.map((item) => {
                const meta = getStatusMeta(item.status)
                return (
                  <div className="credential-page__entry" key={item.id}>
                    <div className="credential-page__entry-head">
                      <p className="credential-page__entry-title">{item.event ?? 'Inscripción'}</p>
                      <span className={`status-pill status-pill--${meta.tone}`}>{meta.label}</span>
                    </div>
                    <ScheduleBlock registration={item} />
                    {item.checkedInAt ? (
                      <p className="credential-page__row-meta">
                        Ingreso registrado {dateTime.format(new Date(item.checkedInAt))}
                      </p>
                    ) : isCheckInable(item) ? (
                      <button
                        type="button"
                        className="credential-page__checkin-btn credential-page__checkin-btn--inline"
                        onClick={() => handleCheckIn(item)}
                        disabled={checkingIn}
                      >
                        <CheckCircle2 size={15} aria-hidden />
                        {checkingIn ? 'Marcando…' : 'Marcar ingreso'}
                      </button>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </>
        )}

        {checkInError && (
          <p className="credential-page__alert" role="alert">
            {checkInError}
          </p>
        )}

        {eventSlug &&
          registration &&
          isRegistrationAdmitted(registration.status) &&
          registrationRequiresMembership &&
          !membershipCurrent &&
          !registration.checkedInAt && (
            <p className="credential-page__alert" role="status">
              Cupo reservado. Falta afiliación activa para habilitar el ingreso.
            </p>
          )}

        {canCheckIn && (
          <button
            type="button"
            className="credential-page__checkin-btn"
            onClick={() => handleCheckIn(registration)}
            disabled={checkingIn}
          >
            <CheckCircle2 size={17} aria-hidden />
            {checkingIn ? 'Marcando…' : 'Marcar ingreso'}
          </button>
        )}
      </div>
    </CredentialShell>
  )
}

/**
 * Franja de datos diferidos. Va arriba de todo y con su antigüedad explícita:
 * el operador tiene que poder juzgar si ese dato todavía sirve, y saber que
 * lo que ve no se acaba de confirmar contra el backend.
 */
function StaleNotice({ cache, onRetry, retrying }) {
  return (
    <div className="credential-page__notice" role="status">
      <WifiOff size={16} aria-hidden />
      <div>
        <p className="credential-page__notice-title">Sin conexión con PLU ARG</p>
        <p className="credential-page__notice-text">
          Última verificación {formatCacheAge(cache?.ageMs ?? 0)}. Puede haber cambiado.
        </p>
      </div>
      <button
        type="button"
        className="credential-page__retry"
        onClick={onRetry}
        disabled={retrying}
      >
        <RefreshCw size={14} aria-hidden className={retrying ? 'is-spinning' : undefined} />
        {retrying ? 'Reintentando…' : 'Reintentar'}
      </button>
    </div>
  )
}

/**
 * No hubo respuesta y no había nada cacheado. El estado de la credencial es
 * desconocido, no inválido: se da el código completo para cotejar contra la
 * planilla y se deja el reintento a mano.
 */
function UnverifiableBody({ code, onRetry, retrying }) {
  return (
    <div className="credential-page__body">
      <p className="credential-page__empty-title">No pudimos contactar al servidor</p>
      <p className="credential-page__empty-text">
        Esto <strong>no</strong> significa que la credencial sea inválida: no se pudo comprobar.
        Verificá este código contra la planilla del evento antes de decidir.
      </p>

      <p className="credential-page__code-callout">{code}</p>

      <button
        type="button"
        className="credential-page__checkin-btn"
        onClick={onRetry}
        disabled={retrying}
      >
        <RefreshCw size={16} aria-hidden className={retrying ? 'is-spinning' : undefined} />
        {retrying ? 'Reintentando…' : 'Reintentar'}
      </button>
    </div>
  )
}

function TicketCredential({ code, onCheckIn }) {
  const [checkingIn, setCheckingIn] = useState(false)
  const [checkInError, setCheckInError] = useState(null)

  const verify = useCallback(async (value) => (await verifyTicketByQrToken(value)).ticket, [])
  const {
    phase,
    data: ticket,
    cache,
    retry,
    retrying,
    patchData,
    verifiedAt,
  } = useCredentialVerification(verify, { code })

  if (phase === 'loading') {
    return (
      <CredentialShell
        verdictIcon={HelpCircle}
        verdictLabel="Verificando…"
        verdictClass="credential-page__verdict--warning"
      >
        <VerificationSkeleton />
      </CredentialShell>
    )
  }

  if (phase === 'unverifiable') {
    const { Icon, label, className } = VERDICT_META.offline
    return (
      <CredentialShell verdictIcon={Icon} verdictLabel={label} verdictClass={className}>
        <UnverifiableBody code={code} onRetry={retry} retrying={retrying} />
      </CredentialShell>
    )
  }

  if (phase === 'not_found' || !ticket) {
    const { Icon, label, className } = VERDICT_META.invalid
    return (
      <CredentialShell verdictIcon={Icon} verdictLabel={label} verdictClass={className}>
        <NotFoundBody code={code} />
      </CredentialShell>
    )
  }

  const isStale = phase === 'stale'
  const checkedInAt = ticket.checkIn?.scannedAt ?? null
  const effectiveStatus = checkedInAt ? 'usada' : ticket.status
  const ticketMeta = getStatusMeta(effectiveStatus)
  const verdictKey =
    effectiveStatus === 'pagada' ? 'valid' : effectiveStatus === 'usada' ? 'used' : 'warning'
  const {
    Icon,
    label: verdictLabel,
    className: verdictClass,
  } = isStale ? VERDICT_META.offline : VERDICT_META[verdictKey]

  async function handleCheckIn() {
    setCheckingIn(true)
    setCheckInError(null)

    let result
    try {
      result = await onCheckIn(ticket.qrToken)
    } catch {
      result = null
    }
    setCheckingIn(false)

    if (result?.outcome === 'ok') {
      patchData((current) => ({
        ...current,
        status: result.ticket.status,
        checkIn: { scannedAt: result.ticket.checkedInAt },
      }))
      return
    }

    // El backend es la autoridad — si otro dispositivo lo escaneó primero
    // (o cualquier otro desacuerdo), volvemos a pedir el estado real en vez
    // de asumir nada del lado del cliente. Si tampoco se puede releer, se dice.
    setCheckInError(
      result?.message ?? 'No se pudo confirmar el ingreso. Reintentá o anotalo a mano.',
    )
    void retry()
  }

  return (
    <CredentialShell
      verdictIcon={Icon}
      verdictLabel={verdictLabel}
      verdictClass={verdictClass}
      code={code}
      verifiedAt={verifiedAt}
    >
      <div className="credential-page__body">
        {isStale && <StaleNotice cache={cache} onRetry={retry} retrying={retrying} />}

        <div className="credential-page__identity-hero">
          <AthletePortrait name={ticket.attendeeName} photoUrl={null} />
          <div className="credential-page__identity-hero-copy">
            <p className="credential-page__athlete-name">{ticket.attendeeName}</p>
            {ticket.ticketCode ? (
              <p className="credential-page__member-code">
                <span className="credential-page__member-code-label">Entrada</span>
                <span className="credential-page__member-code-value">{ticket.ticketCode}</span>
              </p>
            ) : null}
          </div>
        </div>

        <IdentityFacts
          facts={[
            ticket.attendeeDni ? { label: 'Documento', value: ticket.attendeeDni } : null,
          ].filter(Boolean)}
        />

        {/* La entrada es un pase de un solo uso, no una identidad: lo que
            manda es a qué da acceso, y por eso ocupa el lugar que en la
            credencial de atleta ocupa la grilla. */}
        <div className="credential-page__schedule-block">
          <span className="credential-page__schedule-eyebrow">Acceso</span>
          <p className="credential-page__schedule-day">
            {ticket.ticketTypeName ?? 'Entrada general'}
          </p>
          {ticket.event?.title && (
            <p className="credential-page__schedule-detail">{ticket.event.title}</p>
          )}
        </div>

        <dl className="credential-page__rows">
          <div className="credential-page__row">
            <dt>Estado</dt>
            <dd>
              <span className={`status-pill status-pill--${ticketMeta.tone}`}>
                {ticketMeta.label}
              </span>
            </dd>
          </div>

          {checkedInAt && (
            <div className="credential-page__row">
              <dt>Ingreso</dt>
              <dd>
                <span className="credential-page__row-value">
                  {dateTime.format(new Date(checkedInAt))}
                </span>
              </dd>
            </div>
          )}
        </dl>

        {checkInError && (
          <p className="credential-page__alert" role="alert">
            {checkInError}
          </p>
        )}

        {/* Sin verificación fresca no se ofrece marcar: aceptar el toque y
            perderlo es peor que decir que ahora no se puede. */}
        {ticket.status === 'pagada' && !checkedInAt && onCheckIn && !isStale && (
          <button
            type="button"
            className="credential-page__checkin-btn"
            onClick={handleCheckIn}
            disabled={checkingIn}
          >
            <CheckCircle2 size={17} aria-hidden />
            {checkingIn ? 'Marcando…' : 'Marcar ingreso'}
          </button>
        )}

        {ticket.status === 'pendiente_pago' && (
          <p className="credential-page__row-meta">
            Esta entrada todavía no tiene el pago acreditado.
          </p>
        )}
      </div>
    </CredentialShell>
  )
}

function NotFoundBody({ code }) {
  return (
    <div className="credential-page__body">
      <p className="credential-page__empty-title">Credencial no encontrada</p>
      <p className="credential-page__empty-text">
        El código <strong>{code}</strong> no está registrado, o la credencial fue dada de baja.
        Confirmá el dato contra la planilla del evento.
      </p>
    </div>
  )
}

function CredentialShell({
  children,
  verdictIcon: Icon,
  verdictLabel,
  verdictMeta,
  verdictClass,
  code = null,
  verifiedAt = null,
  brandMark = 'Verificación QR',
  backHomeLabel = 'Volver al sitio de PLU ARG',
}) {
  return (
    <main className="credential-page">
      <div className="credential-page__ambient" aria-hidden>
        <div className="credential-page__pattern" />
      </div>

      <div className="credential-page__panel">
        <header className="credential-page__brand">
          <img src={BRAND.logoArgentinaDisplayUrl} alt="" className="credential-page__logo" />
          <div className="credential-page__brand-text">
            <span className="credential-page__brand-name">PLU Argentina</span>
            <span className="credential-page__brand-mark">{brandMark}</span>
          </div>
        </header>

        {/* Key por veredicto: al cambiar de fase (verificando → válida) el
            sello se re-estampa — la respuesta a la puerta leída como tal. */}
        <p
          key={`${verdictClass}__${verdictLabel}`}
          className={`credential-page__verdict ${verdictClass}`}
          role="status"
        >
          <span className="credential-page__verdict-seal" aria-hidden>
            <Icon size={18} />
          </span>
          <span className="credential-page__verdict-copy">
            {verdictMeta ? (
              <span className="credential-page__verdict-meta">{verdictMeta}</span>
            ) : null}
            <span className="credential-page__verdict-label">{verdictLabel}</span>
          </span>
        </p>

        {children}

        <footer className="credential-page__footer">
          {(verifiedAt || code) && (
            <p className="credential-page__footer-meta">
              {verifiedAt && (
                <span className="credential-page__footer-verified">
                  {timeOnly.format(verifiedAt)}
                </span>
              )}
              {code && <span className="credential-page__footer-code">{code}</span>}
            </p>
          )}
          <a href="/">{backHomeLabel}</a>
        </footer>
      </div>
    </main>
  )
}
