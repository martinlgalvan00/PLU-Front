import { LockKeyhole } from 'lucide-react'
import { groupRolesByTier } from '../../lib/permissionInsights.js'
import { usersLabel } from '../../lib/roleAccessLabels.js'

/**
 * Lista de roles agrupada como se lee la jerarquía: acceso total, roles base y
 * personalizados. Reemplaza a las pestañas horizontales, que no decían qué
 * rol mandaba sobre cuál ni escalaban a más de cinco roles.
 */
export default function RoleRail({ activeId, onSelect, roles, t }) {
  const groups = groupRolesByTier(roles)

  return (
    <nav className="roles-rail" aria-label={t('admin.roles.rail.aria')}>
      {groups.map((group) => (
        <section key={group.id} className="roles-rail__group">
          <h3 className="roles-rail__heading">{t(`admin.roles.tiers.${group.id}`)}</h3>
          <ul>
            {group.roles.map((role) => {
              const isActive = role.id === activeId
              return (
                <li key={role.id}>
                  <button
                    type="button"
                    className={`roles-rail__item${isActive ? ' is-active' : ''}${
                      role.active === false ? ' is-inactive' : ''
                    }`}
                    aria-current={isActive ? 'true' : undefined}
                    onClick={() => onSelect(role.id)}
                  >
                    <span className="roles-rail__name">
                      {role.name}
                      {role.isProtected ? (
                        <LockKeyhole size={12} aria-label={t('admin.roles.protected')} />
                      ) : null}
                      {role.scope === 'event' || role.eventScoped ? (
                        <span className="roles-rail__scope">{t('admin.roles.scope.eventShort')}</span>
                      ) : null}
                    </span>
                    <span className="roles-rail__meta">
                      {role.active === false
                        ? t('admin.roles.rail.inactive')
                        : usersLabel(t, role.userCount)}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </nav>
  )
}
