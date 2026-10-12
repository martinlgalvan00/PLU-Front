import { useEffect, useId, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, m } from 'motion/react'
import { ArrowRight, Check, X } from 'lucide-react'
import { CONTACT_EMAIL } from '../../lib/contact.js'
import { money } from '../../lib/format.js'
import { useMotionConfig } from '../../motion/MotionProvider.tsx'
import { drawerBackdropTransition, drawerTransition } from '../../motion/variants.ts'
import { submitContactMessage } from '../../services/contactService.js'

function formatCourseDate(value, locale) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString(locale === 'en' ? 'en-US' : 'es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Consulta de un producto o de una inscripción. Hoy la tienda no cobra online:
 * el pedido llega como un mail a PLU (mismo canal que Contacto) y el equipo
 * coordina el pago y la entrega. Nada acá confirma una compra.
 */
function InquiryForm({ isCourse, product, size, t }) {
  const prefill = isCourse
    ? t('pages.shop.catalog.inquiry.messageCourse', { title: product.title })
    : t('pages.shop.catalog.inquiry.messageProduct', {
        title: product.title,
        size: size ? t('pages.shop.catalog.inquiry.messageSize', { size }) : '',
      })
  const [open, setOpen] = useState(false)
  const [touched, setTouched] = useState(false)
  const [message, setMessage] = useState(prefill)
  const [status, setStatus] = useState('idle') // idle | sending | sent | error

  // El talle elegido se refleja en el mensaje mientras la persona no lo haya editado.
  useEffect(() => {
    if (!touched) setMessage(prefill)
  }, [prefill, touched])

  async function handleSubmit(event) {
    event.preventDefault()
    if (status === 'sending') return
    const data = new FormData(event.currentTarget)
    setStatus('sending')
    try {
      await submitContactMessage({
        name: data.get('name')?.toString().trim() ?? '',
        email: data.get('email')?.toString().trim() ?? '',
        message: message.trim(),
        motive: isCourse ? 'curso' : 'tienda',
      })
      setStatus('sent')
    } catch {
      setStatus('error')
    }
  }

  if (status === 'sent') {
    return (
      <div className="shop-drawer__sent" role="status" aria-live="polite">
        <span className="shop-drawer__sent-icon" aria-hidden>
          <Check size={16} strokeWidth={2.4} />
        </span>
        <div>
          <strong>{t('contact.sentTitle')}</strong>
          <p>{t('contact.sentDesc')}</p>
        </div>
      </div>
    )
  }

  if (!open) {
    return (
      <div className="shop-drawer__inquire">
        <p>{isCourse ? t('pages.shop.catalog.enrollLead') : t('pages.shop.catalog.inquireLead')}</p>
        <button type="button" className="shop-cta" onClick={() => setOpen(true)}>
          <span>{isCourse ? t('pages.shop.catalog.enroll') : t('pages.shop.catalog.inquire')}</span>
          <ArrowRight size={15} aria-hidden />
        </button>
      </div>
    )
  }

  return (
    <form className="shop-drawer__form" onSubmit={handleSubmit}>
      <label>
        <span>{t('contact.name')}</span>
        <input name="name" autoComplete="name" required disabled={status === 'sending'} />
      </label>
      <label>
        <span>{t('contact.email')}</span>
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          disabled={status === 'sending'}
        />
      </label>
      <label>
        <span>{t('contact.message')}</span>
        <textarea
          rows={4}
          required
          value={message}
          disabled={status === 'sending'}
          onChange={(event) => {
            setTouched(true)
            setMessage(event.target.value)
          }}
        />
      </label>
      <button type="submit" className="shop-cta" disabled={status === 'sending'}>
        <span>{status === 'sending' ? t('contact.submitting') : t('contact.submit')}</span>
        <ArrowRight size={15} aria-hidden />
      </button>
      {status === 'error' ? (
        <p className="shop-drawer__error" role="alert">
          <strong>{t('contact.errorTitle')}</strong>{' '}
          {t('contact.errorDesc', { email: CONTACT_EMAIL })}
        </p>
      ) : null}
    </form>
  )
}

/**
 * Acción principal del producto: sumarlo al pedido. El talle es obligatorio
 * cuando el producto lo tiene. Al agregar, se ofrece ir al pedido o seguir
 * mirando; el precio y el stock finales los fija el servidor al confirmar.
 */
function AddToOrder({ isCourse, needsSize, onAdd, onClose, onViewOrder, size, t }) {
  const k = 'pages.shop.checkout'
  // Qué talle (o `null`, sin talle) se agregó último; `undefined` = nada todavía.
  // Cambiar de talle después de agregar vuelve a habilitar la acción.
  const [addedSize, setAddedSize] = useState(undefined)
  const [triedWithoutSize, setTriedWithoutSize] = useState(false)
  const currentSize = size || null

  if (addedSize !== undefined && addedSize === currentSize) {
    return (
      <div className="shop-drawer__added" role="status" aria-live="polite">
        <p>
          <Check size={15} strokeWidth={2.4} aria-hidden /> {t(`${k}.added`)}
        </p>
        <div className="shop-drawer__added-actions">
          <button type="button" className="shop-cta" onClick={onViewOrder}>
            <span>{t(`${k}.viewOrder`)}</span>
            <ArrowRight size={15} aria-hidden />
          </button>
          <button type="button" className="shop-link" onClick={onClose}>
            {t(`${k}.keepBrowsing`)}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="shop-drawer__add">
      <button
        type="button"
        className="shop-cta"
        onClick={() => {
          if (needsSize && !currentSize) {
            setTriedWithoutSize(true)
            return
          }
          onAdd(currentSize)
          setAddedSize(currentSize)
        }}
      >
        <span>{isCourse ? t(`${k}.addCourse`) : t(`${k}.add`)}</span>
        <ArrowRight size={15} aria-hidden />
      </button>
      {triedWithoutSize && needsSize && !currentSize ? (
        <p className="shop-drawer__error" role="alert">
          {t(`${k}.chooseSizeFirst`)}
        </p>
      ) : null}
    </div>
  )
}

function DrawerBody({ locale, onAddToCart, onClose, onViewOrder, product, t }) {
  const titleId = useId()
  const isCourse = product.category === 'course'
  const images = product.imageUrls ?? []
  const [imageIndex, setImageIndex] = useState(0)
  const [size, setSize] = useState('')
  const sizes = product.sizes ?? []
  const course = product.course

  return (
    <>
      <button
        type="button"
        className="shop-drawer__close"
        aria-label={t('pages.shop.catalog.close')}
        onClick={onClose}
      >
        <X size={18} aria-hidden />
      </button>

      {images.length > 0 ? (
        <div className="shop-drawer__gallery" aria-label={t('pages.shop.catalog.gallery')}>
          <div className="shop-drawer__stage">
            <img src={images[imageIndex]} alt={product.title} />
          </div>
          {images.length > 1 ? (
            <ul className="shop-drawer__thumbs">
              {images.map((url, index) => (
                <li key={url}>
                  <button
                    type="button"
                    aria-current={index === imageIndex ? 'true' : undefined}
                    aria-label={`${product.title} ${index + 1}`}
                    onClick={() => setImageIndex(index)}
                  >
                    <img src={url} alt="" loading="lazy" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="shop-drawer__info" aria-labelledby={titleId}>
        {product.event ? (
          <p className="shop-drawer__kicker">
            {t('pages.shop.catalog.forTournament')} · {product.event.title}
          </p>
        ) : (
          <p className="shop-drawer__kicker">
            {t(
              `pages.shop.catalog.tabs.${product.category === 'accessories' ? 'apparel' : product.category}`,
            )}
          </p>
        )}
        <h2 id={titleId} className="shop-drawer__title">
          {product.title}
        </h2>
        <p className="shop-drawer__price">{money(product.price, locale)}</p>
        {product.editionNote ? <p className="shop-drawer__edition">{product.editionNote}</p> : null}
        {product.description ? <p className="shop-drawer__desc">{product.description}</p> : null}

        {isCourse && course ? (
          <dl className="shop-drawer__facts">
            {course.startsAt ? (
              <div>
                <dt>{t('pages.shop.catalog.course.starts')}</dt>
                <dd>{formatCourseDate(course.startsAt, locale)}</dd>
              </div>
            ) : null}
            {course.modality ? (
              <div>
                <dt>{t('pages.shop.catalog.course.modalityLabel')}</dt>
                <dd>{t(`pages.shop.catalog.course.modality.${course.modality}`)}</dd>
              </div>
            ) : null}
            {course.location ? (
              <div>
                <dt>{t('pages.shop.catalog.course.location')}</dt>
                <dd>{course.location}</dd>
              </div>
            ) : null}
            {course.capacity ? (
              <div>
                <dt>{t('pages.shop.catalog.course.capacityLabel')}</dt>
                <dd>{t('pages.shop.catalog.course.capacity', { count: course.capacity })}</dd>
              </div>
            ) : null}
          </dl>
        ) : null}

        {!isCourse && sizes.length > 0 ? (
          <fieldset className="shop-drawer__sizes">
            <legend>{t('pages.shop.catalog.sizeLabel')}</legend>
            <div role="radiogroup" aria-label={t('pages.shop.catalog.chooseSize')}>
              {sizes.map((entry) => (
                <button
                  key={entry.label}
                  type="button"
                  role="radio"
                  aria-checked={size === entry.label}
                  disabled={!entry.inStock}
                  title={entry.inStock ? undefined : t('pages.shop.catalog.sizeSoldOut')}
                  className="shop-drawer__size"
                  onClick={() => setSize(entry.label)}
                >
                  {entry.label}
                </button>
              ))}
            </div>
          </fieldset>
        ) : null}

        {!product.inStock ? (
          <p className="shop-drawer__soldout">
            {isCourse ? t('pages.shop.catalog.course.full') : t('pages.shop.catalog.soldOut')}
          </p>
        ) : (
          <>
            {onAddToCart ? (
              <AddToOrder
                isCourse={isCourse}
                needsSize={!isCourse && sizes.length > 0}
                size={size}
                t={t}
                onAdd={(chosenSize) => onAddToCart(product, { sizeLabel: chosenSize })}
                onClose={onClose}
                onViewOrder={onViewOrder}
              />
            ) : null}
            <InquiryForm isCourse={isCourse} product={product} size={size} t={t} />
          </>
        )}
      </div>
    </>
  )
}

/** Cajón lateral con el detalle de un producto o curso y su consulta. */
export default function ShopProductDrawer({
  locale,
  onAddToCart,
  onClose,
  onViewOrder,
  open,
  product,
  t,
}) {
  const { reducedMotion } = useMotionConfig()

  useEffect(() => {
    if (!open) return undefined
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.()
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onClose])

  return createPortal(
    <AnimatePresence>
      {open && product ? (
        <>
          <m.button
            type="button"
            className="shop-drawer__backdrop"
            aria-label={t('pages.shop.catalog.close')}
            onClick={onClose}
            initial={reducedMotion ? false : 'hidden'}
            animate="visible"
            exit="exit"
            variants={drawerBackdropTransition}
          />
          <m.aside
            className="shop-drawer"
            role="dialog"
            aria-modal="true"
            aria-label={product.title}
            initial={reducedMotion ? false : 'hidden'}
            animate="visible"
            exit="exit"
            variants={drawerTransition}
          >
            <DrawerBody
              key={product.id}
              locale={locale}
              onAddToCart={onAddToCart}
              onClose={onClose}
              onViewOrder={onViewOrder}
              product={product}
              t={t}
            />
          </m.aside>
        </>
      ) : null}
    </AnimatePresence>,
    document.body,
  )
}
