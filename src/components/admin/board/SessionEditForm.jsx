import { useId } from 'react'
import Button from '../../ui/Button.jsx'
import { parseClock } from '../../../services/eventBoardPlanner.js'
import { shiftStart } from '../../../lib/boardTimes.js'

const pad = (n) => String(n).padStart(2, '0')

/** "HH:MM" + minutos → "HH:MM" (sin pasar de las 23:59). */
function addMinutes(clock, minutes) {
  const start = parseClock(clock)
  if (start === null) return ''
  const end = Math.min(start + minutes, 24 * 60 - 1)
  return `${pad(Math.floor(end / 60))}:${pad(end % 60)}`
}

/**
 * SessionEditForm — PLU ARG
 *
 * Edición de una tanda dentro del tablero: nombre, tablado (opciones a la vista,
 * no un desplegable), inicio y pesaje. En un día con fecha las horas son "HH:MM"
 * de Buenos Aires; mover el inicio arrastra el pesaje si nadie lo tocó.
 *
 * La duración no se guarda: se estima por cantidad de atletas y se muestra como
 * orientación ("termina ~09:48"). Lo que manda es la hora que pone la persona.
 */
export default function SessionEditForm({
  athleteCount,
  busy,
  draft,
  hasPlatforms,
  minutesPerAthlete,
  onCancel,
  onChange,
  onSubmit,
  platforms,
  t,
}) {
  const uid = useId()
  const clock = draft.timeMode === 'clock'
  const timeType = clock ? 'time' : 'datetime-local'
  const estimate = Math.max(1, Math.ceil(athleteCount * minutesPerAthlete))
  const ends = clock && draft.startsAt ? addMinutes(draft.startsAt, estimate) : ''
  const choices = [['', t('admin.board.platformNone')], ...platforms.map((p) => [p.id, p.name])]

  return (
    <form className="admin-board__session-edit" onSubmit={onSubmit}>
      <label className="admin-board__session-edit-field">
        <span>{t('admin.board.sessionName')}</span>
        <input
          type="text"
          required
          maxLength={80}
          value={draft.name}
          onChange={(event) => onChange({ name: event.target.value })}
          disabled={busy}
        />
      </label>

      {hasPlatforms ? (
        <fieldset className="admin-board__session-edit-field admin-board__choice-group">
          <legend>{t('admin.board.sessionPlatform')}</legend>
          <div className="admin-board__choices">
            {choices.map(([id, label]) => (
              <label className="admin-board__choice" key={id || 'none'}>
                <input
                  type="radio"
                  name={`${uid}-platform`}
                  value={id}
                  checked={draft.platformId === id}
                  onChange={() => onChange({ platformId: id })}
                  disabled={busy}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : (
        <label className="admin-board__session-edit-field">
          <span>{t('admin.board.sessionPlatform')}</span>
          <input
            type="text"
            maxLength={80}
            value={draft.platform}
            onChange={(event) => onChange({ platform: event.target.value })}
            disabled={busy}
          />
        </label>
      )}

      <div className="admin-board__session-edit-times">
        <label className="admin-board__session-edit-field">
          <span>{t('admin.board.sessionStart')}</span>
          <input
            type={timeType}
            value={draft.startsAt}
            onChange={(event) => onChange(shiftStart(draft, event.target.value))}
            disabled={busy}
          />
        </label>
        <label className="admin-board__session-edit-field">
          <span>{t('admin.board.sessionWeighIn')}</span>
          <input
            type={timeType}
            value={draft.weighInAt}
            onChange={(event) => onChange({ weighInAt: event.target.value, weighTouched: true })}
            disabled={busy}
          />
        </label>
      </div>

      {athleteCount > 0 ? (
        <p className="admin-board__session-edit-hint">
          {ends
            ? t('admin.board.sessionEstimateEnds', { count: athleteCount, minutes: estimate, time: ends })
            : t('admin.board.sessionEstimate', { count: athleteCount, minutes: estimate })}
        </p>
      ) : null}

      <div className="admin-board__session-edit-actions">
        <Button type="submit" className="btn--small" disabled={busy}>
          {busy ? t('admin.board.savingSession') : t('admin.board.saveSession')}
        </Button>
        <button
          type="button"
          className="admin-board__text-btn"
          onClick={onCancel}
          disabled={busy}
        >
          {t('admin.board.cancelSessionEdit')}
        </button>
      </div>
    </form>
  )
}
