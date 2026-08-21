import { createClient } from '@supabase/supabase-js'
import { loadEnvFile } from 'node:process'
loadEnvFile('.env')
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const { data: ev, error: e1 } = await db.from('events').select('*').limit(2)
if (e1) console.log('EVENTS ERR', e1)
for (const e of ev ?? []) console.log('EVENT', { id: e.id, slug: e.slug, name: e.name, status: e.status, capacity: e.capacity, price: e.price, published: e.published, opens: e.registration_opens_at, closes: e.registration_closes_at })
const { data: offers, error: e2 } = await db.from('event_combo_offers').select('*')
console.log('COMBO OFFERS', e2 ?? JSON.stringify(offers, null, 2))
const ids = ['1e3b29bd-592b-4bfb-a131-06fa09b97c6b','25195dbe-29d3-4903-aa73-bdf8ce47c9fb','7af1a6bb-4f3e-4cad-bc67-25b298fd838f']
const { data: ords } = await db.from('athlete_payment_orders').select('id,concept,method,status,amount,provider_preference_id,created_at,expires_at,updated_at').in('id', ids)
console.log('ORDERS', JSON.stringify(ords, null, 2))
