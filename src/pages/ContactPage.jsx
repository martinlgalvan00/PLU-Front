import { Mail, MapPin } from 'lucide-react'
import PageHero from '../components/layout/PageHero.jsx'
import Reveal from '../components/ui/Reveal.jsx'

export default function ContactPage() {
  return (
    <main className="page">
      <div className="page__inner page__inner--narrow">
        <PageHero
          compact
          eyebrow="Contacto"
          title="Hablemos"
          description="Afiliaciones, eventos, pagos, exportaciones y consultas técnicas."
        />
        <Reveal>
          <div className="contact-card surface-card">
            <a href="mailto:soporte@pluarg.com" className="contact-card__email">
              <Mail size={20} /> soporte@pluarg.com
            </a>
            <p className="contact-card__line">
              <MapPin size={16} /> Maximal Strength Club · Buenos Aires, Argentina
            </p>
            <p>Respondemos consultas de atletas, gimnasios aliados y operadores internacionales.</p>
          </div>
        </Reveal>
      </div>
    </main>
  )
}
