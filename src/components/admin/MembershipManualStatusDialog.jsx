import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { BadgeCheck, Ban } from 'lucide-react'
import Button from '../ui/Button.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { MANUAL_OVERRIDE_CHANNELS } from '../../lib/constants.js'

/**
 * MembershipManualStatusDialog — PLU ARG
 *
 * Activar o dar de baja una afiliación a mano, diciendo por qué.
 *
 * Antes esto era un botón de un click. El resultado, en la base al momento de
 * escribir esto: tres afiliaciones activas sobre órdenes de Mercado Pago
 * canceladas, ninguna con un motivo registrado en ningún lado. La ficha del
 * atleta mostraba "Afiliación: Activa" y "Pago: Cancelado" sin nada que
 * explicara la diferencia, y la única forma de reconstruirla era leer
 * `domain_audit_logs` -- que sólo dice quién y cuándo, porque el por qué nunca
 * se pidió.
 *
 * El equivalente para inscripciones (`staff_set_registration_status`) exige
 * motivo desde agosto, y por eso sus tres casos análogos SÍ se pueden explicar
 * ("RECIBÍ EL PAGO Y TODA LA INFORMACIÓN CORRECTAMENTE"). Esta pantalla cierra
 * esa asimetría.
 *
 * El canal se pide sólo al activar: es el que atribuye la plata que entró por
 * fuera de la plataforma, y Finanzas lo necesita para agregar. Dar de baja no
 * atribuye plata a ningún canal, así que ahí alcanza el motivo escrito.
 *
 * Reusa el shell visual de `AdminDeleteConfirmDialog` (mismas clases, mismo
 * tema claro/oscuro) en vez de un modal nuevo: es el mismo objeto de la interfaz
 * -- una decisión irreversible que pide confirmación -- con otro contenido.
 */

const MIN_REASON_LENGTH = 3

export default function MembershipManualStatusDialog({
  athleteName,
  busy = false,
  error = '',
  onCancel,
  onConfirm,
  status,
}) {
  const { t } = useI18n()
  const titleId = useId()
  const descriptionId = useId()
  const channelId = useId()
  const reasonId = useId()
  const panelRef = useRef(null)
  const [channel, setChannel] = useState('')
  const [reason, setReason] = useState('')

  const activating = status === 'activa'
  const trimmedReason = reason.trim()
  const canConfirm =
    trimmedReason.length >= MIN_REASON_LENGTH && (!activating || Boolean(channel))

  // El shell de borrado atrapa el foco sobre `button, input`. Acá el formulario
  // tiene un select y un textarea, así que el ciclo se arma sobre todos los
  // controles: sin esto el Tab se escapa del modal al llegar al motivo.
  const dialogStateRef = useRef({ busy, onCancel })
  dialogStateRef.current = { busy, onCancel }

  useEffect(() => {
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // Foco en el primer campo y no en un botón: lo que se espera del operador
    // acá es que escriba, no que confirme.
    panelRef.current?.querySelector('select, textarea')?.focus()

    function handleKeyDown(event) {
      if (event.key === 'Escape' && !dialogStateRef.current.busy) {
        event.preventDefault()
        dialogStateRef.current.onCancel()
        return
      }
      if (event.key !== 'Tab') return
      const focusable =
        panelRef.current?.querySelectorAll(
          'button:not(:disabled), select:not(:disabled), textarea:not(:disabled)',
        ) ?? []
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
      previousFocus?.focus?.()
    }
  }, [])

  const ConfirmIcon = activating ? BadgeCheck : Ban

  return createPortal(
    <div className="admin-user-delete-dialog">
      <button
        type="button"
        className="admin-user-delete-dialog__backdrop"
        aria-label={t('admin.sections.memberships.manual.close')}
        disabled={busy}
        onClick={onCancel}
      />
      <section
        ref={panelRef}
        className="admin-user-delete-dialog__panel membership-manual-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <span className="admin-user-delete-dialog__icon" aria-hidden>
          <ConfirmIcon size={19} />
        </span>
        <div className="admin-user-delete-dialog__copy">
          <h2 id={titleId}>
            {t(
              activating
                ? 'admin.sections.memberships.manual.activateTitle'
                : 'admin.sections.memberships.manual.cancelTitle',
            )}
          </h2>
          <p id={descriptionId}>
            {t(
              activating
                ? 'admin.sections.memberships.manual.activateDescription'
                : 'admin.sections.memberships.manual.cancelDescription',
              { athlete: athleteName ?? '' },
            )}
          </p>

          {activating ? (
            <div className="membership-manual-dialog__field">
              <label htmlFor={channelId}>
                {t('admin.sections.memberships.manual.channelLabel')}
              </label>
              <select
                id={channelId}
                value={channel}
                disabled={busy}
                onChange={(event) => setChannel(event.target.value)}
              >
                <option value="">
                  {t('admin.sections.memberships.manual.channelPlaceholder')}
                </option>
                {MANUAL_OVERRIDE_CHANNELS.map((value) => (
                  <option key={value} value={value}>
                    {t(`admin.paymentState.manual.channel.${value}`)}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div className="membership-manual-dialog__field">
            <label htmlFor={reasonId}>{t('admin.sections.memberships.manual.reasonLabel')}</label>
            <textarea
              id={reasonId}
              value={reason}
              disabled={busy}
              maxLength={500}
              rows={3}
              placeholder={t('admin.sections.memberships.manual.reasonPlaceholder')}
              onChange={(event) => setReason(event.target.value)}
            />
            <small>{t('admin.sections.memberships.manual.reasonHint')}</small>
          </div>

          {/* Al activar: la orden de Mercado Pago no se toca -- activar a mano
              no fabrica un ingreso. Decirlo acá evita que alguien espere ver el
              pago en verde después de confirmar, y que lo intente "arreglar".
              Al dar de baja: la consecuencia inmediata es en la puerta. */}
          <p className="admin-user-delete-dialog__warning">
            {t(
              activating
                ? 'admin.sections.memberships.manual.orderNotice'
                : 'admin.sections.memberships.cancelConfirmWarning',
            )}
          </p>

          {error ? (
            <p className="admin-user-delete-dialog__error" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <div className="admin-user-delete-dialog__actions">
          <Button type="button" variant="secondary" disabled={busy} onClick={onCancel}>
            {t('admin.sections.memberships.manual.back')}
          </Button>
          <Button
            type="button"
            disabled={busy || !canConfirm}
            onClick={() => onConfirm({ reason: trimmedReason, channel: channel || null })}
          >
            {busy ? (
              <span className="plu-spinner plu-spinner--sm" aria-hidden="true" />
            ) : (
              <ConfirmIcon size={15} aria-hidden />
            )}
            {busy
              ? t('admin.sections.memberships.applying')
              : t(
                  activating
                    ? 'admin.sections.memberships.manual.confirmActivate'
                    : 'admin.sections.memberships.manual.confirmCancel',
                )}
          </Button>
        </div>
      </section>
    </div>,
    document.body,
  )
}
