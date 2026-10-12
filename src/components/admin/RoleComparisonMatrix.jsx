import { useMemo } from 'react'
import { Check, LockKeyhole, Trash2 } from 'lucide-react'
import {
  getModuleAccess,
  getSensitiveStatus,
  groupModulesByArea,
} from '../../lib/permissionInsights.js'
import { ModuleGlyph } from './roleAccessUi.jsx'
import { areaName, moduleName, usersLabel } from '../../lib/roleAccessLabels.js'

const LEVEL_FILL = { none: 0, view: 1, partial: 2, full: 3 }

function LevelCell({ access, t }) {
  const label = t(`admin.roles.levels.${access.level}`)
  const fill = LEVEL_FILL[access.level]

  return (
    <td
      className={`roles-compare__cell roles-level roles-level--${access.level}`}
      title={t(`admin.roles.levelHints.${access.level}`)}
    >
      {access.level === 'none' ? (
        <>
          <span aria-hidden>—</span>
          <span className="sr-only">{label}</span>
        </>
      ) : (
        <>
          <span className="roles-level__bars" aria-hidden>
            {[1, 2, 3].map((step) => (
              <i key={step} className={step <= fill ? 'is-on' : undefined} />
            ))}
          </span>
          <span className="roles-level__label">{label}</span>
        </>
      )}
      {access.hasDestructive ? (
        <Trash2
          size={12}
          className="roles-level__danger"
          role="img"
          aria-label={t('admin.roles.destructiveMark')}
        />
      ) : null}
    </td>
  )
}

function GrantCell({ capability, granted, t }) {
  return (
    <td
      className={`roles-compare__cell roles-grant${granted ? ' is-on' : ''}${
        granted && capability.destructive ? ' is-danger' : ''
      }`}
    >
      {granted ? (
        <>
          <Check size={15} strokeWidth={2.2} aria-hidden />
          <span className="sr-only">{t('admin.roles.compare.granted')}</span>
        </>
      ) : (
        <>
          <span aria-hidden>—</span>
          <span className="sr-only">{t('admin.roles.compare.notGranted')}</span>
        </>
      )}
    </td>
  )
}

/**
 * Quién puede qué, en una sola pantalla: cada columna es un rol y cada fila
 * una capacidad. Arriba van las acciones sensibles, que son lo primero que
 * alguien que supervisa quiere confirmar; abajo, el nivel de acceso por módulo.
 *
 * Sólo lee: para cambiar algo se abre el rol (el encabezado de cada columna).
 */
export default function RoleComparisonMatrix({ catalog, onOpenRole, roles, t }) {
  const columns = useMemo(
    () => roles.map((role) => ({ role, granted: new Set(role.permissions ?? []) })),
    [roles],
  )
  const areas = useMemo(() => groupModulesByArea(catalog), [catalog])
  const sensitiveRows = useMemo(() => getSensitiveStatus(catalog, []), [catalog])
  const columnCount = columns.length + 1

  if (roles.length === 0) {
    return <p className="roles-empty">{t('admin.roles.compare.emptyRoles')}</p>
  }

  return (
    <section className="roles-compare" aria-labelledby="roles-compare-title">
      <header className="roles-compare__head">
        <div>
          <h2 id="roles-compare-title">{t('admin.roles.compare.title')}</h2>
          <p>{t('admin.roles.compare.lead')}</p>
        </div>
        <ul className="roles-compare__legend" aria-label={t('admin.roles.compare.legendLabel')}>
          {['view', 'partial', 'full'].map((level) => (
            <li key={level}>
              <span className="roles-level__bars" aria-hidden>
                {[1, 2, 3].map((step) => (
                  <i key={step} className={step <= LEVEL_FILL[level] ? 'is-on' : undefined} />
                ))}
              </span>
              {t(`admin.roles.levels.${level}`)}
            </li>
          ))}
          <li className="roles-compare__legend-danger">
            <Trash2 size={12} aria-hidden />
            {t('admin.roles.compare.legendDestructive')}
          </li>
        </ul>
      </header>

      <div
        className="roles-compare__scroll"
        tabIndex={0}
        role="region"
        aria-label={t('admin.roles.compare.title')}
      >
        <table className="roles-compare__table">
          <thead>
            <tr>
              <th scope="col" className="roles-compare__corner">
                <span className="sr-only">{t('admin.roles.module')}</span>
              </th>
              {columns.map(({ role }) => (
                <th
                  key={role.id}
                  scope="col"
                  className={`roles-compare__role${role.active === false ? ' is-inactive' : ''}`}
                >
                  <button
                    type="button"
                    onClick={() => onOpenRole(role.id)}
                    title={t('admin.roles.compare.edit', { role: role.name })}
                  >
                    <span className="roles-compare__role-name">
                      <span className="roles-compare__role-text">{role.name}</span>
                      {role.isProtected ? (
                        <LockKeyhole size={12} aria-label={t('admin.roles.protected')} />
                      ) : null}
                    </span>
                    <span className="roles-compare__role-meta">
                      {role.active === false
                        ? t('admin.roles.compare.inactive')
                        : usersLabel(t, role.userCount)}
                    </span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>

          {sensitiveRows.length > 0 ? (
            <tbody>
              <tr className="roles-compare__group">
                <th scope="rowgroup" colSpan={columnCount}>
                  <span>{t('admin.roles.compare.sensitiveTitle')}</span>
                  <small>{t('admin.roles.compare.sensitiveHint')}</small>
                </th>
              </tr>
              {sensitiveRows.map((capability) => (
                <tr key={capability.id}>
                  <th scope="row" className="roles-compare__label">
                    {t(`admin.roles.sensitive.${capability.id}`)}
                  </th>
                  {columns.map(({ role, granted }) => (
                    <GrantCell
                      key={role.id}
                      capability={capability}
                      granted={granted.has(capability.key)}
                      t={t}
                    />
                  ))}
                </tr>
              ))}
            </tbody>
          ) : null}

          {areas.map((area) => (
            <tbody key={area.id}>
              <tr className="roles-compare__group">
                <th scope="rowgroup" colSpan={columnCount}>
                  <span>{areaName(t, area.id)}</span>
                </th>
              </tr>
              {area.modules.map((entry) => (
                <tr key={entry.module}>
                  <th scope="row" className="roles-compare__label">
                    <ModuleGlyph module={entry.module} size={14} />
                    {moduleName(t, entry)}
                  </th>
                  {columns.map(({ role, granted }) => (
                    <LevelCell key={role.id} access={getModuleAccess(entry, granted)} t={t} />
                  ))}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </section>
  )
}
