import { useMemo, useState } from 'react'
import { ArrowRight, Search, X } from 'lucide-react'
import InstitutionalPageHero from '../components/layout/InstitutionalPageHero.jsx'
import FAQAccordion from '../components/ui/FAQAccordion.jsx'
import { useContent } from '../hooks/useContent.js'
import { useI18n } from '../i18n/I18nProvider.jsx'

export default function FAQPage({ onNavigate }) {
  const { FAQ_GROUPS } = useContent()
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')

  const normalizedQuery = query.trim().toLocaleLowerCase()
  const filteredGroups = useMemo(() => FAQ_GROUPS
    .filter((group) => category === 'all' || group.id === category)
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (!normalizedQuery) return true
        return `${item.q} ${item.a}`.toLocaleLowerCase().includes(normalizedQuery)
      }),
    }))
    .filter((group) => group.items.length > 0), [FAQ_GROUPS, category, normalizedQuery])

  const resultCount = filteredGroups.reduce((total, group) => total + group.items.length, 0)

  return (
    <main className="institutional-page faq-page--institutional">
      <InstitutionalPageHero
        aside={(
          <dl className="institutional-hero__ledger">
            <div><dt>{t('pages.faq.heroLedgerTopics')}</dt><dd>{FAQ_GROUPS.length}</dd></div>
            <div><dt>{t('pages.faq.heroLedgerChannel')}</dt><dd>{t('pages.faq.heroLedgerChannelValue')}</dd></div>
          </dl>
        )}
        breadcrumb={t('pages.faq.heroBreadcrumbShort')}
        description={t('pages.faq.heroDesc')}
        eyebrow={t('pages.faq.heroChapter')}
        index="F / 01"
        onHome={() => onNavigate?.('home')}
        title={t('pages.faq.heroTitle')}
      />

      <div className="institutional-page__inner faq-institutional__inner">
        <section className="faq-finder" aria-labelledby="faq-finder-title">
          <div className="faq-finder__intro">
            <p className="institutional-kicker">01 / {t('pages.faq.finderEyebrow')}</p>
            <h2 id="faq-finder-title">{t('pages.faq.finderTitle')}</h2>
          </div>
          <form className="faq-search" role="search" onSubmit={(event) => event.preventDefault()}>
            <Search size={18} aria-hidden />
            <label className="visually-hidden" htmlFor="faq-search-input">{t('pages.faq.searchLabel')}</label>
            <input
              id="faq-search-input"
              autoComplete="off"
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('pages.faq.searchPlaceholder')}
              type="search"
              value={query}
            />
            {query ? (
              <button type="button" aria-label={t('pages.faq.clearSearch')} onClick={() => setQuery('')}>
                <X size={16} aria-hidden />
              </button>
            ) : null}
          </form>
          <div className="faq-categories" role="group" aria-label={t('pages.faq.categoriesAria')}>
            <button type="button" className={category === 'all' ? 'is-active' : ''} aria-pressed={category === 'all'} onClick={() => setCategory('all')}>
              {t('pages.faq.allCategories')}
            </button>
            {FAQ_GROUPS.map((group) => (
              <button
                key={group.id}
                type="button"
                className={category === group.id ? 'is-active' : ''}
                aria-pressed={category === group.id}
                onClick={() => setCategory(group.id)}
              >
                {group.title}
              </button>
            ))}
          </div>
          <p className="faq-finder__count" aria-live="polite">
            {t('pages.faq.resultCount', { count: resultCount })}
          </p>
        </section>

        <div className="faq-results">
          {filteredGroups.length ? filteredGroups.map((group, index) => (
            <section key={group.id} id={group.id} className="faq-institutional-section" aria-labelledby={`${group.id}-title`}>
              <header>
                <span aria-hidden>{String(index + 1).padStart(2, '0')}</span>
                <h2 id={`${group.id}-title`}>{group.title}</h2>
                <small>{String(group.items.length).padStart(2, '0')}</small>
              </header>
              <FAQAccordion idPrefix={group.id} items={group.items} numbered variant="ref" />
            </section>
          )) : (
            <section className="faq-empty-state" aria-labelledby="faq-empty-title">
              <span aria-hidden>00</span>
              <div>
                <h2 id="faq-empty-title">{t('pages.faq.emptyTitle')}</h2>
                <p>{t('pages.faq.emptyDesc')}</p>
              </div>
              <button type="button" onClick={() => { setQuery(''); setCategory('all') }}>
                {t('pages.faq.emptyReset')}
              </button>
            </section>
          )}
        </div>

        <section className="faq-support-band" aria-labelledby="faq-support-title">
          <div>
            <p className="institutional-kicker">{t('pages.faq.supportEyebrow')}</p>
            <h2 id="faq-support-title">{t('pages.faq.notFoundTitle')}</h2>
            <p>{t('pages.faq.supportDesc')}</p>
          </div>
          <button type="button" className="institutional-button institutional-button--primary" onClick={() => onNavigate?.('contact')}>
            {t('pages.faq.notFoundCta')}
            <ArrowRight size={16} aria-hidden />
          </button>
        </section>
      </div>
    </main>
  )
}
