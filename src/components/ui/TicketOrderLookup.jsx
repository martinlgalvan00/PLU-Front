import { useState } from 'react'
import { LoaderCircle, Search } from 'lucide-react'
import Button from './Button.jsx'
import { Field } from './FormFields.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { getTicketsRouteOrderReference } from '../../lib/ticketsRoute.js'
import '../../styles/components/ticket-order-lookup.css'

/**
 * Recuperar una compra ya hecha, sin sesión: el link del mail de confirmación
 * cae acá con `?ref=` precargado. `onLookup` alimenta el mismo `createdOrder`
 * que una compra recién hecha (ver useAppData.js), así que encontrar la orden
 * alcanza para que la pantalla de al lado (TicketPurchaseSection) muestre el
 * QR con el render que ya existe -- esta pieza sólo resuelve la búsqueda.
 */
export default function TicketOrderLookup({ onLookup }) {
  const { t } = useI18n()
  const [initialReference] = useState(() => getTicketsRouteOrderReference() ?? '')
  const [open, setOpen] = useState(() => Boolean(initialReference))
  const [reference, setReference] = useState(initialReference)
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState(null)

  if (!onLookup) return null

  async function handleSubmit(event) {
    event.preventDefault()
    if (!reference.trim() || !email.trim() || submitting) return
    setSubmitting(true)
    setFeedback(null)
    try {
      const result = await onLookup(reference.trim(), email.trim())
      const status = result?.order?.status
      // 'aprobado' no necesita feedback propio: createdOrder ya se actualizó
      // y TicketPurchaseSection pasa a mostrar el QR en el próximo render.
      if (status === 'aprobado') return
      if (status === 'rechazado' || status === 'cancelado') {
        setFeedback({ tone: 'error', message: t('pages.tickets.lookup.rejected') })
        return
      }
      setFeedback({ tone: 'info', message: t('pages.tickets.lookup.pending') })
    } catch (error) {
      setFeedback({
        tone: 'error',
        message:
          error?.status === 404
            ? t('pages.tickets.lookup.notFound')
            : t('pages.tickets.lookup.genericError'),
      })
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) {
    return (
      <button type="button" className="ticket-order-lookup__toggle" onClick={() => setOpen(true)}>
        {t('pages.tickets.lookup.toggleLabel')}
      </button>
    )
  }

  return (
    <div className="ticket-order-lookup">
      <p className="ticket-order-lookup__title">{t('pages.tickets.lookup.title')}</p>
      <p className="ticket-order-lookup__lead">{t('pages.tickets.lookup.lead')}</p>
      <form className="ticket-order-lookup__form" onSubmit={handleSubmit}>
        <Field
          label={t('pages.tickets.lookup.referenceLabel')}
          name="lookup-reference"
          value={reference}
          onChange={(event) => setReference(event.target.value)}
          placeholder={t('pages.tickets.lookup.referencePlaceholder')}
          autoComplete="off"
        />
        <Field
          label={t('pages.tickets.lookup.emailLabel')}
          name="lookup-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder={t('pages.tickets.lookup.emailPlaceholder')}
          autoComplete="email"
          inputMode="email"
        />
        <Button type="submit" variant="secondary" disabled={submitting}>
          {submitting ? (
            <LoaderCircle size={15} aria-hidden className="is-spinning" />
          ) : (
            <Search size={15} aria-hidden />
          )}
          {submitting ? t('pages.tickets.lookup.submitting') : t('pages.tickets.lookup.submit')}
        </Button>
      </form>
      {feedback ? (
        <p
          className={`ticket-order-lookup__feedback ticket-order-lookup__feedback--${feedback.tone}`}
          role={feedback.tone === 'error' ? 'alert' : 'status'}
        >
          {feedback.message}
        </p>
      ) : null}
    </div>
  )
}
