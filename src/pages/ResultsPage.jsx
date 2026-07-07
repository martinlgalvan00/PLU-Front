import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Download, ShieldCheck, Trophy } from 'lucide-react'
import DesignPageHero from '../components/layout/DesignPageHero.jsx'
import Reveal from '../components/ui/Reveal.jsx'
import ResultsArchiveList from '../components/ui/ResultsArchiveList.jsx'
import ResultsArchiveToolbar from '../components/ui/ResultsArchiveToolbar.jsx'
import { useI18n } from '../i18n/I18nProvider.jsx'
import { UPCOMING_EVENTS } from '../lib/events.js'
import {
  filterResultsArchive,
  getResultsArchive,
  getResultsFilterLabels,
  getResultsFilters,
  getResultsSorts,
  getResultsSummary,
  sortResultsArchive,
} from '../services/resultsService.js'

export default function ResultsPage({ onNavigate, events = UPCOMING_EVENTS }) {
  const { locale, t } = useI18n()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [sort, setSort] = useState('recent')
  const [selectedSlug, setSelectedSlug] = useState(null)

  function handleSelectSlug(slug) {
    setSelectedSlug((current) => (current === slug ? null : slug))
  }

  const resultsFilters = useMemo(() => getResultsFilters(t), [t])
  const resultsSorts = useMemo(() => getResultsSorts(t), [t])
  const resultsFilterLabels = useMemo(() => getResultsFilterLabels(t), [t])
  const resultsNotes = useMemo(
    () => [
      {
        icon: ShieldCheck,
        title: t('pages.results.notes.normalization.title'),
        text: t('pages.results.notes.normalization.text'),
      },
      {
        icon: Download,
        title: t('pages.results.notes.export.title'),
        text: t('pages.results.notes.export.text'),
      },
      {
        icon: Trophy,
        title: t('pages.results.notes.pluUsa.title'),
        text: t('pages.results.notes.pluUsa.text'),
      },
    ],
    [t],
  )

  const nextEvent = useMemo(() => events.find((event) => event.featured) ?? events[0], [events])
  const archive = useMemo(() => getResultsArchive(events), [events])
  const summary = useMemo(() => getResultsSummary(archive), [archive])
  const filterIndex = Math.max(
    resultsFilters.findIndex(([key]) => key === filter),
    0,
  )

  const filteredEvents = useMemo(() => {
    const filtered = filterResultsArchive(archive, { query, filter })
    return sortResultsArchive(filtered, sort, locale)
  }, [archive, filter, query, sort, locale])

  useEffect(() => {
    if (selectedSlug && !filteredEvents.some((entry) => entry.slug === selectedSlug)) {
      setSelectedSlug(null)
    }
  }, [filteredEvents, selectedSlug])

  const showPublishedEmpty = summary.published === 0 && (filter === 'all' || filter === 'published')

  return (
    <main className="page page--design results-page--design results-page--premium">
      <DesignPageHero
        className="results-hero"
        compact
        breadcrumbLabel={t('pages.results.heroBreadcrumb')}
        onHome={() => onNavigate?.('home')}
        title={t('pages.results.heroTitle')}
      >
        <dl className="results-hero__status" aria-label={t('pages.results.archiveAria')}>
          <div className="results-hero__metric">
            <dt>{t('pages.results.published')}</dt>
            <dd>{summary.published}</dd>
          </div>
          <div className="results-hero__metric results-hero__metric--pending">
            <dt>{t('pages.results.pending')}</dt>
            <dd>{summary.pending}</dd>
          </div>
        </dl>

        <div className="results-hero__bar">
          <ResultsArchiveToolbar
            compact
            count={filteredEvents.length}
            filter={filter}
            filterCount={resultsFilters.length}
            filterIndex={filterIndex}
            filterLabel={resultsFilterLabels[filter]}
            filters={resultsFilters}
            hero
            query={query}
            segmented
            showCount
            sort={sort}
            sorts={resultsSorts}
            onFilterChange={setFilter}
            onQueryChange={setQuery}
            onSortChange={setSort}
          />
        </div>
      </DesignPageHero>

      <div className="results-page__inner">
        <Reveal>
          <section className="results-shell results-shell--minimal" aria-label={t('pages.results.archiveAria')}>
            <ResultsArchiveList
              entries={filteredEvents}
              onNavigate={onNavigate}
              onSelect={handleSelectSlug}
              selectedSlug={selectedSlug}
            />
          </section>
        </Reveal>

        {showPublishedEmpty && (
          <Reveal delay={60}>
            <div className="results-empty results-empty--premium">
              <span className="results-empty__icon" aria-hidden>
                <Trophy size={22} strokeWidth={1.75} />
              </span>
              <p className="results-empty__title">{t('pages.results.emptyPublishedTitle')}</p>
              <p className="results-empty__desc">{t('pages.results.emptyPublishedDesc')}</p>
              <button
                type="button"
                className="results-empty__link"
                onClick={() => onNavigate?.('pitbull')}
              >
                {t('pages.results.emptyPublishedCta', { event: nextEvent?.title ?? t('nav.pitbull') })}
                <ArrowRight size={14} aria-hidden />
              </button>
            </div>
          </Reveal>
        )}
      </div>

      <section className="results-footnotes" aria-label={t('pages.results.footnotesAria')}>
        <div className="results-footnotes__inner">
          {resultsNotes.map(({ icon: Icon, title, text }) => (
            <Reveal key={title}>
              <article className="results-footnotes__item">
                <span className="results-footnotes__icon" aria-hidden>
                  <Icon size={16} strokeWidth={1.75} />
                </span>
                <div className="results-footnotes__copy">
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </section>
    </main>
  )
}
