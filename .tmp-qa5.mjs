import { chromium } from 'playwright'
const OUT = 'C:\\Users\\Equipo\\AppData\\Local\\Temp\\claude\\c--Users-Equipo-Desktop-Hobbies-PLU-Front\\73f2c329-8812-4cc5-921f-5b7ba10967e5\\scratchpad'
const browser = await chromium.launch()
for (const theme of ['dark', 'light']) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, colorScheme: theme })
  await page.goto('http://localhost:5174/', { waitUntil: 'networkidle' })
  await page.evaluate((t) => localStorage.setItem('plu-arg-theme', t), theme)
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForSelector('.home-mid-stack')
  await page.evaluate(() => document.querySelector('.home-mid-stack')?.scrollIntoView({ block: 'start' }))
  await page.waitForTimeout(1000)
  await page.locator('.home-mid-stack').screenshot({ path: `${OUT}/qa2-home-midstack-${theme}.png` })
  await page.close()
}
await browser.close()
console.log('done')
