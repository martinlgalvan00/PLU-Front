import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LockKeyhole, RefreshCw, Save, ShieldCheck, Trash2, XCircle } from 'lucide-react'
import AdminDataTable from '../../components/admin/AdminDataTable.jsx'
import AdminDeleteConfirmDialog from '../../components/admin/AdminDeleteConfirmDialog.jsx'
import AdminIconButton from '../../components/admin/AdminIconButton.jsx'
import PaymentAccountsPanel from '../../components/admin/payment-accounts/PaymentAccountsPanel.jsx'
import { AdminTableActions } from '../../components/admin/AdminTableCells.jsx'
import { ApiError } from '../../lib/api.js'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { useAdminTour } from '../../providers/AdminTourProvider.jsx'
import { getAccessGatesTourSteps } from '../../lib/adminTourSteps.js'
import {
  fetchPlatformFeatureToggles,
  savePaymentChannel,
  savePlatformFeatureToggle,
} from '../../services/platformSettingsAdminService.js'
import '../../styles/pages/admin-access.css'

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
 * El maestro va aparte: apagado, corta todo lo demás.
 */
const CHECKOUT_FEATURE = {
  feature: 'checkout',
  key: 'checkoutEnabled',
}

/**
 * Orden fijo de las columnas de medios: la matriz se lee de arriba abajo por
 * concepto y de izquierda a derecha por medio, así que un medio ocupa siempre
 * la misma columna aunque el concepto no lo ofrezca.
 */
const CHANNEL_COLUMNS = ['mercado_pago', 'bank_transfer', 'cash_pitbull', 'wise_transfer']

/**
 * Un bloque por concepto, que es la pregunta que se hace quien opera: "¿qué le
 * pasa a Afiliaciones?". Cada fila de la matriz junta tres ejes independientes:
 * el alta manda, los canales son los medios con los que se cobra ese concepto, y
 * la validación decide si Finanzas acredita.
 *
 * `channels` no incluye `cash_pitbull` para entradas: el checkout de entradas no
 * ofrece efectivo, y un interruptor sin efecto es justamente lo que esta
 * pantalla dejó de tener. La celda queda vacía en la matriz hasta que ese medio
 * exista en la compra.
 */
const CONCEPT_BLOCKS = [
  {
    concept: 'membership',
    i18n: 'membershipToggle',
    intake: { feature: 'membership', key: 'membershipEnabled' },
    validation: {
      feature: 'membership_validation',
      key: 'membershipValidationEnabled',
      i18n: 'membershipValidation',
    },
    channels: ['mercado_pago', 'bank_transfer', 'cash_pitbull', 'wise_transfer'],
  },
  {
    concept: 'registration',
    i18n: 'registrationToggle',
    intake: { feature: 'registration', key: 'registrationEnabled' },
    validation: {
      feature: 'registration_validation',
      key: 'registrationValidationEnabled',
      i18n: 'registrationValidation',
    },
    channels: ['mercado_pago', 'bank_transfer', 'cash_pitbull', 'wise_transfer'],
  },
  {
    concept: 'ticket',
    i18n: 'ticketToggle',
    intake: { feature: 'ticket', key: 'ticketEnabled' },
    validation: {
      feature: 'ticket_validation',
      key: 'ticketValidationEnabled',
      i18n: 'ticketValidation',
    },
    channels: ['mercado_pago', 'bank_transfer', 'wise_transfer'],
  },
]

const TOGGLE_FEATURES = [
  CHECKOUT_FEATURE,
  ...CONCEPT_BLOCKS.flatMap((block) => [block.intake, block.validation]),
]

const CHANNEL_CELLS = CONCEPT_BLOCKS.flatMap((block) =>
  block.channels.map((channel) => ({ concept: block.concept, channel })),
)

/**
 * Interruptor con nombre accesible. Con permiso de edición es un checkbox
 * nativo estilado como switch (la posición del pulgar y el relleno dicen el
 * estado, no el color); sin permiso queda una marca de solo lectura con el mismo
 * texto de estado. El texto va siempre en el DOM: `quiet` solo lo oculta a la
 * vista en la matriz de escritorio, donde la columna ya nombra la celda.
 */
