import { Minus, Plus, RotateCcw, Save } from 'lucide-react'
import Button from '../ui/Button.jsx'

/**
 * Barra de cambios pendientes, pegada al borde inferior mientras hay algo sin
 * guardar: antes vivía al final de una tabla de 17 filas y había que recorrerla
 * entera para encontrar el botón de aplicar.
 */
export default function RoleChangeBar({
  diff,
  isSaving,
  labelFor,
  onDiscard,
  onSave,
  pendingRole,
  t,
}) {
  return (
    <div className="roles-changebar" role="status" aria-live="polite">
      <div className="roles-changebar__copy">
        <strong>
          {pendingRole
            ? t('admin.roles.unsavedBeforeSwitch', { role: pendingRole.name })
            : t('admin.roles.unsaved')}
        </strong>
        <span className="roles-changebar__counts">
          {diff.added.length > 0 ? (
            <span className="is-added">
              <Plus size={12} aria-hidden />
              {t('admin.roles.permissionsAdded', { count: diff.added.length })}
            </span>
          ) : null}
          {diff.removed.length > 0 ? (
            <span className="is-removed">
              <Minus size={12} aria-hidden />
              {t('admin.roles.permissionsRemoved', { count: diff.removed.length })}
            </span>
          ) : null}
        </span>
        <details className="roles-changebar__details">
          <summary>{t('admin.roles.reviewChanges')}</summary>
          <ul>
            {diff.added.map((permissionKey) => (
              <li key={`added-${permissionKey}`} className="is-added">
                <Plus size={12} aria-hidden />
                {labelFor(permissionKey)}
              </li>
            ))}
            {diff.removed.map((permissionKey) => (
              <li key={`removed-${permissionKey}`} className="is-removed">
                <Minus size={12} aria-hidden />
                {labelFor(permissionKey)}
              </li>
            ))}
          </ul>
        </details>
      </div>
      <div className="roles-changebar__actions">
        <Button
          type="button"
          variant="outline"
          className="btn--small"
          disabled={isSaving}
          onClick={onDiscard}
        >
          <RotateCcw size={14} aria-hidden />
          {pendingRole ? t('admin.roles.discardAndOpen') : t('admin.roles.discard')}
        </Button>
        <Button
          type="button"
          variant="gold"
          className="btn--small"
          disabled={isSaving}
          onClick={onSave}
        >
          <Save size={14} aria-hidden />
          {isSaving ? t('admin.roles.saving') : t('admin.roles.apply')}
        </Button>
      </div>
    </div>
  )
}
