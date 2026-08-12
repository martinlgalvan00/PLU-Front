import '../styles/pages/design-phase2.css'
import '../styles/pages/results.css'
import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Download, ShieldCheck, Trophy } from 'lucide-react'
import PluPageHero from '../components/layout/PluPageHero.jsx'
import Reveal from '../components/ui/Reveal.jsx'
import ResultsArchiveList from '../components/ui/ResultsArchiveList.jsx'
import ResultsArchiveToolbar from '../components/ui/ResultsArchiveToolbar.jsx'
import { useI18n } from '../i18n/I18nProvider.jsx'
import { UPCOMING_EVENTS } from '../lib/events.js'
import {
  filterResultsArchive,
  getResultsArchive,
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

  const listKey = `${filter}:${sort}:${query.trim().toLowerCase()}`

  return (
    <main className="page page--design page--plu-ref results-page--design results-page--premium">
      <PluPageHero
        breadcrumbLabel={t('pages.results.heroBreadcrumb')}
        chapter={t('pages.results.heroChapter')}
        description={t('pages.results.heroDesc')}
        onHome={() => onNavigate?.('home')}
        title={t('pages.results.heroTitle')}
      />

      <div className="results-page__inner">
        <div className="results-page__toolbar">
          <ResultsArchiveToolbar
            compact
            count={filteredEvents.length}
            filter={filter}
            filters={resultsFilters}
            layout="page"
            query={query}
            showCount
            sort={sort}
            sorts={resultsSorts}
            onFilterChange={setFilter}
            onQueryChange={setQuery}
            onSortChange={setSort}
          />
        </div>
        <Reveal>
          <section className="results-shell results-shell--minimal" aria-label={t('pages.results.archiveAria')}>
            <ResultsArchiveList
              entries={filteredEvents}
              listKey={listKey}
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
              <div className="results-empty__actions">
                <button
                  type="button"
                  className="results-empty__link"
                  onClick={() => onNavigate?.('events')}
                >
                  {t('pages.results.emptyPublishedCtaCalendar')}
                  <ArrowRight size={14} aria-hidden />
                </button>
                <button
                  type="button"
                  className="results-empty__link"
                  onClick={() => onNavigate?.('members')}
                >
                  {t('pages.results.emptyPublishedCtaMembers')}
                  <ArrowRight size={14} aria-hidden />
                </button>
                {nextEvent ? (
                  <button
                    type="button"
                    className="results-empty__link"
                    onClick={() => onNavigate?.('pitbull')}
                  >
                    {t('pages.results.emptyPublishedCta', { event: nextEvent.title ?? t('nav.pitbull') })}
                    <ArrowRight size={14} aria-hidden />
                  </button>
                ) : null}
              </div>
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
