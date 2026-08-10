#!/usr/bin/env node
/**
 * Assert rápido de conectividad Supabase (CI y local). Falla temprano si el
 * stack no exportó bien las env vars o la API Admin no responde.
 */
import { loadEnvFile } from 'node:process'
import { createClient } from '@supabase/supabase-js'

try {
  loadEnvFile()
} catch {
  // En CI las variables vienen del entorno del job.
}

const url = process.env.SUPABASE_URL?.trim()
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
const browserUrl = process.env.VITE_SUPABASE_URL?.trim()
const anonKey = process.env.VITE_SUPABASE_ANON_KEY?.trim()

if (!url || !key) {
  console.error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}

if (!browserUrl || !anonKey) {
  console.error(
    'Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY.\n' +
      'Local: agregalas al .env (mismo proyecto que SUPABASE_URL; anon = publishable).\n' +
      'CI: el job supabase-integration debe exportarlas desde `supabase status -o env`.',
  )
  process.exit(1)
}

if (new URL(url).origin !== new URL(browserUrl).origin) {
  console.error('SUPABASE_URL y VITE_SUPABASE_URL deben apuntar al mismo proyecto.')
  process.exit(1)
}

const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const requiredTables = ['events', 'athletes', 'memberships', 'event_registrations']
for (const table of requiredTables) {
  const { error } = await admin.from(table).select('id', { head: true, count: 'exact' }).limit(1)
  if (error) {
    console.error(`Supabase no responde en ${table}: ${error.message}`)
    process.exit(1)
  }
}

const { error: registerRpcError } = await admin.rpc('register_athlete_v2', {
  p_form: {},
  p_password_hash: 'x',
})
if (registerRpcError && /Could not find the function/i.test(registerRpcError.message)) {
  console.error(`RPC register_athlete_v2 ausente: ${registerRpcError.message}`)
  process.exit(1)
}

const browser = createClient(browserUrl, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const { error: publicError } = await browser
  .from('events')
  .select('id', { head: true, count: 'exact' })
  .eq('published', true)
  .limit(1)
if (publicError) {
  console.error(`Lectura pública de eventos falló: ${publicError.message}`)
  process.exit(1)
}

console.log('Supabase connectivity: OK')
console.log(`Proyecto: ${new URL(url).host}`)
console.log(`Tablas: ${requiredTables.join(', ')}`)
console.log('RPCs: register_athlete_v2 presente')
console.log('Anon/RLS lectura eventos: OK')
