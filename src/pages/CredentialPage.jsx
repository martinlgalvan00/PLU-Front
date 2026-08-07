import { useEffect, useState } from 'react'
import '../styles/pages/credential.css'
import { AlertTriangle, CheckCircle2, HelpCircle, XCircle } from 'lucide-react'
import { BRAND } from '../lib/brand.js'
import { formatShortDate } from '../lib/format.js'
import { formatScheduleSummary, formatSessionDetail } from '../lib/eventSchedule.js'
import { getStatusMeta } from '../lib/status.js'
import { verifyTicketByQrToken } from '../services/ticketApi.js'
import { getMembershipByCodeOrToken } from '../services/athleteApi.js'

const VERDICT_META = {
  valid: { Icon: CheckCircle2, label: 'Credencial válida', className: 'credential-page__verdict--valid' },
  warning: { Icon: HelpCircle, label: 'Revisar antes de ingresar', className: 'credential-page__verdict--warning' },
  unknown: { Icon: HelpCircle, label: 'Sin datos suficientes', className: 'credential-page__verdict--warning' },
  invalid: { Icon: XCircle, label: 'Credencial no válida', className: 'credential-page__verdict--invalid' },
  used: { Icon: AlertTriangle, label: 'Entrada ya utilizada', className: 'credential-page__verdict--invalid' },
}

const dateTime = new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' })

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
 * veredicto → persona → cuándo compite → estados de soporte → acción. El
 * bloque de grilla es el único con escala propia porque es el dato por el que
 * se escanea.
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
export default function CredentialPage({ code, eventSlug, type, onCheckIn, onCheckInRegistration }) {
  if (type === 'ticket') {
    return <TicketCredential code={code} onCheckIn={onCheckIn} />
  }

  return <MembershipCredential code={code} eventSlug={eventSlug} onCheckIn={onCheckInRegistration} />
}

/**
 * Cuándo compite esa persona — el dato por el que se escanea, así que es la
 * única pieza de la pantalla con escala propia.
 *
 * Mientras la organización no arma la grilla se dice explícitamente "a
 * confirmar" y se cae a la fecha del evento: dejar el renglón vacío haría
 * parecer que la credencial está incompleta cuando en realidad está al día.
 */
function ScheduleBlock({ registration }) {
  const summary = formatScheduleSummary(registration.schedule)
  const eventDate = registration.eventStartsAt
    ? formatShortDate(String(registration.eventStartsAt).slice(0, 10))
    : ''

  if (!summary) {
    return (
      <div className="credential-page__schedule-block credential-page__schedule-block--pending">
        <span className="credential-page__schedule-eyebrow">Compite</span>
        <p className="credential-page__schedule-day">
          Día a confirmar{eventDate ? ` · ${eventDate}` : ''}
        </p>
      </div>
    )
  }

  const detail = formatSessionDetail(registration.schedule)

  return (
    <div className="credential-page__schedule-block">
      <span className="credential-page__schedule-eyebrow">Compite</span>
      <p className="credential-page__schedule-day">{summary}</p>
      {detail && <p className="credential-page__schedule-detail">{detail}</p>}
    </div>
  )
}

