import { useId } from 'react'
import { LoaderCircle, X } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { money } from '../../lib/format.js'
import { LEDGER_PASTE_MAX_ROWS } from '../../lib/ledgerPaste.js'

function formatDate(iso, locale) {
  if (!iso) return '—'
  const date = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}

/**
 * Vista previa de las filas pegadas desde una planilla, antes de cargarlas.
 *
 * Nada se guarda hasta confirmar: cada fila muestra si está lista o qué le
 * falta, las inválidas se omiten (no frenan al resto) y cualquier fila se puede
 * quitar. El botón dorado es la única acción principal del bloque.
 */
export default function LedgerPastePreview({
  rows,
  truncated = false,
  busy = false,
  error = '',
  onConfirm,
  onDiscard,
  onRemoveRow,
}) {
  const { locale, t } = useI18n()
  const titleId = useId()
  const valid = rows.filter((row) => row.errors.length === 0)
  const totals = valid.reduce(
    (acc, row) => ({ ...acc, [row.kind]: acc[row.kind] + row.amount }),
    { income: 0, expense: 0 },
  )

  return (
    <section className="ledger-paste" aria-labelledby={titleId}>
      <header className="ledger-paste__head">
        <div className="ledger-paste__intro">
          <h3 id={titleId} className="ledger-paste__title">
            {t('admin.ledger.pasteTitle')}
          </h3>
          <p className="ledger-paste__summary" role="status">
            {t('admin.ledger.pasteSummary', { valid: valid.length, total: rows.length })}
            {valid.length > 0 ? (
              <span className="ledger-paste__totals">
                {totals.income > 0 ? <span>+ {money(totals.income, locale)}</span> : null}
                {totals.expense > 0 ? <span>− {money(totals.expense, locale)}</span> : null}
              </span>
            ) : null}
          </p>
          {truncated ? (
            <p className="ledger-paste__note">
              {t('admin.ledger.pasteTruncated', { max: LEDGER_PASTE_MAX_ROWS })}
            </p>
          ) : null}
        </div>
        <div className="ledger-paste__actions">
          <button
            type="button"
            className="btn btn--ghost btn--small"
            disabled={busy}
            onClick={onDiscard}
          >
            {t('admin.ledger.pasteDiscard')}
          </button>
          <button
            type="button"
            className="btn btn--small ledger-paste__confirm"
            disabled={busy || valid.length === 0}
            onClick={onConfirm}
          >
            {busy ? <LoaderCircle size={14} aria-hidden className="is-spinning" /> : null}
            {busy
              ? t('admin.ledger.saving')
              : valid.length === 1
                ? t('admin.ledger.pasteConfirmOne')
                : t('admin.ledger.pasteConfirm', { count: valid.length })}
          </button>
        </div>
      </header>

      {error ? (
        <p className="form-submit-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="ledger-paste__scroll">
        <table className="ledger-paste__table">
          <thead>
            <tr>
              <th scope="col">{t('admin.ledger.colDate')}</th>
              <th scope="col">{t('admin.ledger.pasteColKind')}</th>
              <th scope="col">{t('admin.ledger.colCategory')}</th>
              <th scope="col">{t('admin.ledger.colConcept')}</th>
              <th scope="col" className="ledger-paste__num">
                {t('admin.ledger.colAmount')}
              </th>
              <th scope="col">
                <span className="ledger-paste__sr">{t('admin.ledger.pasteColStatus')}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const invalid = row.errors.length > 0
              return (
                <tr
                  key={`${row.line}-${index}`}
                  className={invalid ? 'is-invalid' : undefined}
                >
                  <td>{formatDate(row.occurredOn, locale)}</td>
                  <td>
                    {row.kind === 'income'
                      ? t('admin.ledger.composerKindIncome')
                      : t('admin.ledger.composerKindExpense')}
                  </td>
                  <td>{row.category || '—'}</td>
                  <td className="ledger-paste__text">{row.description || '—'}</td>
                  <td className="ledger-paste__num">
                    {row.amount ? money(row.amount, locale) : '—'}
                  </td>
                  <td className="ledger-paste__status">
                    {invalid ? (
                      <span className="ledger-paste__error">
                        {row.errors
                          .map((code) => t(`admin.ledger.pasteError.${code}`))
                          .join(' · ')}
                      </span>
                    ) : (
                      <span className="ledger-paste__ok">{t('admin.ledger.pasteReady')}</span>
                    )}
                    <button
                      type="button"
                      className="ledger-paste__remove"
                      aria-label={t('admin.ledger.pasteRemoveRow')}
                      disabled={busy}
                      onClick={() => onRemoveRow(index)}
                    >
                      <X size={14} aria-hidden />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
