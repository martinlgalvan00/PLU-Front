import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { ArrowRight, CalendarDays, Search } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'

const MAX_RESULTS = 8
const MIN_QUERY_LENGTH = 2

function normalize(value) {
  return (value ?? '')
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function matchesAthlete(athlete, normalizedQuery) {
  const documentId = String(athlete.documentId ?? '')
  return (
    normalize(athlete.fullName).includes(normalizedQuery) ||
    documentId.includes(normalizedQuery) ||
    normalize(athlete.email).includes(normalizedQuery) ||
    normalize(athlete.gym).includes(normalizedQuery)
  )
}

function matchesEvent(event, normalizedQuery) {
  return (
    normalize(event.title).includes(normalizedQuery) ||
    normalize(event.slug).includes(normalizedQuery) ||
    normalize(event.venue).includes(normalizedQuery) ||
    normalize(event.city).includes(normalizedQuery)
  )
}

function initialsOf(fullName) {
  const parts = (fullName ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

/**
 * Buscador global del panel: salta a la ficha 360° de un atleta o a las
 * inscripciones de un evento. Complementa -- no reemplaza -- los filtros
 * propios de cada tabla (ver `AdminSavedViews`).
 */
export default function AdminGlobalSearch({
  athletes = [],
  events = [],
  onSelectAthlete,
  onSelectEvent,
  onFreeTextSubmit,
  variant = 'header',
  placeholder,
  'data-tour': dataTour,
}) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState(-1)
  const rootRef = useRef(null)
  const inputRef = useRef(null)
  const listboxId = useId()
  const isToolbar = variant === 'toolbar'
  const resolvedPlaceholder =
    placeholder ?? (isToolbar ? t('admin.search.dashboard') : t('admin.search.global'))
  const tourAttr = dataTour ?? (isToolbar ? 'dashboard-search' : 'admin-global-search')

  const results = useMemo(() => {
    const normalizedQuery = normalize(query)
    if (normalizedQuery.length < MIN_QUERY_LENGTH) return []

    const athleteHits = athletes
      .filter((athlete) => matchesAthlete(athlete, normalizedQuery))
      .slice(0, MAX_RESULTS)
      .map((athlete) => ({ kind: 'athlete', athlete }))

    const remaining = Math.max(0, MAX_RESULTS - athleteHits.length)
    const eventHits =
      remaining === 0
        ? []
        : events
            .filter((event) => matchesEvent(event, normalizedQuery))
            .slice(0, remaining)
            .map((event) => ({ kind: 'event', event }))

    return [...athleteHits, ...eventHits]
  }, [athletes, events, query])

  useEffect(() => {
    setHighlightIndex(-1)
  }, [query])

  useEffect(() => {
    function handleClickOutside(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (isToolbar) return undefined
    function handleShortcut(event) {
      const isShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k'
      if (!isShortcut) return
      event.preventDefault()
      inputRef.current?.focus()
      inputRef.current?.select()
      setOpen(true)
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [isToolbar])

  function clearQuery() {
    setQuery('')
    setOpen(false)
    setHighlightIndex(-1)
    inputRef.current?.blur()
  }

  function selectAthlete(athlete) {
    onSelectAthlete?.(athlete.id)
    clearQuery()
  }

  function selectEvent(event) {
    onSelectEvent?.(event)
    clearQuery()
  }

  function submitFreeText() {
    const trimmed = query.trim()
    if (!trimmed) return
    onFreeTextSubmit?.(trimmed)
    clearQuery()
  }

  function activateResult(result) {
    if (!result) return
    if (result.kind === 'athlete') selectAthlete(result.athlete)
    else selectEvent(result.event)
  }

  function handleKeyDown(event) {
    if (event.key === 'Escape') {
      setOpen(false)
      setHighlightIndex(-1)
      return
    }
    if (event.key === 'ArrowDown') {
      if (!open || results.length === 0) return
      event.preventDefault()
      setHighlightIndex((current) => (current + 1) % results.length)
      return
    }
    if (event.key === 'ArrowUp') {
      if (!open || results.length === 0) return
      event.preventDefault()
      setHighlightIndex((current) => (current - 1 + results.length) % results.length)
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      if (open && results.length > 0) {
        const target = results[highlightIndex] ?? results[0]
        activateResult(target)
        return
      }
      submitFreeText()
    }
  }

  function handleSubmit(event) {
    event.preventDefault()
    if (open && results.length > 0) {
      activateResult(results[highlightIndex] ?? results[0])
      return
    }
    submitFreeText()
  }

  const showPanel = open && query.trim().length >= MIN_QUERY_LENGTH
  const activeOptionId = highlightIndex >= 0 ? `${listboxId}-option-${highlightIndex}` : undefined
  const rootClassName = isToolbar
    ? 'admin-global-search admin-global-search--toolbar'
    : 'admin-global-search'
  const fieldClassName = isToolbar
    ? 'admin-page-toolbar__search admin-global-search__field'
    : 'admin-global-search__field'

  return (
    <div className={rootClassName} ref={rootRef} data-tour={tourAttr}>
      <form className={fieldClassName} role="search" onSubmit={handleSubmit}>
        <Search size={isToolbar ? 17 : 15} aria-hidden />
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-expanded={showPanel}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={activeOptionId}
          aria-label={resolvedPlaceholder}
          autoComplete="off"
          placeholder={resolvedPlaceholder}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
        />
        {isToolbar ? (
          <button
            type="submit"
            className="admin-page-toolbar__search-submit"
            aria-label={t('admin.search.submit')}
            disabled={!query.trim()}
          >
            <ArrowRight size={15} aria-hidden />
          </button>
        ) : (
          <span className="admin-global-search__shortcut" aria-hidden>
            Ctrl K
          </span>
        )}
      </form>

      {showPanel ? (
        <ul id={listboxId} role="listbox" className="admin-global-search__panel">
          {results.length === 0 ? (
            <li className="admin-global-search__empty" role="presentation">
              {t('admin.search.globalEmpty')}
            </li>
          ) : (
            results.map((result, index) => {
              if (result.kind === 'athlete') {
                const { athlete } = result
                return (
                  <li
                    key={`athlete-${athlete.id}`}
                    id={`${listboxId}-option-${index}`}
                    role="option"
                    aria-selected={highlightIndex === index}
                    className={`admin-global-search__option${highlightIndex === index ? ' is-highlighted' : ''}`}
                    onMouseEnter={() => setHighlightIndex(index)}
                  >
                    <button type="button" onClick={() => selectAthlete(athlete)}>
                      <span className="admin-global-search__avatar" aria-hidden>
                        {initialsOf(athlete.fullName)}
                      </span>
                      <span className="admin-global-search__option-copy">
                        <span className="admin-global-search__option-name">{athlete.fullName}</span>
                        <span className="admin-global-search__option-sub">
                          {athlete.gym || athlete.documentId || athlete.email}
                        </span>
                      </span>
                      <span className="admin-global-search__option-hint">
                        {t('admin.search.globalHint')}
                        <ArrowRight size={13} aria-hidden />
                      </span>
                    </button>
                  </li>
                )
              }

              const { event: meet } = result
              return (
                <li
                  key={`event-${meet.id ?? meet.slug}`}
                  id={`${listboxId}-option-${index}`}
                  role="option"
                  aria-selected={highlightIndex === index}
                  className={`admin-global-search__option${highlightIndex === index ? ' is-highlighted' : ''}`}
                  onMouseEnter={() => setHighlightIndex(index)}
                >
                  <button type="button" onClick={() => selectEvent(meet)}>
                    <span className="admin-global-search__avatar admin-global-search__avatar--event" aria-hidden>
                      <CalendarDays size={14} />
                    </span>
                    <span className="admin-global-search__option-copy">
                      <span className="admin-global-search__option-name">{meet.title}</span>
                      <span className="admin-global-search__option-sub">
                        {meet.venue || meet.city || meet.slug || t('admin.search.eventFallback')}
                      </span>
                    </span>
                    <span className="admin-global-search__option-hint">
                      {t('admin.search.eventHint')}
                      <ArrowRight size={13} aria-hidden />
                    </span>
                  </button>
                </li>
              )
            })
          )}
        </ul>
      ) : null}
    </div>
  )
}
