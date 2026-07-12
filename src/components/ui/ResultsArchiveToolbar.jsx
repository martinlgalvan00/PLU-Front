import { Search } from 'lucide-react'

import FilterPills from './FilterPills.jsx'
import ResultsSortMenu from './ResultsSortMenu.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'

export default function ResultsArchiveToolbar({
  count,
  compact = false,
  embedded = false,
  filter,
  filterCount,
  filterIndex = 0,
  filterLabel,
  filters,
  hero = false,
  layout = 'default',
  onFilterChange,
  onQueryChange,
  onSortChange,
  query,
  segmented = false,
  showCount = true,
  sort,
  sorts,
}) {
  const { t } = useI18n()

  const className = [
    'results-toolbar',
    embedded ? 'results-toolbar--embedded' : '',
    compact ? 'results-toolbar--compact' : '',
    hero ? 'results-toolbar--hero' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const filtersShellClass = [
    'results-toolbar__filters-shell',
    segmented ? 'results-toolbar__filters-shell--segmented' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const countLabel =
    count === 1
      ? t('pages.results.eventCount_one', { count })
      : t('pages.results.eventCount_other', { count })

  const filtersShell = (
    <div
      className={filtersShellClass}
      style={
        segmented
          ? {
              '--filter-active-index': filterIndex,
              '--filter-count': filterCount,
            }
          : undefined
      }
    >
      <FilterPills
        active={filter}
        ariaLabel={t('pages.results.filterArchiveAria')}
        className="filter-pills--refined results-toolbar__filters segmented-switch--luxury"
        onChange={onFilterChange}
        options={filters}
        segmented={segmented}
      />
    </div>
  )

  if (layout === 'page') {
    return (
      <div className={`results-toolbar results-toolbar--page ${compact ? 'results-toolbar--compact' : ''}`.trim()}>
        <div className="results-page__toolbar-row">
          <FilterPills
            active={filter}
            ariaLabel={t('pages.results.filterArchiveAria')}
            className="results-page__filters filter-pills--refined"
            onChange={onFilterChange}
            options={filters}
          />
          <div className="results-page__toolbar-meta">
            <ResultsSortMenu
              className="results-sort-menu--inline"
              minimal
              sort={sort}
              options={sorts}
              onSortChange={onSortChange}
            />
            {showCount ? (
              <span className="results-page__count" aria-live="polite">
                {countLabel}
              </span>
            ) : null}
          </div>
        </div>

        <label className="results-page__search">
          <Search size={15} aria-hidden />
          <input
            type="search"
            value={query}
            placeholder={t('pages.results.searchPlaceholder')}
            aria-label={t('pages.results.searchAria')}
            onChange={(event) => onQueryChange(event.target.value)}
          />
        </label>
      </div>
    )
  }

  if (hero) {
    return (
      <div className={className}>
        <div className="results-hero__toolbar results-hero__toolbar--luxury">
          <div className="results-hero__control-rail">
            <div className="results-hero__control-primary">
              <label className="results-toolbar__search results-toolbar__search--luxury">
                <Search size={15} aria-hidden />
                <input
                  type="search"
                  value={query}
                  placeholder={t('pages.results.heroSearchPlaceholder')}
                  aria-label={t('pages.results.searchAria')}
                  onChange={(event) => onQueryChange(event.target.value)}
                />
              </label>

              <span className="results-hero__control-divider" aria-hidden />

              <ResultsSortMenu luxury sort={sort} options={sorts} onSortChange={onSortChange} />
            </div>

            <span className="results-hero__control-divider results-hero__control-divider--filters" aria-hidden />

            <div className="results-hero__control-filters">{filtersShell}</div>

            {showCount && (
              <span className="results-hero__count" aria-live="polite">
                {countLabel}
              </span>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={className}>
      <div className="results-toolbar__controls">
        <label className="results-toolbar__search">
          <Search size={16} aria-hidden />
          <input
            type="search"
            value={query}
            placeholder={t('pages.results.searchPlaceholder')}
            aria-label={t('pages.results.searchAria')}
            onChange={(event) => onQueryChange(event.target.value)}
          />
        </label>

        <ResultsSortMenu sort={sort} options={sorts} onSortChange={onSortChange} />
      </div>

      <div className="results-toolbar__filters-row">
        {filtersShell}
        {showCount && (
          <p className="results-toolbar__count" aria-live="polite">
            {countLabel}
            {filterLabel ? ` ${filterLabel}` : ''}
          </p>
        )}
      </div>
    </div>
  )
}
