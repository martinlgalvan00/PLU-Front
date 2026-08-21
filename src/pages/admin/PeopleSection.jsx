import { useI18n } from '../../i18n/I18nProvider.jsx'

/**
 * Cascarón de navegación para el ítem de menú único "Personas": una fila de
 * pestañas (Atletas / Afiliaciones / Inscripciones según permisos) sobre el
 * panel activo. Cada pestaña sigue montando su sección especializada tal
 * cual (columnas, filtros, vistas guardadas y acciones propias) -- lo único
 * que cambia respecto de antes es el punto de entrada del menú.
 */
export default function PeopleSection({ activeTab, onTabChange, tabs = [], children }) {
  const { t } = useI18n()

  if (tabs.length <= 1) return children

  return (
    <div className="admin-people-section">
      <div
        className="admin-people-section__tabs"
        role="tablist"
        aria-label={t('admin.nav.people')}
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`admin-people-section__tab${activeTab === tab.id ? ' is-active' : ''}`}
            onClick={() => onTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {children}
    </div>
  )
}
