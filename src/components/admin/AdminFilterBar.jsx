import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Search, SlidersHorizontal, X } from 'lucide-react'
import AdminFilterChipGroup from './AdminFilterChipGroup.jsx'
import AdminFilterDateRange from './AdminFilterDateRange.jsx'
import AdminFilterPanel from './AdminFilterPanel.jsx'
import AdminFilterPillRow from './AdminFilterPillRow.jsx'
import AdminFilterSearch from './AdminFilterSearch.jsx'
import AdminFilterSelect from './AdminFilterSelect.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { filterValueText, filterValueTone, isFilterActive, neutralValue } from '../../lib/adminFilterValue.js'

/**
 * @typedef {Object} AdminFilterGroup
 * @property {string} id
 * @property {string} [label]
 * @property {string|{from: string, to: string}} value Objeto `{from, to}` solo para `variant: 'dateRange'`.
 * @property {(value: string|{from: string, to: string}) => void} onChange
 * @property {[string, string, (string|number)?, ('success'|'danger'|'info')?][]} [options] No aplica a `dateRange`.
 * @property {'chips' | 'select' | 'toggle' | 'dateRange'} [variant]
 * @property {string|{from: string, to: string}} [defaultValue] Valor sin filtro; por convención, la primera opción.
 *   Obligatorio en `dateRange` (no tiene `options` del que inferirlo): usar `{ from: '', to: '' }`.
 * @property {boolean} [showLabel] Forzá label visible (inline suele ocultarlo si hay un solo grupo).
 * @property {string} [ariaLabel] Nombre accesible cuando el label visual está oculto.
 * @property {boolean} [advanced] Si es true, queda detrás de «Más criterios».
 * @property {string} [allLabel] Etiqueta corta del valor neutro cuando el grupo es de chips.
 */

const ADVANCED_POPOVER_GAP = 8
const ADVANCED_POPOVER_MARGIN = 12
const ADVANCED_POPOVER_MAX_WIDTH = 520
const ADVANCED_POPOVER_MAX_HEIGHT = 560
const ADVANCED_POPOVER_MIN_FLIP = 280

function getAdvancedPopoverBounds(toggle) {
  const host =
    toggle.closest('#admin-main-content') || toggle.closest('.admin-shell__main')
  const rect = host?.getBoundingClientRect()
  const viewportRight = window.innerWidth
  const viewportBottom = window.innerHeight
  if (rect && rect.width > 0) {
    return {
      left: Math.max(ADVANCED_POPOVER_MARGIN, rect.left + ADVANCED_POPOVER_MARGIN),
      right: Math.min(viewportRight, rect.right) - ADVANCED_POPOVER_MARGIN,
      top: Math.max(ADVANCED_POPOVER_MARGIN, rect.top + ADVANCED_POPOVER_MARGIN),
      bottom: Math.min(viewportBottom, rect.bottom) - ADVANCED_POPOVER_MARGIN,
    }
  }
  return {
    left: ADVANCED_POPOVER_MARGIN,
    right: viewportRight - ADVANCED_POPOVER_MARGIN,
    top: ADVANCED_POPOVER_MARGIN,
    bottom: viewportBottom - ADVANCED_POPOVER_MARGIN,
  }
}

/**
 * Ancla el sheet al botón, alineado a su izquierda, y lo mantiene dentro del
 * main de admin — no del viewport entero. Centrar 520px sobre un botón pegado
 * al riel mandaba `left: 45px` debajo del sidebar y recortaba el título.
 */
