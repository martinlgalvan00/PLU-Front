export default function DetailTabs({
  tabs,
  activeTab,
  onChange,
  variant = 'default',
  ariaLabel = 'Secciones del detalle',
}) {
  return (
    <div
      className={['detail-tabs', variant === 'editorial' ? 'detail-tabs--editorial' : '']
        .filter(Boolean)
        .join(' ')}
      role="tablist"
      aria-label={ariaLabel}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id
        const showCount = typeof tab.count === 'number'
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={[
              'detail-tabs__tab',
              isActive ? 'is-active' : '',
              showCount && tab.count === 0 ? 'is-empty' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => onChange(tab.id)}
          >
            <span className="detail-tabs__label">{tab.label}</span>
            {showCount ? (
              <span className="detail-tabs__count" data-empty={tab.count === 0 ? 'true' : undefined}>
                {tab.count}
              </span>
            ) : null}
            {tab.hasError ? (
              <span className="detail-tabs__error-dot" aria-hidden />
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
