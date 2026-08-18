import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321'
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY

const admin = createClient(supabaseUrl, supabaseKey)

async function run() {
  console.log('Restoring combo active state to true...')
  const { data: event, error: eventError } = await admin
    .from('events')
    .select('id')
    .eq('slug', 'pitbull-classic-2026')
    .single()
  
  if (eventError) {
    console.error('Error fetching event:', eventError)
    return
  }

  const { error } = await admin
    .from('event_combo_offers')
    .update({ active: true, price: 170000 })
    .eq('event_id', event.id)
    
  if (error) {
    console.error('Error updating combo:', error)
  } else {
    console.log('Combo restored successfully.')
  }
}

run()
