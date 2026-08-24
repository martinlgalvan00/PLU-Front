import { useId, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowDownRight, LoaderCircle } from 'lucide-react'
import Button from '../ui/Button.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { useAdminModal } from './useAdminModal.js'

/**
 * Alta y edición de un egreso de la caja. Mismo contrato que el service
 * (`createExpense`/`updateExpense`): fecha, categoría, importe, detalle y
 * comprobante. `expense` en null es un alta; con fila, edición.
 *
 * El importe vive como string en el form (para no pelear con el input
 * number) y viaja casteado a `Number` al confirmar — igual hacía el
 * formulario inline que reemplaza.
 */
export default function AdminExpenseDialog({ expense = null, busy = false, error = '', onCancel, onConfirm }) {
  const { t } = useI18n()
  const titleId = useId()
  const descriptionId = useId()
  const formId = useId()
  const panelRef = useAdminModal(() => {
    if (!busy) onCancel()
  })
  const [form, setForm] = useState(() => ({
    occurredOn: expense?.occurredOn ? String(expense.occurredOn).slice(0, 10) : new Date().toISOString().slice(0, 10),
    category: expense?.category ?? '',
    description: expense?.description ?? '',
    amount: expense?.amount != null ? String(expense.amount) : '',
    receiptPath: expense?.receiptPath ?? '',
  }))

  function patch(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  function handleSubmit(event) {
    event.preventDefault()
    onConfirm({ ...form, amount: Number(form.amount) })
  }

  const editing = expense != null

  return createPortal(
    <div className="admin-expense-dialog">
      <button
        type="button"
        className="admin-expense-dialog__backdrop"
        aria-label={t('admin.ledger.cancel')}
        disabled={busy}
        onClick={onCancel}
      />
      <section
        ref={panelRef}
        className="admin-expense-dialog__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <header className="admin-expense-dialog__head">
          <span className="admin-expense-dialog__icon" aria-hidden>
            <ArrowDownRight size={18} />
          </span>
          <div>
            <h2 id={titleId}>
              {editing ? t('admin.ledger.editExpense') : t('admin.ledger.addExpense')}
            </h2>
            <p id={descriptionId} className="admin-expense-dialog__lead">
              {editing ? t('admin.ledger.editExpenseHint') : t('admin.ledger.newExpenseHint')}
            </p>
          </div>
        </header>

        <form id={formId} className="admin-expense-dialog__form" onSubmit={handleSubmit}>
          <label className="admin-expense-dialog__field">
            <span>{t('admin.ledger.date')}</span>
            <input
              required
              type="date"
              value={form.occurredOn}
              disabled={busy}
              onChange={(event) => patch('occurredOn', event.target.value)}
            />
          </label>
          <label className="admin-expense-dialog__field">
            <span>{t('admin.ledger.category')}</span>
            <input
              required
              minLength={2}
              maxLength={80}
              value={form.category}
              disabled={busy}
              onChange={(event) => patch('category', event.target.value)}
            />
          </label>
          <label className="admin-expense-dialog__field">
            <span>{t('admin.ledger.amount')}</span>
            <input
              required
              min="1"
              type="number"
              inputMode="numeric"
              value={form.amount}
              disabled={busy}
              onChange={(event) => patch('amount', event.target.value)}
            />
          </label>
          <label className="admin-expense-dialog__field admin-expense-dialog__field--wide">
            <span>{t('admin.ledger.description')}</span>
            <input
              required
              minLength={3}
              maxLength={500}
              value={form.description}
              disabled={busy}
              onChange={(event) => patch('description', event.target.value)}
            />
          </label>
          <label className="admin-expense-dialog__field admin-expense-dialog__field--wide">
            <span>{t('admin.ledger.receipt')}</span>
            <input
              value={form.receiptPath}
              disabled={busy}
              placeholder={t('admin.ledger.receiptHint')}
              onChange={(event) => patch('receiptPath', event.target.value)}
            />
          </label>
        </form>

        {error ? (
          <p className="admin-expense-dialog__error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="admin-expense-dialog__actions">
          <Button type="button" variant="secondary" disabled={busy} onClick={onCancel}>
            {t('admin.ledger.cancel')}
          </Button>
          <Button type="submit" form={formId} disabled={busy}>
            {busy ? (
              <LoaderCircle size={15} aria-hidden className="is-spinning" />
            ) : (
              <ArrowDownRight size={15} aria-hidden />
            )}
            {busy
              ? t('admin.ledger.saving')
              : editing
                ? t('admin.ledger.saveChanges')
                : t('admin.ledger.submit')}
          </Button>
        </div>
      </section>
    </div>,
    document.body,
  )
}
