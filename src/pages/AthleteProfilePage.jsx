import { useState } from 'react'
import { Check, CreditCard, History, Landmark, ShieldCheck, Trophy, X } from 'lucide-react'
import { useI18n } from '../i18n/I18nProvider.jsx'
import { EVENT_STATUS, UPCOMING_EVENTS } from '../lib/events.js'
import { formatShortDate } from '../lib/format.js'
import Reveal from '../components/ui/Reveal.jsx'

function initials(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

function DigitalCredential({ athlete, membership }) {
  const [flipped, setFlipped] = useState(false)
  const membershipActive = membership?.status === 'activa'

  return (
    <article className="account-credential">
      <div className={`account-credential__card${flipped ? ' is-flipped' : ''}`}>
        <div className="account-credential__face account-credential__front">
          <div className="account-credential__brand">
            <div className="account-credential__monogram">PLU</div>
            <div>
              <strong>Powerlifting United</strong>
              <span>Argentina · Credencial digital</span>
            </div>
          </div>
          <div className="account-credential__identity">
            <span className="account-credential__avatar" aria-hidden>{initials(athlete.fullName)}</span>
            <div>
              <small>Atleta</small>
              <h2>{athlete.fullName}</h2>
              {membership?.memberCode && <p>{membership.memberCode}</p>}
            </div>
          </div>
          <span className={`account-credential__status ${membershipActive ? 'is-active' : 'is-inactive'}`}>
            <span className="account-credential__status-dot" aria-hidden />
            {membershipActive ? 'Afiliación activa' : 'Sin afiliación'}
          </span>
        </div>

        <div className="account-credential__face account-credential__back">
          <div><small>DNI o documento</small><strong>{athlete.documentId}</strong></div>
          <div><small>Fecha de nacimiento</small><strong>{formatShortDate(athlete.birthDate)}</strong></div>
          <div><small>Gimnasio o equipo</small><strong>{athlete.gym || 'Sin informar'}</strong></div>
          <div><small>Ubicación</small><strong>{[athlete.city, athlete.province].filter(Boolean).join(', ')}</strong></div>
          <div><small>Sexo competitivo</small><strong>{athlete.sex}</strong></div>
          <div><small>Vigencia</small><strong>{membership?.expirationDate ? formatShortDate(membership.expirationDate) : 'Pendiente'}</strong></div>
          <p>Credencial personal e intransferible · PLU Argentina</p>
        </div>
      </div>
      <button type="button" className="account-credential__flip" onClick={() => setFlipped((value) => !value)}>
        {flipped ? 'Ver frente' : 'Ver reverso'}
      </button>
    </article>
  )
}

function TransferModal({ athlete, onClose }) {
  return (
    <div className="account-payment-modal__overlay" role="presentation" onMouseDown={onClose}>
      <section
        aria-labelledby="transfer-title"
        aria-modal="true"
        className="account-payment-modal"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header>
          <div>
            <span>Transferencia bancaria</span>
            <h2 id="transfer-title">Datos para completar tu afiliación</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar modal"><X size={19} /></button>
        </header>
        <div className="account-payment-modal__notice">Datos de demostración. No realices una transferencia.</div>
        <dl className="account-transfer-data">
          <div><dt>Alias</dt><dd>PLUARG.MAXIMAL</dd></div>
          <div><dt>CBU</dt><dd>0000003100000000000001</dd></div>
          <div><dt>Titular</dt><dd>Maximal · PLU Argentina</dd></div>
          <div><dt>Importe</dt><dd>$38.000 ARS</dd></div>
          <div><dt>Referencia</dt><dd>{athlete.documentId} · {athlete.fullName}</dd></div>
        </dl>
        <p>Incluí tu DNI en el concepto. Luego deberás enviar el comprobante para su validación manual.</p>
        <button type="button" className="account-primary-action" onClick={onClose}>Entendido</button>
      </section>
    </div>
  )
}

export default function AthleteProfilePage({
  athlete,
  memberships,
  onNavigate,
  registrations,
  session,
}) {
  const { t } = useI18n()
  const [paymentMethod, setPaymentMethod] = useState('mercado_pago')
  const [transferOpen, setTransferOpen] = useState(false)
  const [checkoutMessage, setCheckoutMessage] = useState('')

  if (!athlete) return null

  const isDemoUnAffiliated = session?.demoUnAffiliated || session?.email === 'martina.rivas@example.com'
  const storedMembership = memberships.find((item) => item.athleteId === athlete.id)
  const membership = isDemoUnAffiliated ? undefined : storedMembership
  const athleteRegistrations = registrations.filter((item) => item.athleteId === athlete.id)
  const availableEvents = UPCOMING_EVENTS.filter((event) => event.status !== 'finalizado')

  const startMembershipPayment = () => {
    setCheckoutMessage('')
    if (paymentMethod === 'transferencia') {
      setTransferOpen(true)
      return
    }
    setCheckoutMessage('Checkout de Mercado Pago listo para conectar. En esta demo no se realizará ningún cobro.')
  }

  return (
    <main className="page page--design">
      <Reveal>
        <section className="account-hero">
          <div className="account-hero__inner">
            <div className="account-hero__identity">
              <div className="account-hero__avatar" aria-hidden>{initials(athlete.fullName)}</div>
              <div className="account-hero__copy">
                <span className="account-hero__eyebrow">{t('account.eyebrow')}</span>
                <h1>{athlete.fullName}</h1>
                <div className="account-hero__badges">
                  <span className={`account-badge ${membership?.status === 'activa' ? 'account-badge--active' : 'account-badge--pending'}`}>
                    {membership?.status === 'activa' ? t('account.membershipActive') : 'Sin afiliación'}
                  </span>
                  {membership?.memberCode && <span className="account-badge account-badge--code">{membership.memberCode}</span>}
                </div>
              </div>
            </div>
            <DigitalCredential athlete={athlete} membership={membership} />
          </div>
        </section>
      </Reveal>

      <div className="account-sections">
        <Reveal delay={60}>
          <section className="account-section account-membership-section">
            <div className="account-section__heading">
              <div className="account-section__icon"><ShieldCheck size={21} /></div>
              <div><span>Temporada 2026</span><h2>Adquirí tu afiliación anual</h2></div>
              <strong className="account-section__price">$38.000 <small>ARS</small></strong>
            </div>
            <p className="account-section__lead">Activá tu credencial oficial y quedá habilitado para competir en eventos PLU ARG.</p>
            <div className="account-benefits">
              <span><Check size={15} /> Credencial digital</span>
              <span><Check size={15} /> Código de afiliado</span>
              <span><Check size={15} /> Acceso a eventos oficiales</span>
            </div>
            <fieldset className="account-payment-options">
              <legend>Elegí el método de pago</legend>
              <label className={paymentMethod === 'mercado_pago' ? 'is-selected' : ''}>
                <input type="radio" name="membership-payment" value="mercado_pago" checked={paymentMethod === 'mercado_pago'} onChange={(event) => setPaymentMethod(event.target.value)} />
                <CreditCard size={21} />
                <span><strong>Mercado Pago</strong><small>Checkout online</small></span>
              </label>
              <label className={paymentMethod === 'transferencia' ? 'is-selected' : ''}>
                <input type="radio" name="membership-payment" value="transferencia" checked={paymentMethod === 'transferencia'} onChange={(event) => setPaymentMethod(event.target.value)} />
                <Landmark size={21} />
                <span><strong>Transferencia</strong><small>Validación manual</small></span>
              </label>
            </fieldset>
            <button type="button" className="account-primary-action" onClick={startMembershipPayment}>
              Continuar con {paymentMethod === 'mercado_pago' ? 'Mercado Pago' : 'transferencia'}
            </button>
            {checkoutMessage && <p className="account-checkout-message" role="status">{checkoutMessage}</p>}
          </section>
        </Reveal>

        <Reveal delay={120}>
          <section className="account-section">
            <div className="account-section__heading">
              <div className="account-section__icon"><Trophy size={21} /></div>
              <div><span>Competencias</span><h2>Próximos torneos</h2></div>
            </div>
            <div className="account-events-list">
              {availableEvents.map((event) => {
                const registered = !isDemoUnAffiliated && athleteRegistrations.some((item) => item.event === event.title)
                return (
                  <article key={event.slug}>
                    <time dateTime={event.dateISO}>{event.date}</time>
                    <div><h3>{event.title}</h3><p>{event.venue} · {event.location}</p></div>
                    <span className="account-event-status">{registered ? 'Inscripción confirmada' : EVENT_STATUS[event.status]?.label}</span>
                    <button type="button" onClick={() => onNavigate('competition')} disabled={registered}>
                      {registered ? 'Ya estás inscripto' : 'Inscribirme'}
                    </button>
                  </article>
                )
              })}
            </div>
          </section>
        </Reveal>

        <Reveal delay={180}>
          <section className="account-section">
            <div className="account-section__heading">
              <div className="account-section__icon"><History size={21} /></div>
              <div><span>Actividad</span><h2>Historial</h2></div>
            </div>
            {athleteRegistrations.length ? (
              <div className="account-history-list">
                {athleteRegistrations.map((item) => (
                  <article key={item.id}>
                    <div><span>Competencia</span><strong>{item.event}</strong></div>
                    <div><span>Categoría</span><strong>{item.division} · {item.category}</strong></div>
                    <span className="account-history-status">{item.status.replaceAll('_', ' ')}</span>
                  </article>
                ))}
              </div>
            ) : <p className="account-section__empty">{t('account.historyEmpty')}</p>}
          </section>
        </Reveal>
      </div>

      {transferOpen && <TransferModal athlete={athlete} onClose={() => setTransferOpen(false)} />}
    </main>
  )
}
