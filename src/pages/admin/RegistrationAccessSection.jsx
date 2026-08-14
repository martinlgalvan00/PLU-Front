import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { KeyRound, LockKeyhole, Power, RefreshCw, Save, ShieldCheck, XCircle } from 'lucide-react'
import { ApiError } from '../../lib/api.js'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { fetchPlatformFeatureToggles, savePlatformFeatureToggle } from '../../services/platformSettingsAdminService.js'
import '../../styles/pages/admin-registration-access.css'

const EMPTY_GATE = {
  scope: 'membership',
  eventSlug: '',
  label: '',
  code: '',
  active: true,
  startsAt: '',
  endsAt: '',
}

/**
 * Interruptores de la plataforma en tres ejes independientes. `checkout` va
 * aparte porque es el maestro: apagado, corta los otros nueve.
 *
 * `master` marca la fila destacada; `i18n` es el prefijo de las claves de
 * traducción (`...Title`, `...Lead`, `...Aria`), y `state` elige el par de
 * etiquetas de estado (singular para el maestro, plural para los conceptos).
 */
const TOGGLE_GROUPS = [
  {
    id: 'checkout',
    features: [
      { feature: 'checkout', key: 'checkoutEnabled', i18n: 'checkout', state: 'checkout', master: true },
    ],
  },
  {
    id: 'intake',
    features: [
      { feature: 'membership', key: 'membershipEnabled', i18n: 'membershipToggle' },
      { feature: 'registration', key: 'registrationEnabled', i18n: 'registrationToggle' },
      { feature: 'ticket', key: 'ticketEnabled', i18n: 'ticketToggle' },
    ],
  },
  {
    id: 'manual',
    features: [
      { feature: 'membership_manual', key: 'membershipManualEnabled', i18n: 'membershipManual' },
      { feature: 'registration_manual', key: 'registrationManualEnabled', i18n: 'registrationManual' },
      { feature: 'ticket_manual', key: 'ticketManualEnabled', i18n: 'ticketManual' },
    ],
  },
  {
    id: 'validation',
    features: [
      { feature: 'membership_validation', key: 'membershipValidationEnabled', i18n: 'membershipValidation' },
      { feature: 'registration_validation', key: 'registrationValidationEnabled', i18n: 'registrationValidation' },
      { feature: 'ticket_validation', key: 'ticketValidationEnabled', i18n: 'ticketValidation' },
    ],
  },
]

function FeatureToggleRule({ busy, canEdit, enabled, feature, loading, onToggle, t }) {
  const stateLabelFor = (value) => {
    if (feature.state === 'checkout') {
      return value
        ? t('admin.sections.accessGates.checkoutOn')
        : t('admin.sections.accessGates.checkoutOff')
    }
    return value
      ? t('admin.sections.accessGates.enabledPlural')
      : t('admin.sections.accessGates.closedPlural')
  }

  return (
    <div
      className={`admin-registration-access__rule${
        feature.master ? ' admin-registration-access__rule--master' : ''
      }`}
    >
      <div>
        <span
          className={`admin-registration-access__state admin-registration-access__state--${enabled ? 'abierta' : 'cerrada'}`}
        >
          {stateLabelFor(enabled)}
        </span>
        <h3>{t(`admin.sections.accessGates.${feature.i18n}Title`)}</h3>
        <p>{t(`admin.sections.accessGates.${feature.i18n}Lead`)}</p>
      </div>
      {canEdit ? (
        <label className="admin-registration-access__switch">
          <input
            type="checkbox"
            checked={enabled}
            disabled={loading || busy}
            onChange={(event) => onToggle(feature.feature, event.target.checked)}
            aria-label={t(`admin.sections.accessGates.${feature.i18n}Aria`)}
          />
          <span>
            <Power size={13} aria-hidden />
            {busy ? t('admin.sections.accessGates.saving') : stateLabelFor(enabled)}
          </span>
        </label>
      ) : null}
    </div>
  )
}

function toLocalDateTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function gateStateKey(gate, now = new Date()) {
  if (!gate?.active) return 'closed'
  if (gate.startsAt && new Date(gate.startsAt) > now) return 'scheduled'
  if (gate.endsAt && new Date(gate.endsAt) <= now) return 'expired'
  return 'open'
}

