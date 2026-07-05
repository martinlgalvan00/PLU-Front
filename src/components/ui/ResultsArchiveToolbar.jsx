import { Search } from 'lucide-react'
import FilterPills from './FilterPills.jsx'
import { RESULTS_FILTERS, RESULTS_SORTS } from '../../services/resultsService.js'

export default function ResultsArchiveToolbar({
  count,
  embedded = false,
  filter,
  filterLabel,
  onFilterChange,
  onQueryChange,
  onSortChange,
  query,
  sort,
}) {
  return (
    <div className={`results-toolbar ${embedded ? 'results-toolbar--embedded' : ''}`.trim()}>
      <div className="results-toolbar__controls">
        <label className="results-toolbar__search">
          <Search size={16} aria-hidden />
          <input
            type="search"
            value={query}
            placeholder="Buscar evento, sede o ciudad…"
            aria-label="Buscar eventos en el archivo de resultados"
            onChange={(event) => onQueryChange(event.target.value)}
          />
        </label>

        <label className="results-toolbar__sort">
          <span className="results-toolbar__sort-label">Orden</span>
          <select value={sort} aria-label="Ordenar eventos" onChange={(event) => onSortChange(event.target.value)}>
            {RESULTS_SORTS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="results-toolbar__row">
        <FilterPills
          active={filter}
          ariaLabel="Filtrar archivo de resultados"
          onChange={onFilterChange}
          options={RESULTS_FILTERS}
        />

        <p className="results-toolbar__count" aria-live="polite">
          {count} {count === 1 ? 'evento' : 'eventos'} {filterLabel}
        </p>
      </div>
    </div>
  )
}
