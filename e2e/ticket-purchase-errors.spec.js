import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { FIXTURE_PATH } from './global-setup.js'
import {
  navigateToTickets,
  assertSalesPaused,
  fillAttendeeForm,
  fillReadyTicketCheckout,
  selectTicketType,
  selectPaymentMethod,
  submitTicketPurchase,
  purchaseTickets,
  assertOrderCreated,
  assertPurchaseError,
  clearCurrentTicketOrder,
  openTicketCredential,
  setTicketQuantity,
} from './ticket-purchase-helpers.js'

let fixture

test.beforeAll(async () => {
  fixture = JSON.parse(await readFile(FIXTURE_PATH, 'utf8'))
})

test.describe('Errores de compra de entradas', () => {
  test.describe.configure({ timeout: 90_000, retries: 1 })
  test('rechaza nombre corto y DNI inválido sin pegarle al backend', async ({ page }) => {
    await navigateToTickets(page, fixture.ticketEventSlug, { title: fixture.ticketEventTitle })

    const posts = []
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().includes('/api/tickets/orders')) {
        posts.push(request)
      }
    })

    await fillAttendeeForm(page, 0, { fullName: 'Al', dni: 'abc' })
    await selectTicketType(page, 0, 'Público general')
    await selectPaymentMethod(page, 'transferencia')
    await submitTicketPurchase(page)

    await assertPurchaseError(page, { field: 'attendee-0-fullName', message: /nombre/i })
    await assertPurchaseError(page, { field: 'attendee-0-dni', message: /dígitos/i })
    expect(posts).toHaveLength(0)
  })

  test('rechaza un DNI de 6 dígitos', async ({ page }) => {
    await navigateToTickets(page, fixture.ticketEventSlug, { title: fixture.ticketEventTitle })

    await fillAttendeeForm(page, 0, { fullName: 'Nombre Completo', dni: '123456' })
    await selectTicketType(page, 0, 'Público general')
    await selectPaymentMethod(page, 'transferencia')
    await submitTicketPurchase(page)

    await assertPurchaseError(page, { field: 'attendee-0-dni', message: /dígitos/i })
    await expect(page.locator('.ticket-purchase--confirmation')).toHaveCount(0)
  })

  test('rechaza un DNI de 9 dígitos', async ({ page }) => {
    await navigateToTickets(page, fixture.ticketEventSlug, { title: fixture.ticketEventTitle })

    const posts = []
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().includes('/api/tickets/orders')) {
        posts.push(request)
      }
    })

    await fillAttendeeForm(page, 0, { fullName: 'Nombre Completo', dni: '123456789' })
    await selectTicketType(page, 0, 'Público general')
    await selectPaymentMethod(page, 'transferencia')
    await submitTicketPurchase(page)

    await assertPurchaseError(page, { field: 'attendee-0-dni', message: /dígitos/i })
    await expect(page.locator('.ticket-purchase--confirmation')).toHaveCount(0)
    expect(posts).toHaveLength(0)
  })

  test('el formulario arranca con un tipo de entrada seleccionado', async ({ page }) => {
    await navigateToTickets(page, fixture.ticketEventSlug, { title: fixture.ticketEventTitle })

    // Los radios no se pueden dejar vacíos: el default es el primer tipo.
    // "Enviar sin elegir tipo" no es un estado alcanzable en esta UI.
    const checked = page.locator('input[name="attendee-0-ticketTypeId"]:checked')
    await expect(checked).toHaveCount(1)
  })

  test('un evento con la venta cerrada muestra Próximamente', async ({ page }) => {
    await navigateToTickets(page, fixture.pausedEventSlug, {
      title: fixture.pausedEventTitle,
      expectCheckout: false,
    })
    await assertSalesPaused(page)
    await expect(page.locator('.tickets-page__hero')).toContainText(fixture.pausedEventTitle)
  })

  test('la segunda compra sobre un cupo de 1 se rechaza como agotado', async ({ page }) => {
    await navigateToTickets(page, fixture.soldOutEventSlug, { title: fixture.soldOutEventTitle })
    await purchaseTickets(page, {
      attendees: [{ fullName: 'Primer Comprador', dni: '40555666' }],
    })
    await assertOrderCreated(page, { expectedAmount: '15.000', expectedQuantity: 1 })

    await clearCurrentTicketOrder(page)
    await navigateToTickets(page, fixture.soldOutEventSlug, { title: fixture.soldOutEventTitle })
    await purchaseTickets(page, {
      attendees: [{ fullName: 'Segundo Comprador', dni: '40666777' }],
      expectOk: false,
    })

    await assertPurchaseError(page, { message: /agotad/i })
    await expect(page.locator('.ticket-purchase--confirmation')).toHaveCount(0)
  })

  test('un doble envío no crea dos órdenes', async ({ page }) => {
    await navigateToTickets(page, fixture.ticketEventSlug, { title: fixture.ticketEventTitle })
    await fillReadyTicketCheckout(page, {
      attendees: [{ fullName: 'Doble Envío', dni: '40777888', type: 'Público general' }],
    })

    const posts = []
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().includes('/api/tickets/orders')) {
        posts.push(request)
      }
    })

    await page.locator('#checkout form.ticket-purchase').evaluate((form) => {
      form.requestSubmit()
      form.requestSubmit()
    })

    await assertOrderCreated(page, { expectedAmount: '20.000', expectedQuantity: 1 })
    expect(posts.length).toBeGreaterThanOrEqual(1)
    const keys = posts.map((request) => {
      const body = request.postData()
      return body ? JSON.parse(body).idempotencyKey : null
    })
    expect(new Set(keys.filter(Boolean)).size).toBe(1)
  })

  test('un código PREV-* no consulta el backend', async ({ page }) => {
    const previewCode = `PREV-${randomUUID().slice(0, 8).toUpperCase()}`
    const verifyCalls = []
    page.on('request', (request) => {
      if (request.url().includes('/api/tickets/verify/')) verifyCalls.push(request)
    })

    await openTicketCredential(page, {
      qrToken: previewCode,
      eventSlug: fixture.ticketEventSlug,
    })

    await expect(page.locator('.credential-page__preview-banner')).toBeVisible()
    await expect(page.locator('.credential-page')).toContainText(previewCode)
    await expect(page.getByRole('button', { name: /marcar ingreso/i })).toHaveCount(0)
    expect(verifyCalls).toHaveLength(0)
  })

  test('enviar el form vacío no pega al backend', async ({ page }) => {
    await navigateToTickets(page, fixture.ticketEventSlug, { title: fixture.ticketEventTitle })

    const posts = []
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().includes('/api/tickets/orders')) {
        posts.push(request)
      }
    })

    await submitTicketPurchase(page)
    await assertPurchaseError(page, { field: 'attendee-0-fullName', message: /nombre/i })
    await assertPurchaseError(page, { field: 'attendee-0-dni', message: /dígitos/i })
    expect(posts).toHaveLength(0)
  })

  test('un DNI de 7 dígitos es válido', async ({ page }) => {
    await navigateToTickets(page, fixture.ticketEventSlug, { title: fixture.ticketEventTitle })
    await purchaseTickets(page, {
      attendees: [{ fullName: 'Lila Siete', dni: '1234567', type: 'Público general' }],
    })
    await assertOrderCreated(page, { expectedAmount: '20.000', expectedQuantity: 1 })
  })

  test('la segunda fila vacía en un lote no crea la orden', async ({ page }) => {
    await navigateToTickets(page, fixture.ticketEventSlug, { title: fixture.ticketEventTitle })
    await setTicketQuantity(page, 2)
    await fillReadyTicketCheckout(page, {
      attendees: [{ fullName: 'Sólo Uno', dni: '40888777', type: 'Público general' }],
      quantity: 2,
    })

    const posts = []
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().includes('/api/tickets/orders')) {
        posts.push(request)
      }
    })

    await submitTicketPurchase(page)
    await assertPurchaseError(page, { field: 'attendee-1-fullName', message: /nombre/i })
    await assertPurchaseError(page, { field: 'attendee-1-dni', message: /dígitos/i })
    expect(posts).toHaveLength(0)
  })

  test('no se pueden pedir más de 8 entradas', async ({ page }) => {
    await navigateToTickets(page, fixture.ticketEventSlug, { title: fixture.ticketEventTitle })
    await setTicketQuantity(page, 8)
    const addButton = page.getByRole('button', { name: /sumar entrada/i })
    await expect(addButton).toBeDisabled()
    await expect(page.locator('input[name="attendee-7-fullName"]')).toBeVisible()
    await expect(page.locator('input[name="attendee-8-fullName"]')).toHaveCount(0)
  })

  test('un comprobante que no es imagen ni PDF se rechaza', async ({ page }) => {
    await navigateToTickets(page, fixture.ticketEventSlug, { title: fixture.ticketEventTitle })
    await purchaseTickets(page, {
      attendees: [{ fullName: 'Pato Comprobante', dni: '40911222', type: 'Público general' }],
    })
    await assertOrderCreated(page, { expectedAmount: '20.000', expectedQuantity: 1 })

    await page.locator('.ticket-purchase__proof-upload input[type="file"]').setInputFiles({
      name: 'comprobante.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('esto no es un comprobante'),
    })
    await page.getByRole('button', { name: /enviar comprobante/i }).click()
    await expect(page.locator('.ticket-purchase__submit-error')).toContainText(/formato|JPG|PNG|PDF/i)
  })
})
