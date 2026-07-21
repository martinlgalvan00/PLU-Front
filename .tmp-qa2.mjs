import { chromium } from 'playwright'

const OUT = 'C:\\Users\\Equipo\\AppData\\Local\\Temp\\claude\\c--Users-Equipo-Desktop-Hobbies-PLU-Front\\73f2c329-8812-4cc5-921f-5b7ba10967e5\\scratchpad'
const URL = 'http://localhost:5174/'

const consoleErrors = []

async function withPage(browser, opts, fn) {
  const page = await browser.newPage(opts)
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(`[${opts._label || '?'}] ${msg.text()}`)
  })
  page.on('pageerror', (err) => consoleErrors.push(`[${opts._label || '?'}] pageerror: ${err.message}`))
  try {
    await fn(page)
  } finally {
    await page.close()
  }
}

async function setTheme(page, theme) {
  await page.evaluate((t) => localStorage.setItem('plu-arg-theme', t), theme)
  await page.reload({ waitUntil: 'networkidle' })
}

const browser = await chromium.launch()

// ---- 1. Header states, desktop dark ----
await withPage(browser, { viewport: { width: 1440, height: 900 }, colorScheme: 'dark', _label: 'header-dark' }, async (page) => {
  await page.goto(URL, { waitUntil: 'networkidle' })
  await setTheme(page, 'dark')
  await page.waitForSelector('.plu-global-nav')
  await page.waitForTimeout(400)
  await page.locator('.site-header').screenshot({ path: `${OUT}/qa-header-top.png` })

  // hover Results to move indicator
  await page.locator('.plu-global-nav__link', { hasText: 'Resultados' }).hover().catch(() => {})
  await page.getByRole('button', { name: /^Resultados$/ }).click().catch(() => {})
  await page.waitForTimeout(350)
  await page.locator('.site-header').screenshot({ path: `${OUT}/qa-header-indicator-results.png` })

  // open Resources dropdown
  await page.getByRole('button', { name: /Recursos/ }).first().click()
  await page.waitForTimeout(350)
  await page.locator('.plu-nav-menu--resources').screenshot({ path: `${OUT}/qa-header-resources-menu.png` })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)

  // scroll down -> scrolled header
  await page.evaluate(() => window.scrollTo(0, 400))
  await page.waitForTimeout(400)
  await page.locator('.site-header').screenshot({ path: `${OUT}/qa-header-scrolled.png` })

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  console.log('desktop overflow:', overflow)
})

