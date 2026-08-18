import { useEffect, useMemo, useState } from 'react'
import {
  Award,
  Calendar,
  CheckCheck,
  CreditCard,
  Eye,
  FileSpreadsheet,
  Key,
  LockKeyhole,
  Minus,
  Plus,
  QrCode,
  RotateCcw,
  Save,
  Search,
  Settings,
  Trash2,
  Users,
  X,
} from 'lucide-react'
import AdminPageHeader from '../../components/admin/AdminPageHeader.jsx'
import DetailTabs from '../../components/admin/DetailTabs.jsx'
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

function getModuleIcon(module) {
  switch (module) {
    case 'events':
      return Calendar
    case 'athletes':
    case 'users':
      return Users
    case 'memberships':
      return Award
    case 'payments':
      return CreditCard
    case 'checkin':
      return QrCode
    case 'exports':
      return FileSpreadsheet
    case 'security':
      return Key
    default:
      return Settings
  }
}

function formatModuleName(moduleKey, t) {
  const translated = t(`admin.roles.modules.${moduleKey}`)
  if (translated && !translated.startsWith('admin.roles.modules.')) {
    return translated
  }
  const MODULE_NAMES = {
    events: 'Eventos y Competencias',
    athletes: 'Atletas y Perfiles',
    memberships: 'Membresías y Carnets',
    payments: 'Pagos y Transacciones',
    users: 'Usuarios y Accesos',
    roles: 'Roles y Permisos',
    audit: 'Auditoría e Historial',
    checkin: 'Check-In y Accesos',
    exports: 'Exportaciones de Datos',
    security: 'Seguridad y Puertas',
  }
  return MODULE_NAMES[moduleKey] ?? moduleKey.toUpperCase()
}

const ACTION_LABELS = {
  read: 'Ver',
  write: 'Crear',
  approve: 'Aprobar',
  execute: 'Ejecutar',
}

function getActionLabel(action) {
  return ACTION_LABELS[action] ?? action
}

function getActionText(action, module, permission, t) {
  const moduleTitle = formatModuleName(module, t)
  const short = getActionLabel(action)

  switch (action) {
    case 'read':
      return {
        title: short,
        desc: permission?.description || `Ver y consultar ${moduleTitle}.`,
      }
    case 'write':
      return {
        title: short,
        desc: permission?.description || `Crear y modificar ${moduleTitle}.`,
      }
    case 'approve':
      return {
        title: short,
        desc: permission?.description || `Aprobar y autorizar ${moduleTitle}.`,
      }
    case 'execute':
      return {
        title: short,
        desc: permission?.description || `Acciones avanzadas en ${moduleTitle}.`,
      }
    default:
      return {
        title: t(`admin.roles.actions.${action}`),
        desc: permission?.description || '',
      }
  }
}