function placeAdvancedPopover(toggle, popover) {
  const toggleRect = toggle.getBoundingClientRect()
  const bounds = getAdvancedPopoverBounds(toggle)
  const width = Math.min(
    ADVANCED_POPOVER_MAX_WIDTH,
    Math.max(280, bounds.right - bounds.left),
  )
  const spaceBelow = bounds.bottom - toggleRect.bottom - ADVANCED_POPOVER_GAP
  const spaceAbove = toggleRect.top - bounds.top - ADVANCED_POPOVER_GAP
  const flip = spaceBelow < ADVANCED_POPOVER_MIN_FLIP && spaceAbove > spaceBelow
  const available = Math.max(160, flip ? spaceAbove : spaceBelow)

  let left = toggleRect.left
  if (left + width > bounds.right) left = bounds.right - width
  if (left < bounds.left) left = bounds.left

  popover.style.position = 'fixed'
  popover.style.width = `${width}px`
  popover.style.maxWidth = `${width}px`
  popover.style.maxHeight = `${Math.min(ADVANCED_POPOVER_MAX_HEIGHT, available)}px`
  popover.style.left = `${Math.round(left)}px`
  popover.style.right = 'auto'
  if (flip) {
    popover.style.top = 'auto'
    popover.style.bottom = `${Math.round(window.innerHeight - toggleRect.top + ADVANCED_POPOVER_GAP)}px`
  } else {
    popover.style.top = `${Math.round(toggleRect.bottom + ADVANCED_POPOVER_GAP)}px`
    popover.style.bottom = 'auto'
  }
  popover.dataset.placed = 'true'
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
      className={[
        'admin-filter-group',
        'admin-filter-group--rail',
        'admin-filter-group--compact',
        'admin-filter-group--inline',
        'admin-filter-group--toggle',
        label ? 'admin-filter-group--labeled' : '',
      ]
        .filter(Boolean)
        .join(' ')}
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
  /** `'popover'`: search + una fila de pills que abren un popover por filtro,
   * en vez del panel apilado de abajo. Ver AdminFilterPillRow. */
  layout,
}) {
  const { t } = useI18n()
  const panelId = useId()
  const filterPanelId = useId()
  const advancedDialogId = useId()
  const advancedTitleId = useId()
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [filterPanelOpen, setFilterPanelOpen] = useState(false)
  const rootRef = useRef(null)
  const hasMountedFilters = useRef(false)
  /** En listados (inline), los chips van siempre a la vista: el toggle suma un click de más. */
  const alwaysShowFilters = inline
  const visibleFilters = filters.filter((filter) => !filter.advanced)
  const advancedFilters = filters.filter((filter) => filter.advanced)
  const advancedActiveCount = advancedFilters.filter(isFilterActive).length
  const [advancedOpen, setAdvancedOpen] = useState(() => advancedActiveCount > 0)
  const [advancedQuery, setAdvancedQuery] = useState('')
  const advancedToggleRef = useRef(null)
  const advancedPopoverRef = useRef(null)
  const advancedSearchInputRef = useRef(null)
  // Buscar entre 1-2 filtros no ahorra nada — el cuadro solo gana su lugar
  // cuando hay más avanzados de los que se leen de un vistazo (ej. Auditoría).
  const showAdvancedSearch = advancedFilters.length > 2
  const filteredAdvancedFilters = useMemo(() => {
    const normalizedQuery = advancedQuery.trim().toLowerCase()
    if (!normalizedQuery) return advancedFilters
    return advancedFilters.filter((filter) =>
      (filter.ariaLabel ?? filter.label ?? '').toLowerCase().includes(normalizedQuery),
    )
  }, [advancedFilters, advancedQuery])
  const shownFilters = advancedOpen ? filters : visibleFilters
  const activeFilters = filters.filter(isFilterActive)
  const hasQuery = Boolean(query && query.trim())
  const activeCount = activeFilters.length + (hasQuery ? 1 : 0)
  const panelOpen = alwaysShowFilters || filtersOpen
  const chipGroupCount = shownFilters.filter(
    (filter) =>
      filter.variant !== 'select' && filter.variant !== 'toggle' && filter.variant !== 'dateRange',
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
    () =>
      `${query ?? ''}|${filters.map((filter) => `${filter.id}:${JSON.stringify(filter.value)}`).join('|')}`,
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

  // El panel de avanzados ahora flota (popover): cerrar al click afuera o con
  // Escape, mismo patrón que el popover de AdminSavedViews.
  useEffect(() => {
    if (!advancedOpen) return undefined
    function handlePointerDown(event) {
      if (
        advancedPopoverRef.current &&
        !advancedPopoverRef.current.contains(event.target) &&
        advancedToggleRef.current &&
        !advancedToggleRef.current.contains(event.target)
      ) {
        setAdvancedOpen(false)
      }
    }
    function handleKeyDown(event) {
      if (event.key !== 'Escape') return
      setAdvancedOpen(false)
      advancedToggleRef.current?.focus()
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [advancedOpen])

  useLayoutEffect(() => {
    if (!advancedOpen) return undefined
    const popover = advancedPopoverRef.current
    const toggle = advancedToggleRef.current
    if (!popover || !toggle) return undefined

    function place() {
      placeAdvancedPopover(toggle, popover)
    }

    place()
    const raf = window.requestAnimationFrame(place)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.cancelAnimationFrame(raf)
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
      popover.style.maxHeight = ''
      popover.style.maxWidth = ''
      popover.style.width = ''
      popover.style.top = ''
      popover.style.bottom = ''
      popover.style.left = ''
      popover.style.right = ''
      popover.style.position = ''
      delete popover.dataset.placed
    }
  }, [advancedOpen, filteredAdvancedFilters.length])

  useEffect(() => {
    if (advancedOpen && showAdvancedSearch) {
      requestAnimationFrame(() => advancedSearchInputRef.current?.focus())
    } else if (!advancedOpen) {
      setAdvancedQuery('')
    }
  }, [advancedOpen, showAdvancedSearch])

  // El panel único (`layout="panel"`) vive en flujo normal dentro de la
  // tarjeta -- no flota -- pero sigue cerrando al click afuera o con Escape,
  // igual que el resto de los desplegables de esta barra.
  useEffect(() => {
    if (layout !== 'panel' || !filterPanelOpen) return undefined
    function handlePointerDown(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) setFilterPanelOpen(false)
    }
    function handleKeyDown(event) {
      if (event.key === 'Escape') setFilterPanelOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [layout, filterPanelOpen])

  function clearAll() {
    activeFilters.forEach((filter) => filter.onChange(neutralValue(filter)))
    if (hasQuery) onQueryChange('')
  }

  function clearAdvanced() {
    advancedFilters.filter(isFilterActive).forEach((filter) => filter.onChange(neutralValue(filter)))
  }

  function closeAdvanced() {
    setAdvancedOpen(false)
    requestAnimationFrame(() => advancedToggleRef.current?.focus())
  }

  function renderFilter(filter) {
    // Faceta etiquetada por defecto: "Todos" sin "Estado" / "Canal" no se entiende.
    // Opt-out explícito con `showLabel: false` cuando el contexto de la pantalla
    // ya nombra el único criterio.
    const sharedLabel = filter.showLabel === false ? undefined : filter.label

    if (filter.variant === 'dateRange') {
      return (
        <AdminFilterDateRange
          key={filter.id}
          id={filter.id}
          label={sharedLabel}
          value={filter.value}
          onChange={filter.onChange}
          disabled={filter.disabled}
          presentation="popover"
        />
      )
    }

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

  if (layout === 'panel') {
    const panelRootClassName = [
      'admin-filters',
      'admin-filters--panel',
      className,
      filters.some(isFilterActive) ? 'admin-filters--has-active' : '',
    ]
      .filter(Boolean)
      .join(' ')
    const panelActiveFilters = filters.filter(isFilterActive)
    const filterPanelTriggerClassName = [
      'admin-filter-panel-trigger',
      filterPanelOpen ? 'is-open' : '',
      panelActiveFilters.length > 0 ? 'has-active' : '',
    ]
      .filter(Boolean)
      .join(' ')

    return (
      <div ref={rootRef} className={panelRootClassName}>
        <div className="admin-filter-popoverbar">
          <div className="admin-filter-popoverbar__row1">
            <AdminFilterSearch placeholder={placeholder} query={query} onQueryChange={onQueryChange} />
            {filters.length > 0 ? (
              <button
                type="button"
                className={filterPanelTriggerClassName}
                aria-expanded={filterPanelOpen}
                aria-controls={filterPanelId}
                onClick={() => setFilterPanelOpen((current) => !current)}
              >
                <SlidersHorizontal size={15} aria-hidden />
                <span className="admin-filter-panel-trigger__label">{t('admin.filters.toggle')}</span>
                {panelActiveFilters.length > 0 ? (
                  <span
                    className="admin-filter-panel-trigger__badge"
                    aria-label={t('admin.filters.activeCount', { count: panelActiveFilters.length })}
                  >
                    {panelActiveFilters.length}
                  </span>
                ) : null}
                <ChevronDown className="admin-filter-panel-trigger__chevron" size={13} aria-hidden />
              </button>
            ) : null}
            <div className="admin-filter-popoverbar__spacer" />
            {actions ? <div className="admin-filters__actions">{actions}</div> : null}
            {count ? (
              <span className="admin-filter-popoverbar__count" aria-live="polite">
                {count}
              </span>
            ) : null}
          </div>

          {panelActiveFilters.length > 0 ? (
            <div className="admin-filter-panel-chips">
              {panelActiveFilters.map((filter) => {
                const tone = filterValueTone(filter)
                return (
                  <span
                    key={filter.id}
                    className={['admin-filter-panel-chip', tone ? `admin-filter-panel-chip--tone-${tone}` : '']
                      .filter(Boolean)
                      .join(' ')}
                  >
                    {filterValueText(filter, t)}
                    <button
                      type="button"
                      aria-label={t('admin.filters.clearFilter')}
                      onClick={() => filter.onChange(neutralValue(filter))}
                    >
                      <X size={10} aria-hidden />
                    </button>
                  </span>
                )
              })}
              <button type="button" className="admin-filter-panel-chips__clear" onClick={clearAll}>
                {t('admin.filters.clearActive', { count: panelActiveFilters.length })}
              </button>
            </div>
          ) : null}

          {filterPanelOpen && filters.length > 0 ? (
            <AdminFilterPanel id={filterPanelId} filters={filters} />
          ) : null}
        </div>
      </div>
    )
  }

  if (layout === 'popover') {
    const popoverRootClassName = [
      'admin-filters',
      'admin-filters--popover',
      className,
      filters.some(isFilterActive) ? 'admin-filters--has-active' : '',
    ]
      .filter(Boolean)
      .join(' ')

    return (
      <div ref={rootRef} className={popoverRootClassName}>
        <div className="admin-filter-popoverbar">
          <div className="admin-filter-popoverbar__toolbar">
            <AdminFilterSearch placeholder={placeholder} query={query} onQueryChange={onQueryChange} />
            {activeCount > 0 ? (
              <button type="button" className="admin-filter-popoverbar__clear" onClick={clearAll}>
                <X size={12} aria-hidden />
                <span>{t('admin.filters.clearActive', { count: activeCount })}</span>
              </button>
            ) : null}
            {actions ? <div className="admin-filters__actions">{actions}</div> : null}
            {count ? (
              <span className="admin-filter-popoverbar__count" aria-live="polite">
                {count}
              </span>
            ) : null}
          </div>
          {filters.length > 0 ? (
            <div className="admin-filter-popoverbar__facets">
              <AdminFilterPillRow filters={filters} />
            </div>
          ) : null}
        </div>
      </div>
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
            <div className="admin-filters__chips-row">
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
              </div>

              {/* Advanced toggle inline — vive en la misma fila que los chips
                  para que el usuario lo perciba como "ver más opciones de esta barra"
                  y no como un bloque separado. */}
              {advancedFilters.length > 0 ? (
                <button
                  ref={advancedToggleRef}
                  type="button"
                  className={[
                    'admin-filters__advanced-toggle',
                    advancedOpen ? 'is-open' : '',
                    advancedActiveCount > 0 ? 'is-active' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  aria-expanded={advancedOpen}
                  aria-haspopup="dialog"
                  aria-controls={advancedDialogId}
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
                  <ChevronDown className="admin-filters__toggle-icon" size={12} aria-hidden />
                </button>
              ) : null}
            </div>
          </div>

          {/* Fuera de `.admin-filters__panel-inner` para no recortarse con el
              overflow del acordeón mobile. El ancla visual es el botón: JS lo
              posiciona `fixed` debajo (o arriba si no hay lugar). */}
          {advancedOpen && advancedFilters.length > 0 ? (
            <div
              ref={advancedPopoverRef}
              id={advancedDialogId}
              className="admin-filters__advanced-popover"
              role="dialog"
              aria-labelledby={advancedTitleId}
            >
              <div className="admin-filters__advanced-header">
                <div className="admin-filters__advanced-heading">
                  <h2 id={advancedTitleId} className="admin-filters__advanced-title">
                    {t('admin.filters.advancedLabel')}
                  </h2>
                  {advancedActiveCount > 0 ? (
                    <span
                      className="admin-filters__advanced-badge"
                      aria-label={t('admin.filters.activeCount', { count: advancedActiveCount })}
                    >
                      {advancedActiveCount}
                    </span>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="admin-filters__advanced-close"
                  aria-label={t('admin.filters.closeAdvanced')}
                  onClick={closeAdvanced}
                >
                  <X size={16} aria-hidden />
                </button>
              </div>

              {showAdvancedSearch ? (
                <div className="admin-filters__advanced-search">
                  <Search size={13} aria-hidden />
                  <input
                    ref={advancedSearchInputRef}
                    type="text"
                    className="admin-filters__advanced-search-input"
                    value={advancedQuery}
                    onChange={(event) => setAdvancedQuery(event.target.value)}
                    placeholder={t('admin.filters.searchFilters')}
                  />
                </div>
              ) : null}

              <div className="admin-filters__advanced-body">
                {filteredAdvancedFilters.length > 0 ? (
                  <AdminFilterPanel
                    filters={filteredAdvancedFilters}
                    className="admin-filter-panel--sheet"
                    lead="meta"
                    ariaLabel={t('admin.filters.advancedLabel')}
                  />
                ) : (
                  <p className="admin-filters__advanced-empty">
                    {t('admin.filters.noMatchingFilters')}
                  </p>
                )}
              </div>

              <div className="admin-filters__advanced-footer">
                {advancedActiveCount > 0 ? (
                  <button
                    type="button"
                    className="admin-filters__advanced-clear"
                    onClick={clearAdvanced}
                  >
                    {t('admin.filters.clearAdvanced')}
                  </button>
                ) : (
                  <span className="admin-filters__advanced-footer-spacer" aria-hidden />
                )}
                <button
                  type="button"
                  className="admin-filters__advanced-done"
                  onClick={closeAdvanced}
                >
                  {t('admin.filters.done')}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
