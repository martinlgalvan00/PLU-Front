import { readFile } from 'node:fs/promises'
import { test } from '@playwright/test'
import { FIXTURE_PATH } from './global-setup.js'
import {
  acceptCookies,
  navigateToTickets,
  assertTicketTypeVisible,
  fillAttendeeForm,
  selectTicketType,
  setTicketQuantity,
  selectPaymentMethod,
  submitTicketPurchase,
  assertOrderCreated,
} from './ticket-purchase-helpers.js'

let fixture

test.beforeAll(async () => {
  fixture = JSON.parse(await readFile(FIXTURE_PATH, 'utf8'))
})

/**
 * BLOQUEADO: la página pública no llega a ofrecer las entradas en el entorno
 * E2E, así que estos pasos no se pueden ejercitar todavía.
 *
 * Se destraban tres cosas ya corregidas (la ruta era `/entradas/<slug>`, que no
 * existe; el fixture escribía una columna `pricing` que la tabla no tiene; y
 * faltaba `VITE_TICKET_SALES_ENABLED`), pero queda una cuarta: el evento llega
 * a la página -- el hero muestra su título -- y aun así `pricing.ticketsEnabled`
 * no resulta `true`, pese a que en la base `rules` lo tiene. O sea que el
 * mapeo `rules -> pricing` del catálogo público no está llegando a
 * `TicketsPage`. Hasta resolverlo la página muestra "Próximamente".
 *
 * La emisión de credenciales y el canje por zona SÍ están cubiertos, contra la
 * misma RPC que usa el servidor, en `ticket-credentials.spec.js`.
 */
test.describe.fixme('Venta de Entradas', () => {
  test('permite comprar una entrada para público general y una para entrenador', async ({
    page,
  }) => {
    // 1) Navegar a la página de entradas del evento
    await navigateToTickets(page, fixture.ticketEventSlug)
    await acceptCookies(page)

    // 2) Verificar que los tipos de entrada están visibles con sus precios correctos
    await assertTicketTypeVisible(page, 'Entrenadores', '10.000')
    await assertTicketTypeVisible(page, 'Público general', '20.000')

    // 3) Queremos comprar 2 entradas, así que ajustamos la cantidad
    await setTicketQuantity(page, 2)

    // 4) Llenamos el primer asistente (Público general)
    await fillAttendeeForm(page, 0, { fullName: 'Juan Público', dni: '12345678' })
    await selectTicketType(page, 0, 'Público general')

    // 5) Llenamos el segundo asistente (Entrenadores)
    await fillAttendeeForm(page, 1, { fullName: 'Pepe Entrenador', dni: '87654321' })
    await selectTicketType(page, 1, 'Entrenadores')

    // 6) Seleccionamos el método de pago
    await selectPaymentMethod(page, 'transferencia')

    // 7) Enviamos la compra
    await submitTicketPurchase(page)

    // 8) Verificamos que la orden se creó correctamente con el total esperado (10.000 + 20.000 = 30.000)
    //    y la cantidad de 2 entradas.
    await assertOrderCreated(page, { expectedAmount: '30.000', expectedQuantity: 2 })
  })
})