export default function RolesSection({
  activity = [],
  authorization,
  onCreateRole,
  onUpdatePermissions,
  onUpdateStatus,
  permissionCatalog = [],
  roles = [],
}) {
  const { locale, t } = useI18n()

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
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [isCreatingRole, setIsCreatingRole] = useState(false)
  const [roleDraft, setRoleDraft] = useState({ name: '', description: '' })
  const [pendingRoleId, setPendingRoleId] = useState(null)
  const [permSearch, setPermSearch] = useState('')

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

  const roleTabs = useMemo(
    () =>
      orderedRoles.map((role) => ({
        id: role.id,
        label: role.name,
        count: typeof role.userCount === 'number' ? role.userCount : undefined,
      })),
    [orderedRoles],
  )

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

  const filteredPermissionRows = useMemo(() => {
    if (!permSearch.trim()) return permissionRows
    const query = permSearch.toLowerCase().trim()

    return permissionRows
      .map((row) => {
        const moduleTranslated = t(`admin.roles.modules.${row.module}`).toLowerCase()
        const matchesModule =
          moduleTranslated.includes(query) || row.module.toLowerCase().includes(query)

        const matchedActions = {}
        let hasActionMatch = false

        for (const [action, permission] of Object.entries(row.actions)) {
          const actionTranslated = t(`admin.roles.actions.${action}`).toLowerCase()
          const desc = (permission?.description ?? '').toLowerCase()
          if (matchesModule || actionTranslated.includes(query) || desc.includes(query)) {
            matchedActions[action] = permission
            hasActionMatch = true
          }
        }

        if (matchesModule || hasActionMatch) {
          return { ...row, actions: matchedActions }
        }
        return null
      })
      .filter(Boolean)
  }, [permissionRows, permSearch, t])

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
  const permissionDraftSet = useMemo(() => new Set(permissionDraft), [permissionDraft])
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
    }
  }, [permissionCatalog, permissionDraftSet])
  const selectedActivity = useMemo(
    () => activity.filter((item) => item.roleId === selectedRole?.id).slice(0, 3),
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

  function handleGrantAll() {
    if (!editable || !selectedRole) return
    const allKeys = permissionCatalog
      .filter((p) => selectedRole.isProtected || !RESERVED_LOWER_PERMISSIONS.has(p.key))
      .map((p) => p.key)
    setPermissionDraft(allKeys)
    setMessage(null)
  }

  function handleGrantReadOnly() {
    if (!editable || !selectedRole) return
    const readKeys = permissionCatalog
      .filter(
        (p) =>
          p.action === 'read' &&
          (selectedRole.isProtected || !RESERVED_LOWER_PERMISSIONS.has(p.key)),
      )
      .map((p) => p.key)
    setPermissionDraft(readKeys)
    setMessage(null)
  }

  function handleClearAll() {
    if (!editable || !selectedRole) return
    const reservedKeys = permissionCatalog
      .filter((p) => !selectedRole.isProtected && RESERVED_LOWER_PERMISSIONS.has(p.key))
      .map((p) => p.key)
    setPermissionDraft(reservedKeys)
    setMessage(null)
  }

  function handleModuleToggle(row, targetChecked) {
    if (!editable || !selectedRole) return

    const modulePermissions = Object.values(row.actions).filter(Boolean)
    const keysToToggle = modulePermissions
      .filter((p) => selectedRole.isProtected || !RESERVED_LOWER_PERMISSIONS.has(p.key))
      .map((p) => p.key)

    setPermissionDraft((current) => {
      const next = new Set(current)
      if (targetChecked) {
        keysToToggle.forEach((key) => next.add(key))
      } else {
        keysToToggle.forEach((key) => next.delete(key))
      }
      return permissionCatalog
        .filter((candidate) => next.has(candidate.key))
        .map((candidate) => candidate.key)
    })
    setMessage(null)
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

  async function handleRoleStatus() {
    if (!selectedRole || !onUpdateStatus || !editable || dirty) return
    setIsUpdatingStatus(true)
    try {
      await onUpdateStatus(selectedRole.id, !selectedRole.active)
      setMessage({
        tone: 'success',
        text: selectedRole.active ? 'Rol desactivado.' : 'Rol activado.',
      })
    } catch (error) {
      setMessage({ tone: 'error', text: error?.message ?? 'No se pudo actualizar el rol.' })
    } finally {
      setIsUpdatingStatus(false)
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

  const toolbar = selectedRole ? (
    <div className="admin-roles__toolbar">
      <div className="admin-roles__search-box">
        <Search size={14} className="admin-roles__search-icon" aria-hidden />
        <input
          type="search"
          className="admin-roles__search-input"
          placeholder={t('admin.roles.searchPlaceholder')}
          value={permSearch}
          onChange={(e) => setPermSearch(e.target.value)}
        />
        {permSearch ? (
          <button
            type="button"
            className="admin-roles__search-clear"
            onClick={() => setPermSearch('')}
            aria-label={t('admin.roles.clearSearch')}
          >
            <X size={12} aria-hidden />
          </button>
        ) : null}
      </div>

      {editable ? (
        <div
          className="admin-roles__presets"
          role="group"
          aria-label={t('admin.roles.presetsAria')}
        >
          <button
            type="button"
            className="admin-roles__preset-btn"
            onClick={handleGrantAll}
            title={t('admin.roles.presetAllTitle')}
          >
            <CheckCheck size={13} aria-hidden />
            <span>{t('admin.roles.presetAll')}</span>
          </button>

          <button
            type="button"
            className="admin-roles__preset-btn"
            onClick={handleGrantReadOnly}
            title={t('admin.roles.presetReadOnlyTitle')}
          >
            <Eye size={13} aria-hidden />
            <span>{t('admin.roles.presetReadOnly')}</span>
          </button>

          <button
            type="button"
            className="admin-roles__preset-btn admin-roles__preset-btn--clear"
            onClick={handleClearAll}
            title={t('admin.roles.presetClearTitle')}
          >
            <Trash2 size={13} aria-hidden />
            <span>{t('admin.roles.presetClear')}</span>
          </button>
        </div>
      ) : null}
    </div>
  ) : null

  const activitySection =
    canViewAudit && selectedRole ? (
      <section className="admin-roles__activity" aria-labelledby="admin-role-activity-title">
        <header className="admin-roles__activity-head">
          <h2 id="admin-role-activity-title">{t('admin.roles.activityTitle')}</h2>
        </header>

        {selectedActivity.length > 0 ? (
          <ol className="admin-roles__activity-list">
            {selectedActivity.map((item) => {
              const addedPermissions = item.addedPermissions ?? []
              const removedPermissions = item.removedPermissions ?? []
              const hasPermissionDetails =
                addedPermissions.length > 0 || removedPermissions.length > 0
              const actionLabel =
                item.action === 'access_role.created'
                  ? t('admin.roles.activityCreated')
                  : item.action === 'access_role.permissions_updated'
                    ? t('admin.roles.activityUpdated')
                    : t('admin.roles.activityConfigured')

              return (
                <li key={item.id}>
                  <div className="admin-roles__activity-body">
                    <div className="admin-roles__activity-title">
                      <strong>{actionLabel}</strong>
                      <span className="admin-roles__activity-meta">
                        {t('admin.roles.activityActor', {
                          actor: item.actorName || t('admin.roles.systemActor'),
                        })}
                        <span aria-hidden="true">·</span>
                        <time dateTime={item.createdAt}>
                          {formatActivityDate(item.createdAt, locale)}
                        </time>
                      </span>
                    </div>
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
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ol>
        ) : (
          <p className="admin-roles__activity-empty">{t('admin.roles.activityEmpty')}</p>
        )}
      </section>
    ) : null

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

      <div className="admin-roles__tabs-bar">
        <DetailTabs
          tabs={roleTabs}
          activeTab={selectedRole?.id}
          onChange={handleRoleSelect}
          variant="editorial"
        />
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
        <form id="admin-role-create" className="admin-roles__create" onSubmit={handleCreateRole}>
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

      {toolbar}

      <div className="admin-roles__workspace">
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

              <div
                className="admin-roles__matrix-meta"
                aria-label={t('admin.roles.activeCount', {
                  active: activePermissionCount,
                  total: permissionCatalog.length,
                })}
              >
                <p className="admin-roles__meta-line">
                  <span>{t('admin.roles.usersCount', { count: selectedRole.userCount ?? 0 })}</span>
                  <span aria-hidden="true">·</span>
                  <span>{t('admin.roles.modulesCount', { count: roleStats.modules })}</span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {t('admin.roles.activeCount', {
                      active: activePermissionCount,
                      total: permissionCatalog.length,
                    })}
                  </span>
                </p>
              </div>
              {editable && onUpdateStatus ? (
                <Button
                  type="button"
                  variant="outline"
                  className="btn--small"
                  disabled={dirty || isUpdatingStatus}
                  onClick={handleRoleStatus}
                >
                  {isUpdatingStatus
                    ? 'Actualizando…'
                    : selectedRole.active
                      ? 'Desactivar rol'
                      : 'Activar rol'}
                </Button>
              ) : null}
            </header>

            {activitySection}

            <div className="admin-roles__matrix-scroll">
              {filteredPermissionRows.length === 0 ? (
                <div className="admin-roles__search-empty">
                  <Search size={22} aria-hidden />
                  <p>{t('admin.roles.searchEmpty', { query: permSearch })}</p>
                  <Button
                    variant="outline"
                    className="btn--small"
                    onClick={() => setPermSearch('')}
                  >
                    {t('admin.roles.clearSearch')}
                  </Button>
                </div>
              ) : (
                <table className="admin-roles__perm-table">
                  <thead>
                    <tr>
                      <th scope="col" className="admin-roles__perm-table-module">
                        Módulo
                      </th>
                      {ACTION_ORDER.map((action) => (
                        <th key={action} scope="col" className="admin-roles__perm-table-action">
                          {getActionLabel(action)}
                        </th>
                      ))}
                      {editable ? (
                        <th scope="col" className="admin-roles__perm-table-all">
                          Todo
                        </th>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPermissionRows.map((row) => {
                      const ModuleIcon = getModuleIcon(row.module)
                      const modulePermissions = Object.values(row.actions).filter(Boolean)
                      const moduleTotal = modulePermissions.length
                      const moduleActive = modulePermissions.filter((p) =>
                        permissionDraftSet.has(p.key),
                      ).length
                      const isAllActive = moduleTotal > 0 && moduleActive === moduleTotal
                      const isSomeActive = moduleActive > 0 && moduleActive < moduleTotal
                      const moduleName = formatModuleName(row.module, t)

                      return (
                        <tr key={row.module}>
                          <th scope="row" className="admin-roles__perm-table-module">
                            <span className="admin-roles__perm-table-module-inner">
                              <span className="admin-roles__perm-table-icon" aria-hidden>
                                <ModuleIcon size={14} />
                              </span>
                              <span className="admin-roles__perm-table-module-copy">
                                <strong>{moduleName}</strong>
                                <small>
                                  {moduleActive}/{moduleTotal}
                                </small>
                              </span>
                            </span>
                          </th>

                          {ACTION_ORDER.map((action) => {
                            const permission = row.actions[action]
                            if (!permission) {
                              return (
                                <td key={action} className="admin-roles__perm-table-cell is-empty">
                                  <span className="admin-roles__perm-na" aria-hidden>
                                    —
                                  </span>
                                </td>
                              )
                            }

                            const checked = permissionDraftSet.has(permission.key)
                            const reserved =
                              editable &&
                              !selectedRole.isProtected &&
                              RESERVED_LOWER_PERMISSIONS.has(permission.key)
                            const text = getActionText(action, row.module, permission, t)

                            return (
                              <td
                                key={action}
                                className={`admin-roles__perm-table-cell${checked ? ' is-on' : ''}${
                                  reserved ? ' is-reserved' : ''
                                }`}
                              >
                                <label
                                  className={`admin-roles__permission admin-roles__permission--cell${
                                    checked ? ' is-checked' : ''
                                  }${reserved ? ' is-reserved' : ''}`}
                                  title={reserved ? t('admin.roles.reservedPermission') : text.desc}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    disabled={!editable || reserved}
                                    aria-label={`${moduleName}: ${text.title}`}
                                    onChange={(e) =>
                                      handlePermissionChange(permission, e.target.checked)
                                    }
                                  />
                                  <span aria-hidden />
                                </label>
                              </td>
                            )
                          })}

                          {editable ? (
                            <td className="admin-roles__perm-table-cell admin-roles__perm-table-cell--all">
                              <label
                                className="admin-roles__master-toggle admin-roles__master-toggle--cell"
                                title="Acceso completo a este módulo"
                              >
                                <input
                                  type="checkbox"
                                  checked={isAllActive}
                                  aria-label={`Todo el módulo ${moduleName}`}
                                  ref={(el) => {
                                    if (el) el.indeterminate = isSomeActive
                                  }}
                                  onChange={(e) => handleModuleToggle(row, e.target.checked)}
                                />
                                <span className="admin-roles__master-switch" aria-hidden />
                              </label>
                            </td>
                          ) : null}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
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
    </section>
  )
}
