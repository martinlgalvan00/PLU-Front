import { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  Ban,
  CircleCheck,
  ChevronDown,
  KeyRound,
  CirclePause,
  Search,
  Shield,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react'
import AdminDeleteConfirmDialog from '../../components/admin/AdminDeleteConfirmDialog.jsx'
import AdminDataTable from '../../components/admin/AdminDataTable.jsx'
import AdminEmptyState from '../../components/admin/AdminEmptyState.jsx'
import { Field, Select } from '../../components/ui/FormFields.jsx'
import Button from '../../components/ui/Button.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { formatRecordCount } from '../../i18n/adminHelpers.js'
import { getRoleLabel } from '../../lib/roles.js'
import UsersRowMenu from './UsersRowMenu.jsx'
import '../../styles/pages/admin-users.css'

const EMPTY_DRAFT = { name: '', email: '', role: 'plu_arg', eventId: '' }

const STATUS_FILTERS = [
  ['active', 'admin.users.statusActive'],
  ['invited', 'admin.users.statusInvited'],
  ['suspended', 'admin.users.statusSuspended'],
  ['disabled', 'admin.users.statusDisabled'],
]

function statusLabel(t, status) {
  switch (status) {
    case 'active':
      return t('admin.users.statusActive')
    case 'invited':
      return t('admin.users.statusInvited')
    case 'suspended':
      return t('admin.users.statusSuspended')
    case 'disabled':
      return t('admin.users.statusDisabled')
    default:
      return status ?? t('admin.users.statusUnknown')
  }
}

export default function UsersSection({
  accessRoles,
  adminEvents,
  canDeleteUsers,
  canManageUsers,
  onCreateSecurityUser,
  onCreateUser,
  onDeleteUser,
  onNavigateRoles,
  onResetPassword,
  onUpdateRole,
  onUpdateStatus,
  users,
}) {
  const { t } = useI18n()
  const formId = useId()
  const formRef = useRef(null)
  const newButtonRef = useRef(null)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [isCreating, setIsCreating] = useState(false)
  const [draft, setDraft] = useState(EMPTY_DRAFT)
  const [formError, setFormError] = useState('')
  const [tempPassword, setTempPassword] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [updatingUserId, setUpdatingUserId] = useState(null)
  const [pendingDeletion, setPendingDeletion] = useState(null)
  const [deleteError, setDeleteError] = useState('')
  const [deleteNotice, setDeleteNotice] = useState('')

  const isSecurityRole = draft.role === 'seguridad_plu_arg'

  const eventOptions = useMemo(
    () => (adminEvents ?? []).map((event) => [event.id, event.title]),
    [adminEvents],
  )
  const roleOptions = useMemo(
    () =>
      (accessRoles ?? [])
        .filter((role) => role.active !== false && role.canAssign)
        .map((role) => [role.key, role.name]),
    [accessRoles],
  )

  const statusCounts = useMemo(() => {
    const counts = Object.create(null)
    for (const user of users) {
      const key = user.status ?? 'active'
      counts[key] = (counts[key] ?? 0) + 1
    }
    return counts
  }, [users])

  // Solo se ofrecen los estados que existen en el padrón: con un único estado
  // el filtro no separa nada, así que el control ni se dibuja (salvo que haya
  // quedado uno aplicado, para poder soltarlo).
  const statusOptions = useMemo(
    () => [
      ['all', t('admin.users.allStatuses')],
      ...STATUS_FILTERS.filter(
        ([value]) => (statusCounts[value] ?? 0) > 0 || value === statusFilter,
      ).map(([value, key]) => [value, `${t(key)} · ${statusCounts[value] ?? 0}`]),
    ],
    [statusCounts, statusFilter, t],
  )
  const distinctStatuses = Object.keys(statusCounts).length
  const showStatusFilter = distinctStatuses > 1 || statusFilter !== 'all'

  const rows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return users.filter((user) => {
      const status = user.status ?? 'active'
      if (statusFilter !== 'all' && status !== statusFilter) return false
      if (!normalizedQuery) return true
      return (
        user.name.toLowerCase().includes(normalizedQuery) ||
        user.email.toLowerCase().includes(normalizedQuery)
      )
    })
  }, [users, query, statusFilter])

  function clearFilters() {
    setQuery('')
    setStatusFilter('all')
  }

  const isGloballyEmpty = users.length === 0
  const isFilteredEmpty = !isGloballyEmpty && rows.length === 0
  const emptyMessage = isGloballyEmpty ? (
    <AdminEmptyState
      icon={Shield}
      title={t('admin.sections.users.emptyTitle')}
      lead={t('admin.sections.users.emptyLead')}
    />
  ) : isFilteredEmpty ? (
    <AdminEmptyState
      icon={Shield}
      filtered
      title={t('admin.sections.users.emptyFilteredTitle')}
      lead={t('admin.sections.users.emptyFiltered')}
      actionLabel={t('admin.sections.users.clearFilters')}
      onAction={clearFilters}
    />
  ) : null

  useEffect(() => {
    if (!isCreating) return undefined
    const frame = window.requestAnimationFrame(() => {
      formRef.current?.querySelector('input[name="name"]')?.focus()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [isCreating])

  useEffect(() => {
    if (!isCreating) return undefined

    function handleKeyDown(event) {
      if (event.key !== 'Escape' || isSubmitting) return
      event.preventDefault()
      setIsCreating(false)
      setDraft(EMPTY_DRAFT)
      setFormError('')
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isCreating, isSubmitting])

  function closeCreateForm() {
    setIsCreating(false)
    setDraft(EMPTY_DRAFT)
    setFormError('')
    // El botón "Cancelar" desaparece al cerrar: el foco vuelve a "Nuevo usuario".
    window.requestAnimationFrame(() => newButtonRef.current?.focus())
  }

  function openCreateForm() {
    setFormError('')
    setTempPassword(null)
    setIsCreating(true)
  }

  async function handleAddUser(event) {
    event.preventDefault()
    if (draft.name.trim().length < 3) {
      setFormError(t('admin.users.errorName'))
      return
    }
    if (!/^\S+@\S+\.\S+$/.test(draft.email.trim())) {
      setFormError(t('admin.users.errorEmail'))
      return
    }
    if (isSecurityRole && !draft.eventId) {
      setFormError(t('admin.users.errorEvent'))
      return
    }

    setFormError('')
    setTempPassword(null)

    setIsSubmitting(true)
    try {
      if (!isSecurityRole) {
        const { user, emailed } = await onCreateUser(draft)
        setTempPassword({
          email: user?.email ?? draft.email.trim().toLowerCase(),
          password: null,
          emailed,
          mode: 'invitation',
        })
        setDraft(EMPTY_DRAFT)
        setIsCreating(false)
        return
      }

      const { user, tempPassword: password } = await onCreateSecurityUser(draft)
      setTempPassword({ email: user.email, password, emailed: false, mode: 'security' })
      setDraft(EMPTY_DRAFT)
      setIsCreating(false)
    } catch (error) {
      setFormError(
        error?.status === 409 ? t('admin.users.errorEmailTaken') : t('admin.users.errorCreate'),
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleRoleChange(userId, roleKey) {
    setFormError('')
    setUpdatingUserId(userId)
    try {
      await onUpdateRole(userId, roleKey)
    } catch (error) {
      setFormError(error?.message ?? t('admin.users.errorRoleUpdate'))
    } finally {
      setUpdatingUserId(null)
    }
  }

  // Reenvía una invitación nueva. Ninguna contraseña ni token vuelve al panel.
  async function handleResetPassword(user) {
    if (!onResetPassword) return
    setFormError('')
    setTempPassword(null)
    setUpdatingUserId(user.id)
    try {
      const { emailed } = await onResetPassword(user.id)
      setTempPassword({ email: user.email, password: null, emailed, mode: 'reset' })
    } catch (error) {
      setFormError(error?.message ?? t('admin.users.errorReset'))
    } finally {
      setUpdatingUserId(null)
    }
  }

  async function handleStatusChange(userId, nextStatus) {
    if (!onUpdateStatus) return
    setFormError('')
    setUpdatingUserId(userId)
    try {
      await onUpdateStatus(userId, nextStatus)
    } catch (error) {
      setFormError(error?.message ?? t('admin.users.errorStatusUpdate'))
    } finally {
      setUpdatingUserId(null)
    }
  }

  function openDeleteDialog(user) {
    setDeleteError('')
    setDeleteNotice('')
    setPendingDeletion(user)
  }

  function closeDeleteDialog() {
    if (updatingUserId) return
    setPendingDeletion(null)
    setDeleteError('')
  }

  async function handleDeleteUser() {
    if (!pendingDeletion || !onDeleteUser) return
    setDeleteError('')
    setUpdatingUserId(pendingDeletion.id)

    try {
      await onDeleteUser(pendingDeletion.id)
      setDeleteNotice(t('admin.users.deleteSuccess', { name: pendingDeletion.name }))
      setPendingDeletion(null)
    } catch (error) {
      setDeleteError(error?.message ?? t('admin.users.errorDelete'))
    } finally {
      setUpdatingUserId(null)
    }
  }

  function canMutateUser(row) {
    return (
      row.role !== 'admin_maximal' &&
      ((canManageUsers && Boolean(onUpdateStatus)) ||
        (canManageUsers && Boolean(onResetPassword)) ||
        (canDeleteUsers && Boolean(onDeleteUser)))
    )
  }

  const isFiltering = query.trim() !== '' || statusFilter !== 'all'
  const showActionsColumn = users.some(canMutateUser)

  function toggleCreateForm() {
    if (isCreating) {
      if (!isSubmitting) closeCreateForm()
      return
    }
    openCreateForm()
  }

  // Lo menos frecuente y lo irreversible van al menú. "Dar de baja" pide un
  // segundo toque dentro del propio menú; "Eliminar" abre su diálogo.
  function buildMenuItems(row) {
    const status = row.status ?? 'active'
    const canUpdateStatus = canManageUsers && Boolean(onUpdateStatus)
    const canDelete = canDeleteUsers && Boolean(onDeleteUser)
    const canReset = canManageUsers && Boolean(onResetPassword)
    const items = []

    if (canUpdateStatus && (status === 'active' || status === 'suspended')) {
      const isActive = status === 'active'
      items.push({
        key: 'toggle',
        label: isActive ? t('admin.users.actionSuspend') : t('admin.users.actionActivate'),
        icon: isActive ? CirclePause : CircleCheck,
        onSelect: () => void handleStatusChange(row.id, isActive ? 'suspended' : 'active'),
      })
    }
    if (status === 'disabled' && canUpdateStatus) {
      items.push({
        key: 'activate',
        label: t('admin.users.actionActivate'),
        icon: CircleCheck,
        onSelect: () => void handleStatusChange(row.id, 'active'),
      })
    }
    if (canReset) {
      items.push({
        key: 'reset',
        label: t('admin.users.actionReset'),
        icon: KeyRound,
        onSelect: () => void handleResetPassword(row),
      })
    }
    if (canUpdateStatus && status !== 'disabled') {
      items.push({
        key: 'disable',
        label: t('admin.users.actionDisable'),
        confirmLabel: t('admin.users.confirmDisable'),
        icon: Ban,
        tone: 'danger',
        onSelect: () => void handleStatusChange(row.id, 'disabled'),
      })
    }
    if (canDelete) {
      items.push({
        key: 'delete',
        label: t('admin.users.actionDelete'),
        icon: Trash2,
        tone: 'danger',
        onSelect: () => openDeleteDialog(row),
      })
    }
    return items
  }

  const columns = [
    {
      key: 'name',
      label: t('admin.columns.user'),
      mobile: 'primary',
      sortable: true,
      render: (row) => (
        <div className="admin-users__who">
          <span
            className={`admin-users__monogram${row.role === 'admin_maximal' ? ' is-owner' : ''}`}
            aria-hidden
          >
            {row.name?.trim()?.charAt(0)?.toUpperCase() ?? '?'}
          </span>
          <span className="admin-users__who-copy">
            <strong className="admin-users__who-name">{row.name ?? '—'}</strong>
            <span className="admin-users__who-email" title={row.email}>
              {row.email}
            </span>
          </span>
        </div>
      ),
    },
    {
      key: 'role',
      label: t('admin.columns.role'),
      mobile: 'badge',
      sortable: true,
      className: 'data-table__column--role',
      width: 190,
      render: (row) => {
        const roleKey = row.roleKey ?? row.role
        const canEditRole =
          canManageUsers &&
          row.role !== 'admin_maximal' &&
          roleOptions.some(([optionKey]) => optionKey === roleKey)

        if (!canEditRole) {
          return <span className="admin-users__role-text">{getRoleLabel(row)}</span>
        }

        const busy = updatingUserId === row.id

        return (
          <label
            className={`admin-users__role-select${busy ? ' is-busy' : ''}`}
            onClick={(event) => event.stopPropagation()}
          >
            <select
              name={`role-${row.id}`}
              value={roleKey}
              disabled={busy}
              aria-label={`${t('admin.columns.role')}: ${row.name}`}
              onChange={(event) => handleRoleChange(row.id, event.target.value)}
            >
              {roleOptions.map(([optionValue, optionLabel]) => (
                <option key={optionValue} value={optionValue}>
                  {optionLabel}
                </option>
              ))}
            </select>
            <ChevronDown size={13} aria-hidden />
          </label>
        )
      },
    },
    {
      key: 'status',
      label: t('admin.columns.status'),
      mobile: 'badge',
      sortable: true,
      width: 140,
      sortAccessor: (row) => row.status ?? 'active',
      render: (row) => {
        const status = row.status ?? 'active'
        return (
          <span className={`admin-users__status admin-users__status--${status}`}>
            <span className="admin-users__status-dot" aria-hidden />
            {statusLabel(t, status)}
          </span>
        )
      },
    },
    ...(showActionsColumn
      ? [
          {
            key: 'actions',
            label: t('admin.columns.action'),
            mobile: 'action',
            sortable: false,
            mobileSortable: false,
            width: 64,
            className: 'data-table__column--actions admin-users__column-actions',
            render: (row) => {
              if (!canMutateUser(row)) return null

              const busy = updatingUserId === row.id

              return (
                <div
                  className="admin-users__row-actions"
                  role="group"
                  aria-label={t('admin.users.actionsAria', { name: row.name })}
                  onClick={(event) => event.stopPropagation()}
                >
                  {busy ? <span className="plu-spinner plu-spinner--sm" aria-hidden="true" /> : null}
                  <UsersRowMenu
                    label={t('admin.actions.more')}
                    items={buildMenuItems(row)}
                    disabled={busy}
                  />
                </div>
              )
            },
          },
        ]
      : []),
  ]

  return (
    <section className="admin-users" aria-label={t('admin.sections.users.title')}>
      <div className="admin-users__toolbar">
        {!isGloballyEmpty ? (
          <div className="admin-users__search" role="search">
            <Search size={15} aria-hidden />
            <input
              type="search"
              name="users-search"
              value={query}
              placeholder={t('admin.search.users')}
              aria-label={t('admin.search.users')}
              autoComplete="off"
              onChange={(event) => setQuery(event.target.value)}
            />
            {query ? (
              <button
                type="button"
                className="admin-users__search-clear"
                aria-label={t('admin.filters.clearFilter')}
                onClick={() => setQuery('')}
              >
                <X size={13} aria-hidden />
              </button>
            ) : null}
          </div>
        ) : null}

        {showStatusFilter ? (
          <label className={`admin-users__filter${statusFilter !== 'all' ? ' is-active' : ''}`}>
            <select
              name="users-status"
              value={statusFilter}
              aria-label={t('admin.filters.status')}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              {statusOptions.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <ChevronDown size={13} aria-hidden />
          </label>
        ) : null}

        <span className="admin-users__count" aria-live="polite">
          {isFiltering
            ? formatRecordCount(t, rows.length, users.length)
            : users.length === 1
              ? t('admin.users.totalOne')
              : t('admin.users.total', { count: users.length })}
        </span>

        {canManageUsers ? (
          <div className="admin-users__toolbar-actions">
            {onNavigateRoles ? (
              <button type="button" className="admin-users__link" onClick={onNavigateRoles}>
                <Shield size={15} aria-hidden />
                <span>{t('admin.users.managePermissions')}</span>
              </button>
            ) : null}
            {isCreating ? (
              <button
                type="button"
                className="admin-users__link"
                aria-controls={formId}
                aria-expanded
                onClick={toggleCreateForm}
              >
                <X size={15} aria-hidden />
                <span>{t('admin.users.cancel')}</span>
              </button>
            ) : (
              <Button
                ref={newButtonRef}
                type="button"
                variant="gold"
                className="btn--small admin-users__new-btn"
                aria-controls={formId}
                aria-expanded={false}
                onClick={toggleCreateForm}
              >
                <UserPlus size={15} aria-hidden />
                <span>{t('admin.users.newUser')}</span>
              </Button>
            )}
          </div>
        ) : null}
      </div>

      {canManageUsers && isCreating ? (
        <form
          ref={formRef}
          id={formId}
          className={`admin-users__form${isSecurityRole ? ' admin-users__form--security' : ''}`}
          onSubmit={handleAddUser}
        >
          <h3 className="admin-users__form-title">{t('admin.users.formTitle')}</h3>

          <div className="admin-users__form-fields">
            <Field
              label={t('admin.users.name')}
              name="name"
              value={draft.name}
              onChange={(e) => setDraft((current) => ({ ...current, name: e.target.value }))}
              placeholder={t('admin.users.namePlaceholder')}
              autoComplete="name"
            />
            <Field
              label={t('admin.users.email')}
              name="email"
              type="email"
              value={draft.email}
              onChange={(e) => setDraft((current) => ({ ...current, email: e.target.value }))}
              placeholder="nombre@pluarg.com.ar"
              autoComplete="email"
            />
            <Select
              label={t('admin.columns.role')}
              name="role"
              value={draft.role}
              onChange={(e) =>
                setDraft((current) => ({ ...current, role: e.target.value, eventId: '' }))
              }
              options={roleOptions}
            />
            {isSecurityRole ? (
              <Select
                label={t('admin.users.event')}
                name="eventId"
                value={draft.eventId}
                onChange={(e) => setDraft((current) => ({ ...current, eventId: e.target.value }))}
                options={[['', t('admin.users.eventPlaceholder')], ...eventOptions]}
              />
            ) : null}
            <div className="admin-users__form-actions">
              <Button
                type="submit"
                variant="gold"
                className="btn--small admin-users__submit"
                disabled={isSubmitting}
              >
                <UserPlus size={14} aria-hidden />
                {isSubmitting ? t('admin.users.creating') : t('admin.users.addUser')}
              </Button>
            </div>
          </div>

          {isSecurityRole ? (
            <p className="admin-users__form-hint">{t('admin.users.securityHint')}</p>
          ) : null}
        </form>
      ) : null}

      {formError ? (
        <p className="admin-users__notice admin-users__notice--error" role="alert">
          {formError}
        </p>
      ) : null}
      {deleteNotice ? (
        <p className="admin-users__notice" role="status">
          {deleteNotice}
        </p>
      ) : null}
      {tempPassword ? (
        <div className="admin-users__credential" role="status">
          <p className="admin-users__credential-title">
            {tempPassword.mode === 'security'
              ? t('admin.users.tempPasswordTitle')
              : tempPassword.mode === 'reset'
                ? t('admin.users.resetTitle')
                : t('admin.users.inviteTitle')}
          </p>
          <dl className="admin-users__credential-meta">
            <div>
              <dt>{t('admin.users.email')}</dt>
              <dd>{tempPassword.email}</dd>
            </div>
            {tempPassword.password ? (
              <div>
                <dt>{t('admin.users.tempPasswordLabel')}</dt>
                <dd>
                  <code>{tempPassword.password}</code>
                </dd>
              </div>
            ) : null}
          </dl>
          <p className="admin-users__credential-note">
            {tempPassword.mode === 'security'
              ? t('admin.users.tempPasswordWarn')
              : tempPassword.emailed
                ? t('admin.users.credentialEmailed', { email: tempPassword.email })
                : t('admin.users.credentialNotEmailed')}
          </p>
        </div>
      ) : null}

      {isGloballyEmpty ? (
        <div className="admin-users__empty">{emptyMessage}</div>
      ) : (
        <AdminDataTable
          variant="admin"
          density="compact"
          className="admin-users__table"
          columns={columns}
          rows={rows}
          emptyMessage={emptyMessage}
        />
      )}

      {pendingDeletion ? (
        <AdminDeleteConfirmDialog
          busy={updatingUserId === pendingDeletion.id}
          error={deleteError}
          onCancel={closeDeleteDialog}
          onConfirm={() => void handleDeleteUser()}
          title={t('admin.users.deleteTitle')}
          description={t('admin.users.deleteDescription', {
            name: pendingDeletion.name,
            email: pendingDeletion.email,
          })}
          warning={t('admin.users.deleteWarning')}
          cancelLabel={t('admin.users.deleteCancel')}
          confirmLabel={t('admin.users.deleteConfirm')}
          busyLabel={t('admin.users.deleting')}
        />
      ) : null}
    </section>
  )
}
