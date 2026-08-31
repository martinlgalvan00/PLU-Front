# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: checkout-coupon-manual-only.spec.js >> Orden abierta por transferencia — el atleta la cancela >> cancela, recupera el cupón y puede abrir otra orden
- Location: e2e\checkout-coupon-manual-only.spec.js:231:3

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: locator('.form-submit-notice')
Expected pattern: /cancelamos tu orden/i
Timeout: 15000ms
Error: element(s) not found

Call log:
  - Expect "toContainText" with timeout 15000ms
  - waiting for locator('.form-submit-notice')

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
  - button "E2E Cupón 7be8a46e"
- main:
  - navigation "Navegación del registro":
    - button "Eventos"
  - complementary:
    - paragraph: Inscripción a competencia
    - heading "E2E Solo Manual 7be8a46e" [level=1]
    - paragraph: Completá el pago para confirmar tu lugar.
    - paragraph: Inscripción E2E Solo Manual 7be8a46e
    - text: Pendiente
    - strong: $ 85.000
    - code: RORD-552cdc5d6fbc824b
    - paragraph: Administración confirmará la acreditación en hasta 48 horas.
    - button "Ver datos de transferencia"
  - button "Elegir otro medio"
  - button "Ver datos de transferencia"
  - text: ¿Cancelar esta orden? Vas a poder elegir otro medio de pago y tu código queda libre para usarlo de nuevo.
  - button "Sí, cancelar"
  - button "Volver"
  - paragraph: Inscripción E2E Solo Manual 7be8a46e
  - text: Total
  - strong: $ 85.000
