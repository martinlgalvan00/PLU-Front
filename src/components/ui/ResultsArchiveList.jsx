import { useEffect, useRef } from 'react'
import { CalendarDays, ChevronRight, MapPin } from 'lucide-react'
import ResultsEventPanel from './ResultsEventPanel.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { hasEventResults } from '../../services/resultsService.js'

function formatArchiveDate(dateISO, locale) {
  const date = new Date(`${dateISO}T12:00:00`)
  const day = date.getDate()
  const month = date
    .toLocaleDateString(locale === 'en' ? 'en-US' : 'es-AR', { month: 'short' })
    .replace('.', '')
  const year = date.getFullYear()

  return { day, month, year }
}

function ResultsStatusBadge({ status, t }) {
  return (
    <span className={`results-badge results-badge--${status}`}>
      {status === 'published' ? t('pages.results.listPublished') : t('pages.results.listPending')}
    </span>
  )
}

function ResultsArchiveRow({ entry, isExpanded, onSelect, onNavigate, t, locale }) {
  const isPublished = entry.resultsStatus === 'published'
  const canShowResults = isPublished && hasEventResults(entry.slug)
  const { day, month, year } = formatArchiveDate(entry.dateISO, locale)
  const panelRef = useRef(null)

  useEffect(() => {
    if (!isExpanded || !panelRef.current) return
    panelRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [isExpanded])

  function handleRowActivate() {
    if (canShowResults) {
      onSelect(entry.slug)
      return
    }

    if (!isPublished && entry.featured && entry.slug?.includes('pitbull')) {
      onNavigate?.('pitbull')
    }
  }

  function handleAction(event) {
    event.stopPropagation()

    if (canShowResults) {
      onSelect(entry.slug)
      return
    }

    if (!isPublished && entry.featured && entry.slug?.includes('pitbull')) {
      onNavigate?.('pitbull')
    }
  }

  const actionLabel = canShowResults
    ? isExpanded
      ? t('pages.results.listHideResults')
      : t('pages.results.listViewResults')
    : entry.featured
      ? t('pages.results.listViewEvent')
      : t('pages.results.listSoon')

  return (
    <div className={`results-archive-item${isExpanded ? ' results-archive-item--expanded' : ''}`}>
      <article
        className={`results-archive-row ${entry.featured ? 'results-archive-row--featured' : ''} ${isPublished ? 'results-archive-row--published' : ''}${canShowResults ? ' results-archive-row--interactive' : ''}`.trim()}
        onClick={canShowResults ? handleRowActivate : undefined}
        onKeyDown={
          canShowResults
            ? (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  handleRowActivate()
                }
              }
            : undefined
        }
        role={canShowResults ? 'button' : undefined}
        tabIndex={canShowResults ? 0 : undefined}
        aria-expanded={canShowResults ? isExpanded : undefined}
      >
        <div className="results-archive-row__date" aria-hidden>
          <span className="results-archive-row__day">{day}</span>
          <span className="results-archive-row__month">{month}</span>
          <span className="results-archive-row__year">{year}</span>
        </div>

        <div className="results-archive-row__body">
          <div className="results-archive-row__title-row">
            <h3 className="results-archive-row__title">{entry.title}</h3>
            {entry.featured && <span className="results-archive-row__tag">{t('pages.results.listNext')}</span>}
          </div>
          <p className="results-archive-row__meta">
            <MapPin size={12} aria-hidden />
            {entry.venue} · {entry.location}
          </p>
        </div>

        <div className="results-archive-row__aside">
          <ResultsStatusBadge status={entry.resultsStatus} t={t} />
          <button
            type="button"
            className={`results-archive-row__action ${canShowResults || entry.featured ? 'results-archive-row__action--active' : ''}${isExpanded ? ' results-archive-row__action--expanded' : ''}`.trim()}
            onClick={handleAction}
            disabled={!canShowResults && !entry.featured}
          >
            {actionLabel}
            {(canShowResults || entry.featured) && <ChevronRight size={15} aria-hidden />}
          </button>
        </div>
      </article>

      {isExpanded && canShowResults && (
        <div ref={panelRef}>
          <ResultsEventPanel entry={entry} onClose={() => onSelect(entry.slug)} />
        </div>
      )}
    </div>
  )
}

export default function ResultsArchiveList({ entries, onNavigate, selectedSlug, onSelect }) {
  const { locale, t } = useI18n()

  if (!entries.length) {
    return (
      <div className="results-filter-empty">
        <CalendarDays size={20} aria-hidden className="results-filter-empty__icon" />
        <p className="results-filter-empty__title">{t('pages.results.emptyNoMatchesTitle')}</p>
        <p className="results-filter-empty__desc">{t('pages.results.emptyNoMatchesDesc')}</p>
      </div>
    )
  }

  return (
    <div className="results-archive-list">
      {entries.map((entry) => (
        <ResultsArchiveRow
          key={entry.slug}
          entry={entry}
          isExpanded={selectedSlug === entry.slug}
          locale={locale}
          onNavigate={onNavigate}
          onSelect={onSelect}
          t={t}
        />
      ))}
    </div>
  )
}
