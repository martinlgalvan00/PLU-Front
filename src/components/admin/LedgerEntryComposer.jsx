import { useId, useRef, useState } from 'react'
import { LoaderCircle, Plus } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'

function todayIso() {
  const date = new Date()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/**
 * Fila de carga rápida del libro de caja: una línea que se llena como una
 * planilla — tipo, fecha, rubro, detalle, importe — y se confirma con Enter.
 * Tras guardar conserva tipo y fecha (se suelen cargar varios seguidos) y
 * devuelve el foco al rubro. `onSubmit` resuelve `true` si el asiento quedó
 * guardado; sólo entonces se limpian los campos, así un error no pierde lo
 * tipeado.
 *
 * El comprobante no va acá: se adjunta desde el diálogo de edición del asiento.
 */
export default function LedgerEntryComposer({
  categories = [],
  busy = false,
  onSubmit,
  onKindChange,
}) {
  const { t } = useI18n()
  const uid = useId()
  const categoryRef = useRef(null)
  const [form, setForm] = useState(() => ({
    kind: 'income',
    occurredOn: todayIso(),
    category: '',
    description: '',
    amount: '',
  }))

  const income = form.kind === 'income'
  const listId = `${uid}-categories`

  function patch(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
    if (field === 'kind') onKindChange?.(value)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (busy) return
    const saved = await onSubmit({
      kind: form.kind,
      occurredOn: form.occurredOn,
      category: form.category.trim(),
      description: form.description.trim(),
      amount: Number(form.amount),
    })
    if (!saved) return
    setForm((current) => ({ ...current, category: '', description: '', amount: '' }))
    categoryRef.current?.focus()
  }

  return (
    <form
      className="ledger-composer"
      aria-label={t('admin.ledger.composerAria')}
      onSubmit={(event) => void handleSubmit(event)}
    >
      <fieldset className="ledger-composer__kind" disabled={busy}>
        <legend>{t('admin.ledger.composerKind')}</legend>
        {['income', 'expense'].map((kind) => (
          <label key={kind} className="ledger-composer__kind-option">
            <input
              type="radio"
              name={`${uid}-kind`}
              value={kind}
              checked={form.kind === kind}
              onChange={() => patch('kind', kind)}
            />
            <span>
              {kind === 'income'
                ? t('admin.ledger.composerKindIncome')
                : t('admin.ledger.composerKindExpense')}
            </span>
          </label>
        ))}
      </fieldset>

      <label className="ledger-composer__field ledger-composer__field--date">
        <span>{t('admin.ledger.date')}</span>
        <input
          required
          type="date"
          value={form.occurredOn}
          disabled={busy}
          onChange={(event) => patch('occurredOn', event.target.value)}
        />
      </label>

      <label className="ledger-composer__field ledger-composer__field--category">
        <span>{t('admin.ledger.category')}</span>
        <input
          ref={categoryRef}
          required
          minLength={2}
          maxLength={80}
          list={listId}
          autoComplete="off"
          value={form.category}
          disabled={busy}
          placeholder={
            income
              ? t('admin.ledger.composerCategoryIncomeHint')
              : t('admin.ledger.composerCategoryExpenseHint')
          }
          onChange={(event) => patch('category', event.target.value)}
        />
        <datalist id={listId}>
          {categories.map((category) => (
            <option key={category} value={category} />
          ))}
        </datalist>
      </label>

      <label className="ledger-composer__field ledger-composer__field--description">
        <span>{t('admin.ledger.description')}</span>
        <input
          required
          minLength={3}
          maxLength={500}
          autoComplete="off"
          value={form.description}
          disabled={busy}
          placeholder={t('admin.ledger.composerDescriptionHint')}
          onChange={(event) => patch('description', event.target.value)}
        />
      </label>

      <label className="ledger-composer__field ledger-composer__field--amount">
        <span>{t('admin.ledger.amount')}</span>
        <input
          required
          min="1"
          type="number"
          inputMode="numeric"
          value={form.amount}
          disabled={busy}
          placeholder={t('admin.ledger.composerAmountHint')}
          onChange={(event) => patch('amount', event.target.value)}
        />
      </label>

      <button className="btn btn--small ledger-composer__submit" type="submit" disabled={busy}>
        {busy ? (
          <LoaderCircle size={14} aria-hidden className="is-spinning" />
        ) : (
          <Plus size={14} aria-hidden />
        )}
        {busy
          ? t('admin.ledger.saving')
          : income
            ? t('admin.ledger.composerSubmitIncome')
            : t('admin.ledger.composerSubmitExpense')}
      </button>
    </form>
  )
}
