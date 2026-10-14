import { useState } from 'react'
import { X } from 'lucide-react'
import Button from '../ui/Button.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'

/**
 * Barra contextual de Usuarios: aparece cuando hay cuentas tildadas y deja
 * cambiarles el rol a todas de una vez. Usa el estilo de la barra de Atletas.
 *
 * Cambiar un rol corta las sesiones abiertas de la cuenta, así que el cambio
 * pasa por una confirmación explícita en vez de aplicarse al elegir el rol.
 * Qué pasó con cada cuenta lo resuelve y lo informa quien la monta
 * (`onApply` devuelve cuando terminó; si lanza, el mensaje se muestra acá).
 */
export default function UsersBulkRoleBar({
  count,
  onApply,
  onClear,
  roleOptions = [],
}) {
  const { t } = useI18n()
  const [roleKey, setRoleKey] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (count === 0) return null

  const roleLabel = roleOptions.find(([value]) => value === roleKey)?.[1] ?? ''

  function reset() {
    setRoleKey('')
    setConfirming(false)
    setError('')
  }

  async function handleConfirm() {
    if (!roleKey || busy) return
    setBusy(true)
    setError('')
    try {
      await onApply(roleKey)
      reset()
    } catch (err) {
      setError(err?.message || t('admin.users.bulk.error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="admin-athletes-bulk" role="region" aria-label={t('admin.users.bulk.label')}>
      <div className="admin-athletes-bulk__row">
        <p
          className="admin-athletes-bulk__count"
          aria-label={t('admin.users.bulk.selectedCount', { count })}
        >
          <strong>{count}</strong>
          <span>{t('admin.users.bulk.selectedLabel')}</span>
        </p>

        <button
          type="button"
          className="admin-athletes-bulk__dismiss"
          disabled={busy}
          onClick={() => {
            reset()
            onClear()
          }}
          aria-label={t('admin.users.bulk.clear')}
        >
          <X size={15} aria-hidden />
        </button>
      </div>

      <div className="admin-athletes-bulk__panel">
        <label className="admin-athletes-bulk__field admin-athletes-bulk__field--grow">
          <span>{t('admin.users.bulk.changeTo')}</span>
          <select
            name="bulk-role"
            value={roleKey}
            disabled={busy}
            onChange={(event) => {
              setRoleKey(event.target.value)
              setConfirming(false)
              setError('')
            }}
          >
            <option value="">{t('admin.users.bulk.choose')}</option>
            {roleOptions.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <Button
          type="button"
          disabled={busy || !roleKey || confirming}
          onClick={() => setConfirming(true)}
        >
          {t('admin.users.bulk.apply', { count })}
        </Button>
      </div>

      {confirming ? (
        <div className="admin-athletes-bulk__panel admin-athletes-bulk__panel--confirm">
          <p>
            <strong>{t('admin.users.bulk.confirmTitle', { count, role: roleLabel })}</strong>{' '}
            {t('admin.users.bulk.confirmBody')}
          </p>
          <Button type="button" disabled={busy} onClick={() => void handleConfirm()}>
            {busy ? t('admin.users.bulk.applying') : t('admin.users.bulk.confirm')}
          </Button>
          <button
            type="button"
            className="admin-athletes-bulk__text-btn"
            disabled={busy}
            onClick={() => setConfirming(false)}
          >
            {t('admin.users.bulk.back')}
          </button>
        </div>
      ) : null}

      {error ? (
        <p className="admin-athletes-bulk__result" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
