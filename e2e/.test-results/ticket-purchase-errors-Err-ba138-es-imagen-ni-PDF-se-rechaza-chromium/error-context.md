# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ticket-purchase-errors.spec.js >> Errores de compra de entradas >> un comprobante que no es imagen ni PDF se rechaza
- Location: e2e\ticket-purchase-errors.spec.js:215:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('.tickets-page__hero')
Expected: visible
Timeout: 20000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 20000ms
  - waiting for locator('.tickets-page__hero')

```

```yaml
- status:
  - paragraph:
    - strong: Ambiente de desarrollo
  - button "Ocultar aviso de desarrollo"
- link "Saltar al contenido principal":
  - /url: "#main-content"
- banner:
  - button "Inicio":
    - img "PLU Argentina — emblema oficial"
    - img "PLU ARG — Powerlifting United"
  - navigation "Principal":
    - button "Afiliación"
    - button "Competencia"
    - button "Resultados"
    - button "Récords"
    - button "Más"
  - 'button "Tema: Oscuro"'
  - 'switch "Idioma: Español"'
  - button "Acceder"
- status:
  - paragraph: Cargando…
- contentinfo:
  - paragraph: Próximo intento
  - heading "Empezá tu recorrido." [level=2]
  - button "Afiliarme ahora"
  - link "Maximalstrengthcorp@gmail.com":
    - /url: mailto:Maximalstrengthcorp@gmail.com
  - button "Inicio":
    - img "PLU ARG — Powerlifting United"
  - text: Capítulo Argentina · operación local Maximal
  - navigation "Competir":
    - heading "Competir" [level=3]
    - list:
      - listitem:
        - button "Afiliación"
      - listitem:
        - button "Eventos"
        - list:
          - listitem:
            - button "Pitbull Classic"
      - listitem:
        - button "Resultados"
      - listitem:
        - button "Récords"
      - listitem:
        - button "Estándares"
  - navigation "Recursos":
    - heading "Recursos" [level=3]
    - list:
      - listitem:
        - button "Recursos"
      - listitem:
        - button "Reglamento"
      - listitem:
        - button "FAQ"
      - listitem:
        - button "Comunidad"
  - navigation "Institucional":
    - heading "Institucional" [level=3]
    - list:
      - listitem:
        - button "Nosotros"
      - listitem:
        - button "Sponsors"
      - listitem:
        - button "Contacto"
      - listitem:
        - button "Acceder"
  - text: © 2026 PLU ARG
  - button "No medir mi navegación"
  - button "Cookies"
  - text: Estándar Powerlifting United
