import { useEffect, useMemo, useState } from 'react'
import Button from '../../ui/Button.jsx'
import SegmentedSwitch from '../../ui/SegmentedSwitch.jsx'

const signatureOf = (platforms) => platforms.map((item) => `${item.id}:${item.name}`).join('|')

/**
 * PlatformBar — PLU ARG
 *
 * Tablados del evento: cuántos son (uno o dos) y cómo se llaman. Sin tablados
 * cargados es la primera pregunta del tablero; con ellos, una fila compacta
 * para renombrar o sumar el segundo.
 *
 * Trabaja sobre un borrador: nada se guarda hasta apretar "Guardar tablados".
 * Bajar de dos a uno avisa qué tandas quedan sin tablado, porque quitar un
 * tablado nunca borra tandas ni mueve atletas.
 */
export default function PlatformBar({ busy = false, canEdit = false, onSave, platforms, t }) {
  const signature = signatureOf(platforms)
  const [draft, setDraft] = useState(() => platforms.map(({ id, name }) => ({ id, name })))
  const [dirty, setDirty] = useState(false)

  // El server manda: al releer se descarta el borrador salvo que haya edición
  // sin guardar. La firma (y no el array) evita re-sincronizar en cada render.
  useEffect(() => {
    if (dirty) return
    setDraft(platforms.map(({ id, name }) => ({ id, name })))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `signature` resume `platforms`
  }, [dirty, signature])

  const removed = useMemo(
    () => platforms.filter((item) => !draft.some((entry) => entry.id === item.id)),
    [draft, platforms],
  )

  const hasBlank = draft.some((entry) => !entry.name.trim())
  const lowerNames = draft.map((entry) => entry.name.trim().toLowerCase())
  const hasDuplicate = new Set(lowerNames).size !== lowerNames.length

  function defaultName(position) {
    return t('admin.board.platformDefaultName', { n: position + 1 })
  }

  async function saveCount(count) {
    const next = Array.from({ length: count }, (_, index) => ({
      ...(platforms[index] ? { id: platforms[index].id } : {}),
      name: platforms[index]?.name ?? defaultName(index),
    }))
    await onSave(next)
  }

  function changeCount(key) {
    const count = Number(key)
    setDirty(true)
    setDraft((current) =>
      Array.from({ length: count }, (_, index) => ({
        id: current[index]?.id,
        name: current[index]?.name ?? defaultName(index),
      })),
    )
  }

  function rename(index, name) {
    setDirty(true)
    setDraft((current) =>
      current.map((entry, position) => (position === index ? { ...entry, name } : entry)),
    )
  }

  async function handleSave(event) {
    event.preventDefault()
    if (busy || hasBlank || hasDuplicate) return
    const ok = await onSave(
      draft.map((entry) => ({
        ...(entry.id ? { id: entry.id } : {}),
        name: entry.name.trim(),
      })),
    )
    if (ok) setDirty(false)
  }

  if (platforms.length === 0) {
    return (
      <div className="admin-board__platform-setup" role="group" aria-labelledby="board-platform-q">
        <div className="admin-board__platform-setup-copy">
          <h2 className="admin-board__platform-setup-title" id="board-platform-q">
            {t('admin.board.platformsSetupTitle')}
          </h2>
          <p className="admin-board__platform-setup-lead">{t('admin.board.platformsSetupLead')}</p>
        </div>
        <div className="admin-board__platform-setup-actions">
          <Button type="button" disabled={!canEdit || busy} onClick={() => saveCount(1)}>
            {t('admin.board.platformsOne')}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!canEdit || busy}
            onClick={() => saveCount(2)}
          >
            {t('admin.board.platformsTwo')}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <form
      className="admin-board__platform-bar"
      onSubmit={handleSave}
      aria-label={t('admin.board.platformsLabel')}
    >
      <div className="admin-board__platform-bar-count">
        <span className="admin-board__platform-bar-label">{t('admin.board.platformsLabel')}</span>
        {canEdit ? (
          <SegmentedSwitch
            active={String(draft.length)}
            ariaLabel={t('admin.board.platformsCountAria')}
            className="admin-board__platform-switch"
            onChange={changeCount}
            options={[
              ['1', t('admin.board.platformsOne')],
              ['2', t('admin.board.platformsTwo')],
            ]}
          />
        ) : null}
      </div>

      <div className="admin-board__platform-bar-names">
        {draft.map((entry, index) => (
          <label className="admin-board__platform-field" key={entry.id ?? `new-${index}`}>
            <span className="visually-hidden">
              {t('admin.board.platformNameLabel', { n: index + 1 })}
            </span>
            <input
              type="text"
              maxLength={80}
              value={entry.name}
              onChange={(event) => rename(index, event.target.value)}
              disabled={!canEdit || busy}
              aria-invalid={!entry.name.trim() || undefined}
            />
          </label>
        ))}
      </div>

      {canEdit && dirty ? (
        <div className="admin-board__platform-bar-actions">
          <Button
            type="submit"
            className="btn--small"
            disabled={busy || hasBlank || hasDuplicate}
          >
            {busy ? t('admin.board.platformsSaving') : t('admin.board.platformsSave')}
          </Button>
        </div>
      ) : null}

      {removed.length > 0 ? (
        <p className="admin-board__platform-warning" role="status">
          {t('admin.board.platformsRemoveWarning', {
            names: removed.map((item) => item.name).join(', '),
          })}
        </p>
      ) : null}
    </form>
  )
}
