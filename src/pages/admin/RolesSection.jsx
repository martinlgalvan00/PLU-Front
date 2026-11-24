import { useEffect, useMemo, useState } from 'react'
import { Copy, Eye, LockKeyhole, Minus, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import '../../styles/pages/admin-roles.css'
import AdminPageHeader from '../../components/admin/AdminPageHeader.jsx'
import DetailTabs from '../../components/admin/DetailTabs.jsx'
import RoleChangeBar from '../../components/admin/RoleChangeBar.jsx'
import RoleComparisonMatrix from '../../components/admin/RoleComparisonMatrix.jsx'
import RolePackageBar from '../../components/admin/RolePackageBar.jsx'
import RolePermissionEditor from '../../components/admin/RolePermissionEditor.jsx'
import RoleRail from '../../components/admin/RoleRail.jsx'
import { moduleName, translateOr } from '../../lib/roleAccessLabels.js'
import Button from '../../components/ui/Button.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { useAdminTour } from '../../providers/AdminTourProvider.jsx'
import { getRolesTourSteps } from '../../lib/adminTourSteps.js'
import {
  canManageRolePermissions,
  getRoleHierarchyLevel,
  hasPermission,
} from '../../lib/permissions.js'
import {
  applyPackageToggle,
  applyPermissionToggle,
  diffPermissions,
  getSensitiveCapability,
  getSensitiveStatus,
  groupModulesByArea,
  isReservedPermission,
  permissionSignature,
  presetPermissionKeys,
  summarizeRoleAccess,
} from '../../lib/permissionInsights.js'

const VIEWS = { compare: 'compare', edit: 'edit' }
const MAX_SENSITIVE_SHOWN = 4

function actorCanEditRole(actor, role) {
  return role?.canManagePermissions ?? canManageRolePermissions(actor, role)
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
  onUpdateStatus,
  // Abre Usuarios filtrado por el rol. Sin esto (o sin acceso a Usuarios) no se ofrece.
  onViewUsers,
  permissionCatalog = [],
  roles = [],
}) {
  const { locale, t } = useI18n()
  const { startTour } = useAdminTour()

  useEffect(() => {
    startTour('admin-roles', getRolesTourSteps(t))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al montar
  }, [])

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
  const [view, setView] = useState(VIEWS.compare)
  const [selectedRoleId, setSelectedRoleId] = useState(initialRole?.id ?? null)
  const [permissionDraft, setPermissionDraft] = useState([])
  const [message, setMessage] = useState(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [isCreatingRole, setIsCreatingRole] = useState(false)
  const [roleDraft, setRoleDraft] = useState({ name: '', description: '' })
  // Rol del que se está copiando, si el formulario de alta se abrió con
  // «Duplicar»: arrastra los permisos ya filtrados para que el alta los envíe.
  const [duplicateSource, setDuplicateSource] = useState(null)
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

  const areas = useMemo(() => groupModulesByArea(permissionCatalog), [permissionCatalog])

  const visibleAreas = useMemo(() => {
    const query = permSearch.trim().toLowerCase()
    if (!query) return areas

    return areas
      .map((area) => ({
        ...area,
        modules: area.modules.filter((entry) => {
          const haystack = [
            entry.module,
            entry.label,
            moduleName(t, entry),
            translateOr(t, `admin.roles.moduleHints.${entry.module}`, ''),
          ]
            .join(' ')
            .toLowerCase()
          return haystack.includes(query)
        }),
      }))
      .filter((area) => area.modules.length > 0)
  }, [areas, permSearch, t])

  const editable = Boolean(
    selectedRole && !selectedRole.isProtected && actorCanEditRole(authorization, selectedRole),
  )
  const dirty =
    selectedRole &&
    permissionSignature(permissionDraft) !== permissionSignature(selectedRole.permissions)
  const canCreateRole = Boolean(onCreateRole) && hasPermission(authorization, 'admin.roles.write')
  const canViewAudit = hasPermission(authorization, 'admin.audit.read')
  const pendingRole = orderedRoles.find((role) => role.id === pendingRoleId) ?? null

  const permissionByKey = useMemo(
    () => new Map(permissionCatalog.map((permission) => [permission.key, permission])),
    [permissionCatalog],
  )
  const draftSet = useMemo(() => new Set(permissionDraft), [permissionDraft])
  const diff = useMemo(
    () => diffPermissions(selectedRole?.permissions, permissionDraft),
    [permissionDraft, selectedRole],
  )
  const summary = useMemo(
    () => summarizeRoleAccess(permissionCatalog, draftSet),
    [permissionCatalog, draftSet],
  )
  const enabledSensitive = useMemo(
    () => getSensitiveStatus(permissionCatalog, draftSet).filter((item) => item.granted),
    [permissionCatalog, draftSet],
  )
  const selectedActivity = useMemo(
    () => activity.filter((item) => item.roleId === selectedRole?.id).slice(0, 5),
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
    const capability = getSensitiveCapability(permissionKey)
    if (capability) return t(`admin.roles.sensitive.${capability.id}`)

    const permission = permissionByKey.get(permissionKey)
    if (!permission) return permissionKey
    const module = translateOr(
      t,
      `admin.roles.modules.${permission.module}`,
      permission.moduleLabel,
    )
    const action = translateOr(
      t,
      `admin.roles.actions.${permission.action}`,
      permission.actionLabel,
    )
    return `${module} · ${action}`
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

  function handleOpenRole(roleId) {
    handleRoleSelect(roleId)
    setView(VIEWS.edit)
  }

  function handleDiscard() {
    setPermissionDraft(selectedRole?.permissions ?? [])
    setMessage(null)
    const nextRoleId = pendingRoleId
    setPendingRoleId(null)
    if (nextRoleId) setSelectedRoleId(nextRoleId)
  }

  function handlePreset(preset) {
    if (!editable || !selectedRole) return
    setPermissionDraft(presetPermissionKeys(preset, permissionCatalog, permissionDraft))
    setMessage(null)
  }

  function handleToggle(permission, checked) {
    if (!editable || isReservedPermission(permission.key)) return
    setPermissionDraft((current) =>
      applyPermissionToggle(permissionCatalog, current, permission, checked),
    )
    setMessage(null)
  }

  function handlePackageToggle(packageId, checked) {
    if (!editable) return
    setPermissionDraft((current) =>
      applyPackageToggle(permissionCatalog, current, packageId, checked),
    )
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
        text: selectedRole.active ? t('admin.roles.deactivated') : t('admin.roles.activated'),
      })
    } catch (error) {
      setMessage({ tone: 'error', text: error?.message ?? t('admin.roles.errorStatus') })
    } finally {
      setIsUpdatingStatus(false)
    }
  }

  // Abre el alta con el nombre, la descripción y los permisos del rol elegido.
  // Los reservados (usuarios, roles, tarifas, tandas) se descartan acá porque el
  // servidor rechaza cualquier matriz que los incluya; lo que sobra ya es
  // coherente (si el origen opera un módulo, también lo lee).
  function handleDuplicateRole() {
    if (!selectedRole || !canCreateRole) return
    if (dirty) {
      setMessage({ tone: 'warning', text: t('admin.roles.finishChangesFirst') })
      return
    }
    const allKeys = selectedRole.permissions ?? []
    const permissionKeys = allKeys.filter((key) => !isReservedPermission(key))
    setDuplicateSource({
      name: selectedRole.name,
      permissionKeys,
      droppedCount: allKeys.length - permissionKeys.length,
    })
    setRoleDraft({
      name: t('admin.roles.copyName', { role: selectedRole.name }).slice(0, 64),
      description: (selectedRole.description ?? '').slice(0, 180),
    })
    setIsCreating(true)
    setMessage(null)
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
        permissionKeys: duplicateSource?.permissionKeys ?? [],
      })
      setSelectedRoleId(createdRole.id)
      setView(VIEWS.edit)
      setRoleDraft({ name: '', description: '' })
      setDuplicateSource(null)
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

  const viewTabs = [
    { id: VIEWS.compare, label: t('admin.roles.views.compare') },
    { id: VIEWS.edit, label: t('admin.roles.views.edit') },
  ]

  const lockedReason = !selectedRole
    ? null
    : selectedRole.isProtected
      ? t('admin.roles.editor.lockedProtected')
      : !editable
        ? t('admin.roles.editor.lockedReadonly')
        : null

  const shownSensitive = enabledSensitive.slice(0, MAX_SENSITIVE_SHOWN)
  const hiddenSensitiveCount = enabledSensitive.length - shownSensitive.length

  const newRoleButton = canCreateRole ? (
    <button
      type="button"
      className="roles-add"
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
        if (isCreating) {
          setDuplicateSource(null)
          setRoleDraft({ name: '', description: '' })
        }
        setIsCreating((current) => !current)
        setMessage(null)
      }}
    >
      {isCreating ? <X size={14} aria-hidden /> : <Plus size={14} aria-hidden />}
      <span>{isCreating ? t('admin.roles.cancel') : t('admin.roles.newRole')}</span>
    </button>
  ) : null

  return (
    <section className="roles-page">
      <AdminPageHeader
        className="roles-page__header"
        eyebrow={t('admin.roles.eyebrow')}
        title={t('admin.roles.title')}
        subtitle={t('admin.roles.subtitle')}
        actions={newRoleButton}
      />

      {message ? (
        <p
          className={`roles-message roles-message--${message.tone}`}
          role={message.tone === 'error' ? 'alert' : 'status'}
        >
          {message.text}
        </p>
      ) : null}

      {isCreating ? (
        <form id="admin-role-create" className="roles-create" onSubmit={handleCreateRole}>
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
              rows={2}
              placeholder={t('admin.roles.descriptionPlaceholder')}
              onChange={(event) =>
                setRoleDraft((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
            />
          </label>
          <div className="roles-create__submit">
            <Button
              type="submit"
              className="btn--small"
              disabled={roleDraft.name.trim().length < 3 || isCreatingRole}
            >
              <Plus size={14} aria-hidden />
              {isCreatingRole ? t('admin.roles.creating') : t('admin.roles.create')}
            </Button>
            <p>
              {duplicateSource
                ? t('admin.roles.duplicateHint', {
                    count: duplicateSource.permissionKeys.length,
                    role: duplicateSource.name,
                  })
                : t('admin.roles.createHint')}
              {duplicateSource?.droppedCount > 0
                ? ` ${t('admin.roles.duplicateDropped', { count: duplicateSource.droppedCount })}`
                : ''}
            </p>
          </div>
        </form>
      ) : null}

      <div className="roles-views">
        <DetailTabs
          tabs={viewTabs}
          activeTab={view}
          onChange={setView}
          variant="editorial"
          ariaLabel={t('admin.roles.views.aria')}
        />
      </div>

      {view === VIEWS.compare ? (
        <RoleComparisonMatrix
          catalog={permissionCatalog}
          onOpenRole={handleOpenRole}
          roles={orderedRoles}
          t={t}
        />
      ) : selectedRole ? (
        <div className="roles-editor">
          <RoleRail
            activeId={selectedRole.id}
            onSelect={handleRoleSelect}
            roles={orderedRoles}
            t={t}
          />

          <div className="roles-editor__main">
            <header className="roles-editor__head">
              <div className="roles-editor__title">
                <span className="roles-editor__level">
                  {selectedRole.isSystem
                    ? t('admin.roles.level', { level: getRoleHierarchyLevel(selectedRole) })
                    : t('admin.roles.customLevel')}
                </span>
                <h2>{selectedRole.name}</h2>
                <p>{selectedRole.description || t('admin.roles.noDescription')}</p>
                {selectedRole.scope === 'event' || selectedRole.eventScoped ? (
                  <p className="roles-editor__scope-hint">{t('admin.roles.scope.eventHint')}</p>
                ) : null}
              </div>

              <dl className="roles-editor__stats">
                <div>
                  <dt>{t('admin.roles.statUsers')}</dt>
                  <dd>{selectedRole.userCount ?? 0}</dd>
                  {onViewUsers && (selectedRole.userCount ?? 0) > 0 ? (
                    <button
                      type="button"
                      className="roles-editor__users-link"
                      onClick={() => onViewUsers(selectedRole.key)}
                    >
                      {t('admin.roles.viewUsers')}
                    </button>
                  ) : null}
                </div>
                <div>
                  <dt>{t('admin.roles.statModules')}</dt>
                  <dd>
                    {summary.modules}
                    <span>/{summary.totalModules}</span>
                  </dd>
                </div>
                <div className={summary.destructive > 0 ? 'is-danger' : undefined}>
                  <dt>{t('admin.roles.statSensitive')}</dt>
                  <dd>
                    {summary.sensitive}
                    <span>/{summary.totalSensitive}</span>
                  </dd>
                </div>
              </dl>

              {canCreateRole ? (
                <Button
                  type="button"
                  variant="outline"
                  className="btn--small roles-editor__status"
                  disabled={dirty || isCreatingRole}
                  onClick={handleDuplicateRole}
                >
                  <Copy size={14} aria-hidden />
                  {t('admin.roles.duplicateRole')}
                </Button>
              ) : null}

              {editable && onUpdateStatus ? (
                <Button
                  type="button"
                  variant="outline"
                  className="btn--small roles-editor__status"
                  disabled={dirty || isUpdatingStatus}
                  onClick={handleRoleStatus}
                >
                  {isUpdatingStatus
                    ? t('admin.roles.updatingStatus')
                    : selectedRole.active
                      ? t('admin.roles.deactivateRole')
                      : t('admin.roles.activateRole')}
                </Button>
              ) : null}

              <p
                className={`roles-editor__sensitive${enabledSensitive.length === 0 ? ' is-none' : ''}`}
              >
                {enabledSensitive.length === 0 ? (
                  t('admin.roles.editor.sensitiveNone')
                ) : (
                  <>
                    {shownSensitive.map((item) => (
                      <span
                        key={item.id}
                        className={`roles-editor__tag${item.destructive ? ' is-danger' : ''}`}
                      >
                        {item.destructive ? <Trash2 size={11} aria-hidden /> : null}
                        {t(`admin.roles.sensitive.${item.id}`)}
                      </span>
                    ))}
                    {hiddenSensitiveCount > 0 ? (
                      <span className="roles-editor__tag">+{hiddenSensitiveCount}</span>
                    ) : null}
                  </>
                )}
              </p>

              {lockedReason ? (
                <p className="roles-editor__notice">
                  <LockKeyhole size={13} aria-hidden />
                  {lockedReason}
                </p>
              ) : null}
              {selectedRole.active === false ? (
                <p className="roles-editor__notice">{t('admin.roles.editor.inactiveNote')}</p>
              ) : null}
            </header>

            <div className="roles-editor__toolbar">
              <div className="roles-editor__search">
                <Search size={14} aria-hidden />
                <input
                  type="search"
                  placeholder={t('admin.roles.searchPlaceholder')}
                  aria-label={t('admin.roles.searchPlaceholder')}
                  value={permSearch}
                  onChange={(event) => setPermSearch(event.target.value)}
                />
                {permSearch ? (
                  <button
                    type="button"
                    onClick={() => setPermSearch('')}
                    aria-label={t('admin.roles.clearSearch')}
                  >
                    <X size={12} aria-hidden />
                  </button>
                ) : null}
              </div>

              {editable ? (
                <div
                  className="roles-editor__presets"
                  role="group"
                  aria-label={t('admin.roles.presetsAria')}
                >
                  <button
                    type="button"
                    onClick={() => handlePreset('read-only')}
                    title={t('admin.roles.presetReadOnlyTitle')}
                  >
                    <Eye size={13} aria-hidden />
                    {t('admin.roles.presetReadOnly')}
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePreset('edit')}
                    title={t('admin.roles.presetEditTitle')}
                  >
                    <Pencil size={13} aria-hidden />
                    {t('admin.roles.presetEdit')}
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePreset('clear')}
                    title={t('admin.roles.presetClearTitle')}
                  >
                    <Minus size={13} aria-hidden />
                    {t('admin.roles.presetClear')}
                  </button>
                </div>
              ) : null}
            </div>

            {!permSearch ? (
              <RolePackageBar
                catalog={permissionCatalog}
                draftSet={draftSet}
                editable={editable}
                onTogglePackage={handlePackageToggle}
                t={t}
              />
            ) : null}

            {visibleAreas.length === 0 ? (
              <div className="roles-editor__empty">
                <Search size={20} aria-hidden />
                <p>{t('admin.roles.searchEmpty', { query: permSearch })}</p>
                <Button variant="outline" className="btn--small" onClick={() => setPermSearch('')}>
                  {t('admin.roles.clearSearch')}
                </Button>
              </div>
            ) : (
              <RolePermissionEditor
                areas={visibleAreas}
                draftSet={draftSet}
                editable={editable}
                onToggle={handleToggle}
                t={t}
              />
            )}

            {editable ? (
              <p className="roles-editor__hint">{t('admin.roles.dependencyHint')}</p>
            ) : null}

            {canViewAudit ? (
              <details className="roles-history">
                <summary>
                  <span>{t('admin.roles.editor.history')}</span>
                  <small>
                    {t('admin.roles.editor.historyCount', { count: selectedActivity.length })}
                  </small>
                </summary>
                {selectedActivity.length > 0 ? (
                  <ol>
                    {selectedActivity.map((item) => {
                      const added = item.addedPermissions ?? []
                      const removed = item.removedPermissions ?? []
                      const actionLabel =
                        item.action === 'access_role.created'
                          ? t('admin.roles.activityCreated')
                          : item.action === 'access_role.permissions_updated'
                            ? t('admin.roles.activityUpdated')
                            : t('admin.roles.activityConfigured')

                      return (
                        <li key={item.id}>
                          <div className="roles-history__line">
                            <strong>{actionLabel}</strong>
                            <span>
                              {t('admin.roles.activityActor', {
                                actor: item.actorName || t('admin.roles.systemActor'),
                              })}
                              <span aria-hidden> · </span>
                              <time dateTime={item.createdAt}>
                                {formatActivityDate(item.createdAt, locale)}
                              </time>
                            </span>
                          </div>
                          {added.length + removed.length > 0 ? (
                            <ul className="roles-history__changes">
                              {added.map((permissionKey) => (
                                <li key={`h-add-${item.id}-${permissionKey}`}>
                                  <Plus size={12} aria-hidden />
                                  {permissionLabel(permissionKey)}
                                </li>
                              ))}
                              {removed.map((permissionKey) => (
                                <li
                                  key={`h-rem-${item.id}-${permissionKey}`}
                                  className="is-removed"
                                >
                                  <Minus size={12} aria-hidden />
                                  {permissionLabel(permissionKey)}
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </li>
                      )
                    })}
                  </ol>
                ) : (
                  <p className="roles-history__empty">{t('admin.roles.activityEmpty')}</p>
                )}
              </details>
            ) : null}

            {dirty ? (
              <RoleChangeBar
                diff={diff}
                isSaving={isSaving}
                labelFor={permissionLabel}
                onDiscard={handleDiscard}
                onSave={handleSave}
                pendingRole={pendingRole}
                t={t}
              />
            ) : null}
          </div>
        </div>
      ) : (
        <p className="roles-empty">{t('admin.roles.empty')}</p>
      )}
    </section>
  )
}