// ---- 2. Mobile drawer ----
await withPage(browser, { viewport: { width: 390, height: 844 }, colorScheme: 'dark', _label: 'mobile-drawer' }, async (page) => {
  await page.goto(URL, { waitUntil: 'networkidle' })
  await setTheme(page, 'dark')
  await page.waitForSelector('.plu-global-nav__menu-button')
  await page.locator('.plu-global-nav__menu-button').click()
  await page.waitForTimeout(350)
  await page.screenshot({ path: `${OUT}/qa-mobile-drawer.png` })
  // check hamburger morph (button still visible? it's now the close X via header, but drawer has its own close button)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  console.log('mobile drawer overflow:', overflow)

  // expand Recursos section
  const resourcesToggle = page.locator('.plu-drawer__section-toggle')
  await resourcesToggle.click()
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${OUT}/qa-mobile-drawer-resources.png` })
})

// ---- 3. Home membership section, dark + light, desktop ----
for (const theme of ['dark', 'light']) {
  await withPage(browser, { viewport: { width: 1440, height: 1100 }, colorScheme: theme, _label: `home-${theme}` }, async (page) => {
    await page.goto(URL, { waitUntil: 'networkidle' })
    await setTheme(page, theme)
    await page.waitForSelector('.home-mid-stack')
    await page.evaluate(() => document.querySelector('.home-mid-stack')?.scrollIntoView({ block: 'start' }))
    await page.waitForTimeout(1000)
    await page.locator('.home-mid-stack').screenshot({ path: `${OUT}/qa-home-midstack-${theme}.png` })

    // credential hover
    const cred = page.locator('.home-credential')
    const box = await cred.boundingBox()
    if (box) {
      await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.25)
      await page.waitForTimeout(300)
      await cred.screenshot({ path: `${OUT}/qa-credential-hover-${theme}.png` })
    }
  })
}

// ---- 4. Home membership section, tablet + mobile, dark ----
for (const [label, width, height] of [['tablet', 820, 1200], ['mobile', 390, 1800]]) {
  await withPage(browser, { viewport: { width, height }, colorScheme: 'dark', _label: `home-${label}` }, async (page) => {
    await page.goto(URL, { waitUntil: 'networkidle' })
    await setTheme(page, 'dark')
    await page.waitForSelector('.home-mid-stack')
    await page.evaluate(() => document.querySelector('.home-mid-stack')?.scrollIntoView({ block: 'start' }))
    await page.waitForTimeout(900)
    const box = await page.locator('.home-mid-stack').boundingBox()
    await page.screenshot({ path: `${OUT}/qa-home-midstack-${label}.png`, clip: { x: 0, y: Math.max(0, box.y), width, height: Math.min(box.height + 20, height) } })
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    console.log(`${label} overflow:`, overflow)
  })
}

// ---- 5. FAQ page ----
await withPage(browser, { viewport: { width: 1280, height: 1000 }, colorScheme: 'dark', _label: 'faq' }, async (page) => {
  await page.goto(URL, { waitUntil: 'networkidle' })
  await setTheme(page, 'dark')
  await page.evaluate(() => window.history.pushState({}, '', '/'))
  // navigate via app router by clicking Resources -> FAQ, simpler: use onNavigate through drawer link is complex; try direct hash-based nav if supported, else click through UI
  await page.waitForSelector('.plu-global-nav')
  await page.getByRole('button', { name: /Recursos/ }).first().click()
  await page.waitForTimeout(300)
  await page.getByRole('menuitem', { name: /FAQ|Preguntas/i }).first().click()
  await page.waitForTimeout(600)
  await page.waitForSelector('.faq-item', { timeout: 8000 }).catch(() => {})
  await page.screenshot({ path: `${OUT}/qa-faq-closed.png`, fullPage: false })
  const firstQ = page.locator('.faq-item__trigger').first()
  await firstQ.click()
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${OUT}/qa-faq-open.png`, fullPage: false })
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  console.log('faq overflow:', overflow)
})

// ---- 6. Community page ----
await withPage(browser, { viewport: { width: 1280, height: 1100 }, colorScheme: 'dark', _label: 'community' }, async (page) => {
  await page.goto(URL, { waitUntil: 'networkidle' })
  await setTheme(page, 'dark')
  await page.waitForSelector('.plu-global-nav')
  await page.getByRole('button', { name: /Recursos/ }).first().click()
  await page.waitForTimeout(300)
  await page.getByRole('menuitem', { name: /Comunidad/i }).first().click()
  await page.waitForTimeout(700)
  await page.waitForSelector('.community-directory', { timeout: 8000 }).catch(() => {})
  await page.evaluate(() => document.querySelector('.community-directory')?.scrollIntoView({ block: 'center' }))
  await page.waitForTimeout(700)
  await page.locator('.community-directory').screenshot({ path: `${OUT}/qa-community-directory.png` }).catch(() => {})
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  console.log('community overflow:', overflow)
})

// ---- 7. Reduced motion pass over home + header ----
await withPage(browser, { viewport: { width: 1440, height: 1000 }, colorScheme: 'dark', reducedMotion: 'reduce', _label: 'reduced-motion' }, async (page) => {
  await page.goto(URL, { waitUntil: 'networkidle' })
  await setTheme(page, 'dark')
  await page.waitForSelector('.home-mid-stack')
  await page.evaluate(() => document.querySelector('.home-mid-stack')?.scrollIntoView({ block: 'start' }))
  await page.waitForTimeout(500)
  await page.locator('.home-mid-stack').screenshot({ path: `${OUT}/qa-reduced-motion-home.png` })
})

console.log('CONSOLE_ERRORS:', JSON.stringify(consoleErrors, null, 2))
await browser.close()
console.log('done')