function mapOperationalError(error, messages) {
  if (error instanceof ApiError) {
    if (error.status === 404) return messages.routeMissing
    if (error.status === 0) return messages.apiDown
  }
  const raw = error?.message ?? ''
  if (raw === 'Ruta no encontrada') return messages.routeMissing
  return raw || messages.fallback
}

export default function RegistrationAccessSection({
  configuration = { membershipGate: null, eventGates: [] },
  adminEvents = [],
  canEdit = false,
  isLoading = false,
  error = null,
  onRefresh,
  onSave,
}) {
  const { locale, t } = useI18n()
  const [draft, setDraft] = useState(null)
  const [notice, setNotice] = useState('')
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  // Vacío = todo abierto: la fila se lee con `!== false`, así que un interruptor
  // nuevo no necesita sumarse acá para arrancar habilitado.
  const [toggles, setToggles] = useState({})
  const [togglesLoading, setTogglesLoading] = useState(true)
  const [togglesError, setTogglesError] = useState('')
  const [savingFeature, setSavingFeature] = useState(null)
  const formRef = useRef(null)
  const triggerRef = useRef(null)
  const shouldFocusEditorRef = useRef(false)
  const eventGates = configuration.eventGates ?? []
  const events = useMemo(
    () => adminEvents.filter((event) => event.slug && event.status !== 'archived'),
    [adminEvents],
  )

  const operationalMessages = useMemo(
    () => ({
      routeMissing: t('admin.sections.accessGates.routeMissing'),
      apiDown: t('admin.sections.accessGates.apiDown'),
      fallback: t('admin.sections.accessGates.togglesLoadError'),
    }),
    [t],
  )

  const loadToggles = useCallback(async () => {
    setTogglesLoading(true)
    setTogglesError('')
    try {
      setToggles(await fetchPlatformFeatureToggles())
    } catch (loadError) {
      setTogglesError(mapOperationalError(loadError, operationalMessages))
    } finally {
      setTogglesLoading(false)
    }
  }, [operationalMessages])

  useEffect(() => {
    onRefresh?.()
  }, [onRefresh])

  useEffect(() => {
    void loadToggles()
  }, [loadToggles])

  useEffect(() => {
    if (!draft || !shouldFocusEditorRef.current) return undefined
    shouldFocusEditorRef.current = false
    const form = formRef.current
    if (typeof form?.scrollIntoView === 'function') {
      form.scrollIntoView({ block: 'nearest' })
    }
    const firstField = form?.querySelector(
      'input:not([disabled]):not([type="checkbox"]), select:not([disabled]), textarea:not([disabled])',
    )
    firstField?.focus?.()
    return undefined
  }, [draft])

  async function handleToggleFeature(feature, enabled) {
    setSavingFeature(feature)
    setTogglesError('')
    try {
      setToggles(await savePlatformFeatureToggle(feature, enabled))
    } catch (toggleError) {
      setTogglesError(
        mapOperationalError(toggleError, {
          ...operationalMessages,
          fallback: t('admin.sections.accessGates.togglesSaveError'),
        }),
      )
    } finally {
      setSavingFeature(null)
    }
  }

  function openEditor(gate = null, scope = 'membership', trigger = null) {
    triggerRef.current = trigger
    shouldFocusEditorRef.current = true
    setNotice('')
    setFormError('')
    setDraft(
      gate
        ? {
            scope: gate.scope,
            eventSlug: gate.eventSlug ?? '',
            label: gate.label,
            code: '',
            active: gate.active,
            startsAt: toLocalDateTime(gate.startsAt),
            endsAt: toLocalDateTime(gate.endsAt),
          }
        : {
            ...EMPTY_GATE,
            scope,
            eventSlug: scope === 'registration' ? events[0]?.slug ?? '' : '',
          },
    )
  }

  function cancelEditor() {
    setDraft(null)
    setFormError('')
    const trigger = triggerRef.current
    triggerRef.current = null
    if (typeof trigger?.focus === 'function') {
      trigger.focus()
    }
  }

  const currentGate =
    draft?.scope === 'membership'
      ? configuration.membershipGate
      : eventGates.find((gate) => gate.eventSlug === draft?.eventSlug) ?? null

  async function submit(event) {
    event.preventDefault()
    setFormError('')
    setNotice('')
    if (!draft?.label.trim()) {
      setFormError(t('admin.sections.accessGates.labelRequired'))
      return
    }
    if (draft.scope === 'registration' && !draft.eventSlug) {
      setFormError(t('admin.sections.accessGates.eventRequired'))
      return
    }
    const trimmedCode = draft.code.trim()
    if (draft.active && !trimmedCode && !currentGate?.active) {
      setFormError(t('admin.sections.accessGates.codeRequired'))
      return
    }
    setSaving(true)
    const result = await onSave?.({
      ...draft,
      eventSlug: draft.scope === 'registration' ? draft.eventSlug.trim() : undefined,
      label: draft.label.trim(),
      code: trimmedCode || undefined,
      startsAt: draft.startsAt || undefined,
      endsAt: draft.endsAt || undefined,
    })
    setSaving(false)
    if (result?.error) {
      setFormError(
        mapOperationalError(
          { message: result.error, status: result.error === 'Ruta no encontrada' ? 404 : undefined },
          {
            ...operationalMessages,
            fallback: t('admin.sections.accessGates.saveError'),
          },
        ),
      )
      return
    }
    setDraft(null)
    triggerRef.current = null
    setNotice(t('admin.sections.accessGates.saved'))
  }

  const gatesError = error
    ? mapOperationalError(
        { message: error, status: error === 'Ruta no encontrada' ? 404 : undefined },
        {
          ...operationalMessages,
          fallback: t('admin.sections.accessGates.gatesLoadError'),
        },
      )
    : ''

  function stateLabel(key) {
    return t(`admin.sections.accessGates.state.${key}`)
  }

  function stateClass(key) {
    if (key === 'open') return 'abierta'
    if (key === 'scheduled') return 'programada'
    if (key === 'expired') return 'vencida'
    return 'cerrada'
  }

  function formatEndsAt(value) {
    if (!value) return ''
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  }

  return (
    <section className="admin-registration-access" aria-labelledby="access-gates-title">
      <header className="admin-registration-access__hero">
        <div className="admin-registration-access__hero-copy">
          <p className="admin-registration-access__eyebrow">
            <KeyRound size={14} aria-hidden />
            {t('admin.sections.accessGates.eyebrow')}
          </p>
          <h1 id="access-gates-title">{t('admin.sections.accessGates.title')}</h1>
          <p className="admin-registration-access__subtitle">{t('admin.sections.accessGates.subtitle')}</p>
        </div>
        <button
          type="button"
          className="admin-registration-access__button admin-registration-access__button--quiet"
          onClick={() => {
            onRefresh?.()
            void loadToggles()
          }}
          disabled={isLoading || togglesLoading}
        >
          <RefreshCw size={15} aria-hidden />
          {t('admin.sections.accessGates.refresh')}
        </button>
      </header>

      {gatesError ? (
        <div className="admin-registration-access__message admin-registration-access__message--error" role="alert">
          <XCircle size={15} aria-hidden />
          <span>{gatesError}</span>
          <button type="button" className="admin-registration-access__button" onClick={() => onRefresh?.()}>
            {t('admin.sections.accessGates.retry')}
          </button>
        </div>
      ) : null}
      {notice ? (
        <p className="admin-registration-access__notice" role="status">
          <ShieldCheck size={15} aria-hidden /> {notice}
        </p>
      ) : null}
      {isLoading && !configuration.membershipGate && eventGates.length === 0 ? (
        <p className="admin-registration-access__loading">{t('admin.sections.accessGates.loading')}</p>
      ) : null}

      <section className="admin-registration-access__block" aria-labelledby="access-toggles-title">
        <header className="admin-registration-access__block-head">
          <div>
            <h2 id="access-toggles-title">{t('admin.sections.accessGates.togglesTitle')}</h2>
            <p>{t('admin.sections.accessGates.togglesLead')}</p>
          </div>
        </header>

        {TOGGLE_GROUPS.map((group) => (
          <div key={group.id} className="admin-registration-access__toggle-group">
            {group.id === 'checkout' ? null : (
              <div className="admin-registration-access__toggle-group-head">
                <h3>{t(`admin.sections.accessGates.group.${group.id}Title`)}</h3>
                <p>{t(`admin.sections.accessGates.group.${group.id}Lead`)}</p>
              </div>
            )}
            {/* Todos los grupos comparten la misma caja: los diez interruptores
                hacen lo mismo, así que tienen que verse igual. Lo que cambia es
                el encabezado del eje, y el acento celeste del maestro. */}
            <div className="admin-registration-access__rules admin-registration-access__rules--primary">
              {group.features.map((feature) => (
                <FeatureToggleRule
                  key={feature.feature}
                  busy={savingFeature === feature.feature}
                  canEdit={canEdit}
                  enabled={toggles[feature.key] !== false}
                  feature={feature}
                  loading={togglesLoading}
                  onToggle={handleToggleFeature}
                  t={t}
                />
              ))}
            </div>
          </div>
        ))}

        {togglesLoading ? (
          <p className="admin-registration-access__loading">{t('admin.sections.accessGates.togglesLoading')}</p>
        ) : null}
        {togglesError ? (
          <div className="admin-registration-access__message admin-registration-access__message--error" role="alert">
            <XCircle size={15} aria-hidden />
            <span>{togglesError}</span>
            <button type="button" className="admin-registration-access__button" onClick={() => void loadToggles()}>
              {t('admin.sections.accessGates.retry')}
            </button>
          </div>
        ) : null}
      </section>

      <section className="admin-registration-access__block" aria-labelledby="access-gates-private-title">
        <header className="admin-registration-access__block-head">
          <div>
            <h2 id="access-gates-private-title">{t('admin.sections.accessGates.gatesTitle')}</h2>
            <p>{t('admin.sections.accessGates.gatesLead')}</p>
          </div>
        </header>

        <article className="admin-registration-access__rule">
          <div>
            <span
              className={`admin-registration-access__state admin-registration-access__state--${stateClass(gateStateKey(configuration.membershipGate))}`}
            >
              {stateLabel(gateStateKey(configuration.membershipGate))}
            </span>
            <h3>{t('admin.sections.accessGates.membershipGateTitle')}</h3>
            <p>
              {configuration.membershipGate
                ? t('admin.sections.accessGates.membershipGateWithLabel', {
                    label: configuration.membershipGate.label,
                  })
                : t('admin.sections.accessGates.membershipGateEmpty')}
            </p>
          </div>
          {canEdit ? (
            <button
              type="button"
              className="admin-registration-access__button"
              onClick={(event) => openEditor(configuration.membershipGate, 'membership', event.currentTarget)}
            >
              {t('admin.sections.accessGates.configure')}
            </button>
          ) : null}
        </article>

        <div className="admin-registration-access__subhead">
          <div>
            <h3 id="access-event-gates-title">{t('admin.sections.accessGates.eventGatesTitle')}</h3>
            <p>{t('admin.sections.accessGates.eventGatesLead')}</p>
          </div>
          {canEdit ? (
            <button
              type="button"
              className="admin-registration-access__button"
              onClick={(event) => openEditor(null, 'registration', event.currentTarget)}
            >
              {t('admin.sections.accessGates.newGate')}
            </button>
          ) : null}
        </div>

        <div
          className="admin-registration-access__list"
          role="list"
          aria-labelledby="access-event-gates-title"
        >
          {eventGates.length ? (
            eventGates.map((gate) => {
              const key = gateStateKey(gate)
              return (
                <article className="admin-registration-access__rule" role="listitem" key={gate.id}>
                  <div>
                    <span className={`admin-registration-access__state admin-registration-access__state--${stateClass(key)}`}>
                      {stateLabel(key)}
                    </span>
                    <h3>{gate.eventTitle ?? gate.eventSlug}</h3>
                    <p>
                      {gate.label}
                      {gate.endsAt
                        ? t('admin.sections.accessGates.until', { date: formatEndsAt(gate.endsAt) })
                        : ''}
                    </p>
                  </div>
                  {canEdit ? (
                    <button
                      type="button"
                      className="admin-registration-access__button"
                      onClick={(event) => openEditor(gate, 'registration', event.currentTarget)}
                    >
                      {t('admin.sections.accessGates.edit')}
                    </button>
                  ) : null}
                </article>
              )
            })
          ) : (
            <p className="admin-registration-access__empty">{t('admin.sections.accessGates.eventGatesEmpty')}</p>
          )}
        </div>

        {canEdit && draft ? (
          <form ref={formRef} className="admin-registration-access__form" onSubmit={submit} noValidate>
            <header>
              <LockKeyhole size={17} aria-hidden />
              <div>
                <h3>
                  {draft.scope === 'membership'
                    ? t('admin.sections.accessGates.formTitleMembership')
                    : t('admin.sections.accessGates.formTitleRegistration')}
                </h3>
                <p>{t('admin.sections.accessGates.formLead')}</p>
              </div>
            </header>

            <fieldset className="admin-registration-access__fields" disabled={saving}>
              <label htmlFor="access-gate-scope">
                <span>{t('admin.sections.accessGates.scope')}</span>
                <select
                  id="access-gate-scope"
                  value={draft.scope}
                  onChange={(event) =>
                    setDraft({
                      ...EMPTY_GATE,
                      scope: event.target.value,
                      eventSlug: event.target.value === 'registration' ? events[0]?.slug ?? '' : '',
                    })
                  }
                >
                  <option value="membership">{t('admin.sections.accessGates.scopeMembership')}</option>
                  <option value="registration">{t('admin.sections.accessGates.scopeRegistration')}</option>
                </select>
              </label>

              {draft.scope === 'registration' ? (
                <label htmlFor="access-gate-event">
                  <span>{t('admin.sections.accessGates.event')}</span>
                  <select
                    id="access-gate-event"
                    value={draft.eventSlug}
                    onChange={(event) => setDraft({ ...draft, eventSlug: event.target.value })}
                  >
                    {events.map((item) => (
                      <option key={item.slug} value={item.slug}>
                        {item.title}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              <label htmlFor="access-gate-label">
                <span>{t('admin.sections.accessGates.label')}</span>
                <input
                  id="access-gate-label"
                  value={draft.label}
                  onChange={(event) => setDraft({ ...draft, label: event.target.value })}
                  placeholder={t('admin.sections.accessGates.labelPlaceholder')}
                  maxLength={80}
                />
              </label>

              <label htmlFor="access-gate-code">
                <span>
                  {t('admin.sections.accessGates.code')}
                  {currentGate?.active ? (
                    <small> {t('admin.sections.accessGates.codeKeepHint')}</small>
                  ) : null}
                </span>
                <input
                  id="access-gate-code"
                  type="password"
                  autoComplete="new-password"
                  value={draft.code}
                  onChange={(event) => setDraft({ ...draft, code: event.target.value })}
                  placeholder={t('admin.sections.accessGates.codePlaceholder')}
                  minLength={10}
                  maxLength={72}
                />
              </label>

              <label htmlFor="access-gate-starts">
                <span>{t('admin.sections.accessGates.startsAt')}</span>
                <input
                  id="access-gate-starts"
                  type="datetime-local"
                  value={draft.startsAt}
                  onChange={(event) => setDraft({ ...draft, startsAt: event.target.value })}
                />
              </label>

              <label htmlFor="access-gate-ends">
                <span>{t('admin.sections.accessGates.endsAt')}</span>
                <input
                  id="access-gate-ends"
                  type="datetime-local"
                  value={draft.endsAt}
                  onChange={(event) => setDraft({ ...draft, endsAt: event.target.value })}
                />
              </label>

              <label className="admin-registration-access__switch" htmlFor="access-gate-active">
                <input
                  id="access-gate-active"
                  type="checkbox"
                  checked={draft.active}
                  onChange={(event) => setDraft({ ...draft, active: event.target.checked })}
                  aria-label={t('admin.sections.accessGates.activeAria')}
                />
                <span>
                  {draft.active
                    ? t('admin.sections.accessGates.enabledSingular')
                    : t('admin.sections.accessGates.closedSingular')}
                </span>
              </label>
            </fieldset>

            {formError ? (
              <p className="admin-registration-access__error" role="alert">
                <XCircle size={15} aria-hidden /> {formError}
              </p>
            ) : null}

            <footer className="admin-registration-access__form-actions">
              <button type="button" className="admin-registration-access__button" onClick={cancelEditor}>
                {t('admin.sections.accessGates.cancel')}
              </button>
              <button
                type="submit"
                className="admin-registration-access__button admin-registration-access__button--primary"
                disabled={saving}
              >
                {saving ? (
                  t('admin.sections.accessGates.saving')
                ) : (
                  <>
                    <Save size={15} aria-hidden /> {t('admin.sections.accessGates.save')}
                  </>
                )}
              </button>
            </footer>
          </form>
        ) : null}
      </section>
    </section>
  )
}