function SwitchControl({
  ariaLabel,
  busy,
  canEdit,
  enabled,
  loading,
  onToggle,
  quiet = false,
  stateLabel,
  t,
}) {
  const tone = enabled ? 'on' : 'off'
  const text = (
    <span
      className={`admin-access__switch-state${quiet ? ' admin-access__switch-state--quiet' : ''}`}
    >
      {busy ? t('admin.sections.accessGates.saving') : stateLabel}
    </span>
  )

  if (!canEdit) {
    return (
      <span className={`admin-access__mark admin-access__mark--${tone}`}>
        <span className="admin-access__mark-dot" aria-hidden />
        {text}
      </span>
    )
  }

  return (
    <label className="admin-access__switch">
      <input
        type="checkbox"
        checked={enabled}
        disabled={loading || busy}
        onChange={(event) => onToggle(event.target.checked)}
        aria-label={ariaLabel}
      />
      {text}
    </label>
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

function isGateReopenable(gate) {
  if (!gate) return false
  const state = gateStateKey(gate)
  return state === 'closed' || state === 'expired'
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
  onDelete,
  onToggleSaved,
  canReadPaymentAccounts = false,
  canEditPaymentAccounts = false,
}) {
  const { locale, t } = useI18n()
  const { startTour } = useAdminTour()

  useEffect(() => {
    startTour('admin-access-gates', getAccessGatesTourSteps(t))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al montar
  }, [])

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
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteError, setDeleteError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const formRef = useRef(null)
  const triggerRef = useRef(null)
  const shouldFocusEditorRef = useRef(false)
  const eventGates = useMemo(() => configuration.eventGates ?? [], [configuration.eventGates])
  const events = useMemo(
    () => adminEvents.filter((event) => event.slug && event.status !== 'archived'),
    [adminEvents],
  )

  // Lo primero que pregunta el operador es "¿está todo abierto?". Contarlo acá
  // evita tener que leer interruptor por interruptor para responderlo. Entran los
  // dos tipos: los booleanos por concepto y las celdas de la matriz de canales.
  const togglesSummary = useMemo(() => {
    const openToggles = TOGGLE_FEATURES.filter((feature) => toggles[feature.key] !== false).length
    const openChannels = CHANNEL_CELLS.filter(
      ({ concept, channel }) => toggles.paymentChannels?.[concept]?.[channel] !== false,
    ).length
    const open = openToggles + openChannels
    const total = TOGGLE_FEATURES.length + CHANNEL_CELLS.length
    return { open, total, allOpen: open === total }
  }, [toggles])

  // Un concepto sin ningún medio abierto no cobra, aunque su alta esté en ON. Es
  // un estado configurable a propósito, así que se avisa en vez de impedirse.
  const conceptsWithoutChannel = useMemo(
    () =>
      CONCEPT_BLOCKS.filter(
        (block) =>
          toggles.paymentChannels &&
          block.channels.every(
            (channel) => toggles.paymentChannels[block.concept]?.[channel] === false,
          ),
      ).map((block) => block.concept),
    [toggles],
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

  // shouldFocusEditorRef, prendido solo por openEditor(), evita que el efecto
  // reenfoque en cada tecla (el draft cambia en cada keystroke) y también
  // vuelve a enfocar si se abre otra fila mientras el formulario ya estaba
  // abierto.
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

  /**
   * Un solo camino de guardado para los dos tipos de interruptor: `save` es la
   * llamada concreta y `id` la clave con la que la fila muestra "Guardando…".
   */
  async function persistToggle(id, save) {
    setSavingFeature(id)
    setTogglesError('')
    try {
      setToggles(await save())
      await onToggleSaved?.()
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

  const handleToggleFeature = (feature, enabled) =>
    persistToggle(feature, () => savePlatformFeatureToggle(feature, enabled))

  const handleToggleChannel = (concept, channel, enabled) =>
    persistToggle(`${concept}:${channel}`, () => savePaymentChannel(concept, channel, enabled))

  function openEditor(gate = null, scope = 'membership', trigger = null) {
    triggerRef.current = trigger
    shouldFocusEditorRef.current = true
    setNotice('')
    setFormError('')
    const reopening = isGateReopenable(gate)
    setDraft(
      gate
        ? {
            scope: gate.scope,
            eventSlug: gate.eventSlug ?? '',
            label: gate.label,
            code: '',
            active: reopening ? true : gate.active,
            startsAt: reopening ? '' : toLocalDateTime(gate.startsAt),
            endsAt: reopening ? '' : toLocalDateTime(gate.endsAt),
          }
        : {
            ...EMPTY_GATE,
            scope,
            eventSlug: scope === 'registration' ? (events[0]?.slug ?? '') : '',
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
      : (eventGates.find((gate) => gate.eventSlug === draft?.eventSlug) ?? null)
  const reopeningDraft = Boolean(draft && isGateReopenable(currentGate))
  const requiresNewCode = Boolean(draft?.active && (!currentGate?.active || reopeningDraft))

  async function submit(event) {
    event.preventDefault()
    setFormError('')
    setNotice('')
    const trimmedLabel = draft?.label.trim() ?? ''
    const trimmedCode = draft?.code.trim() ?? ''
    if (!trimmedLabel) {
      setFormError(t('admin.sections.accessGates.labelRequired'))
      return
    }
    if (draft.scope === 'registration' && !draft.eventSlug) {
      setFormError(t('admin.sections.accessGates.eventRequired'))
      return
    }
    if (requiresNewCode && !trimmedCode) {
      setFormError(t('admin.sections.accessGates.codeRequired'))
      return
    }
    setSaving(true)
    const result = await onSave?.({
      ...draft,
      eventSlug: draft.scope === 'registration' ? draft.eventSlug.trim() : undefined,
      label: trimmedLabel,
      code: trimmedCode || undefined,
    })
    setSaving(false)
    if (result?.error) {
      setFormError(
        mapOperationalError(
          {
            message: result.error,
            status: result.error === 'Ruta no encontrada' ? 404 : undefined,
          },
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

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    setDeleteError('')
    const result = await onDelete?.(deleteTarget.id)
    setDeleting(false)
    if (result?.error) {
      setDeleteError(result.error)
      return
    }
    setDeleteTarget(null)
    setNotice(t('admin.sections.accessGates.deleted'))
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

  function formatEndsAt(value) {
    if (!value) return ''
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(value),
    )
  }

  // La tanda de afiliaciones es una sola y siempre tiene fila (aunque no haya
  // código configurado: ahí la fila ofrece "Configurar"). Las de torneo se suman
  // debajo, una por evento.
  const gateRows = useMemo(
    () => [
      { id: 'membership-gate', kind: 'membership', gate: configuration.membershipGate ?? null },
      ...eventGates.map((gate) => ({ id: gate.id, kind: 'event', gate })),
    ],
    [configuration.membershipGate, eventGates],
  )

  const gateColumns = [
    {
      key: 'scope',
      label: t('admin.sections.accessGates.colScope'),
      mobile: 'primary',
      desktop: 'primary',
      render: (row) => (
        <span className="admin-access__gate-name">
          {row.kind === 'membership'
            ? t('admin.sections.accessGates.membershipGateTitle')
            : (row.gate.eventTitle ?? row.gate.eventSlug)}
        </span>
      ),
    },
    {
      key: 'label',
      label: t('admin.sections.accessGates.colLabel'),
      render: (row) =>
        row.gate ? (
          row.gate.label
        ) : (
          <span className="admin-access__muted">
            {t('admin.sections.accessGates.membershipGateEmpty')}
          </span>
        ),
    },
    {
      key: 'endsAt',
      label: t('admin.sections.accessGates.colEnds'),
      width: 170,
      // En card móvil una fecha ausente no ocupa lugar: solo la tabla lleva guion.
      mobileRender: (row) => (row.gate?.endsAt ? formatEndsAt(row.gate.endsAt) : null),
      render: (row) =>
        row.gate?.endsAt ? (
          formatEndsAt(row.gate.endsAt)
        ) : (
          <span className="admin-access__muted" aria-hidden>
            —
          </span>
        ),
    },
    {
      key: 'state',
      label: t('admin.sections.accessGates.colState'),
      mobile: 'badge',
      desktop: 'status',
      width: 120,
      render: (row) => {
        const key = gateStateKey(row.gate)
        return (
          <span className={`admin-access__gate-state admin-access__gate-state--${key}`}>
            <span className="admin-access__gate-dot" aria-hidden />
            {stateLabel(key)}
          </span>
        )
      },
    },
    ...(canEdit
      ? [
          {
            key: 'actions',
            label: (
              <span className="admin-access__sr-only">
                {t('admin.sections.accessGates.colActions')}
              </span>
            ),
            mobile: 'action',
            width: 190,
            align: 'right',
            render: (row) => {
              const scope = row.kind === 'membership' ? 'membership' : 'registration'
              return (
                <AdminTableActions>
                  <button
                    type="button"
                    className="admin-access__btn admin-access__btn--small"
                    onClick={(event) => openEditor(row.gate, scope, event.currentTarget)}
                  >
                    {isGateReopenable(row.gate)
                      ? t('admin.sections.accessGates.reopen')
                      : row.kind === 'membership'
                        ? t('admin.sections.accessGates.configure')
                        : t('admin.sections.accessGates.edit')}
                  </button>
                  {row.gate ? (
                    <AdminIconButton
                      icon={Trash2}
                      label={t('admin.sections.accessGates.delete')}
                      onClick={() => setDeleteTarget(row.gate)}
                    />
                  ) : null}
                </AdminTableActions>
              )
            },
          },
        ]
      : []),
  ]

  return (
    <section className="admin-access" aria-labelledby="access-gates-title">
      <header className="admin-access__header">
        <div className="admin-access__intro">
          <h1 id="access-gates-title">{t('admin.sections.accessGates.title')}</h1>
          <p>{t('admin.sections.accessGates.subtitle')}</p>
        </div>
        <button
          type="button"
          className="admin-access__btn admin-access__btn--ghost"
          onClick={() => {
            onRefresh?.()
            void loadToggles()
          }}
          disabled={isLoading || togglesLoading}
        >
          <RefreshCw size={14} aria-hidden />
          {t('admin.sections.accessGates.refresh')}
        </button>
      </header>

      {gatesError ? (
        <div className="admin-access__message admin-access__message--error" role="alert">
          <XCircle size={15} aria-hidden />
          <span>{gatesError}</span>
          <button type="button" className="admin-access__btn" onClick={() => onRefresh?.()}>
            {t('admin.sections.accessGates.retry')}
          </button>
        </div>
      ) : null}
      {notice ? (
        <p className="admin-access__notice" role="status">
          <ShieldCheck size={15} aria-hidden /> {notice}
        </p>
      ) : null}
      {isLoading && !configuration.membershipGate && eventGates.length === 0 ? (
        <p className="admin-access__loading">{t('admin.sections.accessGates.loading')}</p>
      ) : null}

      <section className="admin-access__block" aria-labelledby="access-toggles-title">
        <header className="admin-access__block-head">
          <div>
            <h2 id="access-toggles-title">{t('admin.sections.accessGates.togglesTitle')}</h2>
            <p>{t('admin.sections.accessGates.togglesLead')}</p>
          </div>
          {togglesLoading || togglesError ? null : (
            <p className="admin-access__summary" role="status">
              <span
                className={`admin-access__summary-dot admin-access__summary-dot--${
                  togglesSummary.allOpen ? 'on' : 'off'
                }`}
                aria-hidden
              />
              {t('admin.sections.accessGates.togglesSummary', {
                open: togglesSummary.open,
                total: togglesSummary.total,
              })}
            </p>
          )}
        </header>

        {/* Frenos que vienen del entorno, no del panel: sin esto un interruptor
            podía estar en ON y no tener ningún efecto, sin explicación. */}
        {(toggles.environmentHolds ?? []).length > 0 ? (
          <div className="admin-access__hold" role="status">
            <LockKeyhole size={15} aria-hidden />
            <span>
              {t('admin.sections.accessGates.environmentHold', {
                variables: (toggles.environmentHolds ?? []).map((hold) => hold.variable).join(', '),
              })}
            </span>
          </div>
        ) : null}

        {/* Interruptor maestro: una franja propia por encima de la matriz. Es el
            único estado de la pantalla que justifica el rojo: pausado, no entra
            un peso a la plataforma. */}
        <div
          className={`admin-access__master${
            toggles[CHECKOUT_FEATURE.key] === false ? ' admin-access__master--halted' : ''
          }`}
        >
          <div className="admin-access__master-copy">
            <h3>{t('admin.sections.accessGates.checkoutTitle')}</h3>
            <p>{t('admin.sections.accessGates.checkoutLead')}</p>
          </div>
          <SwitchControl
            ariaLabel={t('admin.sections.accessGates.checkoutAria')}
            busy={savingFeature === CHECKOUT_FEATURE.feature}
            canEdit={canEdit}
            enabled={toggles[CHECKOUT_FEATURE.key] !== false}
            loading={togglesLoading}
            onToggle={(enabled) => handleToggleFeature(CHECKOUT_FEATURE.feature, enabled)}
            stateLabel={
              toggles[CHECKOUT_FEATURE.key] !== false
                ? t('admin.sections.accessGates.checkoutOn')
                : t('admin.sections.accessGates.checkoutOff')
            }
            t={t}
          />
        </div>

        {/* Matriz: concepto en filas; alta, medios y validación en columnas. La
            cabecera es visual (aria-hidden): cada interruptor ya trae su nombre
            accesible completo ("Habilitar Wise para entradas"). */}
        <div className="admin-access__matrix">
          <div className="admin-access__matrix-head" aria-hidden>
            <span />
            <span>{t('admin.sections.accessGates.colIntake')}</span>
            {CHANNEL_COLUMNS.map((channel) => (
              <span key={channel}>{t(`admin.sections.accessGates.channelShort.${channel}`)}</span>
            ))}
            <span>{t('admin.sections.accessGates.colValidation')}</span>
          </div>

          {CONCEPT_BLOCKS.map((block) => {
            const conceptTitle = t(`admin.sections.accessGates.${block.i18n}Title`)
            const intakeOpen = toggles[block.intake.key] !== false
            const withoutChannel = conceptsWithoutChannel.includes(block.concept)
            return (
              <div
                key={block.concept}
                className={`admin-access__row${intakeOpen ? '' : ' admin-access__row--closed'}`}
                role="group"
                aria-label={conceptTitle}
              >
                <h3 className="admin-access__row-title">{conceptTitle}</h3>

                <div className="admin-access__cell admin-access__cell--intake">
                  <span className="admin-access__cell-name">
                    {t('admin.sections.accessGates.colIntake')}
                  </span>
                  <SwitchControl
                    ariaLabel={t(`admin.sections.accessGates.${block.i18n}Aria`)}
                    busy={savingFeature === block.intake.feature}
                    canEdit={canEdit}
                    enabled={intakeOpen}
                    loading={togglesLoading}
                    onToggle={(enabled) => handleToggleFeature(block.intake.feature, enabled)}
                    quiet
                    stateLabel={
                      intakeOpen
                        ? t('admin.sections.accessGates.enabledPlural')
                        : t('admin.sections.accessGates.closedPlural')
                    }
                    t={t}
                  />
                </div>

                {CHANNEL_COLUMNS.map((channel) => {
                  if (!block.channels.includes(channel)) {
                    return (
                      <div
                        key={channel}
                        className="admin-access__cell admin-access__cell--na"
                        aria-hidden
                      >
                        <span className="admin-access__na">—</span>
                      </div>
                    )
                  }
                  const channelOpen = toggles.paymentChannels?.[block.concept]?.[channel] !== false
                  return (
                    <div
                      key={channel}
                      className={`admin-access__cell admin-access__cell--channel${
                        intakeOpen ? '' : ' admin-access__cell--muted'
                      }`}
                    >
                      <span className="admin-access__cell-name">
                        {t(`admin.sections.accessGates.channel.${channel}`)}
                      </span>
                      <SwitchControl
                        ariaLabel={t('admin.sections.accessGates.channelAria', {
                          channel: t(`admin.sections.accessGates.channel.${channel}`),
                          concept: conceptTitle,
                        })}
                        busy={savingFeature === `${block.concept}:${channel}`}
                        canEdit={canEdit}
                        enabled={channelOpen}
                        loading={togglesLoading}
                        onToggle={(enabled) => handleToggleChannel(block.concept, channel, enabled)}
                        quiet
                        stateLabel={
                          channelOpen
                            ? t('admin.sections.accessGates.channelOn')
                            : t('admin.sections.accessGates.channelOff')
                        }
                        t={t}
                      />
                    </div>
                  )
                })}

                <div
                  className={`admin-access__cell admin-access__cell--validation${
                    intakeOpen ? '' : ' admin-access__cell--muted'
                  }`}
                >
                  <span className="admin-access__cell-name">
                    {t('admin.sections.accessGates.colValidation')}
                  </span>
                  <SwitchControl
                    ariaLabel={t(`admin.sections.accessGates.${block.validation.i18n}Aria`)}
                    busy={savingFeature === block.validation.feature}
                    canEdit={canEdit}
                    enabled={toggles[block.validation.key] !== false}
                    loading={togglesLoading}
                    onToggle={(enabled) => handleToggleFeature(block.validation.feature, enabled)}
                    quiet
                    stateLabel={
                      toggles[block.validation.key] !== false
                        ? t('admin.sections.accessGates.enabledSingular')
                        : t('admin.sections.accessGates.closedSingular')
                    }
                    t={t}
                  />
                </div>

                {withoutChannel ? (
                  <p className="admin-access__row-warning" role="status">
                    <XCircle size={14} aria-hidden />
                    {t('admin.sections.accessGates.noChannelWarning')}
                  </p>
                ) : null}
              </div>
            )
          })}
        </div>

        {/* Lo que el operador necesita saber una vez, no en cada lectura: las
            consecuencias de cada interruptor viven acá, cerradas por defecto. */}
        <details className="admin-access__legend">
          <summary>{t('admin.sections.accessGates.legendSummary')}</summary>
          <dl>
            {CONCEPT_BLOCKS.map((block) => (
              <div key={block.concept}>
                <dt>{t(`admin.sections.accessGates.${block.i18n}Title`)}</dt>
                <dd>
                  {t(`admin.sections.accessGates.${block.i18n}Lead`)}{' '}
                  {t(`admin.sections.accessGates.${block.validation.i18n}Lead`)}
                </dd>
              </div>
            ))}
            <div>
              <dt>{t('admin.sections.accessGates.channelsLabel')}</dt>
              <dd>{t('admin.sections.accessGates.legendChannels')}</dd>
            </div>
          </dl>
        </details>

        {togglesLoading ? (
          <p className="admin-access__loading">{t('admin.sections.accessGates.togglesLoading')}</p>
        ) : null}
        {togglesError ? (
          <div className="admin-access__message admin-access__message--error" role="alert">
            <XCircle size={15} aria-hidden />
            <span>{togglesError}</span>
            <button type="button" className="admin-access__btn" onClick={() => void loadToggles()}>
              {t('admin.sections.accessGates.retry')}
            </button>
          </div>
        ) : null}
      </section>

      {/* Con qué cuentas se cobra: va entre los medios (la matriz de arriba)
          y las tandas, porque completa la pregunta "cómo se cobra". */}
      {canReadPaymentAccounts ? (
        <PaymentAccountsPanel t={t} locale={locale} canEdit={canEditPaymentAccounts} />
      ) : null}

      <section className="admin-access__block" aria-labelledby="access-gates-private-title">
        <header className="admin-access__block-head">
          <div>
            <h2 id="access-gates-private-title">{t('admin.sections.accessGates.gatesTitle')}</h2>
            <p>{t('admin.sections.accessGates.gatesLead')}</p>
          </div>
          {canEdit ? (
            <button
              type="button"
              className="admin-access__btn"
              onClick={(event) => openEditor(null, 'registration', event.currentTarget)}
            >
              {t('admin.sections.accessGates.newGate')}
            </button>
          ) : null}
        </header>

        <AdminDataTable
          className="admin-data-table--access-gates"
          columns={gateColumns}
          density="compact"
          pagination={false}
          rows={gateRows}
        />
        {eventGates.length === 0 ? (
          <p className="admin-access__empty" role="status">
            {t('admin.sections.accessGates.eventGatesEmpty')}
          </p>
        ) : null}

        {canEdit && draft ? (
          <form ref={formRef} className="admin-access__form" onSubmit={submit} noValidate>
            <header>
              <h3>
                {draft.scope === 'membership'
                  ? t('admin.sections.accessGates.formTitleMembership')
                  : t('admin.sections.accessGates.formTitleRegistration')}
              </h3>
              <p>
                {t(
                  reopeningDraft
                    ? 'admin.sections.accessGates.formLeadReopen'
                    : 'admin.sections.accessGates.formLead',
                )}
              </p>
            </header>

            <fieldset className="admin-access__fields" disabled={saving}>
              <label htmlFor="access-gate-scope">
                <span>{t('admin.sections.accessGates.scope')}</span>
                <select
                  id="access-gate-scope"
                  value={draft.scope}
                  onChange={(event) =>
                    setDraft({
                      ...EMPTY_GATE,
                      scope: event.target.value,
                      eventSlug:
                        event.target.value === 'registration' ? (events[0]?.slug ?? '') : '',
                    })
                  }
                >
                  <option value="membership">
                    {t('admin.sections.accessGates.scopeMembership')}
                  </option>
                  <option value="registration">
                    {t('admin.sections.accessGates.scopeRegistration')}
                  </option>
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
                <span>{t('admin.sections.accessGates.code')}</span>
                <input
                  id="access-gate-code"
                  type="password"
                  autoComplete="new-password"
                  value={draft.code}
                  onChange={(event) => setDraft({ ...draft, code: event.target.value })}
                  minLength={10}
                  maxLength={72}
                />
                {/* Una sola línea de ayuda según el caso: antes el aviso se partía
                    entre la etiqueta y el pie, y el requisito se leía dos veces. */}
                <small>
                  {requiresNewCode
                    ? t('admin.sections.accessGates.codeRequired')
                    : currentGate?.active
                      ? t('admin.sections.accessGates.codeKeepHint')
                      : t('admin.sections.accessGates.codePlaceholder')}
                </small>
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

              <label
                className="admin-access__switch admin-access__switch--field"
                htmlFor="access-gate-active"
              >
                <input
                  id="access-gate-active"
                  type="checkbox"
                  checked={draft.active}
                  onChange={(event) => setDraft({ ...draft, active: event.target.checked })}
                  aria-label={t('admin.sections.accessGates.activeAria')}
                />
                <span className="admin-access__switch-state">
                  {draft.active
                    ? t('admin.sections.accessGates.enabledSingular')
                    : t('admin.sections.accessGates.closedSingular')}
                </span>
              </label>
            </fieldset>

            {formError ? (
              <p className="admin-access__error" role="alert">
                <XCircle size={15} aria-hidden /> {formError}
              </p>
            ) : null}

            <footer className="admin-access__form-actions">
              <button type="button" className="admin-access__btn" onClick={cancelEditor}>
                {t('admin.sections.accessGates.cancel')}
              </button>
              <button
                type="submit"
                className="admin-access__btn admin-access__btn--primary"
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
      {deleteTarget ? (
        <AdminDeleteConfirmDialog
          busy={deleting}
          error={deleteError}
          onCancel={() => {
            if (!deleting) setDeleteTarget(null)
          }}
          onConfirm={() => void handleDelete()}
          title={t('admin.sections.accessGates.deleteTitle')}
          description={t('admin.sections.accessGates.deleteDescription', {
            label: deleteTarget.label,
          })}
          warning={t('admin.sections.accessGates.deleteWarning')}
          cancelLabel={t('admin.sections.accessGates.cancel')}
          confirmLabel={t('admin.sections.accessGates.delete')}
          busyLabel={t('admin.sections.accessGates.deleting')}
        />
      ) : null}
    </section>
  )
}
