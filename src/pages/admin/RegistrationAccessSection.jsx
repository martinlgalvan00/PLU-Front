import { useCallback, useEffect, useMemo, useState } from 'react'
import { KeyRound, LockKeyhole, Power, RefreshCw, Save, ShieldCheck, XCircle } from 'lucide-react'
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

function toLocalDateTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function gateState(gate, now = new Date()) {
  if (!gate?.active) return 'Cerrada'
  if (gate.startsAt && new Date(gate.startsAt) > now) return 'Programada'
  if (gate.endsAt && new Date(gate.endsAt) <= now) return 'Vencida'
  return 'Abierta'
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
  const { locale } = useI18n()
  const [draft, setDraft] = useState(EMPTY_GATE)
  const [notice, setNotice] = useState('')
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [toggles, setToggles] = useState({ checkoutEnabled: true, membershipEnabled: true, registrationEnabled: true })
  const [togglesLoading, setTogglesLoading] = useState(true)
  const [togglesError, setTogglesError] = useState('')
  const [savingFeature, setSavingFeature] = useState(null)
  const eventGates = configuration.eventGates ?? []
  const events = useMemo(
    () => adminEvents.filter((event) => event.slug && event.status !== 'archived'),
    [adminEvents],
  )

  const loadToggles = useCallback(async () => {
    setTogglesLoading(true)
    setTogglesError('')
    try {
      setToggles(await fetchPlatformFeatureToggles())
    } catch (loadError) {
      setTogglesError(loadError?.message ?? 'No se pudieron leer los interruptores generales.')
    } finally {
      setTogglesLoading(false)
    }
  }, [])

  useEffect(() => { onRefresh?.() }, [onRefresh])
  useEffect(() => { void loadToggles() }, [loadToggles])

  async function handleToggleFeature(feature, enabled) {
    setSavingFeature(feature)
    setTogglesError('')
    try {
      setToggles(await savePlatformFeatureToggle(feature, enabled))
    } catch (toggleError) {
      setTogglesError(toggleError?.message ?? 'No se pudo actualizar el interruptor.')
    } finally {
      setSavingFeature(null)
    }
  }

  function editGate(gate = null, scope = 'membership') {
    setNotice('')
    setFormError('')
    setDraft(gate ? {
      scope: gate.scope,
      eventSlug: gate.eventSlug ?? '',
      label: gate.label,
      code: '',
      active: gate.active,
      startsAt: toLocalDateTime(gate.startsAt),
      endsAt: toLocalDateTime(gate.endsAt),
    } : { ...EMPTY_GATE, scope, eventSlug: scope === 'registration' ? events[0]?.slug ?? '' : '' })
  }

  async function submit(event) {
    event.preventDefault()
    setFormError('')
    setNotice('')
    if (!draft.label.trim()) {
      setFormError('Nombrá la tanda para identificarla en la auditoría.')
      return
    }
    if (draft.scope === 'registration' && !draft.eventSlug) {
      setFormError('Elegí el torneo que querés habilitar.')
      return
    }
    if (draft.active && !draft.code && !currentGate?.active) {
      setFormError('Definí un código nuevo de al menos 10 caracteres para abrir la tanda.')
      return
    }
    setSaving(true)
    const result = await onSave?.(draft)
    setSaving(false)
    if (result?.error) {
      setFormError(result.error)
      return
    }
    setDraft(EMPTY_GATE)
    setNotice('Tanda guardada. El código nunca se vuelve a mostrar ni se guarda en texto plano.')
  }

  const currentGate = draft.scope === 'membership'
    ? configuration.membershipGate
    : eventGates.find((gate) => gate.eventSlug === draft.eventSlug) ?? null

  return (
    <section className="admin-registration-access" aria-labelledby="access-gates-title">
      <header className="admin-registration-access__hero">
        <div>
          <p className="admin-registration-access__eyebrow"><KeyRound size={14} aria-hidden /> Aperturas controladas</p>
          <h1 id="access-gates-title">Acceso y habilitación</h1>
          <p>Controlá quién puede iniciar una afiliación o inscripción antes de abrirla al público.</p>
        </div>
        <button type="button" className="admin-registration-access__button admin-registration-access__button--quiet" onClick={() => onRefresh?.()} disabled={isLoading}>
          <RefreshCw size={15} aria-hidden /> Actualizar
        </button>
      </header>

      <div className="admin-registration-access__block-head">
        <div>
          <h2>Habilitación general</h2>
          <p>Corte total, con o sin código: apagado acá, nadie puede empezar una afiliación, inscripción, entrada o suscripción nueva.</p>
        </div>
      </div>
      <div className="admin-registration-access__rule">
        <div>
          <span className={`admin-registration-access__state admin-registration-access__state--${toggles.checkoutEnabled ? 'abierta' : 'cerrada'}`}>
            {toggles.checkoutEnabled ? 'Habilitados' : 'Pausados'}
          </span>
          <h3>Cobros generales</h3>
          <p>Interruptor maestro: cubre afiliaciones, inscripciones, entradas y suscripciones. Reemplaza a la variable de entorno de Vercel — ya no hace falta redeploy para pausar la venta.</p>
        </div>
        {canEdit ? (
          <label className="admin-registration-access__switch">
            <input
              type="checkbox"
              checked={toggles.checkoutEnabled}
              disabled={togglesLoading || savingFeature === 'checkout'}
              onChange={(event) => handleToggleFeature('checkout', event.target.checked)}
              aria-label="Habilitar cobros generales"
            />
            <span><Power size={13} aria-hidden /> {savingFeature === 'checkout' ? 'Guardando…' : toggles.checkoutEnabled ? 'Habilitados' : 'Pausados'}</span>
          </label>
        ) : null}
      </div>
      <div className="admin-registration-access__rule">
        <div>
          <span className={`admin-registration-access__state admin-registration-access__state--${toggles.membershipEnabled ? 'abierta' : 'cerrada'}`}>
            {toggles.membershipEnabled ? 'Habilitadas' : 'Cerradas'}
          </span>
          <h3>Afiliaciones</h3>
          <p>Con esto apagado, nadie puede iniciar ni renovar una afiliación, tenga o no el código de la tanda privada.</p>
        </div>
        {canEdit ? (
          <label className="admin-registration-access__switch">
            <input
              type="checkbox"
              checked={toggles.membershipEnabled}
              disabled={togglesLoading || savingFeature === 'membership'}
              onChange={(event) => handleToggleFeature('membership', event.target.checked)}
              aria-label="Habilitar afiliaciones"
            />
            <span><Power size={13} aria-hidden /> {savingFeature === 'membership' ? 'Guardando…' : toggles.membershipEnabled ? 'Habilitadas' : 'Cerradas'}</span>
          </label>
        ) : null}
      </div>
      <div className="admin-registration-access__rule">
        <div>
          <span className={`admin-registration-access__state admin-registration-access__state--${toggles.registrationEnabled ? 'abierta' : 'cerrada'}`}>
            {toggles.registrationEnabled ? 'Habilitadas' : 'Cerradas'}
          </span>
          <h3>Inscripciones</h3>
          <p>Se suma a la ventana propia de cada torneo (publicado + fecha de apertura): si acá está apagado, ningún evento admite inscripciones nuevas.</p>
        </div>
        {canEdit ? (
          <label className="admin-registration-access__switch">
            <input
              type="checkbox"
              checked={toggles.registrationEnabled}
              disabled={togglesLoading || savingFeature === 'registration'}
              onChange={(event) => handleToggleFeature('registration', event.target.checked)}
              aria-label="Habilitar inscripciones"
            />
            <span><Power size={13} aria-hidden /> {savingFeature === 'registration' ? 'Guardando…' : toggles.registrationEnabled ? 'Habilitadas' : 'Cerradas'}</span>
          </label>
        ) : null}
      </div>
      {togglesError ? <p className="admin-registration-access__error" role="alert"><XCircle size={15} aria-hidden /> {togglesError}</p> : null}

      <div className="admin-registration-access__block-head">
        <div><h2>Tandas privadas</h2><p>Además del corte general, cada tanda puede pedir un código para abrir de a poco.</p></div>
      </div>
      <div className="admin-registration-access__rule">
        <div>
          <span className={`admin-registration-access__state admin-registration-access__state--${gateState(configuration.membershipGate).toLowerCase()}`}>
            {gateState(configuration.membershipGate)}
          </span>
          <h2>Afiliaciones</h2>
          <p>{configuration.membershipGate ? `${configuration.membershipGate.label}.` : 'Sin código: la afiliación está disponible según su ventana normal.'}</p>
        </div>
        {canEdit ? <button type="button" className="admin-registration-access__button" onClick={() => editGate(configuration.membershipGate, 'membership')}>Configurar</button> : null}
      </div>

      <div className="admin-registration-access__block-head">
        <div><h2>Inscripciones por torneo</h2><p>Cada evento puede tener su propio código y ventana.</p></div>
        {canEdit ? <button type="button" className="admin-registration-access__button" onClick={() => editGate(null, 'registration')}>Nueva tanda</button> : null}
      </div>

      <div className="admin-registration-access__list">
        {eventGates.length ? eventGates.map((gate) => (
          <article className="admin-registration-access__rule" key={gate.id}>
            <div>
              <span className={`admin-registration-access__state admin-registration-access__state--${gateState(gate).toLowerCase()}`}>{gateState(gate)}</span>
              <h3>{gate.eventTitle ?? gate.eventSlug}</h3>
              <p>{gate.label}{gate.endsAt ? ` · Hasta ${new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(gate.endsAt))}` : ''}</p>
            </div>
            {canEdit ? <button type="button" className="admin-registration-access__button" onClick={() => editGate(gate, 'registration')}>Editar</button> : null}
          </article>
        )) : <p className="admin-registration-access__empty">No hay tandas privadas para torneos.</p>}
      </div>

      {canEdit ? (
        <form className="admin-registration-access__form" onSubmit={submit}>
          <header><LockKeyhole size={17} aria-hidden /><div><h2>{draft.scope === 'membership' ? 'Configurar afiliaciones' : 'Configurar inscripción'}</h2><p>Al cerrar una tanda se invalida su código. Para reabrirla hay que crear otro.</p></div></header>
          <div className="admin-registration-access__fields">
            <label>Alcance<select value={draft.scope} onChange={(event) => setDraft({ ...EMPTY_GATE, scope: event.target.value, eventSlug: event.target.value === 'registration' ? events[0]?.slug ?? '' : '' })}><option value="membership">Afiliaciones</option><option value="registration">Inscripción a torneo</option></select></label>
            {draft.scope === 'registration' ? <label>Torneo<select value={draft.eventSlug} onChange={(event) => setDraft({ ...draft, eventSlug: event.target.value })}>{events.map((event) => <option key={event.slug} value={event.slug}>{event.title}</option>)}</select></label> : null}
            <label>Nombre de tanda<input value={draft.label} onChange={(event) => setDraft({ ...draft, label: event.target.value })} placeholder="Ej. Selección clubes — tanda 1" maxLength="80" /></label>
            <label>Código {currentGate?.active ? <small>Dejá vacío para conservarlo</small> : null}<input type="password" autoComplete="new-password" value={draft.code} onChange={(event) => setDraft({ ...draft, code: event.target.value })} placeholder="Mínimo 10 caracteres" minLength="10" maxLength="72" /></label>
            <label>Abre<input type="datetime-local" value={draft.startsAt} onChange={(event) => setDraft({ ...draft, startsAt: event.target.value })} /></label>
            <label>Cierra<input type="datetime-local" value={draft.endsAt} onChange={(event) => setDraft({ ...draft, endsAt: event.target.value })} /></label>
            <label className="admin-registration-access__switch"><input type="checkbox" checked={draft.active} onChange={(event) => setDraft({ ...draft, active: event.target.checked })} /><span>{draft.active ? 'Habilitada' : 'Cerrada'}</span></label>
          </div>
          {formError ? <p className="admin-registration-access__error" role="alert"><XCircle size={15} aria-hidden /> {formError}</p> : null}
          {notice ? <p className="admin-registration-access__notice" role="status"><ShieldCheck size={15} aria-hidden /> {notice}</p> : null}
          <footer><button type="submit" className="admin-registration-access__button admin-registration-access__button--primary" disabled={saving}>{saving ? 'Guardando…' : <><Save size={15} aria-hidden /> Guardar tanda</>}</button></footer>
        </form>
      ) : null}
      {error ? <p className="admin-registration-access__error" role="alert">{error}</p> : null}
    </section>
  )
}
