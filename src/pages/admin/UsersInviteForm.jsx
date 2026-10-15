import { useMemo } from 'react'
import { CalendarCheck, Trash2, UserPlus } from 'lucide-react'
import Button from '../../components/ui/Button.jsx'
import { Field, Select } from '../../components/ui/FormFields.jsx'
import { isEventScopedRole } from '../../lib/permissions.js'
import { summarizeRoleAccess } from '../../lib/permissionInsights.js'

// Panel de alta de una cuenta del panel. Una sola decisión pesa de verdad: el
// rol. Por eso al elegirlo se muestra al lado qué va a poder hacer esa persona
// (módulos y acciones sensibles), calculado con el mismo catálogo que usa
// "Roles y permisos". El organizador exige eventos en el mismo alta.
export default function UsersInviteForm({
  draft,
  eventOptions,
  adminEvents = [],
  fieldErrors,
  formId,
  formRef,
  isSecurityRole,
  isSubmitting,
  onDraftChange,
  onSubmit,
  permissionCatalog,
  roles,
  t,
}) {
  const hasEmail = draft.email.trim() !== ''
  const roleOptions = useMemo(() => roles.map((role) => [role.key, role.name]), [roles])
  const selectedRole = roles.find((role) => role.key === draft.role) ?? null
  const isOrganizerRole = isEventScopedRole(draft.role)
  const selectedEventIds = Array.isArray(draft.eventIds) ? draft.eventIds : []

  const scope = useMemo(() => {
    if (!selectedRole || isSecurityRole || isOrganizerRole || !permissionCatalog?.length) return null
    if (!Array.isArray(selectedRole.permissions)) return null
    return summarizeRoleAccess(permissionCatalog, selectedRole.permissions)
  }, [isOrganizerRole, isSecurityRole, permissionCatalog, selectedRole])

  function toggleEvent(eventId) {
    const next = new Set(selectedEventIds)
    if (next.has(eventId)) next.delete(eventId)
    else next.add(eventId)
    onDraftChange({ eventIds: [...next] })
  }

  return (
    <form
      ref={formRef}
      id={formId}
      className={`admin-users__form${isSecurityRole ? ' admin-users__form--security' : ''}${
        isOrganizerRole ? ' admin-users__form--organizer' : ''
      }`}
      onSubmit={onSubmit}
      noValidate
    >
      <header className="admin-users__form-head">
        <h3 className="admin-users__form-title">{t('admin.users.formTitle')}</h3>
        <p className="admin-users__form-lead">
          {isSecurityRole
            ? t('admin.users.securityHint')
            : isOrganizerRole
              ? t('admin.users.organizerHint')
              : hasEmail
                ? t('admin.users.formLead')
                : t('admin.users.formLeadOpen')}
        </p>
      </header>

      <div className="admin-users__form-body">
        <div className="admin-users__form-col">
          <Field
            label={t('admin.users.name')}
            name="name"
            value={draft.name}
            onChange={(e) => onDraftChange({ name: e.target.value })}
            placeholder={
              isSecurityRole
                ? t('admin.users.namePlaceholder')
                : t('admin.users.namePlaceholderOpen')
            }
            autoComplete="name"
            className={fieldErrors.name ? 'is-invalid' : ''}
          />
          <Field
            label={t('admin.users.email')}
            name="email"
            type="email"
            value={draft.email}
            onChange={(e) => onDraftChange({ email: e.target.value })}
            placeholder={
              isSecurityRole ? 'nombre@pluarg.com.ar' : t('admin.users.emailPlaceholderOpen')
            }
            autoComplete="email"
            className={fieldErrors.email ? 'is-invalid' : ''}
          />
        </div>

        <div className="admin-users__form-col">
          <Select
            label={t('admin.columns.role')}
            name="role"
            value={draft.role}
            onChange={(e) =>
              onDraftChange({ role: e.target.value, eventId: '', eventIds: [] })
            }
            options={roleOptions}
          />
          {isSecurityRole ? (
            <Select
              label={t('admin.users.event')}
              name="eventId"
              value={draft.eventId}
              onChange={(e) => onDraftChange({ eventId: e.target.value })}
              options={[['', t('admin.users.eventPlaceholder')], ...eventOptions]}
              className={fieldErrors.eventId ? 'is-invalid' : ''}
            />
          ) : isOrganizerRole ? (
            <section
              className={`admin-users__event-grant${fieldErrors.eventIds ? ' is-invalid' : ''}`}
              aria-labelledby="admin-users-event-grant-title"
            >
              <div className="admin-users__event-grant-head">
                <CalendarCheck size={14} aria-hidden />
                <h4 id="admin-users-event-grant-title">{t('admin.users.organizerEventsTitle')}</h4>
              </div>
              <p className="admin-users__event-grant-lead">
                {t('admin.users.organizerEventsLead')}
              </p>
              {adminEvents.length === 0 ? (
                <p className="admin-users__event-grant-empty">{t('admin.users.organizerEventsEmpty')}</p>
              ) : (
                <ul className="admin-users__event-grant-list">
                  {adminEvents.map((event) => (
                    <li key={event.id}>
                      <label className="admin-users__event-grant-item">
                        <input
                          type="checkbox"
                          checked={selectedEventIds.includes(event.id)}
                          onChange={() => toggleEvent(event.id)}
                        />
                        <span>
                          <strong>{event.title}</strong>
                          <small>{event.slug}</small>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
              <p className="admin-users__event-grant-count" role="status">
                {selectedEventIds.length === 0
                  ? t('admin.users.eventAccess.noneSelected')
                  : t('admin.users.eventAccess.selectedCount', {
                      count: selectedEventIds.length,
                    })}
              </p>
            </section>
          ) : (
            <section className="admin-users__scope" aria-live="polite">
              <p className="admin-users__scope-text">
                {selectedRole?.description || t('admin.users.scopeNoDescription')}
              </p>
              {scope ? (
                <dl className="admin-users__scope-stats">
                  <div>
                    <dt>{t('admin.users.scopeModules')}</dt>
                    <dd>
                      {scope.modules}
                      <span>/{scope.totalModules}</span>
                    </dd>
                    <span className="admin-users__meter" aria-hidden>
                      <i
                        style={{ width: `${(scope.modules / (scope.totalModules || 1)) * 100}%` }}
                      />
                    </span>
                  </div>
                  <div>
                    <dt>{t('admin.users.scopeSensitive')}</dt>
                    <dd>
                      {scope.sensitive}
                      <span>/{scope.totalSensitive}</span>
                    </dd>
                    <span className="admin-users__meter" aria-hidden>
                      <i
                        style={{
                          width: `${(scope.sensitive / (scope.totalSensitive || 1)) * 100}%`,
                        }}
                      />
                    </span>
                  </div>
                  {scope.destructive > 0 ? (
                    <p className="admin-users__scope-warn">
                      <Trash2 size={12} aria-hidden />
                      {t('admin.users.scopeDestructive')}
                    </p>
                  ) : null}
                </dl>
              ) : null}
            </section>
          )}
        </div>
      </div>

      <footer className="admin-users__form-foot">
        {!isSecurityRole ? (
          <label className="admin-users__send-email">
            <input
              type="checkbox"
              name="sendEmail"
              checked={draft.sendEmail && hasEmail}
              disabled={!hasEmail}
              onChange={(e) => onDraftChange({ sendEmail: e.target.checked })}
            />
            <span>{t('admin.users.sendEmail')}</span>
          </label>
        ) : (
          <span />
        )}
        <Button
          type="submit"
          variant="gold"
          className="btn--small admin-users__submit"
          disabled={isSubmitting}
        >
          <UserPlus size={14} aria-hidden />
          {isSubmitting
            ? t('admin.users.creating')
            : isSecurityRole || hasEmail
              ? t('admin.users.addUser')
              : t('admin.users.generateLink')}
        </Button>
      </footer>
    </form>
  )
}
