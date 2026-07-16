import { useMemo, useState } from 'react'
import { UserPlus } from 'lucide-react'
import AdminListSection from '../../components/admin/AdminListSection.jsx'
import { AdminIdentityCell } from '../../components/admin/AdminTableCells.jsx'
import DataTable from '../../components/ui/DataTable.jsx'
import { Field, Select } from '../../components/ui/FormFields.jsx'
import Button from '../../components/ui/Button.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { ROLE_OPTIONS } from '../../lib/constants.js'
import { getRoleLabel } from '../../lib/roles.js'

const EMPTY_DRAFT = { name: '', email: '', role: 'seguridad_plu_arg', eventId: '' }

export default function UsersSection({ adminEvents, canManageUsers, onCreateSecurityUser, onCreateUser, onUpdateRole, users }) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState(EMPTY_DRAFT)
  const [formError, setFormError] = useState('')
  const [tempPassword, setTempPassword] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const eventOptions = useMemo(
    () => (adminEvents ?? []).map((event) => [event.id, event.title]),
    [adminEvents],
  )

  const rows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return users.filter((user) => {
      if (!normalizedQuery) return true
      return (
        user.name.toLowerCase().includes(normalizedQuery) ||
        user.email.toLowerCase().includes(normalizedQuery)
      )
    })
  }, [users, query])

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
    if (draft.role === 'seguridad_plu_arg' && !draft.eventId) {
      setFormError(t('admin.users.errorEvent'))
      return
    }

    setFormError('')
    setTempPassword(null)

    if (draft.role !== 'seguridad_plu_arg') {
      onCreateUser(draft)
      setDraft(EMPTY_DRAFT)
      return
    }

    setIsSubmitting(true)
    try {
      const { user, tempPassword: password } = await onCreateSecurityUser(draft)
      setTempPassword({ email: user.email, password })
      setDraft(EMPTY_DRAFT)
    } catch (error) {
      setFormError(error?.status === 409 ? t('admin.users.errorEmailTaken') : t('admin.users.errorCreate'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AdminListSection
      variant="users"
      filteredCount={rows.length}
      placeholder={t('admin.search.users')}
      query={query}
      showHeader={false}
      showStats={false}
      totalCount={users.length}
      onQueryChange={setQuery}
    >
      {canManageUsers && (
        <form className="admin-users__add-form" onSubmit={handleAddUser}>
          <Field
            label={t('admin.users.name')}
            name="name"
            value={draft.name}
            onChange={(e) => setDraft((current) => ({ ...current, name: e.target.value }))}
            placeholder={t('admin.users.namePlaceholder')}
          />
          <Field
            label={t('admin.users.email')}
            name="email"
            type="email"
            value={draft.email}
            onChange={(e) => setDraft((current) => ({ ...current, email: e.target.value }))}
            placeholder="nombre@pluarg.com.ar"
          />
          <Select
            label={t('admin.columns.role')}
            name="role"
            value={draft.role}
            onChange={(e) => setDraft((current) => ({ ...current, role: e.target.value, eventId: '' }))}
            options={ROLE_OPTIONS}
          />
          {draft.role === 'seguridad_plu_arg' && (
            <Select
              label={t('admin.users.event')}
              name="eventId"
              value={draft.eventId}
              onChange={(e) => setDraft((current) => ({ ...current, eventId: e.target.value }))}
              options={[['', t('admin.users.eventPlaceholder')], ...eventOptions]}
            />
          )}
          <Button type="submit" className="btn--small admin-users__add-btn" disabled={isSubmitting}>
            <UserPlus size={14} aria-hidden />
            {isSubmitting ? t('admin.users.creating') : t('admin.users.addUser')}
          </Button>
        </form>
      )}

      {formError && <p className="admin-users__form-error">{formError}</p>}
      {tempPassword && (
        <p className="admin-users__temp-password" role="status">
          {t('admin.users.tempPasswordNote', { email: tempPassword.email, password: tempPassword.password })}
        </p>
      )}

      <DataTable
        variant="admin"
        columns={[
          {
            key: 'name',
            label: t('admin.columns.user'),
            mobile: 'primary',
            render: (row) => <AdminIdentityCell name={row.name} sub={row.email} />,
          },
          {
            key: 'role',
            label: t('admin.columns.role'),
            mobile: 'badge',
            render: (row) =>
              canManageUsers ? (
                <label className="admin-users__role-select">
                  <span className="admin-users__role-select-label">{t('admin.columns.role')}</span>
                  <select
                    name={`role-${row.id}`}
                    value={row.role}
                    aria-label={`${t('admin.columns.role')}: ${row.name}`}
                    onChange={(e) => onUpdateRole(row.id, e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {ROLE_OPTIONS.map(([optionValue, optionLabel]) => (
                      <option key={optionValue} value={optionValue}>
                        {optionLabel}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <span className="status-pill status-pill--neutral">{getRoleLabel(row.role)}</span>
              ),
          },
        ]}
        rows={rows}
        emptyMessage={t('admin.sections.users.empty')}
      />
    </AdminListSection>
  )
}
