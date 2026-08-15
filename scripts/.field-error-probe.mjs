import { chromium } from 'playwright'
import { join } from 'path'

const outDir = join(process.cwd(), 'scripts', '.visual-check-output')
const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
})
const page = await browser.newPage({ viewport: { width: 1440, height: 950 }, colorScheme: 'dark' })
await page.goto('http://127.0.0.1:5173/afiliacion', { waitUntil: 'networkidle' })
await page.getByRole('button', { name: /Comenzar afiliaci/i }).first().click()
await page.waitForTimeout(1500)

const info = await page.evaluate(() => ({
  main: document.querySelector('main')?.className ?? null,
  fields: [...document.querySelectorAll('.field')].map((f) => ({
    cls: f.className,
    name: f.querySelector('input, select')?.name ?? null,
    label: f.querySelector('.field__label')?.textContent ?? null,
  })),
  formButtons: [...document.querySelectorAll('form button')].map((b) => b.textContent.trim()),
}))
console.log(JSON.stringify(info, null, 1))
await page.screenshot({ path: join(outDir, 'register-probe.png') })
await browser.close()
