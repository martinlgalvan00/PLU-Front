import '../styles/pages/institutional-pages.css'
import '../styles/layout/design-page-notebook.css'
import { useMemo, useState } from 'react'
import { ArrowRight, Download, Search } from 'lucide-react'
import InstitutionalPageHero from '../components/layout/InstitutionalPageHero.jsx'
import Reveal from '../components/ui/Reveal.jsx'
import { CLASSIFICATION_STANDARDS } from '../data/classificationStandards.js'
import { useI18n } from '../i18n/I18nProvider.jsx'
import { searchPublishedLifters } from '../services/lifterLookupService.js'

const STANDARD_KEYS = ['open', 'junior', 'masters', 'equipped']

export default function StandardsPage({ onNavigate }) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')

  const lifters = useMemo(() => searchPublishedLifters(query), [query])
  const hasQuery = query.trim().length >= 2

  return (
    <main className="institutional-page standards-page--institutional">
      <InstitutionalPageHero
        breadcrumb={t('pages.standards.heroBreadcrumb')}
        description={t('pages.standards.heroDesc')}
        eyebrow={t('pages.standards.heroEyebrow')}
        index="E / 01"
        onHome={() => onNavigate?.('home')}
        title={t('pages.standards.heroTitle')}
      />

      <div className="institutional-page__inner">
        <Reveal variant="fade">
          <section className="institutional-manifesto" aria-labelledby="standards-intro-title">
            <p className="institutional-kicker">{t('pages.standards.introEyebrow')}</p>
            <h2 id="standards-intro-title">{t('pages.standards.introTitle')}</h2>
            <p>{t('pages.standards.introDesc')}</p>
          </section>
        </Reveal>

        <section className="standards-grid" aria-labelledby="standards-grid-title">
          <header className="institutional-section-head">
            <p className="institutional-kicker">02 / {t('pages.standards.gridEyebrow')}</p>
            <div>
              <h2 id="standards-grid-title">{t('pages.standards.gridTitle')}</h2>
              <p>{t('pages.standards.gridDesc')}</p>
            </div>
          </header>

          <ul className="standards-grid__list">
            {STANDARD_KEYS.map((key) => (
              <li key={key}>
                <h3>{t(`pages.standards.categories.${key}.title`)}</h3>
                <p>{t(`pages.standards.categories.${key}.desc`)}</p>
                <p className="standards-grid__note">
                  {t(`pages.standards.categories.${key}.note`)}
                </p>
              </li>
            ))}
          </ul>

          <div className="standards-grid__doc">
            {CLASSIFICATION_STANDARDS.pdfUrl ? (
              <a
                className="institutional-cta"
                href={CLASSIFICATION_STANDARDS.pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Download size={16} aria-hidden />
                <span>{t(CLASSIFICATION_STANDARDS.pdfLabelKey)}</span>
              </a>
            ) : (
              <p className="standards-grid__pdf-empty">{t('pages.standards.pdfPending')}</p>
            )}
          </div>

          <p className="standards-grid__disclaimer">{t('pages.standards.disclaimer')}</p>
        </section>

        <section className="standards-lookup" aria-labelledby="standards-lookup-title">
          <header className="institutional-section-head">
            <p className="institutional-kicker">03 / {t('pages.standards.lookupEyebrow')}</p>
            <div>
              <h2 id="standards-lookup-title">{t('pages.standards.lookupTitle')}</h2>
              <p>{t('pages.standards.lookupDesc')}</p>
            </div>
          </header>

          <label className="standards-lookup__search">
            <Search size={16} aria-hidden />
            <span className="visually-hidden">{t('pages.standards.lookupLabel')}</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('pages.standards.lookupPlaceholder')}
              autoComplete="off"
            />
          </label>

          {hasQuery ? (
            lifters.length > 0 ? (
              <ul className="standards-lookup__results">
                {lifters.map((lifter) => (
                  <li key={lifter.id}>
                    <strong>{lifter.name}</strong>
                    <span>{lifter.division}</span>
                    <span>{lifter.meet}</span>
                    <span className="standards-lookup__total">{lifter.totalLabel}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="standards-lookup__empty">{t('pages.standards.lookupEmpty')}</p>
            )
          ) : (
            <p className="standards-lookup__hint">{t('pages.standards.lookupHint')}</p>
          )}
        </section>

        <Reveal delay={40}>
          <div className="institutional-cta-row">
            <button
              type="button"
              className="institutional-cta"
              onClick={() => onNavigate?.('rulebook')}
            >
              <span>{t('pages.standards.ctaRulebook')}</span>
              <ArrowRight size={14} aria-hidden />
            </button>
            <button
              type="button"
              className="institutional-cta institutional-cta--ghost"
              onClick={() => onNavigate?.('records')}
            >
              <span>{t('pages.standards.ctaRecords')}</span>
              <ArrowRight size={14} aria-hidden />
            </button>
          </div>
        </Reveal>
      </div>
    </main>
  )
}
