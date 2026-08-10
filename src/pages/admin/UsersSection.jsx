import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Ban,
  CheckCircle2,
  LoaderCircle,
  PauseCircle,
  Shield,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react'
import AdminListSection from '../../components/admin/AdminListSection.jsx'
import AdminIconButton from '../../components/admin/AdminIconButton.jsx'
import { AdminIdentityCell, AdminTableActions, AdminTableActionsEmpty } from '../../components/admin/AdminTableCells.jsx'
import AdminDataTable from '../../components/admin/AdminDataTable.jsx'
import { Field, Select } from '../../components/ui/FormFields.jsx'
import Pill from '../../components/ui/Pill.jsx'
import Button from '../../components/ui/Button.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { getRoleLabel } from '../../lib/roles.js'

const EMPTY_DRAFT = { name: '', email: '', role: 'plu_arg', eventId: '' }

const STATUS_FILTERS = [
  ['all', 'admin.users.filterAll'],
  ['active', 'admin.users.statusActive'],
  ['invited', 'admin.users.statusInvited'],
  ['suspended', 'admin.users.statusSuspended'],
  ['disabled', 'admin.users.statusDisabled'],
]

function statusTone(status) {
  switch (status) {
    case 'active':
      return 'success'
    case 'invited':
      return 'info'
    case 'suspended':
      return 'warning'
    case 'disabled':
      return 'danger'
    default:
      return 'neutral'
  }
}

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