- contentinfo:
  - paragraph: Próximo intento
  - heading "Empezá tu recorrido." [level=2]
  - button "Afiliarme ahora"
  - link "hola@pluarg.com.ar":
    - /url: mailto:hola@pluarg.com.ar
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
  140 |     // El código prohíbe la pasarela: la selección tiene que quedar sólo con los
  141 |     // canales que admite. Si Mercado Pago sigue ofrecido, el checkout está
  142 |     // por mandar al atleta a un medio que el backend va a rechazar (PLU28).
  143 |     await expect(page.getByRole('radio', { name: /mercado pago/i })).toHaveCount(0)
  144 |     await expect(page.getByRole('radio', { name: /Transferencia bancaria/i })).toBeVisible()
  145 | 
  146 |     await page.locator('label.plu-checkout__pill', { hasText: 'Transferencia bancaria' }).click()
  147 |     await expect(page.getByRole('radio', { name: /Transferencia bancaria/i })).toBeChecked()
  148 | 
  149 |     await page.getByRole('button', { name: /Continuar al pago/i }).click()
  150 | 
  151 |     // Avanzar es exactamente lo que el atleta reportó que no podía hacer.
  152 |     const transferModal = page.getByRole('dialog', { name: /completar tu inscripción/i })
  153 |     await expect(transferModal).toBeVisible()
  154 | 
  155 |     // La verdad no está en la pantalla sino en la orden: importe pactado,
  156 |     // código adjunto y el descuento calculado contra la base manual.
  157 |     const order = await latestRegistrationOrder()
  158 |     expect(order, 'no se creó ninguna orden manual').not.toBeNull()
  159 |     expect(order.manual_payment_channel).toBe('bank_transfer')
  160 |     expect(order.discount_code).toBe(fixture.manualOnlyDiscountCode)
  161 |     expect(order.discount_amount).toBe(7500)
  162 |     expect(order.amount).toBe(85000)
  163 |   })
  164 | 
  165 |   /**
  166 |    * El estado real en el que quedó la cuenta que reportó el problema: una
  167 |    * inscripción empezada por transferencia y nunca terminada, y encima el
  168 |    * cupón. La orden abierta se reusa, así que el código tiene que entrar por
  169 |    * la recotización (`requote_open_order`) y no por el alta.
  170 |    */
  171 |   test('aplica el código sobre una orden abierta sin cupón y la recotiza', async ({ page }) => {
  172 |     await seedOpenOrderWithoutCode()
  173 | 
  174 |     await page.goto('/mi-cuenta?section=events')
  175 |     await acceptCookies(page)
  176 |     const eventRow = page.locator('article.account-events-list__row', {
  177 |       hasText: fixture.manualOnlyEventTitle,
  178 |     })
  179 |     await eventRow.getByRole('button', { name: /^Elegir otro medio$/i }).click()
  180 | 
  181 |     await redeemCode(page, fixture.manualOnlyDiscountCode)
  182 |     await expect(page.locator('.register-discount__applied')).toContainText('85.000')
  183 | 
  184 |     await page.getByRole('button', { name: /Continuar al pago/i }).click()
  185 | 
  186 |     // Sin bloqueo: ni "pago en curso" ni el cartel de método bloqueado.
  187 |     await expect(page.getByRole('dialog', { name: /completar tu inscripción/i })).toBeVisible()
  188 | 
  189 |     await expect
  190 |       .poll(async () => (await latestRegistrationOrder())?.discount_code, { timeout: 15_000 })
  191 |       .toBe(fixture.manualOnlyDiscountCode)
  192 |     const order = await latestRegistrationOrder()
  193 |     expect(order.amount).toBe(85000)
  194 |   })
  195 | })
  196 | 
  197 | /**
  198 |  * La salida que faltaba: cerrar la orden abierta desde el checkout.
  199 |  *
  200 |  * Una inscripción por transferencia que quedó `pendiente` la reusa el checkout
  201 |  * hasta que vence (24 h). Con un cupón consumido encima, la redención —única
  202 |  * por (código, atleta)— hacía que el mismo código rebotara con PLU22 en el
  203 |  * intento siguiente, y no había ninguna acción del atleta que lo destrabara.
  204 |  */
  205 | /**
  206 |  * Deja la pantalla de liquidación de la orden abierta a la vista, que es donde
  207 |  * viven las acciones sobre la orden. El cupón se aplica de paso porque en este
  208 |  * entorno es lo que destraba los canales manuales.
  209 |  */
  210 | async function openSettleScreen(page) {
  211 |   await page.goto('/mi-cuenta?section=events')
  212 |   await acceptCookies(page)
  213 |   const eventRow = page.locator('article.account-events-list__row', {
  214 |     hasText: fixture.manualOnlyEventTitle,
  215 |   })
  216 |   await eventRow.getByRole('button', { name: /^Elegir otro medio$/i }).click()
  217 | 
  218 |   await redeemCode(page, fixture.manualOnlyDiscountCode)
  219 |   await page.getByRole('button', { name: /Continuar al pago/i }).click()
  220 | 
  221 |   const modal = page.getByRole('dialog', { name: /completar tu inscripción/i })
  222 |   await expect(modal).toBeVisible()
  223 |   await expect
  224 |     .poll(async () => (await latestRegistrationOrder())?.discount_code, { timeout: 15_000 })
  225 |     .toBe(fixture.manualOnlyDiscountCode)
  226 |   await modal.getByRole('button', { name: /cerrar modal/i }).click()
  227 |   await expect(modal).toBeHidden()
  228 | }
  229 | 
  230 | test.describe('Orden abierta por transferencia — el atleta la cancela', () => {
  231 |   test('cancela, recupera el cupón y puede abrir otra orden', async ({ page }) => {
  232 |     await seedOpenOrderWithoutCode()
  233 |     // El cupón queda aplicado sobre la orden abierta, para probar que la
  234 |     // cancelación devuelve la redención y no la deja consumida.
  235 |     await openSettleScreen(page)
  236 | 
  237 |     await page.getByRole('button', { name: /^Cancelar esta orden$/i }).click()
  238 | 
  239 |     // El acuse sale donde se hizo el clic, no en un toast que se va.
> 240 |     await expect(page.locator('.form-submit-notice')).toContainText(/cancelamos tu orden/i, {
      |                                                       ^ Error: expect(locator).toContainText(expected) failed
  241 |       timeout: 15_000,
  242 |     })
  243 | 
  244 |     // La orden queda cerrada con su motivo, y la inscripción no queda viva.
  245 |     await expect
  246 |       .poll(async () => (await anyRegistrationOrder())?.status, { timeout: 15_000 })
  247 |       .toBe('cancelado')
  248 |     const cancelled = await anyRegistrationOrder()
  249 |     expect(cancelled.cancellation_code).toBe('cancelled_by_athlete')
  250 |     // El cupón volvió: sin esto el próximo intento rebota con PLU22.
  251 |     expect(cancelled.discount_code).toBeNull()
  252 |     const { data: redemptions } = await admin
  253 |       .from('discount_code_redemptions')
  254 |       .select('id')
  255 |       .eq('payment_order_id', cancelled.id)
  256 |     expect(redemptions ?? []).toHaveLength(0)
  257 |     const { data: regs } = await admin
  258 |       .from('event_registrations')
  259 |       .select('status')
  260 |       .eq('payment_order_id', cancelled.id)
  261 |     expect((regs ?? []).every((row) => row.status === 'cancelada')).toBe(true)
  262 |   })
  263 | 
  264 |   /**
  265 |    * La guarda que importa: con un comprobante adjunto la orden ya es trabajo de
  266 |    * Finanzas. Cancelar tiene que fallar Y decir por qué — un "no se puede"
  267 |    * mudo es el bug original.
  268 |    */
  269 |   test('con comprobante adjunto explica por qué no puede cancelar', async ({ page }) => {
  270 |     await seedOpenOrderWithoutCode()
  271 |     await openSettleScreen(page)
  272 | 
  273 |     // El comprobante se adjunta con la pantalla ya abierta: así el botón sigue
  274 |     // en pantalla y quien rechaza es la guarda del servidor, que es la que
  275 |     // tiene que explicarse.
  276 |     const order = await latestRegistrationOrder()
  277 |     const { error } = await admin
  278 |       .from('athlete_payment_orders')
  279 |       .update({
  280 |         payment_proof_path: 'qa/comprobante-e2e.pdf',
  281 |         payment_proof_uploaded_at: new Date().toISOString(),
  282 |       })
  283 |       .eq('id', order.id)
  284 |     if (error) throw new Error(`No se pudo simular el comprobante: ${error.message}`)
  285 | 
  286 |     await page.getByRole('button', { name: /^Cancelar esta orden$/i }).click()
  287 | 
  288 |     await expect(page.locator('.form-submit-error')).toContainText(/comprobante/i, {
  289 |       timeout: 15_000,
  290 |     })
  291 |     // Y la orden sigue viva: la guarda no es cosmética.
  292 |     expect((await anyRegistrationOrder())?.status).toBe('pendiente')
  293 |   })
  294 | })
  295 | 
  296 | /**
  297 |  * El perfil competitivo incompleto — división, categoría y peso en null en la
  298 |  * ficha del atleta. Es el estado de la cuenta que reportó "el botón no hace
  299 |  * nada": `validateCompetitionForm` exige los tres, y el submit corta antes de
  300 |  * llamar a la API.
  301 |  *
  302 |  * Lo que se protege es que el corte SE VEA. Un CTA que no responde y no dice
  303 |  * por qué no tiene salida: el atleta no sabe que le falta cargar su división,
  304 |  * y desde la pantalla de pago no hay nada que se lo indique.
  305 |  */
  306 | test.describe('Inscripción a competencia — perfil competitivo incompleto', () => {
  307 |   test.beforeEach(async () => {
  308 |     const { error } = await admin
  309 |       .from('athletes')
  310 |       .update({ division: null, category: null, estimated_weight: null })
  311 |       .eq('id', fixture.athleteId)
  312 |     if (error) throw new Error(`No se pudo vaciar el perfil: ${error.message}`)
  313 |   })
  314 | 
  315 |   test.afterEach(async () => {
  316 |     await admin
  317 |       .from('athletes')
  318 |       .update({ division: 'Open', category: 'Raw', estimated_weight: 93 })
  319 |       .eq('id', fixture.athleteId)
  320 |   })
  321 | 
  322 |   test('el CTA explica qué falta en vez de no hacer nada', async ({ page }) => {
  323 |     await page.goto('/mi-cuenta?section=events')
  324 |     await acceptCookies(page)
  325 |     const eventRow = page.locator('article.account-events-list__row', {
  326 |       hasText: fixture.manualOnlyEventTitle,
  327 |     })
  328 |     await eventRow.getByRole('button', { name: /Inscribirme/i }).click()
  329 | 
  330 |     await redeemCode(page, fixture.manualOnlyDiscountCode)
  331 |     await page.locator('label.plu-checkout__pill', { hasText: 'Transferencia bancaria' }).click()
  332 | 
  333 |     await page.getByRole('button', { name: /Continuar al pago/i }).click()
  334 | 
  335 |     // Sin orden creada: el submit corta del lado del cliente, y está bien que
  336 |     // corte. Lo que no puede pasar es que corte en silencio.
  337 |     // El cartel tiene que salir donde el atleta hizo clic —`.form-submit-error`
  338 |     // se pinta justo encima de la barra de pago—, no sólo junto al campo, que
  339 |     // en esta pantalla queda scrolleado varias alturas más arriba.
  340 |     const submitError = page.locator('.form-submit-error')
```