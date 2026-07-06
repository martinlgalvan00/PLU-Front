import { ArrowDown, FileDown } from 'lucide-react'
import DesignPageHero from '../components/layout/DesignPageHero.jsx'
import Button from '../components/ui/Button.jsx'
import Reveal from '../components/ui/Reveal.jsx'
import SubNav from '../components/ui/SubNav.jsx'
import { useContent } from '../hooks/useContent.js'
import { useI18n } from '../i18n/I18nProvider.jsx'

function RulebookSection({ id, title, note, index, children }) {
  return (
    <section id={id} className="anchor-target rulebook-section">
      <header className="rulebook-section__head">
        <span className="rulebook-section__index" aria-hidden>
          {index}
        </span>
        <h2 className="rulebook-section__title">{title}</h2>
      </header>
      <div className="rulebook-section__body">{children}</div>
      {note && <p className="rulebook-section__note">{note}</p>}
    </section>
  )
}

export default function RulebookPage({ onNavigate }) {
  const {
    RULEBOOK_DIVISIONS,
    RULEBOOK_DOWNLOAD,
    RULEBOOK_EQUIPMENT,
    RULEBOOK_JUDGING,
    RULEBOOK_WEIGHT_CATEGORIES,
  } = useContent()
  const { t } = useI18n()

  const subNavItems = [
    { href: '#reg-descarga', label: t('pages.rulebook.navDownload'), shortLabel: t('pages.rulebook.navDownload') },
    { href: '#reg-categorias', label: t('pages.rulebook.navWeight'), shortLabel: t('pages.rulebook.navWeight') },
    { href: '#reg-divisiones', label: t('pages.rulebook.navDivisions'), shortLabel: t('pages.rulebook.navDivisions') },
    { href: '#reg-equipamiento', label: t('pages.rulebook.navEquipment'), shortLabel: t('pages.rulebook.navEquipment') },
    { href: '#reg-jueceo', label: t('pages.rulebook.navJudging'), shortLabel: t('pages.rulebook.navJudging') },
  ]

  return (
    <main className="page page--design rulebook-page rulebook-page--premium">
      <DesignPageHero
        className="rulebook-hero"
        compact
        breadcrumbLabel={t('pages.rulebook.heroBreadcrumb')}
        onHome={() => onNavigate?.('home')}
        title={t('pages.rulebook.heroTitle')}
        description={t('pages.rulebook.heroDesc')}
      />

      <SubNav
        className="sub-nav--rulebook-premium"
        items={subNavItems}
        label={t('pages.rulebook.navAria')}
      />

      <div className="rulebook-page__inner">
        <Reveal>
          <section id="reg-descarga" className="anchor-target rulebook-download-strip">
            <div className="rulebook-download-strip__main">
              <span className="rulebook-download-strip__icon" aria-hidden>
                <FileDown size={18} strokeWidth={1.75} />
              </span>
              <div className="rulebook-download-strip__copy">
                <div className="rulebook-download-strip__meta-row">
                  <span className="rulebook-download-strip__badge">{RULEBOOK_DOWNLOAD.format}</span>
                  <span className="rulebook-download-strip__status">{RULEBOOK_DOWNLOAD.subtitle}</span>
                </div>
                <h2 className="rulebook-download-strip__title">{RULEBOOK_DOWNLOAD.title}</h2>
              </div>
              <Button className="btn--small rulebook-download-strip__action" variant="outline" disabled>
                {RULEBOOK_DOWNLOAD.action}
                <ArrowDown size={14} aria-hidden />
              </Button>
            </div>
          </section>
        </Reveal>

        <Reveal>
          <RulebookSection id="reg-categorias" index="01" title={t('pages.rulebook.weightTitle')}>
            <div className="rulebook-weight-grid">
              {RULEBOOK_WEIGHT_CATEGORIES.map((item) => (
                <div key={item.title} className="rulebook-weight-grid__group">
                  <h3 className="rulebook-weight-grid__label">{item.title}</h3>
                  <ul className="rulebook-weight-grid__chips" aria-label={item.title}>
                    {item.weights.map((weight) => (
                      <li key={weight}>
                        <span className="rulebook-weight-chip">
                          {weight}
                          <span className="rulebook-weight-chip__unit">{item.unit}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <p className="rulebook-section__disclaimer">{t('pages.rulebook.weightDisclaimer')}</p>
          </RulebookSection>
        </Reveal>

        <Reveal>
          <RulebookSection
            id="reg-divisiones"
            index="02"
            title={t('pages.rulebook.divisionsTitle')}
            note={t('pages.rulebook.divisionsNote')}
          >
            <dl className="rulebook-ledger">
              {RULEBOOK_DIVISIONS.map((division) => (
                <div key={division.title} className="rulebook-ledger__row">
                  <dt>{division.title}</dt>
                  <dd>{division.range}</dd>
                </div>
              ))}
            </dl>
          </RulebookSection>
        </Reveal>

        <Reveal>
          <RulebookSection id="reg-equipamiento" index="03" title={t('pages.rulebook.equipmentTitle')}>
            <div className="rulebook-modality-grid">
              {RULEBOOK_EQUIPMENT.map((item) => (
                <article key={item.title} className="rulebook-modality-card">
                  <h3 className="rulebook-modality-card__title">{item.title}</h3>
                  <p className="rulebook-modality-card__text">{item.text}</p>
                </article>
              ))}
            </div>
          </RulebookSection>
        </Reveal>

        <Reveal>
          <RulebookSection id="reg-jueceo" index="04" title={t('pages.rulebook.judgingTitle')}>
            <ol className="rulebook-canon">
              {RULEBOOK_JUDGING.map((rule) => (
                <li key={rule.numeral} className="rulebook-canon__item">
                  <span className="rulebook-canon__numeral" aria-hidden>
                    {rule.numeral}
                  </span>
                  <p>{rule.text}</p>
                </li>
              ))}
            </ol>
          </RulebookSection>
        </Reveal>

        <div className="rulebook-page__action">
          <button type="button" className="rulebook-page__link" onClick={() => onNavigate('contact')}>
            {t('pages.rulebook.contactCta')}
          </button>
        </div>
      </div>
    </main>
  )
}
