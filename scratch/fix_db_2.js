import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321'
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
const admin = createClient(supabaseUrl, supabaseKey)

async function run() {
  const { data: event } = await admin.from('events').select('id, rules').eq('slug', 'pitbull-classic-2026').single()
  const { data: plan } = await admin.from('membership_plans').select('id').eq('active', true).eq('collection_mode', 'one_time').order('version', { ascending: false }).limit(1).single()

  await admin.from('event_combo_offers').update({
    active: true,
    price: 170000,
    membership_plan_id: plan.id
  }).eq('event_id', event.id)

  const newRules = { ...event.rules, comboPrice: 170000 }
  await admin.from('events').update({ rules: newRules }).eq('id', event.id)
  console.log('Fixed DB state!')
}
run()
