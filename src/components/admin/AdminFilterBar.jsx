import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { ChevronDown, SlidersHorizontal, X } from 'lucide-react'
import AdminFilterChipGroup from './AdminFilterChipGroup.jsx'
import AdminFilterSearch from './AdminFilterSearch.jsx'
import AdminFilterSelect from './AdminFilterSelect.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'

/**
 * @typedef {Object} AdminFilterGroup
 * @property {string} id
 * @property {string} [label]
 * @property {string} value
 * @property {(value: string) => void} onChange
 * @property {[string, string, (string|number)?, ('success'|'danger'|'info')?][]} options
 * @property {'chips' | 'select' | 'toggle'} [variant]
 * @property {string} [defaultValue] Valor sin filtro; por convención, la primera opción.
 * @property {boolean} [showLabel] Forzá label visible (inline suele ocultarlo si hay un solo grupo).
 * @property {string} [ariaLabel] Nombre accesible cuando el label visual está oculto.
 * @property {boolean} [advanced] Si es true, queda detrás de «Más filtros».
 * @property {string} [allLabel] Etiqueta corta del valor neutro cuando el grupo es de chips.
 */

function neutralValue(filter) {
  return filter.defaultValue ?? filter.options?.[0]?.[0]
}

function isFilterActive(filter) {
  return filter.value !== neutralValue(filter)
}

/** Toggle binario: una sola opción no-neutra que se prende/apaga. */
function AdminFilterToggle({
  id,
  label,
  ariaLabel,
  value,
  onChange,
  options = [],
  defaultValue,
  disabled = false,
}) {
  const neutral = defaultValue ?? options[0]?.[0]
  const activeOption = options.find(([optionValue]) => optionValue !== neutral) ?? options[1]
  if (!activeOption) return null

  const [optionValue, optionLabel, optionCount] = activeOption
  const pressed = value === optionValue
  const labelId = label ? `${id}-label` : undefined
  const showCount = optionCount !== undefined && optionCount !== null && optionCount !== ''
  const zeroCount = showCount && Number(optionCount) === 0
  if (zeroCount && !pressed) return null

  return (
    <div
      className="admin-filter-group admin-filter-group--rail admin-filter-group--compact admin-filter-group--inline admin-filter-group--toggle"
      role="group"
      aria-label={!label ? ariaLabel || optionLabel : undefined}
      aria-labelledby={labelId}
    >
      {label ? (
        <span id={labelId} className="admin-filter-group__label">
          {label}
        </span>
      ) : null}
      <button
        type="button"
        className={`admin-filter-chip admin-filter-chip--toggle${pressed ? ' is-active' : ''}`}
        aria-pressed={pressed}
        disabled={disabled}
        onClick={() => onChange(pressed ? neutral : optionValue)}
      >
        <span className="admin-filter-chip__label">{optionLabel}</span>
        {showCount ? (
          <span className="admin-filter-chip__count" aria-hidden>
            {optionCount}
          </span>
        ) : null}
      </button>
    </div>
  )
}

