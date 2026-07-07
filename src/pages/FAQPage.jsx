import { ArrowRight } from 'lucide-react'
import DesignPageHero from '../components/layout/DesignPageHero.jsx'
import FAQAccordion from '../components/ui/FAQAccordion.jsx'
import Reveal from '../components/ui/Reveal.jsx'
import SubNav from '../components/ui/SubNav.jsx'
import { useContent } from '../hooks/useContent.js'
import { useI18n } from '../i18n/I18nProvider.jsx'

export default function FAQPage({ onNavigate }) {
  const { FAQ_GROUPS } = useContent()
  const { t } = useI18n()

  const subNavItems = FAQ_GROUPS.map((group) => ({
    href: `#${group.id}`,
    label: group.title,
    shortLabel: group.shortLabel ?? group.title,
  }))

  return (
    <main className="page page--design faq-page faq-page--premium">
      <DesignPageHero
        className="faq-hero"
        compact
        breadcrumbLabel={t('pages.faq.heroBreadcrumb')}
        onHome={() => onNavigate?.('home')}
        title={t('pages.faq.heroTitle')}
        description={t('pages.faq.heroDesc')}
      />

      <SubNav
        className="sub-nav--faq-premium"
        items={subNavItems}
        label={t('pages.faq.categoriesAria')}
      />

      <div className="faq-page__inner">
        {FAQ_GROUPS.map((group, index) => (
          <Reveal key={group.id} delay={index * 40}>
            <section id={group.id} className="anchor-target faq-section">
              <header className="faq-section__head">
                <span className="faq-section__index" aria-hidden>
                  {String(index + 1).padStart(2, '0')}
                </span>
                <h2 className="faq-section__title">{group.title}</h2>
              </header>
              <FAQAccordion items={group.items} numbered variant="ref" />
            </section>
          </Reveal>
        ))}

        <Reveal delay={FAQ_GROUPS.length * 40}>
          <div className="faq-page__cta">
            <p className="faq-page__cta-copy">{t('pages.faq.notFoundTitle')}</p>
            <button type="button" className="faq-page__cta-link" onClick={() => onNavigate('contact')}>
              {t('pages.faq.notFoundCta')}
              <ArrowRight size={14} aria-hidden />
            </button>
          </div>
        </Reveal>
      </div>
    </main>
  )
}
