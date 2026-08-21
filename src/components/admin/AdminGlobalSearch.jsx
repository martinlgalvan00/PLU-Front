import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { ArrowRight, Search } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'

const MAX_RESULTS = 6
const MIN_QUERY_LENGTH = 2

function normalize(value) {
  return (value ?? '').toString().trim().toLowerCase()
}

function matchesAthlete(athlete, normalizedQuery) {
  return (
    athlete.fullName?.toLowerCase().includes(normalizedQuery) ||
    athlete.documentId?.includes(normalizedQuery) ||
    athlete.email?.toLowerCase().includes(normalizedQuery) ||
    athlete.gym?.toLowerCase().includes(normalizedQuery)
  )
}

function initialsOf(fullName) {
  const parts = (fullName ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

/**
 * Buscador global del panel: salta directo a la ficha 360° de un atleta
 * (nombre, DNI, email o gimnasio) desde cualquier sección, sin pasar por la
 * lista de Atletas. Complementa -- no reemplaza -- los filtros propios de
 * cada tabla (ver `AdminSavedViews`).
 */
export default function AdminGlobalSearch({ athletes = [], onSelectAthlete }) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState(-1)
  const rootRef = useRef(null)
  const inputRef = useRef(null)
  const listboxId = useId()

  const results = useMemo(() => {
    const normalizedQuery = normalize(query)
    if (normalizedQuery.length < MIN_QUERY_LENGTH) return []
    return athletes.filter((athlete) => matchesAthlete(athlete, normalizedQuery)).slice(0, MAX_RESULTS)
  }, [athletes, query])

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
  }, [])

  function selectAthlete(athlete) {
    onSelectAthlete?.(athlete.id)
    setQuery('')
    setOpen(false)
    setHighlightIndex(-1)
    inputRef.current?.blur()
  }

  function handleKeyDown(event) {
    if (event.key === 'Escape') {
      setOpen(false)
      setHighlightIndex(-1)
      return
    }
    if (!open || results.length === 0) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setHighlightIndex((current) => (current + 1) % results.length)
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlightIndex((current) => (current - 1 + results.length) % results.length)
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      const target = results[highlightIndex] ?? results[0]
      if (target) selectAthlete(target)
    }
  }

  const showPanel = open && query.trim().length >= MIN_QUERY_LENGTH
  const activeOptionId = highlightIndex >= 0 ? `${listboxId}-option-${highlightIndex}` : undefined

  return (
    <div className="admin-global-search" ref={rootRef} data-tour="admin-global-search">
      <div className="admin-global-search__field">
        <Search size={15} aria-hidden />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={showPanel}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={activeOptionId}
          aria-label={t('admin.search.globalAria')}
          autoComplete="off"
          placeholder={t('admin.search.global')}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
        />
        <span className="admin-global-search__shortcut" aria-hidden>
          Ctrl K
        </span>
      </div>

      {showPanel ? (
        <ul id={listboxId} role="listbox" className="admin-global-search__panel">
          {results.length === 0 ? (
            <li className="admin-global-search__empty" role="presentation">
              {t('admin.search.globalEmpty')}
            </li>
          ) : (
            results.map((athlete, index) => (
              <li
                key={athlete.id}
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
            ))
          )}
        </ul>
      ) : null}
    </div>
  )
}
