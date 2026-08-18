import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL || 'http://127.0.0.1:54321'
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR4eWh0anN1amxnaWpjdWV3ZGF4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTY4NjY2MzU0MCwiZXhwIjoxOTk3MjE5NTQwfQ.x'
const supabase = createClient(supabaseUrl, supabaseKey)

async function run() {
  const { data: plans } = await supabase.from('membership_plans').select('*')
  console.log('PLANS:', plans)

  const { data: event } = await supabase.from('events').select('*').eq('slug', 'pitbull-classic-2026').single()
  console.log('EVENT:', event)

  const { data: combo } = await supabase.from('event_combo_offers').select('*').eq('event_id', event?.id)
  console.log('COMBO:', combo)
}

run()
