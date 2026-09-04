import { BadgeCheck, Plus, Trash2, Wand2 } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import {
  CREDENTIALS_PER_TYPE_MAX,
  coachTicketCredentials,
  defaultTicketCredential,
  validateTicketCredentials,
} from '../../lib/ticketCredentials.js'
import { ZONE_SCOPES } from '../../services/securityZoneService.js'

/**
 * Subcategorías de un tipo de entrada.
 *
 * Una entrada es lo que se compra; las credenciales son lo que esa compra
 * emite. Casi siempre es una sola, pero el entrenador paga una vez y recibe
 * dos: la de espectador para la tribuna y la de ENTRENADOR que le abre la
 * entrada en calor. Cada credencial sale con su propio QR y seguridad la canjea
 * una vez en el puesto que le corresponde.
 *
 * El cupo se descuenta por COMPRA, no por credencial. Se dice explícito abajo
 * de la lista porque "cupo 20" con dos credenciales son 20 lugares y 40 QR, y
 * esa diferencia se presta a confusión.
 */
export default function AdminTicketCredentialsEditor({
  canEdit,
  credentials = [],
  fieldPrefix,
  onChange,
  quota = null,
}) {
  const { t } = useI18n()
  const issues = validateTicketCredentials(credentials)
  const issueAt = (index, field) =>
    issues.find((issue) => issue.index === index && issue.field === field)?.code ?? null
  const listIssue = issues.find((issue) => issue.index === -1)?.code ?? null

  function patch(index, next) {
    onChange(credentials.map((credential, i) => (i === index ? { ...credential, ...next } : credential)))
  }

  function toggleScope(index, scope) {
    const current = credentials[index]?.zoneScopes ?? []
    patch(index, {
      zoneScopes: current.includes(scope)
        ? current.filter((value) => value !== scope)
        : [...current, scope],
    })
  }

  const atMax = credentials.length >= CREDENTIALS_PER_TYPE_MAX
  // El atajo sólo aparece cuando todavía no se armó nada: una vez que el admin
  // editó las credenciales, sobreescribirlas con un preset sería destructivo.
  const showCoachPreset =
    canEdit &&
    credentials.length === 1 &&
    credentials[0]?.label === defaultTicketCredential().label

  return (
    <div
      className="admin-ticket-credentials"
      data-field={`${fieldPrefix}.credentials`}
      tabIndex={listIssue ? -1 : undefined}
    >
      <div className="admin-ticket-credentials__head">
        <span className="admin-ticket-types__days-label">
          <BadgeCheck size={13} aria-hidden />
          {t('admin.eventEditor.supabase.credentialsLabel')}
        </span>
        {showCoachPreset ? (
          <button
            type="button"
            className="admin-ticket-credentials__preset"
            onClick={() => onChange(coachTicketCredentials())}
          >
            <Wand2 size={13} aria-hidden />
            {t('admin.eventEditor.supabase.credentialCoachPreset')}
          </button>
        ) : null}
      </div>

      <ul className="admin-ticket-credentials__list">
        {credentials.map((credential, index) => (
          <li key={index} className="admin-ticket-credentials__item">
            <div className="admin-ticket-credentials__row">
              <label className="admin-event-form__field admin-ticket-credentials__name">
                <span>
                  {index === 0
                    ? t('admin.eventEditor.supabase.credentialNamePrimary')
                    : t('admin.eventEditor.supabase.credentialName')}
                </span>
                <input
                  disabled={!canEdit}
                  type="text"
                  maxLength={40}
                  value={credential.label ?? ''}
                  data-field={`${fieldPrefix}.credentials.${index}.label`}
                  aria-invalid={Boolean(issueAt(index, 'label'))}
                  placeholder={t('admin.eventEditor.supabase.credentialNamePlaceholder')}
                  onChange={(event) => patch(index, { label: event.target.value })}
                />
                {issueAt(index, 'label') ? (
                  <small className="admin-event-form__error" role="alert">
                    {t(`admin.eventEditor.supabase.credentialError.${issueAt(index, 'label')}`)}
                  </small>
                ) : null}
              </label>

              {canEdit && credentials.length > 1 ? (
                <button
                  type="button"
                  className="admin-ticket-types__remove"
                  onClick={() => onChange(credentials.filter((_, i) => i !== index))}
                  aria-label={t('admin.eventEditor.supabase.credentialRemove')}
                >
                  <Trash2 size={14} aria-hidden />
                </button>
              ) : null}
            </div>

            <div className="admin-ticket-credentials__zones">
              <span className="admin-ticket-types__days-label">
                {t('admin.eventEditor.supabase.credentialZones')}
              </span>
              <div className="admin-ticket-types__days-list">
                {ZONE_SCOPES.map((scope) => (
                  <label key={scope} className="admin-ticket-types__day-chip">
                    <input
                      checked={(credential.zoneScopes ?? []).includes(scope)}
                      disabled={!canEdit}
                      type="checkbox"
                      onChange={() => toggleScope(index, scope)}
                    />
                    <span>{t(`admin.eventZones.scope.${scope}`)}</span>
                  </label>
                ))}
              </div>
              {issueAt(index, 'zoneScopes') ? (
                <small className="admin-event-form__error" role="alert">
                  {t(`admin.eventEditor.supabase.credentialError.${issueAt(index, 'zoneScopes')}`)}
                </small>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      {listIssue ? (
        <small className="admin-event-form__error" role="alert">
          {t(`admin.eventEditor.supabase.credentialError.${listIssue}`)}
        </small>
      ) : null}

      {canEdit && !atMax ? (
        <button
          type="button"
          className="admin-ticket-credentials__add"
          onClick={() => onChange([...credentials, { label: '', zoneScopes: [] }])}
        >
          <Plus size={13} aria-hidden />
          {t('admin.eventEditor.supabase.credentialAdd')}
        </button>
      ) : null}

      {/* Lo que más se malinterpreta: el cupo son lugares, no credenciales. */}
      {credentials.length > 1 ? (
        <small className="admin-ticket-credentials__note">
          {quota === null || quota === undefined || quota === ''
            ? t('admin.eventEditor.supabase.credentialsPerPurchase', {
                count: credentials.length,
              })
            : t('admin.eventEditor.supabase.credentialsPerPurchaseQuota', {
                count: credentials.length,
                quota,
                total: credentials.length * Number(quota),
              })}
        </small>
      ) : null}
    </div>
  )
}
