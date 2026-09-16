# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: admin-events-edit-payment-matrix.spec.js >> Panel de eventos: edición y medios de cobro >> la matriz del evento guarda Mercado Pago, transferencia, efectivo y Wise
- Location: e2e\admin-events-edit-payment-matrix.spec.js:75:3

# Error details

```
Error: expect(locator).toHaveValue(expected) failed

Locator:  locator('#event-bank-alias')
Expected: "plu.e2e.qa"
Received: ""
Timeout:  10000ms

Call log:
  - Expect "toHaveValue" with timeout 10000ms
  - waiting for locator('#event-bank-alias')
    24 × locator resolved to <input value="" type="text" maxlength="120" id="event-bank-alias" name="bankTransfer.alias" placeholder="Ej. club.troupe.mp"/>
       - unexpected value ""

```

```yaml
- textbox "Alias":
  - /placeholder: Ej. club.troupe.mp
```

# Test source

```ts
  1   | import { readFile } from 'node:fs/promises'
  2   | import { createClient } from '@supabase/supabase-js'
  3   | import { expect, test } from '@playwright/test'
  4   | import { loginAsAdmin } from './admin-helpers.js'
  5   | import { FIXTURE_PATH } from './global-setup.js'
  6   | import { resolveLocalSupabase } from './local-supabase.js'
  7   | import { buildAdminEventPath } from '../src/lib/adminEventRoute.js'
  8   | 
  9   | let fixture
  10  | let admin
  11  | 
  12  | test.describe('Panel de eventos: edición y medios de cobro', () => {
  13  |   test.describe.configure({ mode: 'serial', timeout: 120_000, retries: 1 })
  14  | 
  15  |   test.beforeAll(async () => {
  16  |     fixture = JSON.parse(await readFile(FIXTURE_PATH, 'utf8'))
  17  |     const supabase = resolveLocalSupabase()
  18  |     admin = createClient(supabase.url, supabase.serviceRoleKey, {
  19  |       auth: { persistSession: false, autoRefreshToken: false },
  20  |     })
  21  |   })
  22  | 
  23  |   async function saveEvent(page) {
  24  |     const response = page.waitForResponse(
  25  |       (candidate) =>
  26  |         candidate.url().includes('/api/events/upsert') && candidate.request().method() === 'POST',
  27  |     )
  28  |     await page.getByRole('button', { name: /^Guardar cambios$/i }).click()
  29  |     const result = await response
  30  |     expect(result.ok(), await result.text()).toBeTruthy()
  31  |     await expect(page.getByRole('button', { name: /^Guardar cambios$/i })).toBeDisabled({
  32  |       timeout: 20_000,
  33  |     })
  34  |   }
  35  | 
  36  |   async function storedEvent(slug) {
  37  |     const { data, error } = await admin
  38  |       .from('events')
  39  |       .select('venue, payment_channel_overrides')
  40  |       .eq('slug', slug)
  41  |       .single()
  42  |     if (error) throw new Error(`No se pudo releer ${slug}: ${error.message}`)
  43  |     return data
  44  |   }
  45  | 
  46  |   test('los eventos generales permiten editar y persistir sus datos', async ({ page }) => {
  47  |     await loginAsAdmin(page, { email: fixture.adminEmail, password: fixture.adminPassword })
  48  |     const events = [
  49  |       [fixture.eventSlug, fixture.eventTitle],
  50  |       [fixture.manualOnlyEventSlug, fixture.manualOnlyEventTitle],
  51  |       [fixture.soldOutEventSlug, fixture.soldOutEventTitle],
  52  |       [fixture.pausedEventSlug, fixture.pausedEventTitle],
  53  |     ]
  54  | 
  55  |     for (const [slug, title] of events) {
  56  |       await page.goto(buildAdminEventPath(slug))
  57  |       await expect(page.getByRole('region', { name: /evento seleccionado/i })).toBeVisible({
  58  |         timeout: 20_000,
  59  |       })
  60  |       await expect(page.locator('#event-title')).toHaveValue(title)
  61  | 
  62  |       const venue = page.locator('#event-venue')
  63  |       const original = await venue.inputValue()
  64  |       const edited = `${original} · editado E2E`
  65  |       await venue.fill(edited)
  66  |       await saveEvent(page)
  67  |       await expect.poll(async () => (await storedEvent(slug)).venue).toBe(edited)
  68  | 
  69  |       await venue.fill(original)
  70  |       await saveEvent(page)
  71  |       await expect.poll(async () => (await storedEvent(slug)).venue).toBe(original)
  72  |     }
  73  |   })
  74  | 
  75  |   test('la matriz del evento guarda Mercado Pago, transferencia, efectivo y Wise', async ({
  76  |     page,
  77  |   }) => {
  78  |     await loginAsAdmin(page, { email: fixture.adminEmail, password: fixture.adminPassword })
  79  |     await page.goto(buildAdminEventPath(fixture.ticketEventSlug))
  80  |     await expect(page.getByRole('region', { name: /evento seleccionado/i })).toBeVisible({
  81  |       timeout: 20_000,
  82  |     })
  83  |     await page.getByRole('tab', { name: /ventas y cupos/i }).click()
  84  |     await page.getByRole('tab', { name: /^Cobro$/i }).click()
> 85  |     await expect(page.locator('#event-bank-alias')).toHaveValue('plu.e2e.qa')
      |                                                     ^ Error: expect(locator).toHaveValue(expected) failed
  86  | 
  87  |     const channels = ['Mercado Pago', 'Transferencia', 'Efectivo Pitbull', 'Wise']
  88  |     for (const channel of channels) {
  89  |       await expect(page.getByRole('checkbox', { name: `${channel} · Inscripción` })).toBeChecked()
  90  |       await expect(page.getByRole('checkbox', { name: `${channel} · Entradas` })).toBeChecked()
  91  |     }
  92  | 
  93  |     const wiseTickets = page.getByRole('checkbox', { name: 'Wise · Entradas' })
  94  |     await wiseTickets.uncheck()
  95  |     await saveEvent(page)
  96  |     await expect
  97  |       .poll(async () => (await storedEvent(fixture.ticketEventSlug)).payment_channel_overrides)
  98  |       .toMatchObject({ ticket: { wise_transfer: false } })
  99  | 
  100 |     await wiseTickets.check()
  101 |     await saveEvent(page)
  102 |     await expect
  103 |       .poll(async () => (await storedEvent(fixture.ticketEventSlug)).payment_channel_overrides)
  104 |       .toMatchObject({
  105 |         registration: {
  106 |           mercado_pago: true,
  107 |           bank_transfer: true,
  108 |           cash_pitbull: true,
  109 |           wise_transfer: true,
  110 |         },
  111 |         ticket: {
  112 |           mercado_pago: true,
  113 |           bank_transfer: true,
  114 |           cash_pitbull: true,
  115 |           wise_transfer: true,
  116 |         },
  117 |       })
  118 |   })
  119 | })
  120 | 
```