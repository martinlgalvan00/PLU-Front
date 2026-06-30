import { useState } from 'react'
import { BadgeCheck, CalendarDays, CreditCard, UserCircle } from 'lucide-react'
import StatusPill from '../components/ui/StatusPill.jsx'
import { money } from '../lib/format.js'
import { UPCOMING_EVENTS } from '../lib/events.js'

export default function AthleteProfilePage({ athlete, memberships, onNavigate, onSelectEvent, payments, registrations }) {
  const [flipped, setFlipped] = useState(false)
  if (!athlete) return null
  const membership = memberships.find((item) => item.athleteId === athlete.id)
  const athletePayments = payments.filter((item) => item.athleteId === athlete.id)

  return (
    <main className="page athlete-portal"><div className="page__inner">
      <section className="athlete-welcome surface-card"><div><span>Portal del atleta</span><h1>Hola, {athlete.fullName.split(' ')[0]}</h1><p>Administrá tu afiliación, competencias y datos personales.</p></div><StatusPill value={membership?.status || 'pendiente_pago'} /></section>
      <section className="athlete-overview">
        <article className="profile-summary surface-card"><UserCircle size={32} /><div><span>Documento</span><strong>{athlete.documentId}</strong></div><div><span>Correo electrónico</span><strong>{athlete.email}</strong></div><div><span>Equipo</span><strong>{athlete.gym}</strong></div></article>
        <div className="digital-card-block">
          <div className={`digital-card ${flipped ? 'is-flipped' : ''}`}>
            <div className="card-face card-front"><div className="card-brand"><span>POWERLIFTING</span><strong>UNITED</strong><small>ARGENTINA</small></div><div className="card-member"><span>ATLETA PLU</span><h2>{athlete.fullName}</h2><p>{membership?.memberCode || 'AFILIACIÓN PENDIENTE'}</p></div><BadgeCheck size={34} /></div>
            <div className="card-face card-back"><div><span>Documento</span><strong>{athlete.documentId}</strong></div><div><span>Sexo competitivo</span><strong>{athlete.sex}</strong></div><div><span>Equipo</span><strong>{athlete.gym}</strong></div><div><span>Vencimiento</span><strong>{membership?.expirationDate || 'Pendiente'}</strong></div><small>La validez de este carnet puede verificarse con PLU Argentina.</small></div>
          </div>
          <button className="btn btn--secondary card-flip" type="button" onClick={() => setFlipped((value) => !value)}><CreditCard size={17} /> Ver {flipped ? 'frente' : 'reverso'}</button>
        </div>
      </section>
      <section className="portal-section surface-card"><header><div><span>Temporada 2026</span><h2>Afiliación anual</h2></div><CreditCard size={24} /></header><div className="membership-row"><div><span>Estado</span><StatusPill value={membership?.status || 'pendiente_pago'} /></div><div><span>Vigencia</span><strong>{membership ? `${membership.startDate} al ${membership.expirationDate}` : 'Sin afiliación activa'}</strong></div><div><span>Último pago</span><strong>{athletePayments[0] ? money(athletePayments[0].amount) : '—'}</strong></div><button className="btn" type="button" onClick={() => onNavigate('membership')}>{membership?.status === 'activa' ? 'Renovar afiliación' : 'Pagar afiliación'}</button></div></section>
      <section className="portal-section surface-card"><header><div><span>Calendario PLU ARG</span><h2>Competencias disponibles</h2></div><CalendarDays size={24} /></header><div className="portal-events">{UPCOMING_EVENTS.map((event) => { const registration = registrations.find((item) => item.athleteId === athlete.id && item.event === event.title); return <article key={event.slug}><time>{event.date}</time><div><h3>{event.title}</h3><p>{event.venue} · {event.location}</p></div>{registration ? <StatusPill value={registration.status} /> : <button className="btn btn--small" type="button" onClick={() => onSelectEvent(event)}>Inscribirme</button>}</article> })}</div></section>
    </div></main>
  )
}
