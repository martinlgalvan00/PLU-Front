import { chromium } from 'playwright'

const BASE = process.env.BASE ?? 'http://localhost:4173'
const TAG = process.env.TAG ?? 'base'

const browser = await chromium.launch()

async function collect(page, label, ms = 6000) {
  return page.evaluate(
    ({ label, ms }) =>
      new Promise((resolve) => {
        const longTasks = []
        let obs
        try {
          obs = new PerformanceObserver((list) => {
            for (const e of list.getEntries()) if (e.duration > 50) longTasks.push(e.duration)
          })
          obs.observe({ entryTypes: ['longtask'] })
        } catch {
          /* longtask no soportado */
        }
        setTimeout(() => {
          try {
            obs?.disconnect()
          } catch {}
          const nav = performance.getEntriesByType('navigation')[0]
          const paint = performance.getEntriesByType('paint')
          let lcp = 0
          try {
            const lcpEntries = performance.getEntriesByType('largest-contentful-paint')
            lcp = lcpEntries[lcpEntries.length - 1]?.startTime ?? 0
          } catch {}
          const res = performance.getEntriesByType('resource')
          const js = res.filter((r) => r.name.endsWith('.js'))
          const css = res.filter((r) => r.name.endsWith('.css'))
          resolve({
            label,
            ttfb: Math.round(nav?.responseStart ?? 0),
            fcp: Math.round(paint.find((p) => p.name === 'first-contentful-paint')?.startTime ?? 0),
            lcp: Math.round(lcp),
            dcl: Math.round(nav?.domContentLoadedEventEnd ?? 0),
            jsFiles: js.length,
            jsTransferKB: Math.round(js.reduce((s, r) => s + (r.transferSize || 0), 0) / 1024),
            cssFiles: css.length,
            cssTransferKB: Math.round(css.reduce((s, r) => s + (r.transferSize || 0), 0) / 1024),
            longTasks: longTasks.length,
            longTasksTotalMs: Math.round(longTasks.reduce((s, d) => s + d, 0)),
            longTasksMaxMs: Math.round(Math.max(0, ...longTasks)),
          })
        }, ms)
      }),
    { label, ms },
  )
}

const results = []

// Carga inicial de la home
{
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
  results.push(await collect(page, 'home-load+6s', 6000))

  // Navegación interna (SPA) hacia vistas pesadas si expone __pluNav
  const hasNav = await page.evaluate(() => typeof window.__pluNav === 'function')
  if (hasNav) {
    for (const view of ['register', 'events', 'results', 'pitbull']) {
      await page.evaluate((v) => window.__pluNav(v), view)
      results.push(await collect(page, `nav-${view}+4s`, 4000))
    }
  } else {
    results.push({ label: 'sin __pluNav en preview' })
  }

  // Idle 8s: ¿long tasks por polling/render en reposo?
  results.push(await collect(page, 'idle+8s', 8000))
  await ctx.close()
}

// Mobile
{
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    cpu: { throttle: 4 },
  })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
  results.push(await collect(page, 'home-mobile-throttled', 6000))
  await ctx.close()
}

await browser.close()
console.log(`\n===== PERF ${TAG} (${BASE}) =====`)
for (const r of results) {
  if (!r.ttfb && r.label?.startsWith('sin')) {
    console.log(r.label)
    continue
  }
  console.log(
    `${r.label.padEnd(22)} ttfb=${r.ttfb}ms fcp=${r.fcp}ms lcp=${r.lcp}ms dcl=${r.dcl}ms ` +
      `js=${r.jsFiles}arch/${r.jsTransferKB}KB css=${r.cssFiles}arch/${r.cssTransferKB}KB ` +
      `longTasks=${r.longTasks} (${r.longTasksTotalMs}ms, max ${r.longTasksMaxMs}ms)`,
  )
}
