import { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  Ban,
  CheckCircle2,
  PauseCircle,
  Shield,
  UserPlus,
  X,
} from 'lucide-react'
import AdminListSection from '../../components/admin/AdminListSection.jsx'
import { AdminIdentityCell } from '../../components/admin/AdminTableCells.jsx'
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

export default function UsersSection({
  accessRoles,
  adminEvents,
  canManageUsers,
  onCreateSecurityUser,
  onCreateUser,
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

  function canMutateUser(row) {
    return canManageUsers && row.role !== 'admin_maximal' && Boolean(onUpdateStatus)
  }

  const filterActions = canManageUsers ? (
    <div className="admin-users__toolbar-actions">
      {onNavigateRoles ? (
        <Button
          type="button"
          variant="secondary"
          className="btn--small"
          onClick={onNavigateRoles}
        >
          <Shield size={14} aria-hidden />
          <span>{t('admin.users.managePermissions')}</span>
        </Button>
      ) : null}
      <Button
        type="button"
        variant={isCreating ? 'secondary' : 'gold'}
        className="btn--small"
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
        {isCreating ? <X size={14} aria-hidden /> : <UserPlus size={14} aria-hidden />}
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
      showHeader
      showStats={false}
      eyebrow={t('admin.sections.users.eyebrow')}
      title={t('admin.sections.users.title')}
      subtitle={t('admin.sections.users.subtitle')}
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
            render: (row) =>
              canManageUsers &&
              row.role !== 'admin_maximal' &&
              roleOptions.some(([roleKey]) => roleKey === (row.roleKey ?? row.role)) ? (
                <label className="admin-users__role-select">
                  <span className="admin-users__role-select-label">{t('admin.columns.role')}</span>
                  <select
                    name={`role-${row.id}`}
                    value={row.roleKey ?? row.role}
                    disabled={updatingUserId === row.id}
                    aria-label={`${t('admin.columns.role')}: ${row.name}`}
                    onChange={(e) => handleRoleChange(row.id, e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {roleOptions.map(([optionValue, optionLabel]) => (
                      <option key={optionValue} value={optionValue}>
                        {optionLabel}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <span className="status-pill status-pill--neutral">{getRoleLabel(row)}</span>
              ),
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
            mobile: 'actions',
            sortable: false,
            render: (row) => {
              if (!canMutateUser(row)) {
                return <span className="admin-users__actions-empty">—</span>
              }

              const status = row.status ?? 'active'
              const busy = updatingUserId === row.id

              return (
                <div className="admin-users__row-actions" role="group" aria-label={t('admin.users.actionsAria', { name: row.name })}>
                  {status !== 'active' ? (
                    <button
                      type="button"
                      className="admin-users__action-btn admin-users__action-btn--activate"
                      disabled={busy}
                      onClick={(e) => {
                        e.stopPropagation()
                        void handleStatusChange(row.id, 'active')
                      }}
                    >
                      <CheckCircle2 size={14} aria-hidden />
                      <span>{t('admin.users.actionActivate')}</span>
                    </button>
                  ) : null}
                  {status === 'active' ? (
                    <button
                      type="button"
                      className="admin-users__action-btn"
                      disabled={busy}
                      onClick={(e) => {
                        e.stopPropagation()
                        void handleStatusChange(row.id, 'suspended')
                      }}
                    >
                      <PauseCircle size={14} aria-hidden />
                      <span>{t('admin.users.actionSuspend')}</span>
                    </button>
                  ) : null}
                  {status !== 'disabled' ? (
                    <button
                      type="button"
                      className="admin-users__action-btn admin-users__action-btn--danger"
                      disabled={busy}
                      onClick={(e) => {
                        e.stopPropagation()
                        void handleStatusChange(row.id, 'disabled')
                      }}
                    >
                      <Ban size={14} aria-hidden />
                      <span>{t('admin.users.actionDisable')}</span>
                    </button>
                  ) : null}
                </div>
              )
            },
          },
        ]}
        rows={rows}
        emptyMessage={t('admin.sections.users.empty')}
      />
    </AdminListSection>
  )
}
