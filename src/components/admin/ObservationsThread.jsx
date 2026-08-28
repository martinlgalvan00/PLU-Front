import { useCallback, useEffect, useId, useState } from 'react'
import { LoaderCircle, MessageSquarePlus, Trash2 } from 'lucide-react'
import Button from '../ui/Button.jsx'
import StatusBadge from '../ui/StatusBadge.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { actorLabel, formatStateDateTime } from '../../lib/stateProvenance.js'
import {
  addObservation as addObservationRequest,
  deleteObservation as deleteObservationRequest,
  listObservations,
} from '../../services/athleteApi.js'

/**
 * ObservationsThread — PLU ARG
 *
 * El hilo de observaciones de una inscripción o una afiliación.
 *
 * Por qué existe: hasta acá anotar algo era un efecto colateral de mover el
 * estado. El diálogo de corrección exige un estado distinto al vigente, así que
 * dejar escrito "el pago llegó a nombre del padre" sobre una inscripción
 * confirmada obligaba a sacarla de confirmada, y además cada motivo pisaba al
 * anterior: un caso que pasa por tres manos terminaba con una sola línea.
 *
 * El hilo mezcla las dos cosas a propósito -- las observaciones sueltas y los
 * motivos de los cambios de estado -- porque para quien lee el caso son lo
 * mismo: lo que se dijo sobre esta inscripción, en orden. Lo que las distingue
 * es el badge del estado que acompañaba a cada una.
 *
 * Las entradas van de la más nueva a la más vieja: en un caso abierto lo que
 * importa es lo último que se dijo, no cómo empezó.
 */
export default function ObservationsThread({
  entityType,
  entityId,
  canWrite = false,
  onChange,
}) {
  const { locale, t } = useI18n()
  const fieldId = useId()
  const [observations, setObservations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState(null)

  const load = useCallback(async () => {
    if (!entityId) return
    setLoading(true)
    setError('')
    try {
      setObservations(await listObservations(entityType, [entityId]))
    } catch (loadError) {
      setError(loadError?.message ?? t('admin.observations.loadError'))
    } finally {
      setLoading(false)
    }
  }, [entityId, entityType, t])

  useEffect(() => {
    void load()
  }, [load])

  const valid = draft.trim().length >= 3

  async function submit(event) {
    event.preventDefault()
    if (!valid || saving) return
    setSaving(true)
    setError('')
    try {
      const { observation } = await addObservationRequest(entityType, entityId, draft.trim())
      // Se antepone en vez de recargar el hilo entero: la respuesta ya trae la
      // fila que la base escribió, con su id, su autor y su fecha reales.
      setObservations((current) => [observation, ...current])
      setDraft('')
      onChange?.()
    } catch (saveError) {
      setError(saveError?.message ?? t('admin.observations.saveError'))
    } finally {
      setSaving(false)
    }
  }

  async function remove(observationId) {
    setDeletingId(observationId)
    setError('')
    try {
      await deleteObservationRequest(observationId)
      setObservations((current) => current.filter((item) => item.id !== observationId))
      onChange?.()
    } catch (deleteError) {
      setError(deleteError?.message ?? t('admin.observations.deleteError'))
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <section className="admin-observations" aria-label={t('admin.observations.title')}>
      {canWrite ? (
        <form className="admin-observations__form" onSubmit={submit}>
          <label className="admin-observations__field" htmlFor={fieldId}>
            <span>{t('admin.observations.newLabel')}</span>
            <textarea
              id={fieldId}
              rows={2}
              maxLength={1000}
              value={draft}
              disabled={saving}
              placeholder={t('admin.observations.placeholder')}
              onChange={(event) => setDraft(event.target.value)}
            />
          </label>
          <Button type="submit" disabled={!valid || saving}>
            {saving ? (
              <LoaderCircle size={15} aria-hidden className="is-spinning" />
            ) : (
              <MessageSquarePlus size={15} aria-hidden />
            )}
            {saving ? t('admin.observations.saving') : t('admin.observations.save')}
          </Button>
        </form>
      ) : null}

      {error ? (
        <p className="admin-observations__error" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="admin-observations__empty" role="status">
          {t('admin.observations.loading')}
        </p>
      ) : observations.length ? (
        <ol className="admin-observations__list">
          {observations.map((observation) => (
            <li key={observation.id} className="admin-observations__item">
              <div className="admin-observations__meta">
                {/* El estado que acompañó a la observación, cuando la escribió
                    alguien al mover el estado. Una observación suelta no lleva
                    badge: no cambió nada. */}
                {observation.statusChange ? (
                  <StatusBadge value={observation.statusChange} />
                ) : null}
                <span className="admin-observations__author">
                  {actorLabel(observation.author) ?? t('admin.paymentState.manual.unknownActor')}
                </span>
                <time dateTime={observation.createdAt}>
                  {formatStateDateTime(observation.createdAt, locale) ?? '—'}
                </time>
                {canWrite ? (
                  <button
                    type="button"
                    className="admin-observations__delete"
                    disabled={deletingId === observation.id}
                    aria-label={t('admin.observations.delete')}
                    onClick={() => remove(observation.id)}
                  >
                    {deletingId === observation.id ? (
                      <LoaderCircle size={14} aria-hidden className="is-spinning" />
                    ) : (
                      <Trash2 size={14} aria-hidden />
                    )}
                  </button>
                ) : null}
              </div>
              <p className="admin-observations__body">{observation.body}</p>
            </li>
          ))}
        </ol>
      ) : error ? null : (
        // El vacío se afirma sólo cuando la lectura salió bien: "todavía no hay
        // observaciones" después de un error es una mentira, y encima invita a
        // escribir en vez de a reintentar.
        <p className="admin-observations__empty">{t('admin.observations.empty')}</p>
      )}
    </section>
  )
}
