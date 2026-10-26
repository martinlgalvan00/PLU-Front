import { expect, test } from '@playwright/test'
import {
  acceptCookies,
  athleteRow,
  hiddenStub,
  mockApi,
  OPEN_SLUG,
  openEvent,
  SUBMISSION_SLUG,
  submissionEvent,
} from './mock-api.js'

/**
 * Inscripciones con la landing oculta ("Plataforma en construcción").
 *
 * Mostrar u ocultar la página y vender inscripciones son decisiones separadas
 * (`hiddenLandingTakesRegistrations`): Barbell Submission puede vender mientras
 * se construye su página oficial. Estos flujos aseguran qué ve el público en
 * cada combinación y que la inscripción sale para ESE evento, con todos los
 * datos obligatorios.
 */

const eventPath = (slug) => `/evento/${slug}`

async function openEventPage(page, slug = SUBMISSION_SLUG) {
  await page.goto(eventPath(slug))
  await acceptCookies(page)
}

function constructionPage(page) {
  return page.locator('main.event-under-construction')
}

test.describe('landing oculta · lo que ve el público', () => {
  test('con la venta abierta: aviso de página en construcción + Inscribirme con fecha y sede', async ({
    page,
  }) => {
    await mockApi(page)
    await openEventPage(page)

    const main = constructionPage(page)
    await expect(main).toHaveAttribute('data-registration', 'open')
    await expect(main.getByRole('heading', { level: 1 })).toHaveText('Barbell Submission')
    await expect(main.getByRole('status')).toHaveText(/próximamente/i)
    await expect(main).toContainText('Estamos construyendo algo genial: la página oficial de Barbell Submission')
    await expect(main).toContainText('6 de marzo de 2027')
    await expect(main).toContainText('Virtus Fitness · Berazategui, Buenos Aires')
    await expect(main.getByRole('button', { name: 'Inscribirme' })).toBeVisible()
    await expect(main.getByRole('button', { name: /ver el calendario/i })).toBeVisible()
  })

  test('con la venta cerrada: solo el aviso, sin datos del evento ni botón de inscripción', async ({
    page,
  }) => {
    await mockApi(page, { events: [hiddenStub(), openEvent()] })
    await openEventPage(page)

    const main = constructionPage(page)
    await expect(main).toHaveAttribute('data-registration', 'closed')
    await expect(main).toContainText('Estamos construyendo algo genial: la página oficial de Barbell Submission')
    await expect(main.getByRole('button', { name: 'Inscribirme' })).toHaveCount(0)
    await expect(main).not.toContainText('Virtus')
    await expect(main.getByRole('button', { name: /ver el calendario/i })).toBeVisible()
  })

  test('programada: dice cuándo abre y todavía no deja inscribirse', async ({ page }) => {
    await mockApi(page, {
      events: [submissionEvent({ registration_opens_at: '2099-01-10T15:00:00Z' }), openEvent()],
    })
    await openEventPage(page)

    const main = constructionPage(page)
    await expect(main).toHaveAttribute('data-registration', 'scheduled')
    await expect(main).toContainText(/la inscripción abre el 10 de enero de 2099/i)
    await expect(main.getByRole('button', { name: 'Inscribirme' })).toHaveCount(0)
  })

  test('con la inscripción pausada en la plataforma no ofrece inscribirse', async ({ page }) => {
    await mockApi(page, { platform: { registrationEnabled: false } })
    await openEventPage(page)

    const main = constructionPage(page)
    await expect(main).toContainText('Estamos construyendo algo genial: la página oficial de Barbell Submission')
    await expect(main.getByRole('button', { name: 'Inscribirme' })).toHaveCount(0)
  })

  test('con la venta cerrada el evento oculto no aparece en el calendario', async ({ page }) => {
    await mockApi(page, { events: [hiddenStub(), openEvent()] })
    await page.goto('/eventos')
    await acceptCookies(page)

    const main = page.locator('main')
    await expect(main.getByText('Winter Open').first()).toBeVisible()
    await expect(main.getByText('Barbell Submission')).toHaveCount(0)
  })

  test('con la venta abierta el calendario lo lista y deja inscribirse', async ({ page }) => {
    await mockApi(page)
    await page.goto('/eventos')
    await acceptCookies(page)

    const card = page.locator('.event-card', { hasText: 'Barbell Submission' })
    await expect(card).toBeVisible()
    await expect(card.getByRole('button', { name: /inscribirme/i })).toBeVisible()
  })

  test('con la inscripción pausada en la plataforma no se lista', async ({ page }) => {
    await mockApi(page, { platform: { registrationEnabled: false } })
    await page.goto('/eventos')
    await acceptCookies(page)

    await expect(page.locator('main').getByText('Winter Open').first()).toBeVisible()
    await expect(page.locator('.event-card', { hasText: 'Barbell Submission' })).toHaveCount(0)
  })

  test('el aviso vuelve a donde se abrió: portada o calendario', async ({ page }) => {
    await mockApi(page)
    await page.goto('/')
    await acceptCookies(page)
    await page
      .getByRole('group', { name: 'Barbell Submission' })
      .getByRole('button', { name: /página oficial/i })
      .click()
    await constructionPage(page).getByRole('button', { name: 'Volver al inicio' }).click()
    await expect(page).toHaveURL(/\/$/)

    await openEventPage(page)
    await expect(
      constructionPage(page).getByRole('button', { name: 'Volver al calendario' }),
    ).toBeVisible()
  })

  test('el calendario lista por fecha aunque el catálogo llegue desordenado', async ({ page }) => {
    const visible = submissionEvent({
      rules: { landing: { templateId: 'submission', publicVisible: true, phase: 'published' } },
    })
    // Marzo 2027 llega antes que diciembre 2026.
    await mockApi(page, { events: [visible, openEvent()] })
    await page.goto('/eventos')
    await acceptCookies(page)

    const titles = page.locator('main').getByRole('heading', {
      name: /^(Winter Open|Barbell Submission)$/,
    })
    await expect(titles.first()).toHaveText('Winter Open')
    await expect(titles.nth(1)).toHaveText('Barbell Submission')
  })

  test('sin cuenta, "Inscribirme" lleva a crear la cuenta de atleta', async ({ page }) => {
    await mockApi(page)
    await openEventPage(page)

    await constructionPage(page).getByRole('button', { name: 'Inscribirme' }).click()
    await expect(page.locator('main.event-under-construction')).toHaveCount(0)
    await expect(page.getByRole('heading', { level: 1, name: 'Perfil de atleta' })).toBeVisible()
    // El alta dice a qué torneo vuelve al terminar.
    await expect(
      page
        .getByText('seguís con tu inscripción a Barbell Submission', { exact: false })
        .filter({ visible: true }),
    ).toHaveCount(1)
  })
})

