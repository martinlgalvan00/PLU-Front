#!/usr/bin/env node
/**
 * Assert rápido de conectividad Supabase (CI). Falla temprano si el stack
 * local no exportó bien las env vars o la API no responde.
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

if (!url || !key) {
  console.error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}

const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const { error } = await admin.from('events').select('id', { head: true, count: 'exact' }).limit(1)
if (error) {
  console.error(`Supabase no responde: ${error.message}`)
  process.exit(1)
}

console.log('Supabase connectivity: OK')
