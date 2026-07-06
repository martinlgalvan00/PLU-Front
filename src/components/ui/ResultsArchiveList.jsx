import { CalendarDays, ChevronRight, MapPin } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'

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

function ResultsArchiveRow({ entry, onNavigate, t, locale }) {
  const isPublished = entry.resultsStatus === 'published'
  const { day, month, year } = formatArchiveDate(entry.dateISO, locale)

  function handleAction() {
    if (isPublished) {
      onNavigate?.('events')
      return
    }

    if (entry.slug?.includes('pitbull')) {
      onNavigate?.('pitbull')
    }
  }

  const actionLabel = isPublished
    ? t('pages.results.listViewResults')
    : entry.featured
      ? t('pages.results.listViewEvent')
      : t('pages.results.listSoon')

  return (
    <article
      className={`results-archive-row ${entry.featured ? 'results-archive-row--featured' : ''} ${isPublished ? 'results-archive-row--published' : ''}`.trim()}
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
          className={`results-archive-row__action ${isPublished || entry.featured ? 'results-archive-row__action--active' : ''}`.trim()}
          onClick={handleAction}
          disabled={!isPublished && !entry.featured}
        >
          {actionLabel}
          {(isPublished || entry.featured) && <ChevronRight size={15} aria-hidden />}
        </button>
      </div>
    </article>
  )
}

export default function ResultsArchiveList({ entries, onNavigate }) {
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
        <ResultsArchiveRow key={entry.slug} entry={entry} locale={locale} onNavigate={onNavigate} t={t} />
      ))}
    </div>
  )
}