export default function AdminFilterBar({
  actions = null,
  className = '',
  compact = false,
  inline = false,
  count = null,
  query,
  onQueryChange,
  filters = [],
  placeholder = 'Buscar…',
}) {
  const { t } = useI18n()
  const panelId = useId()
  const [filtersOpen, setFiltersOpen] = useState(false)
  const rootRef = useRef(null)
  const hasMountedFilters = useRef(false)
  /** En listados (inline), los chips van siempre a la vista: el toggle suma un click de más. */
  const alwaysShowFilters = inline
  const visibleFilters = filters.filter((filter) => !filter.advanced)
  const advancedFilters = filters.filter((filter) => filter.advanced)
  const advancedActiveCount = advancedFilters.filter(isFilterActive).length
  const [advancedOpen, setAdvancedOpen] = useState(() => advancedActiveCount > 0)
  const shownFilters = advancedOpen ? filters : visibleFilters
  const activeFilters = filters.filter(isFilterActive)
  const hasQuery = Boolean(query && query.trim())
  const activeCount = activeFilters.length + (hasQuery ? 1 : 0)
  const panelOpen = alwaysShowFilters || filtersOpen
  const chipGroupCount = shownFilters.filter(
    (filter) => filter.variant !== 'select' && filter.variant !== 'toggle',
  ).length
  const isMultiGroup = shownFilters.length > 1 || advancedFilters.length > 0
  const rootClassName = [
    'admin-filters',
    'admin-filters--chips',
    'admin-filters--rails',
    compact ? 'admin-filters--compact' : '',
    inline ? 'admin-filters--inline' : '',
    alwaysShowFilters ? 'admin-filters--open' : '',
    isMultiGroup ? 'admin-filters--multi' : '',
    filters.some((filter) => isFilterActive(filter)) ? 'admin-filters--has-active' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')
  const filterSignature = useMemo(
    () => `${query ?? ''}|${filters.map((filter) => `${filter.id}:${filter.value}`).join('|')}`,
    [filters, query],
  )

  useEffect(() => {
    if (!hasMountedFilters.current) {
      hasMountedFilters.current = true
      return
    }
    const root = rootRef.current
    if (!root) return
    root.classList.remove('is-filter-applied')
    void root.offsetWidth
    root.classList.add('is-filter-applied')
    const timer = window.setTimeout(() => root.classList.remove('is-filter-applied'), 420)
    return () => window.clearTimeout(timer)
  }, [filterSignature])

  useEffect(() => {
    if (advancedActiveCount > 0) setAdvancedOpen(true)
  }, [advancedActiveCount])

  function clearAll() {
    activeFilters.forEach((filter) => filter.onChange(neutralValue(filter)))
    if (hasQuery) onQueryChange('')
  }

  function renderFilter(filter) {
    // Labels visibles solo si se piden o si es select (campo etiquetado).
    // En multi-chip/toggle el copy del control ya alcanza — evita "ESTADO / VENCIMIENTO".
    const sharedLabel =
      filter.showLabel === false
        ? undefined
        : filter.showLabel === true || filter.variant === 'select'
          ? filter.label
          : undefined

    if (filter.variant === 'select') {
      return (
        <AdminFilterSelect
          key={filter.id}
          id={filter.id}
          label={sharedLabel}
          ariaLabel={filter.label}
          value={filter.value}
          onChange={filter.onChange}
          options={filter.options}
        />
      )
    }

    if (filter.variant === 'toggle') {
      return (
        <AdminFilterToggle
          key={filter.id}
          id={filter.id}
          label={sharedLabel}
          ariaLabel={filter.ariaLabel ?? filter.label}
          value={filter.value}
          onChange={filter.onChange}
          options={filter.options}
          defaultValue={neutralValue(filter)}
          disabled={filter.disabled}
        />
      )
    }

    return (
      <AdminFilterChipGroup
        key={filter.id}
        compact={compact}
        inline={inline}
        ariaLabel={filter.ariaLabel ?? filter.label}
        id={filter.id}
        label={sharedLabel}
        value={filter.value}
        onChange={filter.onChange}
        options={filter.options}
        disabled={filter.disabled}
        defaultValue={neutralValue(filter)}
        omitNeutral
        allLabel={filter.allLabel ?? t('admin.filters.showingAll')}
        clearable
        hideEmpty
      />
    )
  }

  return (
    <div ref={rootRef} className={rootClassName}>
      <div className="admin-filters__primary">
        <AdminFilterSearch placeholder={placeholder} query={query} onQueryChange={onQueryChange} />

        {!alwaysShowFilters && filters.length > 0 ? (
          <button
            type="button"
            className={`admin-filters__toggle${filtersOpen ? ' is-open' : ''}`}
            aria-controls={panelId}
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((current) => !current)}
          >
            <SlidersHorizontal size={14} aria-hidden />
            <span>{t('admin.filters.toggle')}</span>
            {activeCount > 0 ? (
              <span
                className="admin-filters__active-count"
                aria-label={t('admin.filters.activeCount', { count: activeCount })}
              >
                {activeCount}
              </span>
            ) : null}
            <ChevronDown className="admin-filters__toggle-icon" size={13} aria-hidden />
          </button>
        ) : null}

        {activeCount > 0 ? (
          <button type="button" className="admin-filters__clear" onClick={clearAll}>
            <X size={12} aria-hidden />
            <span>{t('admin.filters.clearActive', { count: activeCount })}</span>
          </button>
        ) : null}

        {actions ? <div className="admin-filters__actions">{actions}</div> : null}

        {count ? (
          <span className="admin-filters__count" aria-live="polite">
            <span className="admin-filters__count-label">{count}</span>
          </span>
        ) : null}
      </div>

      {filters.length > 0 ? (
        <div
          id={panelId}
          className={`admin-filters__panel${panelOpen ? ' is-open' : ''}`}
          hidden={panelOpen ? undefined : true}
        >
          <div className="admin-filters__panel-inner">
            <div
              className={[
                'admin-filters__groups',
                isMultiGroup ? 'admin-filters__groups--multi' : '',
                chipGroupCount === 0 ? 'admin-filters__groups--secondary-only' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {visibleFilters.map(renderFilter)}
              {advancedOpen ? advancedFilters.map(renderFilter) : null}
              {advancedFilters.length > 0 ? (
                <button
                  type="button"
                  className={[
                    'admin-filters__advanced-toggle',
                    advancedOpen ? 'is-open' : '',
                    advancedActiveCount > 0 ? 'is-active' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  aria-expanded={advancedOpen}
                  onClick={() => setAdvancedOpen((current) => !current)}
                >
                  <span>
                    {advancedOpen
                      ? t('admin.filters.fewerFilters')
                      : t('admin.filters.moreFilters')}
                  </span>
                  {!advancedOpen && advancedActiveCount > 0 ? (
                    <span
                      className="admin-filters__active-count"
                      aria-label={t('admin.filters.activeCount', { count: advancedActiveCount })}
                    >
                      {advancedActiveCount}
                    </span>
                  ) : null}
                  <ChevronDown className="admin-filters__toggle-icon" size={13} aria-hidden />
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