function UserDeletionDialog({ busy, error, onCancel, onConfirm, t, user }) {
  const titleId = useId()
  const descriptionId = useId()
  const panelRef = useRef(null)
  const dialogStateRef = useRef({ busy, onCancel })
  dialogStateRef.current = { busy, onCancel }

  useEffect(() => {
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panelRef.current?.querySelector('button')?.focus()

    function handleKeyDown(event) {
      if (event.key === 'Escape' && !dialogStateRef.current.busy) {
        event.preventDefault()
        dialogStateRef.current.onCancel()
        return
      }

      if (event.key !== 'Tab') return
      const focusable = panelRef.current?.querySelectorAll('button:not(:disabled)') ?? []
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
      previousFocus?.focus?.()
    }
  }, [])

  return createPortal(
    <div className="admin-user-delete-dialog">
      <button
        type="button"
        className="admin-user-delete-dialog__backdrop"
        aria-label={t('admin.users.deleteCancel')}
        disabled={busy}
        onClick={onCancel}
      />
      <section
        ref={panelRef}
        className="admin-user-delete-dialog__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <span className="admin-user-delete-dialog__icon" aria-hidden>
          <Trash2 size={19} />
        </span>
        <div className="admin-user-delete-dialog__copy">
          <h2 id={titleId}>{t('admin.users.deleteTitle')}</h2>
          <p id={descriptionId}>
            {t('admin.users.deleteDescription', { name: user.name, email: user.email })}
          </p>
          <p className="admin-user-delete-dialog__warning">{t('admin.users.deleteWarning')}</p>
          {error ? (
            <p className="admin-user-delete-dialog__error" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <div className="admin-user-delete-dialog__actions">
          <Button type="button" variant="secondary" disabled={busy} onClick={onCancel}>
            {t('admin.users.deleteCancel')}
          </Button>
          <Button
            type="button"
            className="admin-user-delete-dialog__confirm"
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? <LoaderCircle size={15} aria-hidden /> : <Trash2 size={15} aria-hidden />}
            {busy ? t('admin.users.deleting') : t('admin.users.deleteConfirm')}
          </Button>
        </div>
      </section>
    </div>,
    document.body,
  )
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
  onUpdateRole,
  onUpdateStatus,
  users,
}) {
  const { t } = useI18n()
  const formId = useId()
  const formRef = useRef(null)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [isCreating, setIsCreating] = useState(false)
  const [draft, setDraft] = useState(EMPTY_DRAFT)
  const [formError, setFormError] = useState('')
  const [tempPassword, setTempPassword] = useState(null)
  const [inviteNotice, setInviteNotice] = useState(null)
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

  const statusOptions = useMemo(
    () =>
      STATUS_FILTERS.map(([value, key]) => [
        value,
        t(key),
        value === 'all' ? users.length : (statusCounts[value] ?? 0),
      ]),
    [statusCounts, t, users.length],
  )

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
  }

  function openCreateForm() {
    setFormError('')
    setTempPassword(null)
    setInviteNotice(null)
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
    setInviteNotice(null)

    setIsSubmitting(true)
    try {
      if (!isSecurityRole) {
        const user = await onCreateUser(draft)
        setInviteNotice({ email: user?.email ?? draft.email.trim().toLowerCase() })
        setDraft(EMPTY_DRAFT)
        setIsCreating(false)
        return
      }

      const { user, tempPassword: password } = await onCreateSecurityUser(draft)
      setTempPassword({ email: user.email, password })
      setDraft(EMPTY_DRAFT)
      setIsCreating(false)
    } catch (error) {
      setFormError(error?.status === 409 ? t('admin.users.errorEmailTaken') : t('admin.users.errorCreate'))
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
      ((canManageUsers && Boolean(onUpdateStatus)) || (canDeleteUsers && Boolean(onDeleteUser)))
    )
  }

  const filterActions = canManageUsers ? (
    <div className="admin-users__toolbar-actions">
      {onNavigateRoles ? (
        <Button
          type="button"
          variant="secondary"
          className="btn--small admin-users__toolbar-btn admin-users__toolbar-btn--roles"
          aria-label={t('admin.users.managePermissions')}
          title={t('admin.users.managePermissions')}
          onClick={onNavigateRoles}
        >
          <Shield size={15} aria-hidden />
          <span>{t('admin.users.managePermissions')}</span>
        </Button>
      ) : null}
      <Button
        type="button"
        variant={isCreating ? 'secondary' : 'gold'}
        className="btn--small admin-users__toolbar-btn admin-users__toolbar-btn--primary"
        aria-controls={formId}
        aria-expanded={isCreating}
        onClick={() => {
          if (isCreating) {
            if (!isSubmitting) closeCreateForm()
            return
          }
          openCreateForm()
        }}
      >
        {isCreating ? <X size={15} aria-hidden /> : <UserPlus size={15} aria-hidden />}
        <span>{isCreating ? t('admin.users.cancel') : t('admin.users.newUser')}</span>
      </Button>
    </div>
  ) : null

  return (
    <AdminListSection
      variant="users"
      filteredCount={rows.length}
      filterActions={filterActions}
      filters={[
        {
          id: 'status',
          label: t('admin.filters.status'),
          value: statusFilter,
          onChange: setStatusFilter,
          options: statusOptions,
        },
      ]}
      placeholder={t('admin.search.users')}
      query={query}
      showHeader={false}
      showStats={false}
      totalCount={users.length}
      onQueryChange={setQuery}
    >
      {canManageUsers && isCreating ? (
        <form
          ref={formRef}
          id={formId}
          className={`admin-users__add-form admin-users__add-form--compact${isSecurityRole ? ' admin-users__add-form--security' : ''}`}
          onSubmit={handleAddUser}
        >
          <header className="admin-users__add-form-head">
            <h3 className="admin-users__add-form-title">{t('admin.users.formTitle')}</h3>
            <p className="admin-users__add-form-lead">{t('admin.users.formLead')}</p>
          </header>

          <div className="admin-users__add-form-fields">
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
              onChange={(e) => setDraft((current) => ({ ...current, role: e.target.value, eventId: '' }))}
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
            <div className="admin-users__add-form-actions">
              <Button type="submit" className="btn--small admin-users__add-btn" disabled={isSubmitting}>
                <UserPlus size={14} aria-hidden />
                {isSubmitting ? t('admin.users.creating') : t('admin.users.addUser')}
              </Button>
            </div>
          </div>

          {isSecurityRole ? <p className="admin-users__add-form-hint">{t('admin.users.securityHint')}</p> : null}
        </form>
      ) : null}

      {formError && (
        <p className="admin-users__form-error" role="alert">
          {formError}
        </p>
      )}
      {deleteNotice ? (
        <p className="admin-users__delete-notice" role="status">
          {deleteNotice}
        </p>
      ) : null}
      {tempPassword && (
        <div className="admin-users__temp-password" role="status">
          <p className="admin-users__temp-password-title">{t('admin.users.tempPasswordTitle')}</p>
          <dl className="admin-users__temp-password-meta">
            <div>
              <dt>{t('admin.users.email')}</dt>
              <dd>{tempPassword.email}</dd>
            </div>
            <div>
              <dt>{t('admin.users.tempPasswordLabel')}</dt>
              <dd>
                <code>{tempPassword.password}</code>
              </dd>
            </div>
          </dl>
          <p className="admin-users__temp-password-note">{t('admin.users.tempPasswordWarn')}</p>
        </div>
      )}
      {inviteNotice && (
        <div className="admin-users__temp-password" role="status">
          <p className="admin-users__temp-password-title">{t('admin.users.inviteTitle')}</p>
          <p className="admin-users__temp-password-note">
            {t('admin.users.inviteNote', { email: inviteNotice.email })}
          </p>
        </div>
      )}

      <AdminDataTable
        variant="admin"
        columns={[
          {
            key: 'name',
            label: t('admin.columns.user'),
            mobile: 'primary',
            sortable: true,
            render: (row) => <AdminIdentityCell name={row.name} sub={row.email} />,
          },
          {
            key: 'role',
            label: t('admin.columns.role'),
            mobile: 'badge',
            sortable: true,
            className: 'data-table__column--role',
            render: (row) => {
              const roleKey = row.roleKey ?? row.role
              const canEditRole =
                canManageUsers &&
                row.role !== 'admin_maximal' &&
                roleOptions.some(([optionKey]) => optionKey === roleKey)

              if (!canEditRole) {
                return <span className="admin-users__role-pill">{getRoleLabel(row)}</span>
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
                </label>
              )
            },
          },
          {
            key: 'status',
            label: t('admin.columns.status'),
            mobile: 'badge',
            sortable: true,
            sortAccessor: (row) => row.status ?? 'active',
            render: (row) => (
              <Pill tone={statusTone(row.status ?? 'active')}>
                {statusLabel(t, row.status ?? 'active')}
              </Pill>
            ),
          },
          {
            key: 'actions',
            label: t('admin.columns.action'),
            mobile: 'action',
            sortable: false,
            mobileSortable: false,
            className: 'data-table__column--actions',
            render: (row) => {
              if (!canMutateUser(row)) {
                return <AdminTableActionsEmpty />
              }

              const status = row.status ?? 'active'
              const busy = updatingUserId === row.id
              const canUpdateStatus = canManageUsers && Boolean(onUpdateStatus)
              const canDelete = canDeleteUsers && Boolean(onDeleteUser)

              return (
                <AdminTableActions
                  aria-label={t('admin.users.actionsAria', { name: row.name })}
                  onClick={(event) => event.stopPropagation()}
                >
                  {canUpdateStatus && status !== 'active' ? (
                    <AdminIconButton
                      disabled={busy}
                      icon={busy ? LoaderCircle : CheckCircle2}
                      label={t('admin.users.actionActivate')}
                      onClick={() => void handleStatusChange(row.id, 'active')}
                      variant="celeste"
                    />
                  ) : null}
                  {canUpdateStatus && status === 'active' ? (
                    <AdminIconButton
                      disabled={busy}
                      icon={busy ? LoaderCircle : PauseCircle}
                      label={t('admin.users.actionSuspend')}
                      onClick={() => void handleStatusChange(row.id, 'suspended')}
                      variant="ghost"
                    />
                  ) : null}
                  {canUpdateStatus && status !== 'disabled' ? (
                    <AdminIconButton
                      disabled={busy}
                      icon={Ban}
                      label={t('admin.users.actionDisable')}
                      onClick={() => void handleStatusChange(row.id, 'disabled')}
                      variant="danger"
                    />
                  ) : null}
                  {canDelete ? (
                    <AdminIconButton
                      disabled={busy}
                      icon={Trash2}
                      label={t('admin.users.actionDelete')}
                      onClick={() => openDeleteDialog(row)}
                      variant="danger"
                    />
                  ) : null}
                </AdminTableActions>
              )
            },
          },
        ]}
        rows={rows}
        emptyMessage={t('admin.sections.users.empty')}
      />
      {pendingDeletion ? (
        <UserDeletionDialog
          busy={updatingUserId === pendingDeletion.id}
          error={deleteError}
          onCancel={closeDeleteDialog}
          onConfirm={() => void handleDeleteUser()}
          t={t}
          user={pendingDeletion}
        />
      ) : null}
    </AdminListSection>
  )
}
