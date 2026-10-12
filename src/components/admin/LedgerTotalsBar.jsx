import { useId } from 'react'

import { useI18n } from '../../i18n/I18nProvider.jsx'
import { money } from '../../lib/format.js'

/**
 * Total del filtro al pie de la tabla del libro de caja.
 *
 * Contrato (lo monta `FinanceSection`, no cambiar los nombres de las props):
 * - `income`, `expense`, `balance`: totales de las filas que se ven (ya filtradas).
 * - `count`: cuántas filas se ven. `total`: cuántas trae el período sin filtros.
 * - `filtered`: true si hay filtros activos (entonces `count` < `total` es esperable).
 *
 * Semántica: `<footer>` con una lista de definiciones. Monocromo: el saldo va en
 * tinta y con más peso; ingreso y egreso se distinguen por peso, no por color.
 */
export default function LedgerTotalsBar({
  income = 0,
  expense = 0,
  balance = 0,
  count = 0,
  total = 0,
  filtered = false,
}) {
  const { t, locale } = useI18n()
  const countId = useId()

  const countLabel = filtered
    ? t('admin.ledger.showingFiltered', { shown: count, total })
    : t('admin.ledger.movementCount', { count })

  return (
    <footer className="ledger-totals" role="group" aria-labelledby={countId}>
      <p id={countId} className="ledger-totals__count">{countLabel}</p>
      <dl className="ledger-totals__list">
        <div className="ledger-totals__item ledger-totals__item--income">
          <dt>{t('admin.ledger.income')}</dt>
          <dd>{money(income, locale)}</dd>
        </div>
        <div className="ledger-totals__item ledger-totals__item--expense">
          <dt>{t('admin.ledger.expense')}</dt>
          <dd>{money(expense, locale)}</dd>
        </div>
        <div className="ledger-totals__item ledger-totals__item--balance">
          <dt>{t('admin.ledger.totalsBalance')}</dt>
          <dd>{money(balance, locale)}</dd>
        </div>
      </dl>
    </footer>
  )
}