function MembershipCredential({ code, eventSlug, onCheckIn }) {
  const [status, setStatus] = useState('loading') // 'loading' | 'found' | 'not_found'
  const [data, setData] = useState(null)
  const [checkingIn, setCheckingIn] = useState(false)

  useEffect(() => {
    let cancelled = false
    setStatus('loading')

    getMembershipByCodeOrToken(code, eventSlug)
      .then((result) => {
        if (cancelled) return
        setData(result)
        setStatus('found')
      })
      .catch(() => {
        if (!cancelled) setStatus('not_found')
      })

    return () => {
      cancelled = true
    }
  }, [code, eventSlug])

  if (status === 'loading') {
    return (
      <CredentialShell
        verdictIcon={HelpCircle}
        verdictLabel="Verificando…"
        verdictClass="credential-page__verdict--warning"
      >
        <div className="credential-page__body" />
      </CredentialShell>
    )
  }

  // La afiliación ya no es condición para que la credencial exista: un atleta
  // inscripto a un evento que no la exige también tiene QR, y su veredicto lo
  // da la inscripción. Lo único imprescindible es que el código resuelva a
  // alguien.
  if (status === 'not_found' || !data?.athlete) {
    const { Icon, label, className } = VERDICT_META.invalid
    return (
      <CredentialShell verdictIcon={Icon} verdictLabel={label} verdictClass={className}>
        <NotFoundBody code={code} />
      </CredentialShell>
    )
  }

  const { athlete, membership, registration, registrations = [] } = data
  // El status de la membresía en la base puede estar desactualizado si el
  // cron que la pasa a "vencida" no corrió (ver expire_memberships()) --
  // no confiamos solo en el campo cacheado, comparamos la fecha en vivo
  // contra "ahora" para que el veredicto en la puerta sea siempre correcto.
  const membershipExpiredLive =
    Boolean(membership?.expirationDate) && new Date(membership.expirationDate) < new Date()
  const membershipMeta = membership
    ? getStatusMeta(membershipExpiredLive ? 'vencida' : membership.status)
    : null
  const registrationMeta = registration ? getStatusMeta(registration.status) : null
  // Inscripciones a mostrar cuando el QR se escaneó sin `?evento=`: antes ese
  // caso no traía ninguna y la puerta se quedaba sin nada que hacer.
  const otherRegistrations = eventSlug ? [] : registrations

  // Veredicto general que se muestra arriba de todo, grande, para un
  // vistazo rápido. Para inscripciones a eventos, una membresía vencida
  // baja el veredicto a "revisar" aunque la inscripción puntual figure
  // confirmada.
  let verdict = 'unknown'
  if (eventSlug) {
    const registrationOk = registration && registrationMeta.tone === 'success'
    // Sin afiliación no se penaliza: puede ser un evento que no la exige, y en
    // ese caso la inscripción confirmada alcanza.
    const membershipBlocks = membershipMeta?.tone === 'danger'
    verdict = registrationOk && !membershipBlocks ? 'valid' : registration ? 'warning' : 'unknown'
  } else if (membershipMeta?.tone === 'success') {
    verdict = 'valid'
  } else if (otherRegistrations.some((item) => getStatusMeta(item.status).tone === 'success')) {
    verdict = 'valid'
  } else {
    verdict = 'warning'
  }

  const { Icon, label: verdictLabel, className: verdictClass } = VERDICT_META[verdict]

  const isCheckInable = (item) =>
    Boolean(onCheckIn) && Boolean(item) && !item.checkedInAt &&
    ['pagada', 'confirmada'].includes(item.status)
  const canCheckIn = isCheckInable(registration)

  async function handleCheckIn(target = registration) {
    setCheckingIn(true)
    const result = await onCheckIn(target.id)
    setCheckingIn(false)

    if (result?.outcome === 'ok') {
      setData((current) => ({
        ...current,
        registration:
          current.registration?.id === target.id
            ? { ...current.registration, checkedInAt: result.registration.checkedInAt }
            : current.registration,
        registrations: (current.registrations ?? []).map((item) =>
          item.id === target.id
            ? { ...item, checkedInAt: result.registration.checkedInAt }
            : item,
        ),
      }))
      return
    }

    // El backend es la autoridad -- si otro dispositivo lo escaneó primero
    // (o cualquier otro desacuerdo), volvemos a pedir el estado real en vez
    // de asumir nada del lado del cliente.
    getMembershipByCodeOrToken(code, eventSlug).then((fresh) => setData(fresh))
  }

  return (
    <CredentialShell verdictIcon={Icon} verdictLabel={verdictLabel} verdictClass={verdictClass}>
      <div className="credential-page__body">
        <p className="credential-page__athlete-name">{athlete.fullName}</p>
        {membership?.memberCode && (
          <p className="credential-page__athlete-code">{membership.memberCode}</p>
        )}

        {/* Escaneo con evento: la grilla de esa inscripción manda. */}
        {eventSlug && registration && <ScheduleBlock registration={registration} />}

        <dl className="credential-page__rows">
          <div className="credential-page__row">
            <dt>Afiliación</dt>
            <dd>
              {membership ? (
                <>
                  <span className={`status-pill status-pill--${membershipMeta.tone}`}>
                    {membershipMeta.label}
                  </span>
                  {membership.expirationDate && (
                    <span className="credential-page__row-meta">
                      Hasta {formatShortDate(membership.expirationDate)}
                    </span>
                  )}
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
            <p className="credential-page__section-label">Inscripciones vigentes</p>
            <div className="credential-page__rows">
              {otherRegistrations.map((item) => {
                const meta = getStatusMeta(item.status)
                return (
                  <div className="credential-page__entry" key={item.id}>
                    <div className="credential-page__entry-head">
                      <p className="credential-page__entry-title">{item.event ?? 'Inscripción'}</p>
                      <span className={`status-pill status-pill--${meta.tone}`}>{meta.label}</span>
                    </div>
                    {(item.category || item.division) && (
                      <p className="credential-page__row-meta">
                        {[item.category, item.division].filter(Boolean).join(' · ')}
                      </p>
                    )}
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

function TicketCredential({ code, onCheckIn }) {
  const [status, setStatus] = useState('loading') // 'loading' | 'found' | 'not_found'
  const [ticket, setTicket] = useState(null)
  const [checkingIn, setCheckingIn] = useState(false)

  useEffect(() => {
    let cancelled = false
    setStatus('loading')

    verifyTicketByQrToken(code)
      .then(({ ticket: fetched }) => {
        if (cancelled) return
        setTicket(fetched)
        setStatus('found')
      })
      .catch(() => {
        if (!cancelled) setStatus('not_found')
      })

    return () => {
      cancelled = true
    }
  }, [code])

  if (status === 'loading') {
    return (
      <CredentialShell
        verdictIcon={HelpCircle}
        verdictLabel="Verificando…"
        verdictClass="credential-page__verdict--warning"
      >
        <div className="credential-page__body" />
      </CredentialShell>
    )
  }

  if (status === 'not_found' || !ticket) {
    const { Icon, label, className } = VERDICT_META.invalid
    return (
      <CredentialShell verdictIcon={Icon} verdictLabel={label} verdictClass={className}>
        <NotFoundBody code={code} />
      </CredentialShell>
    )
  }

  const checkedInAt = ticket.checkIn?.scannedAt ?? null
  const effectiveStatus = checkedInAt ? 'usada' : ticket.status
  const ticketMeta = getStatusMeta(effectiveStatus)
  const verdictKey = effectiveStatus === 'pagada' ? 'valid' : effectiveStatus === 'usada' ? 'used' : 'warning'
  const { Icon, label: verdictLabel, className: verdictClass } = VERDICT_META[verdictKey]

  async function handleCheckIn() {
    setCheckingIn(true)
    const result = await onCheckIn(ticket.qrToken)
    setCheckingIn(false)

    if (result?.outcome === 'ok') {
      setTicket((current) => ({ ...current, status: result.ticket.status, checkIn: { scannedAt: result.ticket.checkedInAt } }))
      return
    }

    // El backend es la autoridad — si otro dispositivo lo escaneó primero
    // (o cualquier otro desacuerdo), volvemos a pedir el estado real en vez
    // de asumir nada del lado del cliente.
    verifyTicketByQrToken(code).then(({ ticket: fresh }) => setTicket(fresh))
  }

  return (
    <CredentialShell verdictIcon={Icon} verdictLabel={verdictLabel} verdictClass={verdictClass}>
      <div className="credential-page__body">
        <p className="credential-page__athlete-name">{ticket.attendeeName}</p>
        <p className="credential-page__athlete-code">
          {ticket.ticketCode} · DNI {ticket.attendeeDni}
        </p>

        {/* La entrada es un pase de un solo uso, no una identidad: lo que
            manda es a qué da acceso, y por eso ocupa el lugar que en la
            credencial de atleta ocupa la grilla. */}
        <div className="credential-page__schedule-block">
          <span className="credential-page__schedule-eyebrow">Acceso</span>
          <p className="credential-page__schedule-day">{ticket.ticketTypeName ?? 'Entrada general'}</p>
          {ticket.event?.title && (
            <p className="credential-page__schedule-detail">{ticket.event.title}</p>
          )}
        </div>

        <dl className="credential-page__rows">
          <div className="credential-page__row">
            <dt>Estado</dt>
            <dd>
              <span className={`status-pill status-pill--${ticketMeta.tone}`}>{ticketMeta.label}</span>
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

        {ticket.status === 'pagada' && !checkedInAt && onCheckIn && (
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
          <p className="credential-page__row-meta">Esta entrada todavía no tiene el pago acreditado.</p>
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
        El código <strong>{code}</strong> no está registrado, o la credencial fue dada de baja. Confirmá
        el dato contra la planilla del evento.
      </p>
    </div>
  )
}

function CredentialShell({ children, verdictIcon: Icon, verdictLabel, verdictClass }) {
  return (
    <main className="credential-page">
      <div className="credential-page__panel">
        <header className="credential-page__brand">
          <img src={BRAND.logoArgentinaUrl} alt="PLU Argentina" className="credential-page__logo" />
          <span>PLU Argentina · Verificación</span>
        </header>

        <p className={`credential-page__verdict ${verdictClass}`} role="status">
          <Icon size={20} aria-hidden />
          <span>{verdictLabel}</span>
        </p>

        {children}

        <footer className="credential-page__footer">
          <a href="/">Volver al sitio de PLU ARG</a>
        </footer>
      </div>
    </main>
  )
}
