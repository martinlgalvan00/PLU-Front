import { Check, LockKeyhole } from 'lucide-react'
import {
  getSensitiveCapability,
  isReservedPermission,
  permissionColumn,
} from '../../lib/permissionInsights.js'
import { ModuleGlyph } from './roleAccessUi.jsx'
import { areaName, moduleHint, moduleName, translateOr } from '../../lib/roleAccessLabels.js'

const COLUMNS = ['view', 'modify', 'sensitive']
const COLUMN_LABEL_KEYS = {
  view: 'admin.roles.editor.columnView',
  modify: 'admin.roles.editor.columnAct',
  sensitive: 'admin.roles.editor.columnExtra',
}

function pillLabels(permission, module, t) {
  const capability = getSensitiveCapability(permission.key)
  if (capability) {
    return {
      short: t(`admin.roles.sensitiveShort.${capability.id}`),
      full: t(`admin.roles.sensitive.${capability.id}`),
      danger: Boolean(capability.destructive),
    }
  }
  const short = translateOr(t, `admin.roles.pill.${permission.action}`, permission.actionLabel)
  return { short, full: `${module}: ${short}`, danger: false }
}

function PermissionPill({ checked, disabled, module, onChange, permission, t }) {
  const reserved = isReservedPermission(permission.key)
  const labels = pillLabels(permission, module, t)
  const locked = disabled || reserved

  return (
    <label
      className={`roles-pill${checked ? ' is-on' : ''}${labels.danger ? ' is-danger' : ''}${
        locked ? ' is-locked' : ''
      }`}
      title={reserved ? t('admin.roles.reservedPermission') : (permission.description ?? '')}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={locked}
        aria-label={labels.full}
        onChange={(event) => onChange(permission, event.target.checked)}
      />
      <span className="roles-pill__box" aria-hidden>
        {checked ? <Check size={11} strokeWidth={3} /> : null}
      </span>
      <span className="roles-pill__label">{labels.short}</span>
      {reserved ? <LockKeyhole size={11} aria-hidden /> : null}
    </label>
  )
}

/**
 * Permisos de un rol, agrupados por área y con tres columnas fijas: ver,
 * modificar y acciones sensibles. Cada permiso es una pastilla con su propio
 * nombre, así que no hay que adivinar qué significa "Escritura" en cada módulo
 * y los permisos que antes no tenían columna (eliminar, recorrido
 * identificado, aprobar) quedan a la vista.
 */
export default function RolePermissionEditor({ areas, draftSet, editable, onToggle, t }) {
  return (
    <div className="roles-editor__table" role="group" aria-label={t('admin.roles.title')}>
      <div className="roles-editor__colhead" aria-hidden>
        <span />
        {COLUMNS.map((column) => (
          <span key={column}>{t(COLUMN_LABEL_KEYS[column])}</span>
        ))}
      </div>

      {areas.map((area) => (
        <section key={area.id} className="roles-editor__area">
          <h3 className="roles-editor__area-title">{areaName(t, area.id)}</h3>
          <ul>
            {area.modules.map((entry) => {
              const name = moduleName(t, entry)
              const hint = moduleHint(t, entry)
              const byColumn = Object.fromEntries(COLUMNS.map((column) => [column, []]))
              for (const permission of entry.permissions) {
                byColumn[permissionColumn(permission)].push(permission)
              }

              return (
                <li key={entry.module} className="roles-editor__row">
                  <div className="roles-editor__module">
                    <ModuleGlyph module={entry.module} />
                    <span>
                      <strong>{name}</strong>
                      {hint ? <small>{hint}</small> : null}
                    </span>
                  </div>
                  {COLUMNS.map((column) => (
                    <div
                      key={column}
                      className="roles-editor__cell"
                      data-column={column}
                      data-label={t(COLUMN_LABEL_KEYS[column])}
                    >
                      {byColumn[column].length === 0 ? (
                        <span className="roles-editor__none" aria-hidden>
                          —
                        </span>
                      ) : (
                        byColumn[column].map((permission) => (
                          <PermissionPill
                            key={permission.key}
                            checked={draftSet.has(permission.key)}
                            disabled={!editable}
                            module={name}
                            onChange={onToggle}
                            permission={permission}
                            t={t}
                          />
                        ))
                      )}
                    </div>
                  ))}
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}
