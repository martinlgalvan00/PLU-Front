import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  History,
  LockKeyhole,
  Minus,
  Plus,
  RotateCcw,
  Save,
  ShieldCheck,
  UsersRound,
  X,
} from 'lucide-react'
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
  return role?.canManagePermissions ?? canManageRolePermissions(actor, role)
}

function permissionSignature(permissionKeys) {
  return [...(permissionKeys ?? [])].sort().join('|')
}

function formatActivityDate(value, locale) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  return new Intl.DateTimeFormat(locale === 'es' ? 'es-AR' : 'en-US', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date)
}

export default function RolesSection({
  activity = [],
  authorization,
  onCreateRole,
  onUpdatePermissions,
  permissionCatalog = [],
  roles = [],
}) {
  const { locale, t } = useI18n()
  const roleListRef = useRef(null)

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
    orderedRoles.find((role) => actorCanEditRole(authorization, role)) ?? orderedRoles[0] ?? null
  const [selectedRoleId, setSelectedRoleId] = useState(initialRole?.id ?? null)
  const [permissionDraft, setPermissionDraft] = useState([])
  const [message, setMessage] = useState(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [isCreatingRole, setIsCreatingRole] = useState(false)
  const [roleDraft, setRoleDraft] = useState({ name: '', description: '' })
  const [pendingRoleId, setPendingRoleId] = useState(null)

  const selectedRole =
    orderedRoles.find((role) => role.id === selectedRoleId) ?? orderedRoles[0] ?? null

  useEffect(() => {
    if (orderedRoles.some((role) => role.id === selectedRoleId)) return
    const nextRole =
      orderedRoles.find((role) => actorCanEditRole(authorization, role)) ?? orderedRoles[0] ?? null
    setSelectedRoleId(nextRole?.id ?? null)
  }, [authorization, orderedRoles, selectedRoleId])

  useEffect(() => {
    setPermissionDraft(selectedRole?.permissions ?? [])
    setMessage(null)
    setPendingRoleId(null)
  }, [selectedRole])

  useEffect(() => {
    const selectedButton = roleListRef.current?.querySelector(`[data-role-id="${selectedRoleId}"]`)
    selectedButton?.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [selectedRoleId])

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
    selectedRole && !selectedRole.isProtected && actorCanEditRole(authorization, selectedRole),
  )
  const dirty =
    selectedRole &&
    permissionSignature(permissionDraft) !== permissionSignature(selectedRole.permissions)
  const activePermissionCount = permissionDraft.length
  const canCreateRole = Boolean(onCreateRole) && hasPermission(authorization, 'admin.roles.write')
  const canViewAudit = hasPermission(authorization, 'admin.audit.read')
  const pendingRole = orderedRoles.find((role) => role.id === pendingRoleId) ?? null

  const permissionByKey = useMemo(
    () => new Map(permissionCatalog.map((permission) => [permission.key, permission])),
    [permissionCatalog],
  )
  const permissionDraftSet = useMemo(
    () => new Set(permissionDraft),
    [permissionDraft],
  )
  const permissionDiff = useMemo(() => {
    const savedPermissions = new Set(selectedRole?.permissions ?? [])
    const draftPermissions = new Set(permissionDraft)

    return {
      added: permissionDraft.filter((permissionKey) => !savedPermissions.has(permissionKey)),
      removed: [...savedPermissions].filter(
        (permissionKey) => !draftPermissions.has(permissionKey),
      ),
    }
  }, [permissionDraft, selectedRole])
  const roleStats = useMemo(() => {
    const selectedPermissions = permissionCatalog.filter((permission) =>
      permissionDraftSet.has(permission.key),
    )

    return {
      modules: new Set(selectedPermissions.map((permission) => permission.module)).size,
      elevated: selectedPermissions.filter((permission) => permission.action !== 'read').length,
    }
  }, [permissionCatalog, permissionDraftSet])
  const selectedActivity = useMemo(
    () => activity.filter((item) => item.roleId === selectedRole?.id).slice(0, 6),
    [activity, selectedRole?.id],
  )

  useEffect(() => {
    if (!dirty) return undefined

    function preventAccidentalExit(event) {
      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', preventAccidentalExit)
    return () => window.removeEventListener('beforeunload', preventAccidentalExit)
  }, [dirty])

  function permissionLabel(permissionKey) {
    const permission = permissionByKey.get(permissionKey)
    if (!permission) return permissionKey
    return `${t(`admin.roles.modules.${permission.module}`)} · ${t(`admin.roles.actions.${permission.action}`)}`
  }

  function handleRoleSelect(roleId) {
    if (roleId === selectedRoleId) return
    if (dirty) {
      setPendingRoleId(roleId)
      setMessage(null)
      return
    }
    setSelectedRoleId(roleId)
  }

  function handleDiscard() {
    setPermissionDraft(selectedRole?.permissions ?? [])
    setMessage(null)
    const nextRoleId = pendingRoleId
    setPendingRoleId(null)
    if (nextRoleId) setSelectedRoleId(nextRoleId)
  }

  function handlePermissionChange(permission, checked) {
    if (!editable || RESERVED_LOWER_PERMISSIONS.has(permission.key)) return

    setPermissionDraft((current) => {
      const next = new Set(current)
      if (checked) {
        next.add(permission.key)

        if (permission.action !== 'read' && permission.module !== 'exports') {
          const readPermission = permissionCatalog.find(
            (candidate) => candidate.module === permission.module && candidate.action === 'read',
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
      const updatedRole = await onUpdatePermissions(selectedRole.id, permissionDraft)
      setPermissionDraft(updatedRole?.permissions ?? permissionDraft)
      setMessage({ tone: 'success', text: t('admin.roles.saved') })
      const nextRoleId = pendingRoleId
      setPendingRoleId(null)
      if (nextRoleId) setSelectedRoleId(nextRoleId)
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
    if (dirty) {
      setMessage({
        tone: 'warning',
        text: t('admin.roles.finishChangesFirst'),
      })
      return
    }
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
                  if (dirty) {
                    setMessage({
                      tone: 'warning',
                      text: t('admin.roles.finishChangesFirst'),
                    })
                    return
                  }
                  setIsCreating((current) => !current)
                  setMessage(null)
                }}
              >
                {isCreating ? <X size={14} aria-hidden /> : <Plus size={14} aria-hidden />}
                <span>{isCreating ? t('admin.roles.cancel') : t('admin.roles.newRole')}</span>
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

          <ol ref={roleListRef}>
            {orderedRoles.map((role) => {
              const level = getRoleHierarchyLevel(role)
              const roleEditable = !role.isProtected && actorCanEditRole(authorization, role)

              return (
                <li key={role.id}>
                  <button
                    type="button"
                    data-role-id={role.id}
                    className={role.id === selectedRole?.id ? 'is-active' : ''}
                    aria-pressed={role.id === selectedRole?.id}
                    onClick={() => handleRoleSelect(role.id)}
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
                              : t('admin.roles.usersCount', {
                                  count: role.userCount ?? 0,
                                })}
                      </small>
                    </span>
                    <span className="admin-roles__list-status" aria-hidden>
                      {role.isProtected ? <LockKeyhole size={14} /> : <ShieldCheck size={14} />}
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
                <dl className="admin-roles__impact">
                  <div>
                    <dt>{t('admin.roles.impactUsers')}</dt>
                    <dd>
                      <UsersRound size={13} aria-hidden />
                      {selectedRole.userCount ?? 0}
                    </dd>
                  </div>
                  <div>
                    <dt>{t('admin.roles.impactModules')}</dt>
                    <dd>{roleStats.modules}</dd>
                  </div>
                  <div>
                    <dt>{t('admin.roles.impactElevated')}</dt>
                    <dd>{roleStats.elevated}</dd>
                  </div>
                </dl>
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
                  <progress
                    className="admin-roles__coverage-bar"
                    max={permissionCatalog.length || 1}
                    value={activePermissionCount}
                  />
                </div>
              </div>
            </header>

            <div className="admin-roles__matrix-scroll" tabIndex={0}>
              <table className="admin-roles__matrix">
                <caption className="visually-hidden">
                  {t('admin.roles.matrixAria', { role: selectedRole.name })}
                </caption>
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
                              data-label={t(`admin.roles.actions.${action}`)}
                              aria-label={t('admin.roles.notApplicable')}
                            >
                              <span aria-hidden>—</span>
                            </td>
                          )
                        }

                        const checked = permissionDraftSet.has(permission.key)
                        const reserved =
                          !selectedRole.isProtected &&
                          RESERVED_LOWER_PERMISSIONS.has(permission.key)

                        return (
                          <td key={action} data-label={t(`admin.roles.actions.${action}`)}>
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

            <footer className="admin-roles__matrix-footer">
              {editable ? (
                <p className="admin-roles__matrix-hint">{t('admin.roles.dependencyHint')}</p>
              ) : null}

              {dirty ? (
                <div className="admin-roles__changebar" role="status" aria-live="polite">
                  <div className="admin-roles__changebar-copy">
                    <strong>
                      {pendingRole
                        ? t('admin.roles.unsavedBeforeSwitch', {
                            role: pendingRole.name,
                          })
                        : t('admin.roles.unsaved')}
                    </strong>
                    <div className="admin-roles__change-counts">
                      {permissionDiff.added.length > 0 ? (
                        <span className="is-added">
                          <Plus size={12} aria-hidden />
                          {t('admin.roles.permissionsAdded', {
                            count: permissionDiff.added.length,
                          })}
                        </span>
                      ) : null}
                      {permissionDiff.removed.length > 0 ? (
                        <span className="is-removed">
                          <Minus size={12} aria-hidden />
                          {t('admin.roles.permissionsRemoved', {
                            count: permissionDiff.removed.length,
                          })}
                        </span>
                      ) : null}
                    </div>
                    <details className="admin-roles__change-details">
                      <summary>{t('admin.roles.reviewChanges')}</summary>
                      <ul>
                        {permissionDiff.added.map((permissionKey) => (
                          <li key={`added-${permissionKey}`} className="is-added">
                            <Plus size={12} aria-hidden />
                            {permissionLabel(permissionKey)}
                          </li>
                        ))}
                        {permissionDiff.removed.map((permissionKey) => (
                          <li key={`removed-${permissionKey}`} className="is-removed">
                            <Minus size={12} aria-hidden />
                            {permissionLabel(permissionKey)}
                          </li>
                        ))}
                      </ul>
                    </details>
                  </div>
                  <div className="admin-roles__changebar-actions">
                    <Button
                      type="button"
                      variant="secondary"
                      className="btn--small"
                      disabled={isSaving}
                      onClick={handleDiscard}
                    >
                      <RotateCcw size={14} aria-hidden />
                      {pendingRole ? t('admin.roles.discardAndOpen') : t('admin.roles.discard')}
                    </Button>
                    <Button
                      type="button"
                      variant="gold"
                      className="btn--small"
                      disabled={isSaving}
                      onClick={handleSave}
                    >
                      <Save size={14} aria-hidden />
                      {isSaving ? t('admin.roles.saving') : t('admin.roles.apply')}
                    </Button>
                  </div>
                </div>
              ) : null}
            </footer>
          </div>
        ) : (
          <p className="admin-roles__empty">{t('admin.roles.empty')}</p>
        )}
      </div>

      {canViewAudit && selectedRole ? (
        <section className="admin-roles__activity" aria-labelledby="admin-role-activity-title">
          <header className="admin-roles__activity-head">
            <span className="admin-roles__activity-icon" aria-hidden>
              <History size={16} />
            </span>
            <div>
              <h2 id="admin-role-activity-title">{t('admin.roles.activityTitle')}</h2>
              <p>{t('admin.roles.activitySubtitle', { role: selectedRole.name })}</p>
            </div>
          </header>

          {selectedActivity.length > 0 ? (
            <ol className="admin-roles__activity-list">
              {selectedActivity.map((item) => {
                const addedPermissions = item.addedPermissions ?? []
                const removedPermissions = item.removedPermissions ?? []
                const hasPermissionDetails =
                  addedPermissions.length > 0 || removedPermissions.length > 0

                return (
                  <li key={item.id}>
                    <span className="admin-roles__activity-dot" aria-hidden />
                    <div className="admin-roles__activity-body">
                      <div className="admin-roles__activity-title">
                        <strong>
                          {item.action === 'access_role.created'
                            ? t('admin.roles.activityCreated')
                            : item.action === 'access_role.permissions_updated'
                              ? t('admin.roles.activityUpdated')
                              : t('admin.roles.activityConfigured')}
                        </strong>
                        <time dateTime={item.createdAt}>
                          {formatActivityDate(item.createdAt, locale)}
                        </time>
                      </div>
                      <p>
                        {t('admin.roles.activityActor', {
                          actor: item.actorName || t('admin.roles.systemActor'),
                        })}
                      </p>
                      {hasPermissionDetails ? (
                        <details className="admin-roles__activity-details">
                          <summary>
                            {t('admin.roles.activitySummary', {
                              added: addedPermissions.length,
                              removed: removedPermissions.length,
                            })}
                          </summary>
                          <ul>
                            {addedPermissions.map((permissionKey) => (
                              <li key={`activity-added-${item.id}-${permissionKey}`}>
                                <Plus size={12} aria-hidden />
                                {permissionLabel(permissionKey)}
                              </li>
                            ))}
                            {removedPermissions.map((permissionKey) => (
                              <li
                                key={`activity-removed-${item.id}-${permissionKey}`}
                                className="is-removed"
                              >
                                <Minus size={12} aria-hidden />
                                {permissionLabel(permissionKey)}
                              </li>
                            ))}
                          </ul>
                        </details>
                      ) : (
                        <span className="admin-roles__activity-no-detail">
                          {t('admin.roles.activityNoPermissionChanges')}
                        </span>
                      )}
                    </div>
                  </li>
                )
              })}
            </ol>
          ) : (
            <p className="admin-roles__activity-empty">{t('admin.roles.activityEmpty')}</p>
          )}
        </section>
      ) : null}
    </section>
  )
}
