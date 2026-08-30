import { chromium } from 'playwright'

const BASE = process.env.BASE ?? 'http://localhost:4173'
const TAG = process.env.TAG ?? 'cold'

const browser = await chromium.launch()

async function profilePath(path, label, { cpuThrottle = 4, waitMs = 6000 } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } })
  const page = await ctx.newPage()
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuThrottle })
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })

  const jsFiles = []
  page.on('response', (r) => {
    if (r.url().endsWith('.js')) jsFiles.push(r.url().split('/').pop())
  })

  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
  const data = await page.evaluate(
    (ms) =>
      new Promise((resolve) => {
        const longTasks = []
        let obs
        try {
          obs = new PerformanceObserver((l) => {
            for (const e of l.getEntries()) if (e.duration > 50) longTasks.push(Math.round(e.duration))
          })
          obs.observe({ entryTypes: ['longtask'] })
        } catch {}
        setTimeout(() => {
          obs?.disconnect()
          const nav = performance.getEntriesByType('navigation')[0]
          const paint = performance.getEntriesByType('paint')
          let lcp = 0
          new PerformanceObserver(() => {}).disconnect()
          try {
            lcp = performance.getEntriesByType('largest-contentful-paint').slice(-1)[0]?.startTime ?? 0
          } catch {}
          resolve({
            ttfb: Math.round(nav?.responseStart ?? 0),
            fcp: Math.round(paint.find((p) => p.name === 'first-contentful-paint')?.startTime ?? 0),
            lcp: Math.round(lcp),
            dcl: Math.round(nav?.domContentLoadedEventEnd ?? 0),
            longTasks: longTasks.length,
            longTotal: longTasks.reduce((s, d) => s + d, 0),
            longMax: Math.max(0, ...longTasks),
          })
        }, ms)
      }),
    waitMs,
  )
  await ctx.close()
  return { label, ...data, jsFiles }
}

const home = await profilePath('/', 'home-cold-cpu4')
console.log(`\n===== ${TAG} =====`)
console.log(
  `${home.label}: ttfb=${home.ttfb} fcp=${home.fcp} lcp=${home.lcp} dcl=${home.dcl} longTasks=${home.longTasks} (${home.longTotal}ms, max ${home.longMax}ms)`,
)
console.log('JS en home:', home.jsFiles.join(', '))

// Vista interna via path canónico
for (const [path, label] of [
  ['/resultados', 'results'],
  ['/eventos', 'events'],
  ['/quienes-somos', 'team'],
]) {
  const r = await profilePath(path, `${label}-cold-cpu4`, { waitMs: 4000 })
  console.log(`${r.label}: ttfb=${r.ttfb} fcp=${r.fcp} lcp=${r.lcp} dcl=${r.dcl} longTasks=${r.longTasks} (${r.longTotal}ms)`)
}

await browser.close()
