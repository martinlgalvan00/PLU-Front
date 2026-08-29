import { StatusBadge } from './AdminDataTable.jsx'
import Pill from '../ui/Pill.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { actorLabel, formatStateDateTime, resolvePaymentReasonKeys } from '../../lib/stateProvenance.js'
import { isPlaceholderReason } from '../../services/stateCoherenceService.js'

/**
 * AdminStateCell — PLU ARG
 *
 * Un estado, con el motivo por el que es ese estado.
 *
 * Por qué existe: la ficha del atleta pintaba `<StatusBadge value={row.status} />`
 * y nada más. Un "Cancelado" rojo, solo, tapa cinco cosas que no tienen nada
 * que ver entre sí para quien atiende el reclamo -- venció sin que nadie pagara,
 * la tarjeta rechazó, lo cerró un operador, se reemplazó por un cobro nuevo, o
 * el cobro murió y la afiliación se otorgó igual por transferencia.
 *
 * Lo llamativo es que el dato ya existía y ya se mostraba: /mi-cuenta explica el
 * motivo al atleta desde `derivePaymentProgress` (ver PaymentsSection.jsx). El
 * panel leía un snapshot recortado que no traía las columnas necesarias, así que
 * el operador veía menos que la persona que le estaba reclamando.
 *
 * Misma jerarquía que la lista editorial del atleta -- badge arriba, motivo como
 * línea secundaria debajo -- y no un tooltip: en una tabla operativa el motivo
 * tiene que poder leerse de corrido y encontrarse con Ctrl+F, no aparecer sólo
 * al pasar el mouse (que en mobile no existe).
 */

const ADMIN_PAYMENT_NAMESPACE = 'admin.paymentState'

/**
 * Estado de un cobro en la ficha del atleta.
 *
 * El estado que se pinta es `progress.state` (el agregado de la orden más su
 * libro de intentos), no `order.status` crudo: son distintos justamente en los
 * casos que importan -- una orden con un intento acreditado que el agregado
 * todavía no refleja se muestra "Acreditando", nunca "Rechazado".
 */
export function PaymentStateCell({ payment }) {
  const { locale, t } = useI18n()
  const progress = payment?.progress ?? null

  if (!progress) {
    return <StatusBadge value={payment?.status} />
  }

  const keys = resolvePaymentReasonKeys(progress, {
    namespace: ADMIN_PAYMENT_NAMESPACE,
    locale,
  })

  let reason = null
  if (keys?.text) {
    reason = keys.text
  } else if (keys?.key) {
    const translated = t(keys.key, keys.params)
    if (translated !== keys.key) {
      reason = translated
      if (keys.attemptKey) {
        const attemptText = t(keys.attemptKey)
        if (attemptText !== keys.attemptKey) reason = `${translated} ${attemptText}`
      }
    }
  }

  return (
    <div className="admin-state-cell">
      {/* `Pill` y no `StatusBadge`: el estado de acá es el derivado
          (`progress.state`), que trae su propio vocabulario y su propio tono ya
          resueltos. `StatusBadge` resuelve tono y label desde un status de
          dominio -- lo correcto para las otras dos celdas, no para ésta. */}
      <Pill tone={progress.tone}>{t(`admin.paymentState.state.${progress.state}`)}</Pill>
      {reason ? <p className="admin-state-cell__reason">{reason}</p> : null}
      {/* El cobro murió y el derecho quedó otorgado igual: sin decirlo, la ficha
          se contradice sola entre dos tabs.

          Pero sólo cuando el motivo no lo dijo ya. Con `resolved_off_platform`
          el motivo es "el derecho se otorgó a mano, no corresponde acreditar
          esta orden" y esta nota agregaba "quedó activa por otra vía, no hay que
          volver a cobrar" -- la misma frase dos veces, duplicando el alto de la
          fila en una tabla que se lee comparando filas. */}
      {progress.resolvedElsewhere && progress.reasonCode !== 'resolved_off_platform' ? (
        <p className="admin-state-cell__note">
          {t(`admin.paymentState.resolvedElsewhere.${progress.outcome?.kind ?? 'membership'}`)}
        </p>
      ) : null}
    </div>
  )
}

/**
 * Estado de un derecho (afiliación o inscripción) con su procedencia.
 *
 * `backing` viene de `resolveStateBacking`. Cuando el estado lo puso una
 * persona, la fila lo dice con nombre y fecha: es lo que convierte "Activa" en
 * "Activa porque alguien decidió que sí, el 20/08, por este motivo".
 *
 * `badge` es para las listas que ya acompañaban el estado con otra marca (el
 * "inscripto a un torneo" de Afiliaciones): va al lado del badge de estado, no
 * debajo, porque es otro hecho del socio y no una explicación del estado.
 */
export function EntitlementStateCell({ status, backing, badge = null }) {
  const { locale, t } = useI18n()
  const manual = backing?.manualOverride ?? null

  const head = badge ? (
    <div className="admin-state-cell__head">
      <StatusBadge value={status} />
      {badge}
    </div>
  ) : (
    <StatusBadge value={status} />
  )

  if (!manual) {
    return head
  }

  const actor = actorLabel(manual.by) ?? t('admin.paymentState.manual.unknownActor')
  const when = formatStateDateTime(manual.at, locale) ?? '—'
  const placeholder = isPlaceholderReason(manual.reason)
  const channelLabel = manual.channel
    ? t(`admin.paymentState.manual.channel.${manual.channel}`)
    : null
  // Firma corta en la fila; el mail completo vive en `title` (hover) y en un
  // span oculto para Ctrl+F / lectores, sin estirar la celda.
  const stampShort = t('admin.paymentState.manual.stampShort', { date: when })
  const stampFull = t('admin.paymentState.manual.stamp', { actor, date: when })
  const metaTitle = channelLabel ? `${stampFull} · ${channelLabel}` : stampFull
  const noteText = placeholder ? t('admin.paymentState.manual.missingReason') : manual.reason

  return (
    <div className="admin-state-cell">
      {head}
      <div className="admin-state-cell__provenance">
        <p className="admin-state-cell__reason" title={metaTitle}>
          <span className="admin-state-cell__stamp">
            {stampShort}
            {channelLabel ? ` · ${channelLabel}` : ''}
          </span>
          <span className="admin-state-cell__actor-search">{actor}</span>
        </p>
        <p
          className={
            placeholder
              ? 'admin-state-cell__note admin-state-cell__note--gap'
              : 'admin-state-cell__note admin-state-cell__note--written'
          }
          title={noteText}
        >
          {noteText}
        </p>
      </div>
    </div>
  )
}
