import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import { CheckoutBar } from '../src/components/checkout/CheckoutDesk.jsx'

/**
 * El precio se vuelve a escribir cuando el código lo cambia.
 *
 * Aplicar un código es el momento por el que alguien canjea, y en la barra de
 * pago era un reemplazo de texto en un frame: el importe viejo aparecía tachado
 * arriba y el nuevo ya estaba escrito abajo, sin que nada dijera que uno vino
 * del otro.
 *
 * La animación vive en `checkout-desk.css` y se dispara por `key`: React
 * desmonta y vuelve a montar el nodo del importe cuando el número cambia, y una
 * animación CSS one-shot arranca de nuevo con el nodo nuevo. Sin el `key` sólo
 * correría en el primer render, que es justo el momento en que no hay nada que
 * contar.
 *
 * Lo que se protege acá es el mecanismo, no la estética: que el nodo se renueve
 * cuando el importe cambia y NO se renueve cuando no cambia —la barra vive
 * dentro de un `aria-live="polite"`, así que un remount gratuito le vuelve a
 * leer el total a quien usa lector de pantalla en cada tecla del formulario—.
 */

function renderBar(props) {
  return render(
    <I18nProvider>
      <CheckoutBar total={120000} {...props} />
    </I18nProvider>,
  )
}

afterEach(cleanup)

describe('recotización en la barra de pago', () => {
  it('renueva el nodo del importe cuando el código cambia el precio', () => {
    const { container, rerender } = renderBar()
    const before = container.querySelector('.plu-checkout__total strong')
    expect(before).toBeTruthy()

    rerender(
      <I18nProvider>
        <CheckoutBar total={90000} compareTotal={120000} />
      </I18nProvider>,
    )

    const after = container.querySelector('.plu-checkout__total strong')
    expect(after).toBeTruthy()
    // Nodo distinto: es lo que hace que la animación de entrada vuelva a correr.
    expect(after).not.toBe(before)
    expect(after.textContent).toContain('90.000')

    // Y el importe anterior queda tachado, con su propia entrada.
    const compare = container.querySelector('.plu-checkout__total-compare')
    expect(compare?.textContent ?? '').toContain('120.000')
  })

  it('no renueva nada cuando el importe no cambió', () => {
    const { container, rerender } = renderBar({ packageLabel: 'Inscripción' })
    const before = container.querySelector('.plu-checkout__total strong')

    rerender(
      <I18nProvider>
        <CheckoutBar total={120000} packageLabel="Inscripción + Afiliación" />
      </I18nProvider>,
    )

    const after = container.querySelector('.plu-checkout__total strong')
    expect(after).toBe(before)
  })

  it('el importe con etiqueta ya formateada también renueva por su texto', () => {
    // Los checkouts pasan un string cuando el precio lo decide el medio de pago
    // (por ejemplo un total en USD). El `key` es el texto, no el número, así que
    // el camino funciona igual.
    const { container, rerender } = renderBar({ total: 'USD 120' })
    const before = container.querySelector('.plu-checkout__total strong')

    rerender(
      <I18nProvider>
        <CheckoutBar total="USD 95" />
      </I18nProvider>,
    )

    const after = container.querySelector('.plu-checkout__total strong')
    expect(after).not.toBe(before)
    expect(after.textContent).toBe('USD 95')
  })
})
