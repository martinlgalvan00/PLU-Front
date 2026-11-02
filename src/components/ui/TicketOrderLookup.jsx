import { useEffect, useRef, useState } from 'react'
import { LoaderCircle, Search } from 'lucide-react'
import Button from './Button.jsx'
import { Field } from './FormFields.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { getTicketsRouteOpenKey, getTicketsRouteOrderReference } from '../../lib/ticketsRoute.js'
import '../../styles/components/ticket-order-lookup.css'

/**
 * Recuperar una compra ya hecha, sin sesión: el link del mail de confirmación
 * cae acá con `?ref=` y, si el mail lo firmó, `?k=` abre el QR solo.
 * `onLookup` alimenta el mismo `createdOrder`
 * que una compra recién hecha (ver useAppData.js), así que encontrar la orden
 * alcanza para que la pantalla de al lado (TicketPurchaseSection) muestre el
 * QR con el render que ya existe -- esta pieza sólo resuelve la búsqueda.
 */
export default function TicketOrderLookup({ onLookup, onResend }) {
  const { t } = useI18n()
  const [initialReference] = useState(() => getTicketsRouteOrderReference() ?? '')
  const [openKey] = useState(() => getTicketsRouteOpenKey() ?? '')
  const [open, setOpen] = useState(() => Boolean(initialReference))
  const [reference, setReference] = useState(initialReference)
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [resending, setResending] = useState(false)
  const [matched, setMatched] = useState(null)
  const [feedback, setFeedback] = useState(null)
  const lookupRef = useRef(onLookup)
  const onResendRef = useRef(onResend)
  lookupRef.current = onLookup
  onResendRef.current = onResend

  function settleLookup(result, identity) {
    const status = result?.order?.status
    if (status === 'aprobado') {
      if (onResendRef.current) setMatched(identity)
      return
    }
    setMatched(null)
    if (status === 'rechazado' || status === 'cancelado') {
      setFeedback({ tone: 'error', message: t('pages.tickets.lookup.rejected') })
      return
    }
    setFeedback({ tone: 'info', message: t('pages.tickets.lookup.pending') })
  }

  function failLookup(error) {
    setMatched(null)
    setFeedback({
      tone: 'error',
      message:
        error?.status === 404
          ? t('pages.tickets.lookup.notFound')
          : t('pages.tickets.lookup.genericError'),
    })
  }

  useEffect(() => {
    const lookup = lookupRef.current
    if (!openKey || !initialReference || !lookup) return undefined
    let active = true
    setSubmitting(true)
    lookup(initialReference, '', { openKey })
      .then((result) => {
        if (active) {
          settleLookup(result, { reference: initialReference, email: '', openKey })
        }
      })
      .catch((error) => {
        if (active) failLookup(error)
      })
      .finally(() => {
        if (active) setSubmitting(false)
      })
    return () => {
      active = false
    }
    // La firma y la referencia salen de la URL: una sola apertura.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialReference, openKey])

  if (!onLookup) return null

  async function handleSubmit(event) {
    event.preventDefault()
    if (!reference.trim() || !email.trim() || submitting) return
    setSubmitting(true)
    setFeedback(null)
    try {
      const result = await onLookup(reference.trim(), email.trim())
      settleLookup(result, { reference: reference.trim(), email: email.trim(), openKey: '' })
    } catch (error) {
      failLookup(error)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleResend() {
    if (!matched || !onResend || resending) return
    if (!matched.email && !matched.openKey) return
    setResending(true)
    setFeedback(null)
    try {
      const result = await onResend(matched.reference, matched.email, { openKey: matched.openKey })
      const already = result?.status === 'already'
      setFeedback({
        tone: 'info',
        message: t(already ? 'pages.tickets.lookup.already' : 'pages.tickets.lookup.resent'),
      })
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: error?.message || t('pages.tickets.lookup.resendFailed'),
      })
    } finally {
      setResending(false)
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
        {matched && onResend ? (
          <Button type="button" variant="secondary" disabled={resending} onClick={() => void handleResend()}>
            {resending ? t('pages.tickets.lookup.resending') : t('pages.tickets.lookup.resend')}
          </Button>
        ) : null}
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
