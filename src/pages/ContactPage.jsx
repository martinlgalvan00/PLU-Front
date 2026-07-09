import { Clock, Mail, MapPin } from 'lucide-react'
import DesignPageHero from '../components/layout/DesignPageHero.jsx'
import ContactForm from '../components/ui/ContactForm.jsx'
import Reveal from '../components/ui/Reveal.jsx'
import { useI18n } from '../i18n/I18nProvider.jsx'

export default function ContactPage({ onNavigate }) {
  const { t } = useI18n()

  return (
    <main className="page page--design contact-page contact-page--premium">
      <DesignPageHero
        className="contact-hero"
        compact
        breadcrumbLabel={t('pages.contact.heroBreadcrumb')}
        eyebrow={t('pages.contact.heroEyebrow')}
        onHome={() => onNavigate('home')}
        title={t('pages.contact.heroTitle')}
        description={t('pages.contact.heroDesc')}
      />

      <div className="contact-page__inner">
        <div className="contact-layout">
          <Reveal variant="from-left">
            <ContactForm />
          </Reveal>

          <Reveal variant="from-right" as="aside" className="contact-sidebar" delay={80}>
            <header className="contact-sidebar__head">
              <span className="contact-sidebar__index" aria-hidden>
                03
              </span>
              <div className="contact-sidebar__head-copy">
                <p className="contact-sidebar__eyebrow">{t('brand.federationLine')}</p>
                <h2 className="contact-sidebar__title">{t('contact.sidebarTitle')}</h2>
              </div>
            </header>

            <ul className="contact-sidebar__ledger">
              <li className="contact-sidebar__item">
                <span className="contact-sidebar__item-icon" aria-hidden>
                  <Mail size={14} strokeWidth={1.75} />
                </span>
                <div className="contact-sidebar__item-body">
                  <span className="contact-sidebar__item-label">{t('pages.contact.sidebarEmail')}</span>
                  <p className="contact-sidebar__item-value">
                    <a href={`mailto:${t('contact.sidebarEmail')}`}>{t('contact.sidebarEmail')}</a>
                  </p>
                </div>
              </li>
              <li className="contact-sidebar__item">
                <span className="contact-sidebar__item-icon" aria-hidden>
                  <MapPin size={14} strokeWidth={1.75} />
                </span>
                <div className="contact-sidebar__item-body">
                  <span className="contact-sidebar__item-label">{t('pages.contact.sidebarLocation')}</span>
                  <p className="contact-sidebar__item-value">{t('contact.sidebarLocation')}</p>
                </div>
              </li>
              <li className="contact-sidebar__item">
                <span className="contact-sidebar__item-icon" aria-hidden>
                  <Clock size={14} strokeWidth={1.75} />
                </span>
                <div className="contact-sidebar__item-body">
                  <span className="contact-sidebar__item-label">{t('pages.contact.sidebarResponse')}</span>
                  <p className="contact-sidebar__item-value">{t('contact.sidebarResponse')}</p>
                </div>
              </li>
            </ul>

            <p className="contact-sidebar__note">{t('contact.sidebarNote')}</p>
          </Reveal>
        </div>
      </div>
    </main>
  )
}