test.describe('portada · viñeta de inscripción con la landing oculta', () => {
  function seasonLane(page) {
    return page.getByRole('group', { name: 'Barbell Submission' })
  }

  test('con la venta abierta muestra "Página oficial" e "Inscribirme"', async ({ page }) => {
    await mockApi(page)
    await page.goto('/')
    await acceptCookies(page)

    const lane = seasonLane(page)
    await expect(lane).toContainText('Ya podés inscribirte')
    await expect(lane.getByRole('button', { name: /página oficial/i })).toBeVisible()
    await expect(lane.getByRole('button', { name: /inscribirme/i })).toBeVisible()
  })

  test('"Página oficial" abre el aviso de próximamente con Inscribirme', async ({ page }) => {
    await mockApi(page)
    await page.goto('/')
    await acceptCookies(page)

    await seasonLane(page).getByRole('button', { name: /página oficial/i }).click()
    await expect(page).toHaveURL(new RegExp(`${eventPath(SUBMISSION_SLUG)}$`))
    const main = constructionPage(page)
    await expect(main.getByRole('status')).toHaveText(/próximamente/i)
    await expect(main.getByRole('button', { name: 'Inscribirme' })).toBeVisible()
  })

  test('"Inscribirme" va directo al formulario de Barbell Submission', async ({ page }) => {
    await mockApi(page, { athlete: athleteRow() })
    await page.goto('/')
    await acceptCookies(page)

    await seasonLane(page).getByRole('button', { name: /inscribirme/i }).click()
    const checkout = page.locator('main')
    await expect(checkout.getByRole('button', { name: /continuar al pago/i })).toBeVisible()
    await expect(checkout.getByRole('heading', { name: 'Barbell Submission' })).toBeVisible()
    await expect(checkout).not.toContainText('Winter Open')
  })

  test('con la venta cerrada no aparece en la portada', async ({ page }) => {
    await mockApi(page, { events: [hiddenStub(), openEvent()] })
    await page.goto('/')
    await acceptCookies(page)

    await expect(page.locator('.home-season-actions').first()).toBeVisible()
    await expect(seasonLane(page)).toHaveCount(0)
    await expect(page.locator('.home-season-actions')).not.toContainText('Barbell Submission')
  })
})

