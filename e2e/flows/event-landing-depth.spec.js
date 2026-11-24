import { expect, test } from '@playwright/test'
import { acceptCookies, mockApi, openEvent, submissionEvent } from './mock-api.js'

/**
 * Preset de animación "Profundidad" (`depth`): paso de escena en 3D.
 *
 * Asegura lo que el staff elige en el editor: las escenas debajo del primer
 * pantallazo esperan con perspectiva, llegan de frente al scrollear, la que se
 * va se aleja (animación ligada al scroll, Chromium la soporta) y nada de eso
 * pasa con movimiento reducido o en equipos de gama baja.
 */

const BUILDER_SLUG = 'barbell-submission-2027'

function builderLanding(motion) {
  return submissionEvent({
    rules: {
      landing: {
        templateId: 'builder',
        themeId: 'ember',
        publicVisible: true,
        // Sin bloques guardados el Constructor arma los de siempre.
        layout: { motion },
      },
    },
  })
}

function submissionLanding(motion) {
  return submissionEvent({
    rules: {
      landing: {
        templateId: 'submission',
        themeId: 'ember',
        publicVisible: true,
        phase: 'published',
        layout: { motion },
      },
    },
  })
}

async function open(page, event) {
  await mockApi(page, { events: [event, openEvent()] })
  await page.goto(`/evento/${event.slug}`)
  await acceptCookies(page)
}

/**
 * Primera escena que quedó esperando debajo del pantallazo. Se fija por su id:
 * un locator por `data-reveal` dejaría de encontrarla apenas se revela.
 */
async function hiddenScene(page) {
  const first = page.locator('main [data-reveal="hidden"]').first()
  await expect(first).toBeAttached()
  const id = await first.evaluate((node) => {
    if (!node.id) node.id = `escena-e2e-${Math.random().toString(36).slice(2)}`
    return node.id
  })
  return page.locator(`[id="${id}"]`)
}

const transformOf = (locator) =>
  locator.evaluate((node) => getComputedStyle(node).transform)

test.describe('Profundidad · landing del Constructor', () => {
  test('las escenas esperan con perspectiva y llegan de frente al scrollear', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await open(page, builderLanding('depth'))

    const main = page.locator('main.event-builder')
    await expect(main).toHaveAttribute('data-motion', 'depth')

    const scene = await hiddenScene(page)
    await expect(scene).toHaveAttribute('data-scene', '')
    // Esperando: transform 3D (matrix3d) y transparente.
    expect(await transformOf(scene)).toMatch(/^matrix3d\(/)
    await expect(scene).toHaveCSS('opacity', '0')

    await scene.scrollIntoViewIfNeeded()
    await expect(scene).toHaveAttribute('data-reveal', 'shown')
    await expect(scene).toHaveCSS('opacity', '1')
    await expect.poll(() => transformOf(scene)).toBe('none')
  })

  test('la portada se aleja cuando se va por arriba (animación ligada al scroll)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await open(page, builderLanding('depth'))

    const heroContent = page.locator('.lb-hero__inner[data-scene-content]')
    await expect(heroContent).toHaveCSS('opacity', '1')

    const heroHeight = await page.locator('.lb-hero').evaluate((node) => node.offsetHeight)
    await page.evaluate((y) => window.scrollTo(0, y), Math.round(heroHeight * 0.85))
    await expect
      .poll(() => heroContent.evaluate((node) => Number(getComputedStyle(node).opacity)))
      .toBeLessThan(0.95)
    expect(await transformOf(heroContent)).toMatch(/^matrix3d\(/)
  })

  test('con movimiento reducido no hay perspectiva, espera ni salida', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await open(page, builderLanding('depth'))

    await expect(page.locator('main.event-builder')).toHaveAttribute('data-motion', 'depth')
    await expect(page.locator('main [data-reveal]')).toHaveCount(0)

    const heroContent = page.locator('.lb-hero__inner[data-scene-content]')
    await page.evaluate(() => window.scrollTo(0, 600))
    await expect(heroContent).toHaveCSS('opacity', '1')
    expect(await transformOf(heroContent)).toBe('none')
  })

  test('en equipos de gama baja cae a un fundido plano', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await open(page, builderLanding('depth'))
    await page.evaluate(() => {
      document.documentElement.dataset.motionTier = 'low'
    })

    const scene = await hiddenScene(page)
    // El cambio de regla pasa por la transición: se espera a que se asiente.
    await expect.poll(() => transformOf(scene)).toMatch(/^matrix\(/)
  })

  test('con "Suave" las escenas solo suben, sin 3D', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await open(page, builderLanding('soft'))

    expect(await transformOf(await hiddenScene(page))).toMatch(/^matrix\(/)
  })
})

test.describe('Profundidad · landing de Submission', () => {
  test('las secciones también son escenas con paso en 3D', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await open(page, submissionLanding('depth'))

    const main = page.locator('main.submission-landing')
    await expect(main).toHaveAttribute('data-motion', 'depth')

    const scene = await hiddenScene(page)
    expect(await transformOf(scene)).toMatch(/^matrix3d\(/)
    await scene.scrollIntoViewIfNeeded()
    await expect(scene).toHaveAttribute('data-reveal', 'shown')
    await expect(scene).toHaveCSS('opacity', '1')
  })

  test('sin animaciones elegidas, todo aparece de una vez', async ({ page }) => {
    await open(page, submissionLanding('none'))
    await expect(page.locator('main.submission-landing')).toHaveAttribute('data-motion', 'none')
    await expect(page.locator('main [data-reveal]')).toHaveCount(0)
  })
})

test('el slug de la landing de prueba es el de Barbell Submission', () => {
  expect(builderLanding('depth').slug).toBe(BUILDER_SLUG)
})
