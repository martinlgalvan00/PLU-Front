import { useEffect, useState } from 'react'
import { Banknote, CreditCard, Globe, Landmark } from 'lucide-react'
import { fetchEventPaymentInfo } from '../../../services/eventPaymentInfoService.js'
import CashPaymentPlace from '../../ui/CashPaymentPlace.jsx'
import BlockShell from './BlockShell.jsx'

const CHANNEL_ICON = {
  mercado_pago: CreditCard,
  bank_transfer: Landmark,
  cash_pitbull: Banknote,
  wise_transfer: Globe,
}

/**
 * "Cómo pagar": los medios que acepta la inscripción y, si hay efectivo,
 * dónde se paga con Google Maps y Waze. Se arma con los datos del evento (la
 * misma regla que el checkout), así la landing nunca promete un medio que
 * después no está. Sin datos todavía, el bloque no ocupa lugar.
 */
export default function CustomPaymentsBlock({ block, ctx }) {
  const { event, t } = ctx
  const { title, body } = block.props ?? {}
  const [info, setInfo] = useState(null)

  useEffect(() => {
    let alive = true
    fetchEventPaymentInfo(event?.slug)
      .then((result) => {
        if (alive) setInfo(result)
      })
      .catch(() => {
        if (alive) setInfo(null)
      })
    return () => {
      alive = false
    }
  }, [event?.slug])

  if (!info) return null
  const channels = info.registrationEnabled === false ? [] : (info.channels ?? [])

  return (
    <BlockShell
      id={block.id}
      type="payments"
      title={title || t('pages.eventBuilder.paymentsTitle')}
      lead={body || t('pages.eventBuilder.paymentsLead')}
    >
      {channels.length ? (
        <ul className="lb-payments">
          {channels.map((channel) => {
            const Icon = CHANNEL_ICON[channel] ?? CreditCard
            return (
              <li key={channel}>
                <Icon aria-hidden size={20} strokeWidth={1.6} />
                <div>
                  <strong>{t(`pages.eventBuilder.paymentsChannel.${channel}`)}</strong>
                  <span>{t(`pages.eventBuilder.paymentsChannelHint.${channel}`)}</span>
                </div>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="lb-prose">{t('pages.eventBuilder.paymentsClosed')}</p>
      )}
      {channels.includes('cash_pitbull') ? (
        <div className="lb-payments__cash">
          <CashPaymentPlace cashPayment={info.cashPayment} event={event} />
        </div>
      ) : null}
    </BlockShell>
  )
}