test.describe('landing visible de Barbell Submission · botón de inscripción', () => {
  const visibleLanding = { landing: { templateId: 'submission', themeId: 'ember', publicVisible: true, phase: 'published' } }

  test('con la venta abierta muestra "Inscribirme"', async ({ page }) => {
    await mockApi(page, { events: [submissionEvent({ rules: visibleLanding }), openEvent()] })
    await openEventPage(page)

    const landing = page.locator('main.submission-landing')
    await expect(landing).toBeVisible()
    await expect(landing.getByRole('button', { name: 'Inscribirme' })).toBeVisible()
  })

  test('"Solo anuncio" no ofrece inscribirse (el servidor lo rechazaría con 409)', async ({
    page,
  }) => {
    await mockApi(page, {
      events: [
        submissionEvent({ rules: { ...visibleLanding, salesIntent: 'announce' } }),
        openEvent(),
      ],
    })
    await openEventPage(page)

    const landing = page.locator('main.submission-landing')
    await expect(landing).toBeVisible()
    await expect(landing.getByRole('button', { name: 'Inscribirme' })).toHaveCount(0)
  })
})

test.describe('atleta · inscripción desde la página en construcción', () => {
  async function startCheckout(page, scenario = {}) {
    const api = await mockApi(page, { athlete: athleteRow(), ...scenario })
    await openEventPage(page)
    await constructionPage(page).getByRole('button', { name: 'Inscribirme' }).click()
    const checkout = page.locator('main')
    await expect(checkout.getByRole('button', { name: /continuar al pago/i })).toBeVisible()
    return { api, checkout }
  }

  test('el checkout es de Barbell Submission, no del evento destacado', async ({ page }) => {
    const { checkout } = await startCheckout(page)

    await expect(checkout.getByRole('heading', { name: 'Barbell Submission' })).toBeVisible()
    await expect(checkout).not.toContainText('Winter Open')
    await expect(checkout).toContainText('$ 75.000')
  })

  test('solo ofrece las categorías y modalidades del evento', async ({ page }) => {
    const { checkout } = await startCheckout(page, {
      events: [
        submissionEvent({
          rules: {
            offering: {
              categories: ['Raw'],
              divisions: ['Open'],
              modalities: ['full_power', 'bench'],
            },
          },
        }),
        openEvent(),
      ],
    })

    // Una sola categoría: se muestra fija, sin selector.
    await expect(checkout.getByRole('radio', { name: /raw with wraps/i })).toHaveCount(0)
    await expect(checkout.getByRole('checkbox', { name: /full power/i })).toBeVisible()
    await expect(checkout.getByRole('checkbox', { name: /banco/i })).toBeVisible()
    await expect(checkout.getByRole('checkbox', { name: /push-pull/i })).toHaveCount(0)
    await expect(checkout.getByRole('checkbox', { name: /sentadilla/i })).toHaveCount(0)
  })

  test('sin modalidad no pide el cobro', async ({ page }) => {
    const { api, checkout } = await startCheckout(page)

    await checkout.getByRole('checkbox', { name: /full power/i }).uncheck()
    await checkout.getByRole('button', { name: /continuar al pago/i }).click()

    await expect(checkout.getByText('Elegí al menos una modalidad.').first()).toBeVisible()
    expect(api.registrationRequests).toHaveLength(0)
  })

  test('sin categoría de peso no pide el cobro', async ({ page }) => {
    const { api, checkout } = await startCheckout(page)

    await checkout.getByLabel(/categoría de peso/i).selectOption('')
    await checkout.getByRole('button', { name: /continuar al pago/i }).click()

    await expect(
      checkout.getByText('Seleccioná la categoría de peso en la que vas a competir.').first(),
    ).toBeVisible()
    expect(api.registrationRequests).toHaveLength(0)
  })

  test('sin peso corporal válido no pide el cobro', async ({ page }) => {
    const { api, checkout } = await startCheckout(page)

    await checkout.getByLabel(/peso corporal/i).fill('5')
    await checkout.getByRole('button', { name: /continuar al pago/i }).click()

    await expect(checkout.getByText(/entre 10 y 250 kg/i).first()).toBeVisible()
    expect(api.registrationRequests).toHaveLength(0)
  })

  test('completa: la orden sale para Barbell Submission con división, categoría, modalidad y peso', async ({
    page,
  }) => {
    const { api, checkout } = await startCheckout(page)

    await checkout.getByRole('radio', { name: /raw with wraps/i }).check()
    await checkout.getByRole('checkbox', { name: /banco/i }).check()
    await checkout.getByLabel(/peso corporal/i).fill('66')
    await checkout.getByLabel(/categoría de peso/i).selectOption('67,5')

    const sent = page.waitForRequest(
      (request) =>
        request.url().endsWith('/api/athletes/me/registrations') && request.method() === 'POST',
    )
    await checkout.getByRole('button', { name: /continuar al pago/i }).click()
    const body = (await sent).postDataJSON()

    expect(body).toMatchObject({
      eventSlug: SUBMISSION_SLUG,
      division: 'Open',
      category: 'Raw With Wraps',
      modalities: ['full_power', 'bench'],
      declaredWeightClass: '67,5',
      bodyweightKg: 66,
      paymentMethod: 'mercado_pago',
    })
    expect(body.eventSlug).not.toBe(OPEN_SLUG)
    expect(api.registrationRequests).toHaveLength(1)
  })
})

