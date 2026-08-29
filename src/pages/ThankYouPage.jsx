import { ArrowRight, CheckCircle2, Clock3 } from 'lucide-react'
import '../styles/pages/thank-you.css'

export default function ThankYouPage({ onNavigate }) {
  const payment = new URLSearchParams(window.location.search).get('payment')
  const pending = payment === 'pending'
  return (
    <main className="thank-you-page">
      <section className="thank-you-page__content" aria-labelledby="thank-you-title">
        <div className="thank-you-page__icon" aria-hidden>
          {pending ? <Clock3 size={34} /> : <CheckCircle2 size={34} />}
        </div>
        <p className="thank-you-page__eyebrow">PLU ARGENTINA / PAGO REGISTRADO</p>
        <h1 id="thank-you-title">{pending ? 'Recibimos tu pago' : 'Gracias por tu compra'}</h1>
        <p className="thank-you-page__description">
          {pending
            ? 'Mercado Pago todavía está procesando la operación. Te avisaremos cuando se confirme.'
            : 'Tu operación fue registrada correctamente. Podés consultar el estado desde tu perfil.'}
        </p>
        <div className="thank-you-page__actions">
          <button type="button" className="thank-you-page__primary" onClick={() => onNavigate?.('profile')}>
            Ir a mi perfil <ArrowRight size={17} aria-hidden />
          </button>
          <button type="button" className="thank-you-page__secondary" onClick={() => onNavigate?.('home')}>
            Volver al inicio
          </button>
        </div>
      </section>
    </main>
  )
}
