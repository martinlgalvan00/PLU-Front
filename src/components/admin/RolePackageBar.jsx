import { listPackageStates } from '../../lib/permissionInsights.js'

/**
 * Barra de paquetes operativos encima del editor fino de permisos.
 * Un toque activa/desactiva un conjunto coherente; el estado parcial se ve
 * distinto para no fingir que el paquete está completo.
 */
export default function RolePackageBar({ catalog, draftSet, editable, onTogglePackage, t }) {
  const packages = listPackageStates(catalog, draftSet)
  if (packages.length === 0) return null

  return (
    <div className="roles-packages" role="group" aria-label={t('admin.roles.packages.aria')}>
      <div className="roles-packages__head">
        <strong>{t('admin.roles.packages.title')}</strong>
        <span>{t('admin.roles.packages.lead')}</span>
      </div>
      <ul className="roles-packages__list">
        {packages.map((pack) => {
          const checked = pack.state === 'all'
          const partial = pack.state === 'partial'
          return (
            <li key={pack.id}>
              <label
                className={`roles-packages__item${checked ? ' is-on' : ''}${
                  partial ? ' is-partial' : ''
                }${!editable ? ' is-locked' : ''}`}
                title={t(`admin.roles.packages.hint.${pack.id}`)}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={!editable}
                  ref={(node) => {
                    if (node) node.indeterminate = partial
                  }}
                  aria-label={t(`admin.roles.packages.${pack.id}`)}
                  onChange={(event) => onTogglePackage(pack.id, event.target.checked)}
                />
                <span className="roles-packages__label">
                  {t(`admin.roles.packages.${pack.id}`)}
                </span>
                {partial ? (
                  <span className="roles-packages__partial">{t('admin.roles.packages.partial')}</span>
                ) : null}
              </label>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
