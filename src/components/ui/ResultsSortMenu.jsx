import { useEffect, useId, useRef, useState } from 'react'
import { ArrowDownUp, Check, ChevronDown } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'

export default function ResultsSortMenu({
  className = '',
  luxury = false,
  onSortChange,
  options,
  sort,
}) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const listId = useId()

  const sortOption = options.find(([value]) => value === sort)
  const sortLabel = sortOption?.[1] ?? t('pages.results.sortLabel')
  const sortShortLabel = sortOption?.[2] ?? sortLabel

  useEffect(() => {
    if (!open) return undefined

    function handlePointerDown(event) {
      if (!rootRef.current?.contains(event.target)) {
        setOpen(false)
      }
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  function select(value) {
    if (value !== sort) {
      onSortChange(value)
    }
    setOpen(false)
  }

  const rootClass = [
    'results-sort-menu',
    luxury ? 'results-sort-menu--luxury' : '',
    open ? 'is-open' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={rootClass} ref={rootRef}>
      <button
        type="button"
        className="results-sort-menu__trigger"
        aria-controls={listId}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={t('pages.results.sortMenuCurrent', { sort: sortLabel })}
        onClick={() => setOpen((value) => !value)}
      >
        <ArrowDownUp size={14} aria-hidden className="results-sort-menu__icon" />
        <span className="results-sort-menu__face">
          {luxury && (
            <span className="results-sort-menu__prefix">{t('pages.results.sortLabel')}</span>
          )}
          <span className="results-sort-menu__value">
            <span className="results-sort-menu__label results-sort-menu__label--full">{sortLabel}</span>
            <span className="results-sort-menu__label results-sort-menu__label--short">{sortShortLabel}</span>
          </span>
        </span>
        <ChevronDown size={13} aria-hidden className="results-sort-menu__chevron" />
      </button>

      {open && (
        <ul id={listId} className="results-sort-menu__list" role="listbox" aria-label={t('pages.results.sortAria')}>
          {options.map(([value, label]) => (
            <li key={value} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={sort === value}
                className={`results-sort-menu__option ${sort === value ? 'is-active' : ''}`}
                onClick={() => select(value)}
              >
                <span>{label}</span>
                {sort === value && <Check size={14} aria-hidden className="results-sort-menu__check" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
