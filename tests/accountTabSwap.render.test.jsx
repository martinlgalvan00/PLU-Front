import { readFileSync } from 'node:fs'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { ACCOUNT_TAB_IDS } from '../src/lib/navigation.js'

beforeAll(() => {
  window.matchMedia ??= (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })
  Element.prototype.scrollTo ??= function scrollTo() {}
})

afterEach(cleanup)

describe('cinta de la cuenta como fuente única del orden', () => {
  it('el orden vive en navigation.js y no duplicado en la cinta', () => {
    // Si el orden viviera copiado en AthleteProfilePage, reordenar la cinta
    // dejaría el panel entrando por el lado contrario al del tab que lo abrió.
    expect(ACCOUNT_TAB_IDS).toEqual([
      'account-qr',
      // Sin ficha de canje suelta: Beneficios se retiró de la cinta y el código
      // se canjea dentro del checkout de Afiliación o de Inscripción, que es
      // también donde se escanea su QR. No hay ruta pública de canje.
      // Sin "Oferta exclusiva": las ofertas generadas por código quedaron
      // retiradas (20260915100000) y ya no hay ficha que abrir.
      'account-events',
      'account-history',
      'account-membership',
      // Los pagos van pegados a Afiliación: es donde nace el cobro y adonde
      // apuntan los emails (`/mi-cuenta?section=payments`).
      'account-payments',
      'account-personal-data',
      'account-security',
    ])
  })

  it('la página deriva la dirección del swap de ese orden', () => {
    const page = readFileSync('src/pages/AthleteProfilePage.jsx', 'utf8')
    expect(page).toContain("import MotionContentSwap from '../motion/MotionContentSwap.tsx'")
    // Lo que se está resguardando es de dónde sale el orden, no cómo quedó
    // formateada la línea de import: la lista de constantes crece y Prettier la
    // parte en varias líneas.
    expect(page).toMatch(
      /import \{[^}]*\bACCOUNT_TAB_IDS\b[^}]*\} from '\.\.\/lib\/navigation\.js'/s,
    )
    expect(page).toContain('ACCOUNT_TAB_IDS.indexOf(activeTab)')
    // `sync` y no `wait`: con `wait` el contenedor colapsa un frame entre el
    // panel que sale y el que entra, y la página da un salto de scroll.
    expect(page).toMatch(/mode="sync"/)
    expect(page).toContain('direction={swapDirection}')
    // `resolvedTab` y no `activeTab`: con fichas condicionales, el tab activo
    // puede dejar de existir entre renders (la consulta de ofertas todavía no
    // volvió, o el código venció) y el panel quedaría vacío.
    expect(page).toContain('swapKey={resolvedTab}')
    expect(page).toContain('visibleTabIds.includes(activeTab)')
    // El fade sin dirección que había en CSS no puede seguir corriendo encima.
    expect(page).not.toContain('key={activeTab} className="account-tab-panel"')
  })

  it('la dirección se conserva si el mismo tab vuelve a renderizar', () => {
    // El índice y la dirección se guardan juntos: recalcular contra "el índice
    // anterior" en un segundo render (StrictMode, cambio de props) compararía
    // el índice contra sí mismo y perdería la dirección a mitad del gesto.
    const page = readFileSync('src/pages/AthleteProfilePage.jsx', 'utf8')
    expect(page).toMatch(/useRef\(\{ index: tabIndex, direction: undefined \}\)/)
    expect(page).toContain('if (tabIndex >= 0 && tabIndex !== swapRef.current.index) {')
  })
})

describe('CSS del panel de la cuenta', () => {
  const css = readFileSync('src/styles/pages/account.css', 'utf8')

  it('los dos paneles comparten celda durante la transición', () => {
    // Sin esto la grilla le da una fila a cada panel montado y la página se
    // estira al doble a mitad del cambio de tab.
    expect(css).toMatch(/\.account-sections > \.account-tab-panel \{[^}]*grid-area: 1 \/ 1;[^}]*\}/)
  })

  it('ya no queda el fade sin dirección que manejaba el cambio de tab', () => {
    expect(css).not.toContain('animation: account-tab-fade')
    expect(css).not.toContain('@keyframes account-tab-fade')
  })

  it('el settle interno respeta reduced motion', () => {
    expect(css).toContain('@keyframes account-panel-settle')
    const reducedBlocks = css.match(/@media \(prefers-reduced-motion: reduce\) \{[^}]*\}[^}]*\}/g)
    expect((reducedBlocks ?? []).some((block) => block.includes('account-section__heading'))).toBe(
      true,
    )
  })

  it('anima sólo transform y opacity, sin transition: all', () => {
    const settleIndex = css.indexOf('@keyframes account-panel-settle')
    const settle = css.slice(settleIndex, settleIndex + 240)
    expect(settle).toContain('opacity')
    expect(settle).toContain('transform')
    expect(settle).not.toContain('transition: all')
  })
})

describe('AccountNav sigue anunciando el tab activo', () => {
  it('no perdió el indicador animado ni la semántica de tablist', async () => {
    const { I18nProvider } = await import('../src/i18n/I18nProvider.jsx')
    const MotionProvider = (await import('../src/motion/MotionProvider.tsx')).default
    const AccountNav = (await import('../src/pages/profile/AccountNav.jsx')).default

    let active = 'account-qr'
    const { rerender } = render(
      <I18nProvider>
        <MotionProvider>
          <AccountNav activeId={active} onChange={(id) => (active = id)} />
        </MotionProvider>
      </I18nProvider>,
    )

    expect(screen.getByRole('tablist')).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Credencial' }).getAttribute('aria-selected')).toBe(
      'true',
    )

    // Beneficios ya no es un tab: su canje se hace desde Afiliación.
    expect(screen.queryByRole('tab', { name: 'Beneficios' })).toBe(null)

    fireEvent.click(screen.getByRole('tab', { name: 'Seguridad' }))
    expect(active).toBe('account-security')

    rerender(
      <I18nProvider>
        <MotionProvider>
          <AccountNav activeId="account-security" onChange={() => {}} />
        </MotionProvider>
      </I18nProvider>,
    )
    expect(screen.getByRole('tab', { name: 'Seguridad' }).getAttribute('aria-selected')).toBe(
      'true',
    )
  })
})