- button "Abrir la ayuda paso a paso. Tenés un paso pendiente.": Ayuda
```

# Test source

```ts
  1   | import { expect } from '@playwright/test'
  2   | import { TICKETS_PATH } from '../src/lib/ticketsRoute.js'
  3   | 
  4   | /**
  5   |  * ticket-purchase-helpers.js — PLU ARG
  6   |  *
  7   |  * Helpers compartidos para los tests E2E de compra de entradas. Siguen la
  8   |  * misma convención que redeem-code.js: cada helper espera un punto de
  9   |  * sincronía antes de retornar, para que el test no arranque el paso
  10  |  * siguiente antes de que la UI termine de pintar.
  11  |  */
  12  | 
  13  | const TICKET_CODE = /TCK-\d{8}/
  14  | const QR_TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  15  | const CURRENT_ORDER_KEY = 'plu:current-order'
  16  | 
  17  | function isTicketOrderPost(response) {
  18  |   return response.request().method() === 'POST' && response.url().includes('/api/tickets/orders')
  19  | }
  20  | 
  21  | /** Consentimiento de cookies, como lo resolvería cualquier visita real. */
  22  | export async function acceptCookies(page) {
  23  |   const cookieAcceptAll = page.getByRole('button', { name: /^Aceptar todo$/i })
  24  |   await cookieAcceptAll
  25  |     .waitFor({ state: 'visible', timeout: 5_000 })
  26  |     .then(() => cookieAcceptAll.click())
  27  |     .catch(() => {})
  28  | }
  29  | 
  30  | async function waitForTicketsHero(page, timeout) {
> 31  |   await expect(page.locator('.tickets-page__hero')).toBeVisible({ timeout })
      |                                                     ^ Error: expect(locator).toBeVisible() failed
  32  | }
  33  | 
  34  | /**
  35  |  * Navega a la página de entradas para un evento concreto.
  36  |  *
  37  |  * La ruta se arma con el contrato real (`ticketsRoute.js`) en vez de escribirla
  38  |  * a mano: el helper apuntaba a `/entradas/<slug>`, que no existe, así que la
  39  |  * página respondía 404 y estos tests no llegaban a ejercitar nada. El evento
  40  |  * viaja como query param, no como segmento.
  41  |  *
  42  |  * Si Vite tarda el chunk lazy de TicketsPage, el shell se queda en
  43  |  * "Cargando…" y el hero nunca aparece. Un reload alcanza: no es un fallo
  44  |  * de producto, es el arnés pidiendo el mismo módulo después de muchos tests.
  45  |  */
  46  | export async function navigateToTickets(page, eventSlug, { title, expectCheckout = true } = {}) {
  47  |   const availabilityPath = `/api/tickets/availability/${encodeURIComponent(eventSlug)}`
  48  | 
  49  |   const openTicketsPage = async () => {
  50  |     const catalogReady = page
  51  |       .waitForResponse(
  52  |         (response) => response.ok() && response.url().includes('/api/events/catalog'),
  53  |         { timeout: 20_000 },
  54  |       )
  55  |       .catch(() => null)
  56  |     const availabilityReady = page
  57  |       .waitForResponse((response) => response.ok() && response.url().includes(availabilityPath), {
  58  |         timeout: 20_000,
  59  |       })
  60  |       .catch(() => null)
  61  | 
  62  |     await page.goto(`${TICKETS_PATH}?evento=${encodeURIComponent(eventSlug)}`)
  63  |     await acceptCookies(page)
  64  |     return { catalogReady, availabilityReady }
  65  |   }
  66  | 
  67  |   let pending = await openTicketsPage()
  68  |   try {
  69  |     await waitForTicketsHero(page, 8_000)
  70  |   } catch {
  71  |     pending = await openTicketsPage()
  72  |     await waitForTicketsHero(page, 20_000)
  73  |   }
  74  |   await Promise.all([pending.catalogReady, pending.availabilityReady])
  75  | 
  76  |   if (title) {
  77  |     await expect(page.locator('#tickets-page-title')).toContainText(title, { timeout: 15_000 })
  78  |     const selected = page.locator('.tickets-page__event-option--active strong')
  79  |     if ((await selected.count()) > 0) {
  80  |       await expect(selected).toContainText(title)
  81  |     }
  82  |   }
  83  |   if (expectCheckout) {
  84  |     await assertCheckoutVisible(page)
  85  |     // Transferencia sólo aparece cuando ya llegó el interruptor de canal
  86  |     // manual: si el form se pinta antes, el default es Mercado Pago y un
  87  |     // remount posterior borra lo que se acaba de tipear.
  88  |     await expect(
  89  |       page.locator('#checkout input[name="ticket-payment"][value="transferencia"]'),
  90  |     ).toBeVisible({ timeout: 15_000 })
  91  |     await page
  92  |       .locator('#checkout input[name="attendee-0-fullName"]')
  93  |       .waitFor({ state: 'visible', timeout: 10_000 })
  94  |   }
  95  | }
  96  | 
  97  | /** La confirmación vive en sessionStorage: sin esto, recargar sigue en el QR. */
  98  | export async function clearCurrentTicketOrder(page) {
  99  |   await page.evaluate((key) => sessionStorage.removeItem(key), CURRENT_ORDER_KEY)
  100 | }
  101 | 
  102 | /**
  103 |  * Navega a la ficha pública del evento (`/evento/:slug` = calendario) y entra
  104 |  * al checkout con el CTA "Comprar entradas". No es la landing Pitbull.
  105 |  */
  106 | export async function navigateFromEventToTickets(page, eventSlug, { title } = {}) {
  107 |   await page.goto(`/evento/${encodeURIComponent(eventSlug)}`)
  108 |   await acceptCookies(page)
  109 |   if (title) {
  110 |     await expect(page.getByRole('heading', { name: title }).first()).toBeVisible({
  111 |       timeout: 20_000,
  112 |     })
  113 |   }
  114 |   const ticketCta = page.getByRole('button', { name: /comprar entradas/i })
  115 |   await expect(ticketCta).toBeEnabled({ timeout: 15_000 })
  116 |   await ticketCta.click()
  117 |   await waitForTicketsHero(page, 20_000)
  118 |   if (title) {
  119 |     await expect(page.locator('#tickets-page-title')).toContainText(title, { timeout: 15_000 })
  120 |   }
  121 |   await assertCheckoutVisible(page)
  122 | }
  123 | 
  124 | /**
  125 |  * Verifica que un tipo de entrada sea visible en la sección de ofertas.
  126 |  * La vidriera usa `TicketTypeOptions` en lista (`li`), no articles.
  127 |  */
  128 | export async function assertTicketTypeVisible(page, name, priceText, extras = {}) {
  129 |   const offersGrid = page.locator('.tickets-page__offers-grid')
  130 |   const offer = offersGrid.locator('.ticket-type-options__option', { hasText: name })
  131 |   await expect(offer).toBeVisible({ timeout: 5_000 })
```