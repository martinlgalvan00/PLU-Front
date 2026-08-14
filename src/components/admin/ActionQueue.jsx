import { useMemo, useState } from 'react'
import { ArrowRight, BadgeCheck, ClipboardList, CreditCard, Eye, Ticket } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import PaymentValidationDialog from './PaymentValidationDialog.jsx'

const PRIORITY_ORDER = ['high', 'medium', 'low']

const TYPE_ICONS = {
  payment: CreditCard,
  registration: ClipboardList,
  membership: BadgeCheck,
  ticket_order: Ticket,
}

function itemHasProof(item) {
  const path = typeof item?.paymentProofPath === 'string' ? item.paymentProofPath.trim() : item?.paymentProofPath
  return Boolean(item?.hasProof || path)
}

export default function ActionQueue({
  compact = false,
  embedded = false,
  showGroupHeads = true,
  showHeader = true,
  items = [],
  onNavigate,
  onApprovePayment,
  onRejectPayment,
  onApproveTicketOrder,
  onRejectTicketOrder,
  canEdit,
}) {
  const { t } = useI18n()
  const [reviewItem, setReviewItem] = useState(null)
  const [reviewMode, setReviewMode] = useState('validate')
  const [confirmBusy, setConfirmBusy] = useState(false)
  const [confirmError, setConfirmError] = useState('')

  const groups = useMemo(
    () =>
      PRIORITY_ORDER.map((priority) => ({
        priority,
        items: items.filter((item) => item.priority === priority),
      })).filter((group) => group.items.length > 0),
    [items],
  )

  const panelClass = [
    'action-queue',
    embedded ? 'action-queue--drawer' : 'surface-card surface-card--flat',
    compact ? 'action-queue--compact' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const Wrapper = embedded ? 'div' : 'section'

  function openReview(item, mode = 'validate') {
    setConfirmError('')
    setReviewMode(mode)
    setReviewItem(item)
  }

  function closeReview() {
    if (confirmBusy) return
    setReviewItem(null)
    setReviewMode('validate')
    setConfirmError('')
  }

  function openItem(item) {
    if (item.paymentId || item.orderId) {
      openReview(item, 'view')
      return
    }
    onNavigate?.(item.section, item.paymentId ?? item.orderId ?? null)
  }

  async function confirmReview() {
    if (!reviewItem || confirmBusy || reviewMode === 'view') return
    setConfirmBusy(true)
    setConfirmError('')
    try {
      let result
      if (reviewItem.paymentId) {
        result = await onApprovePayment?.(reviewItem.paymentId)
      } else if (reviewItem.orderId) {
        result = await onApproveTicketOrder?.(reviewItem.orderId)
      }
      if (result?.error) {
        setConfirmError(result.error)
        return
      }
      setReviewItem(null)
      setReviewMode('validate')
    } catch (error) {
      setConfirmError(error?.message ?? t('admin.paymentValidation.confirmError'))
    } finally {
      setConfirmBusy(false)
    }
  }

  async function rejectReview(reason) {
    if (!reviewItem || confirmBusy || reviewMode === 'view') return
    setConfirmBusy(true)
    setConfirmError('')
    try {
      let result
      if (reviewItem.paymentId) {
        result = await onRejectPayment?.(reviewItem.paymentId, reason)
      } else if (reviewItem.orderId) {
        result = await onRejectTicketOrder?.(reviewItem.orderId, reason)
      }
      if (result?.error) {
        setConfirmError(result.error)
        return
      }
      setReviewItem(null)
      setReviewMode('validate')
    } catch (error) {
      setConfirmError(error?.message ?? t('admin.paymentValidation.rejectError'))
    } finally {
      setConfirmBusy(false)
    }
  }

  if (!items.length) {
    return (
      <Wrapper className={panelClass}>
        {showHeader && (
          <header className="action-queue__header">
            <div>
              <h2>{t('admin.actionQueue.title')}</h2>
              <p>{t('admin.actionQueue.empty')}</p>
            </div>
            <span className="action-queue__count action-queue__count--ok">0</span>
          </header>
        )}
        {!showHeader && (
          <p className="action-queue__empty-inline">{t('admin.actionQueue.empty')}</p>
        )}
      </Wrapper>
    )
  }

  const tasksLabel =
    items.length === 1
      ? t('admin.actionQueue.tasks', { count: items.length })
      : t('admin.actionQueue.tasksMany', { count: items.length })

  return (
    <Wrapper className={panelClass}>
      {showHeader && (
        <header className="action-queue__header">
          <div>
            <h2>{t('admin.actionQueue.title')}</h2>
            <p>{tasksLabel}</p>
          </div>
          <span className="action-queue__count">{items.length}</span>
        </header>
      )}

      <div className="action-queue__groups">
        {groups.map(({ priority, items: groupItems }) => (
          <section key={priority} className={`action-queue__group action-queue__group--${priority}`}>
            {showGroupHeads ? (
              <header className="action-queue__group-head">
                <span className={`action-queue__group-label action-queue__group-label--${priority}`}>
                  {t(`admin.actionQueue.priority.${priority}`)}
                </span>
                <span className="action-queue__group-count">{groupItems.length}</span>
              </header>
            ) : null}

            <ul className="action-queue__list">
              {groupItems.map((item) => {
                const TypeIcon = TYPE_ICONS[item.type] ?? ClipboardList
                const typeLabel = t(`admin.actionQueue.types.${item.type}`)
                const hasProof = itemHasProof(item)
                const isPaymentTask = Boolean(item.paymentId || item.orderId)
                // La cola no es una vía alternativa de acreditación: una
                // transferencia necesita su archivo y Mercado Pago queda
                // exclusivamente en webhook. Efectivo Pitbull es la excepción
                // operativa declarada por la orden.
                const hasPrimaryAction = Boolean(
                  canEdit && (
                    (item.paymentId && item.method === 'manual_link' && (hasProof || item.cashAtPitbull))
                    || (item.orderId && item.provider === 'manual' && hasProof)
                  ),
                )

                return (
                  <li key={item.id} className={`action-queue__card action-queue__card--${item.priority}`}>
                    <span className={`action-queue__type action-queue__type--${item.type}`}>
                      <TypeIcon size={13} aria-hidden />
                      {typeLabel}
                    </span>

                    <div className="action-queue__card-body">
                      <strong className="action-queue__subject">{item.subject}</strong>
                      <span className="action-queue__meta">
                        {!hasPrimaryAction && item.summary ? (
                          <span className="action-queue__meta-item">{item.summary}</span>
                        ) : null}
                        {item.detail ? (
                          <span className="action-queue__meta-item">{item.detail}</span>
                        ) : null}
                        {isPaymentTask && hasProof ? (
                          <button
                            type="button"
                            className="action-queue__proof action-queue__proof--ok"
                            onClick={(event) => {
                              event.stopPropagation()
                              openReview(item, 'view')
                            }}
                          >
                            {t('admin.paymentValidation.viewProof')}
                          </button>
                        ) : null}
                        {isPaymentTask && !hasProof ? (
                          <span className="action-queue__proof">
                            {t('admin.actionQueue.proofMissing')}
                          </span>
                        ) : null}
                      </span>
                    </div>

                    {item.meta ? (
                      <span className="action-queue__amount action-queue__meta-item--accent">
                        {item.meta}
                      </span>
                    ) : (
                      <span className="action-queue__amount action-queue__amount--empty" aria-hidden />
                    )}

                    <div className="action-queue__actions">
                      {item.paymentId && hasPrimaryAction ? (
                        <button
                          type="button"
                          className="btn btn--small action-queue__btn action-queue__btn--primary"
                          onClick={(event) => {
                            event.stopPropagation()
                            openReview(item)
                          }}
                        >
                          {t('admin.actions.validate')}
                        </button>
                      ) : null}
                      {item.orderId && hasPrimaryAction ? (
                        <button
                          type="button"
                          className="btn btn--small action-queue__btn action-queue__btn--primary"
                          onClick={(event) => {
                            event.stopPropagation()
                            openReview(item)
                          }}
                        >
                          {t('admin.actions.validate')}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="btn btn--ghost btn--small action-queue__btn action-queue__btn--ghost"
                        onClick={() => openItem(item)}
                      >
                        {isPaymentTask ? <Eye size={14} aria-hidden /> : null}
                        {t('admin.actions.view')}
                        {isPaymentTask ? null : <ArrowRight size={14} aria-hidden />}
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>

      {reviewItem ? (
        <PaymentValidationDialog
          item={reviewItem}
          mode={reviewMode}
          busy={confirmBusy}
          error={confirmError}
          onCancel={closeReview}
          onConfirm={() => void confirmReview()}
          onReject={(reason) => void rejectReview(reason)}
        />
      ) : null}
    </Wrapper>
  )
}