test.describe('atleta · checkout de competencia', () => {
  async function openCheckout(page, scenario = {}) {
    const api = await mockApi(page, { athlete: athleteRow(), ...scenario })
    await openEventPage(page)
    await constructionPage(page).getByRole('button', { name: 'Inscribirme' }).click()
    const checkout = page.locator('main')
    await expect(checkout.getByRole('button', { name: /continuar al pago/i })).toBeVisible()
    return { api, checkout }
  }

  async function fillAndSubmit(checkout) {
    await checkout.getByLabel(/peso corporal/i).fill('66')
    await checkout.getByLabel(/categoría de peso/i).selectOption('67,5')
    await checkout.getByRole('button', { name: /continuar al pago/i }).click()
  }

  test('un atleta Junior arranca anotado en su franja de edad, no solo en Open', async ({
    page,
  }) => {
    const { checkout } = await openCheckout(page, {
      athlete: athleteRow({ birth_date: '2006-05-10', division: 'Open' }),
    })

    await expect(checkout.getByRole('checkbox', { name: /junior/i })).toBeChecked()
  })

  test('después de "Continuar al pago" la pantalla queda en el panel de pago', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const { checkout } = await openCheckout(page)
    await fillAndSubmit(checkout)

    await expect(page.locator('.register-settle')).toBeInViewport()
    await expect(page.locator('.register-settle')).toBeFocused()
  })

  test('un rechazo de negocio no se presenta como problema de pago', async ({ page }) => {
    const { checkout } = await openCheckout(page, {
      registrationResponse: {
        status: 409,
        body: { error: 'No quedan cupos para este evento.', code: 'PLU04' },
      },
    })
    await fillAndSubmit(checkout)

    await expect(checkout.getByText('No quedan cupos para este evento.').first()).toBeVisible()
    await expect(page.getByText('¿Tenés problemas para pagar?')).toHaveCount(0)
  })
})
