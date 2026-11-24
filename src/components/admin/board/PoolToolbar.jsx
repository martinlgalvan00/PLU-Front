import { ChevronDown, Search } from 'lucide-react'
import SegmentedSwitch from '../../ui/SegmentedSwitch.jsx'
import { EMPTY_POOL_FILTERS, hasActivePoolFilters } from '../../../services/eventBoardPlanner.js'

/**
 * Select sin etiqueta aparte: el nombre del filtro es la opción "todos" ("Sexo"),
 * así que sin elegir nada el control dice qué filtra y, elegido, dice qué eligió.
 * El nombre accesible es siempre el del filtro.
 */
function FacetSelect({ label, onChange, options, value }) {
  return (
    <label className={`admin-board__facet${value ? ' is-set' : ''}`}>
      <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{label}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.value}
          </option>
        ))}
      </select>
      <ChevronDown size={13} strokeWidth={1.8} aria-hidden />
    </label>
  )
}

function RangePair({ fromValue, label, onFrom, onTo, t, toValue }) {
  return (
    <fieldset className="admin-board__filter-pair">
      <legend>{label}</legend>
      <div className="admin-board__filter-pair-inputs">
        <label className="admin-board__filter">
          <span className="visually-hidden">{`${label} · ${t('admin.board.filterFrom')}`}</span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            placeholder={t('admin.board.filterFrom')}
            value={fromValue}
            onChange={(event) => onFrom(event.target.value)}
          />
        </label>
        <label className="admin-board__filter">
          <span className="visually-hidden">{`${label} · ${t('admin.board.filterTo')}`}</span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            placeholder={t('admin.board.filterTo')}
            value={toValue}
            onChange={(event) => onTo(event.target.value)}
          />
        </label>
      </div>
    </fieldset>
  )
}

/**
 * PoolToolbar — PLU ARG
 *
 * Filtros de la bolsa de inscriptos sin ubicar: búsqueda, sexo, categoría,
 * división, rango de peso y de edad, más el cambio entre lista y vista por
 * grupo. Es lo que permite "ver quiénes son los Junior Raw de 57 a 63 kg" y
 * mandarlos a una tanda de un solo gesto.
 *
 * Minimalista a propósito: la bolsa tiene una altura acotada y los filtros no
 * pueden comérsela. Una línea de búsqueda, una fila de tres selects sin
 * etiquetas aparte, "Peso y edad" plegado y la vista como texto.
 *
 * Los filtros son estado del padre porque la selección "todos" y el conteo de
 * la cabecera se calculan sobre la lista filtrada, no sobre la bolsa entera.
 */
export default function PoolToolbar({ facets, filters, onChange, onView, shown, t, total, view }) {
  const active = hasActivePoolFilters(filters)
  const set = (patch) => onChange({ ...filters, ...patch })
  // El bloque de peso/edad arranca abierto si ya hay un rango cargado, y el
  // resumen dice cuántos de los dos rangos están activos aunque esté plegado.
  const rangesSet = [
    filters.weightMin !== '' || filters.weightMax !== '',
    filters.ageMin !== '' || filters.ageMax !== '',
  ].filter(Boolean).length

  return (
    <div className="admin-board__toolbar">
      <label className="admin-board__search">
        <span className="visually-hidden">{t('admin.board.searchPool')}</span>
        <Search size={14} aria-hidden />
        <input
          type="search"
          value={filters.query}
          placeholder={t('admin.board.searchPoolPlaceholder')}
          onChange={(event) => set({ query: event.target.value })}
        />
      </label>

      <div className="admin-board__filters">
        <FacetSelect
          label={t('admin.board.filterSex')}
          onChange={(value) => set({ sex: value })}
          options={facets.sex}
          value={filters.sex}
        />
        <FacetSelect
          label={t('admin.board.filterCategory')}
          onChange={(value) => set({ category: value })}
          options={facets.category}
          value={filters.category}
        />
        <FacetSelect
          label={t('admin.board.filterDivision')}
          onChange={(value) => set({ division: value })}
          options={facets.division}
          value={filters.division}
        />
      </div>

      <details className="admin-board__filter-more" open={rangesSet > 0 || undefined}>
        <summary>
          {t('admin.board.filterMore')}
          {rangesSet > 0 ? (
            <span className="admin-board__filter-more-count">{rangesSet}</span>
          ) : null}
        </summary>
        <div className="admin-board__filter-ranges">
          <RangePair
            fromValue={filters.weightMin}
            label={t('admin.board.filterWeight')}
            onFrom={(value) => set({ weightMin: value })}
            onTo={(value) => set({ weightMax: value })}
            t={t}
            toValue={filters.weightMax}
          />
          <RangePair
            fromValue={filters.ageMin}
            label={t('admin.board.filterAge')}
            onFrom={(value) => set({ ageMin: value })}
            onTo={(value) => set({ ageMax: value })}
            t={t}
            toValue={filters.ageMax}
          />
        </div>
      </details>

      <div className="admin-board__toolbar-foot">
        <SegmentedSwitch
          active={view}
          ariaLabel={t('admin.board.viewAria')}
          className="admin-board__pool-view"
          onChange={onView}
          options={[
            ['list', t('admin.board.viewList')],
            ['groups', t('admin.board.viewGroups')],
          ]}
        />
        {active ? (
          <p className="admin-board__filter-status" role="status">
            <span>{t('admin.board.filterShowing', { shown, total })}</span>
            <button
              type="button"
              className="admin-board__text-btn"
              onClick={() => onChange({ ...EMPTY_POOL_FILTERS })}
            >
              {t('admin.board.filterClear')}
            </button>
          </p>
        ) : null}
      </div>
    </div>
  )
}
