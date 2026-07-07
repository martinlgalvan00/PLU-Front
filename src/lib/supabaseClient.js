import { createClient } from '@supabase/supabase-js'
import { env } from '../config/env.js'

export const isSupabaseConfigured = env.supabase.configured

if (!isSupabaseConfigured && env.isDev) {
  console.warn(
    'Supabase no está configurado (faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY). ' +
      'Las funciones que dependen de Supabase van a usar fallback local hasta que se configuren.',
  )
}

export const supabase = isSupabaseConfigured
  ? createClient(env.supabase.url, env.supabase.anonKey)
  : null
