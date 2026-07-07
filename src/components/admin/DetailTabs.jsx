export default function DetailTabs({ tabs, activeTab, onChange }) {
  return (
    <div className="detail-tabs" role="tablist" aria-label="Secciones del detalle">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={activeTab === tab.id}
          className={activeTab === tab.id ? 'is-active' : ''}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
          {typeof tab.count === 'number' && <span className="detail-tabs__count">{tab.count}</span>}
        </button>
      ))}
    </div>
  )
}
