import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, HelpCircle, XCircle } from 'lucide-react'
import { BRAND } from '../lib/brand.js'
import { formatShortDate } from '../lib/format.js'
import { getStatusMeta } from '../lib/status.js'
import { verifyTicketByQrToken } from '../services/ticketApi.js'

const DAY_PASS_LABELS = {
  day1: 'Día 1',
  day2: 'Día 2',
  both: 'Ambos días',
}

const VERDICT_META = {
  valid: { Icon: CheckCircle2, label: 'Credencial válida', className: 'credential-page__verdict--valid' },
  warning: { Icon: HelpCircle, label: 'Revisar antes de ingresar', className: 'credential-page__verdict--warning' },
  unknown: { Icon: HelpCircle, label: 'Sin datos suficientes', className: 'credential-page__verdict--warning' },
  invalid: { Icon: XCircle, label: 'Credencial no válida', className: 'credential-page__verdict--invalid' },
  used: { Icon: AlertTriangle, label: 'Entrada ya utilizada', className: 'credential-page__verdict--invalid' },
}

/**
 * CredentialPage — PLU ARG
 *
 * Página pública de verificación: a donde apunta el QR impreso en la card de
 * inscripción/afiliación/entrada. Pensada para que el personal de un evento o
 * establecimiento la abra escaneando con la cámara del celular, sin apps ni
 * login, y vea de un vistazo si la credencial es válida — y, en el caso de
 * entradas, para marcar el ingreso ahí mismo y agilizar la fila en la puerta.
 *
 * Nota de arquitectura: atletas/membresías/inscripciones todavía viven en
 * localStorage del navegador (por eso esa rama solo encuentra la credencial
 * en el mismo dispositivo donde se generó) — pero las ENTRADAS (tickets) ya
 * hablan con el backend real (Postgres), así que cualquier dispositivo que
 * escanee el QR ve el estado verdadero, y el check-in queda protegido por
 * una restricción única en la base de datos (ver server/modules/ticketing).
 *
 * Props:
 *   code          string  — código leído del QR (memberCode o qrToken)
 *   eventSlug     string? — slug del evento, si el QR era de una inscripción
 *   type          string? — 'ticket' para entradas generales; si no, se busca
 *                            entre atletas/membresías (comportamiento previo)
 *   athletes      Athlete[]
 *   memberships   Membership[]
 *   registrations Registration[]
 *   onCheckIn     (qrToken: string) => Promise<{outcome, ticket?}> — marca una entrada como usada
 */
export default function CredentialPage({
  code,
  eventSlug,
  type,
  athletes = [],
  memberships = [],
  registrations = [],
  onCheckIn,
}) {
  if (type === 'ticket') {
    return <TicketCredential code={code} onCheckIn={onCheckIn} />
  }

  const membership = memberships.find(
    (item) => (item.memberCode ?? '').toLowerCase() === (code ?? '').toLowerCase(),
  )
  const athlete = membership ? athletes.find((item) => item.id === membership.athleteId) : null

  const registration = athlete && eventSlug
    ? registrations.find(
        (item) => item.athleteId === athlete.id && item.eventSlug === eventSlug && item.status !== 'cancelada',
      )
    : null

  const notFound = !membership || !athlete

  const membershipMeta = membership ? getStatusMeta(membership.status) : null
  const registrationMeta = registration ? getStatusMeta(registration.status) : null

  // Veredicto general que se muestra arriba de todo, grande, para un vistazo rápido.
  // Para inscripciones a eventos, una membresía vencida baja el veredicto a
  // "revisar" aunque la inscripción puntual figure confirmada.
  let verdict = 'unknown'
  if (!notFound) {
    if (eventSlug) {
      const registrationOk = registration && registrationMeta.tone === 'success'
      verdict = registrationOk && membershipMeta.tone !== 'danger' ? 'valid' : registration ? 'warning' : 'unknown'
    } else {
      verdict = membershipMeta.tone === 'success' ? 'valid' : 'warning'
    }
  }

  const { Icon, label: verdictLabel, className: verdictClass } = VERDICT_META[notFound ? 'invalid' : verdict]

  return (
    <CredentialShell verdictIcon={Icon} verdictLabel={verdictLabel} verdictClass={verdictClass}>
      {notFound ? (
        <NotFoundBody code={code} />
      ) : (
        <div className="credential-page__body">
          <p className="credential-page__athlete-name">{athlete.fullName}</p>
          <p className="credential-page__athlete-code">{membership.memberCode}</p>

          <dl className="credential-page__rows">
            <div className="credential-page__row">
              <dt>Afiliación PLU ARG</dt>
              <dd>
                <span className={`status-pill status-pill--${membershipMeta.tone}`}>{membershipMeta.label}</span>
                {membership.expirationDate && (
                  <span className="credential-page__row-meta">
                    Vigente hasta {formatShortDate(membership.expirationDate)}
                  </span>
                )}
              </dd>
            </div>

            {eventSlug && (
              <div className="credential-page__row">
                <dt>Inscripción al evento</dt>
                <dd>
                  {registration ? (
                    <>
                      <span className={`status-pill status-pill--${registrationMeta.tone}`}>
                        {registrationMeta.label}
                      </span>
                      <span className="credential-page__row-meta">
                        {registration.event}
                        {(registration.category || registration.division) &&
                          ` · ${[registration.category, registration.division].filter(Boolean).join(' · ')}`}
                      </span>
                    </>
                  ) : (
                    <span className="credential-page__row-meta">Sin inscripción registrada a este evento.</span>
                  )}
                </dd>
              </div>
            )}
          </dl>
        </div>
      )}
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

        <dl className="credential-page__rows">
          <div className="credential-page__row">
            <dt>Entrada general</dt>
            <dd>
              <span className={`status-pill status-pill--${ticketMeta.tone}`}>{ticketMeta.label}</span>
              <span className="credential-page__row-meta">{ticket.event?.title}</span>
            </dd>
          </div>

          <div className="credential-page__row">
            <dt>Día habilitado</dt>
            <dd>
              <span className="credential-page__row-meta">
                {DAY_PASS_LABELS[ticket.dayPass] ?? ticket.dayPass}
              </span>
            </dd>
          </div>

          {checkedInAt && (
            <div className="credential-page__row">
              <dt>Ingreso registrado</dt>
              <dd>
                <span className="credential-page__row-meta">
                  {new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' }).format(
                    new Date(checkedInAt),
                  )}
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
            <CheckCircle2 size={16} aria-hidden />
            {checkingIn ? 'Marcando…' : 'Marcar ingreso'}
          </button>
        )}

        {ticket.status === 'pendiente_pago' && (
          <p className="credential-page__empty-text">Esta entrada todavía no tiene el pago acreditado.</p>
        )}
      </div>
    </CredentialShell>
  )
}

function NotFoundBody({ code }) {
  return (
    <div className="credential-page__body">
      <p className="credential-page__empty-title">Credencial no encontrada en este dispositivo</p>
      <p className="credential-page__empty-text">
        El código <strong>{code}</strong> no está registrado en este navegador. Puede tratarse de una
        credencial generada en otro dispositivo — pedile a la persona que muestre la card completa o
        confirmá el dato contra la planilla del evento.
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

        <div className={`credential-page__verdict ${verdictClass}`}>
          <Icon size={40} aria-hidden />
          <span>{verdictLabel}</span>
        </div>

        {children}

        <footer className="credential-page__footer">
          <a href="/">Volver al sitio de PLU ARG</a>
        </footer>
      </div>
    </main>
  )
}
