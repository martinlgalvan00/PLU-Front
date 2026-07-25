import { useEffect, useMemo, useState } from 'react'
import { Check, LockKeyhole, Plus, Save, ShieldCheck, X } from 'lucide-react'
import AdminPageHeader from '../../components/admin/AdminPageHeader.jsx'
import Button from '../../components/ui/Button.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import {
  canManageRolePermissions,
  getRoleHierarchyLevel,
  hasPermission,
} from '../../lib/permissions.js'

const ACTION_ORDER = ['read', 'write', 'approve', 'execute']
const RESERVED_LOWER_PERMISSIONS = new Set(['admin.users.write', 'admin.roles.write'])

function actorCanEditRole(actor, role) {
  return (
    role?.canManagePermissions ??
    canManageRolePermissions(actor, role)
  )
}

export default function RolesSection({
  authorization,
  onCreateRole,
  onUpdatePermissions,
  permissionCatalog,
  roles,
}) {
  const { t } = useI18n()

  const orderedRoles = useMemo(
    () =>
      [...roles].sort(
        (first, second) =>
          getRoleHierarchyLevel(first) - getRoleHierarchyLevel(second) ||
          Number(second.isSystem) - Number(first.isSystem) ||
          first.name.localeCompare(second.name),
      ),
    [roles],
  )

  const initialRole =
    orderedRoles.find((role) => actorCanEditRole(authorization, role)) ??
    orderedRoles[0] ??
    null
  const [selectedRoleId, setSelectedRoleId] = useState(initialRole?.id ?? null)
  const [permissionDraft, setPermissionDraft] = useState([])
  const [message, setMessage] = useState(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [isCreatingRole, setIsCreatingRole] = useState(false)
  const [roleDraft, setRoleDraft] = useState({ name: '', description: '' })

  const selectedRole =
    orderedRoles.find((role) => role.id === selectedRoleId) ?? orderedRoles[0] ?? null

  useEffect(() => {
    if (orderedRoles.some((role) => role.id === selectedRoleId)) return
    const nextRole =
      orderedRoles.find((role) => actorCanEditRole(authorization, role)) ??
      orderedRoles[0] ??
      null
    setSelectedRoleId(nextRole?.id ?? null)
  }, [authorization, orderedRoles, selectedRoleId])

  useEffect(() => {
    setPermissionDraft(selectedRole?.permissions ?? [])
    setMessage(null)
  }, [selectedRole])

  const permissionRows = useMemo(() => {
    const byModule = new Map()
    for (const permission of permissionCatalog) {
      const row = byModule.get(permission.module) ?? {
        module: permission.module,
        sortOrder: permission.sortOrder,
        actions: {},
      }
      row.actions[permission.action] = permission
      row.sortOrder = Math.min(row.sortOrder, permission.sortOrder)
      byModule.set(permission.module, row)
    }
    return [...byModule.values()].sort((a, b) => a.sortOrder - b.sortOrder)
  }, [permissionCatalog])

  const editable = Boolean(
    selectedRole &&
    !selectedRole.isProtected &&
    actorCanEditRole(authorization, selectedRole),
  )
  const dirty =
    selectedRole &&
    [...permissionDraft].sort().join('|') !==
      [...(selectedRole.permissions ?? [])].sort().join('|')
  const activePermissionCount = permissionDraft.length
  const canCreateRole =
    Boolean(onCreateRole) && hasPermission(authorization, 'admin.roles.write')

  function handlePermissionChange(permission, checked) {
    if (!editable || RESERVED_LOWER_PERMISSIONS.has(permission.key)) return

    setPermissionDraft((current) => {
      const next = new Set(current)
      if (checked) {
        next.add(permission.key)

        if (permission.action !== 'read' && permission.module !== 'exports') {
          const readPermission = permissionCatalog.find(
            (candidate) =>
              candidate.module === permission.module &&
              candidate.action === 'read',
          )
          if (readPermission) next.add(readPermission.key)
        }
      } else {
        next.delete(permission.key)

        if (permission.action === 'read' && permission.module !== 'exports') {
          permissionCatalog
            .filter((candidate) => candidate.module === permission.module)
            .forEach((candidate) => next.delete(candidate.key))
        }
      }

      return permissionCatalog
        .filter((candidate) => next.has(candidate.key))
        .map((candidate) => candidate.key)
    })
    setMessage(null)
  }

  async function handleSave() {
    if (!selectedRole || !editable || !dirty) return
    setIsSaving(true)
    setMessage(null)
    try {
      await onUpdatePermissions(selectedRole.id, permissionDraft)
      setMessage({ tone: 'success', text: t('admin.roles.saved') })
    } catch (error) {
      setMessage({
        tone: 'error',
        text: error?.message ?? t('admin.roles.errorSave'),
      })
    } finally {
      setIsSaving(false)
    }
  }

  async function handleCreateRole(event) {
    event.preventDefault()
    const name = roleDraft.name.trim()
    if (!canCreateRole || name.length < 3 || isCreatingRole) return

    setIsCreatingRole(true)
    setMessage(null)
    try {
      const createdRole = await onCreateRole({
        name,
        description: roleDraft.description.trim(),
        permissionKeys: [],
      })
      setSelectedRoleId(createdRole.id)
      setRoleDraft({ name: '', description: '' })
      setIsCreating(false)
      setMessage({
        tone: 'success',
        text: t('admin.roles.created', { role: createdRole.name }),
      })
    } catch (error) {
      setMessage({
        tone: 'error',
        text: error?.message ?? t('admin.roles.errorCreate'),
      })
    } finally {
      setIsCreatingRole(false)
    }
  }

  return (
    <section className="admin-roles">
      <AdminPageHeader
        className="admin-roles__page-header"
        eyebrow={t('admin.roles.eyebrow')}
        title={t('admin.roles.title')}
        subtitle={t('admin.roles.subtitle')}
      />

      {message && (
        <p
          className={`admin-roles__message admin-roles__message--${message.tone}`}
          role={message.tone === 'error' ? 'alert' : 'status'}
        >
          {message.text}
        </p>
      )}

      <div className="admin-roles__workspace">
        <aside className="admin-roles__list" aria-label={t('admin.roles.listAria')}>
          <div className="admin-roles__list-head">
            <span className="admin-roles__list-label">{t('admin.roles.hierarchy')}</span>
            {canCreateRole ? (
              <button
                type="button"
                className="admin-roles__add"
                aria-controls="admin-role-create"
                aria-expanded={isCreating}
                onClick={() => {
                  setIsCreating((current) => !current)
                  setMessage(null)
                }}
              >
                {isCreating ? <X size={14} aria-hidden /> : <Plus size={14} aria-hidden />}
                <span>
                  {isCreating ? t('admin.roles.cancel') : t('admin.roles.newRole')}
                </span>
              </button>
            ) : null}
          </div>

          {isCreating ? (
            <form
              id="admin-role-create"
              className="admin-roles__create"
              onSubmit={handleCreateRole}
            >
              <label>
                <span>{t('admin.roles.roleName')}</span>
                <input
                  type="text"
                  value={roleDraft.name}
                  minLength={3}
                  maxLength={64}
                  autoComplete="off"
                  required
                  autoFocus
                  onChange={(event) =>
                    setRoleDraft((current) => ({ ...current, name: event.target.value }))
                  }
                />
              </label>
              <label>
                <span>{t('admin.roles.roleDescription')}</span>
                <textarea
                  value={roleDraft.description}
                  maxLength={180}
                  rows={3}
                  placeholder={t('admin.roles.descriptionPlaceholder')}
                  onChange={(event) =>
                    setRoleDraft((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                />
              </label>
              <Button
                type="submit"
                className="btn--small"
                disabled={roleDraft.name.trim().length < 3 || isCreatingRole}
              >
                <Plus size={14} aria-hidden />
                {isCreatingRole ? t('admin.roles.creating') : t('admin.roles.create')}
              </Button>
              <p>{t('admin.roles.createHint')}</p>
            </form>
          ) : null}

          <ol>
            {orderedRoles.map((role) => {
              const level = getRoleHierarchyLevel(role)
              const roleEditable =
                !role.isProtected && actorCanEditRole(authorization, role)

              return (
                <li key={role.id}>
                  <button
                    type="button"
                    className={role.id === selectedRole?.id ? 'is-active' : ''}
                    aria-pressed={role.id === selectedRole?.id}
                    onClick={() => setSelectedRoleId(role.id)}
                  >
                    <span className="admin-roles__level" aria-hidden>
                      {role.isSystem ? level : t('admin.roles.customBadge')}
                    </span>
                    <span className="admin-roles__list-copy">
                      <strong>{role.name}</strong>
                      <small>
                        {role.isProtected
                          ? t('admin.roles.protectedShort')
                          : !role.isSystem
                            ? t('admin.roles.customShort')
                          : roleEditable
                            ? t('admin.roles.configurableShort')
                            : t('admin.roles.usersCount', { count: role.userCount ?? 0 })}
                      </small>
                    </span>
                    <span className="admin-roles__list-status" aria-hidden>
                      {role.isProtected ? (
                        <LockKeyhole size={14} />
                      ) : (
                        <ShieldCheck size={14} />
                      )}
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>
        </aside>

        {selectedRole ? (
          <div className="admin-roles__matrix-panel">
            <header className="admin-roles__matrix-head">
              <div className="admin-roles__matrix-title">
                <div className="admin-roles__matrix-kicker">
                  <span className="admin-roles__matrix-level">
                    {selectedRole.isSystem
                      ? t('admin.roles.level', {
                          level: getRoleHierarchyLevel(selectedRole),
                        })
                      : t('admin.roles.customLevel')}
                  </span>
                  {!editable ? (
                    <span className="admin-roles__readonly">
                      <LockKeyhole size={12} aria-hidden />
                      {selectedRole.isProtected
                        ? t('admin.roles.protected')
                        : t('admin.roles.readonly')}
                    </span>
                  ) : null}
                </div>
                <h2>{selectedRole.name}</h2>
                <p>{selectedRole.description || t('admin.roles.noDescription')}</p>
              </div>

              <div className="admin-roles__matrix-actions">
                <div
                  className="admin-roles__coverage"
                  aria-label={t('admin.roles.activeCount', {
                    active: activePermissionCount,
                    total: permissionCatalog.length,
                  })}
                >
                  <span className="admin-roles__permission-count">
                    {t('admin.roles.activeCount', {
                      active: activePermissionCount,
                      total: permissionCatalog.length,
                    })}
                  </span>
                  <span className="admin-roles__coverage-bar" aria-hidden="true">
                    <span
                      className="admin-roles__coverage-fill"
                      style={{
                        '--admin-role-coverage': permissionCatalog.length
                          ? activePermissionCount / permissionCatalog.length
                          : 0,
                      }}
                    />
                  </span>
                </div>
                {editable ? (
                  <Button
                    type="button"
                    className="btn--small"
                    disabled={!dirty || isSaving}
                    onClick={handleSave}
                  >
                    <Save size={15} aria-hidden />
                    {isSaving ? t('admin.roles.saving') : t('admin.roles.save')}
                  </Button>
                ) : null}
              </div>
            </header>

            <div className="admin-roles__matrix-scroll" tabIndex={0}>
              <table className="admin-roles__matrix">
                <thead>
                  <tr>
                    <th scope="col">{t('admin.roles.module')}</th>
                    {ACTION_ORDER.map((action) => (
                      <th key={action} scope="col">
                        {t(`admin.roles.actions.${action}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {permissionRows.map((row) => (
                    <tr key={row.module}>
                      <th scope="row">{t(`admin.roles.modules.${row.module}`)}</th>
                      {ACTION_ORDER.map((action) => {
                        const permission = row.actions[action]
                        if (!permission) {
                          return (
                            <td
                              key={action}
                              className="admin-roles__empty-cell"
                              aria-label={t('admin.roles.notApplicable')}
                            >
                              <span aria-hidden>—</span>
                            </td>
                          )
                        }

                        const checked = permissionDraft.includes(permission.key)
                        const reserved =
                          !selectedRole.isProtected &&
                          RESERVED_LOWER_PERMISSIONS.has(permission.key)

                        return (
                          <td key={action}>
                            <label
                              className={`admin-roles__permission${checked ? ' is-checked' : ''}${reserved ? ' is-reserved' : ''}`}
                              title={
                                reserved
                                  ? t('admin.roles.reservedPermission')
                                  : permission.description
                              }
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={!editable || reserved}
                                aria-label={`${t(`admin.roles.modules.${row.module}`)}: ${t(`admin.roles.actions.${action}`)}`}
                                onChange={(event) =>
                                  handlePermissionChange(permission, event.target.checked)
                                }
                              />
                              <span aria-hidden>
                                {reserved ? (
                                  <LockKeyhole size={12} />
                                ) : checked ? (
                                  <Check size={14} />
                                ) : null}
                              </span>
                              <em>
                                {reserved
                                  ? t('admin.roles.reserved')
                                  : t(`admin.roles.actions.${action}`)}
                              </em>
                            </label>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {editable ? (
              <p className="admin-roles__matrix-hint">{t('admin.roles.dependencyHint')}</p>
            ) : null}
          </div>
        ) : (
          <p className="admin-roles__empty">{t('admin.roles.empty')}</p>
        )}
      </div>
    </section>
  )
}
