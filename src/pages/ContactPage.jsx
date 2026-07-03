import DesignPageHero from '../components/layout/DesignPageHero.jsx'
import ContactForm from '../components/ui/ContactForm.jsx'
import Reveal from '../components/ui/Reveal.jsx'
import { useI18n } from '../i18n/I18nProvider.jsx'

export default function ContactPage({ onNavigate }) {
  const { t } = useI18n()

  return (
    <main className="page page--design">
      <DesignPageHero
        breadcrumbLabel="Contacto"
        onHome={() => onNavigate('home')}
        title="Contacto institucional"
        description="Para atletas, gimnasios, organización de eventos o consultas de PLU USA."
      />

      <div className="contact-layout">
        <Reveal variant="from-left">
          <ContactForm />
        </Reveal>

        <Reveal variant="from-right" as="aside" className="contact-sidebar" delay={80}>
          <h3>{t('contact.sidebarTitle')}</h3>
          <p>{t('contact.sidebarLocation')}</p>
          <a href={`mailto:${t('contact.sidebarEmail')}`}>{t('contact.sidebarEmail')}</a>
          <p style={{ marginTop: 24 }}>
            Respondemos consultas de atletas, gimnasios aliados y operadores internacionales en 24–48 h
            hábiles.
          </p>
        </Reveal>
      </div>
    </main>
  )
}
