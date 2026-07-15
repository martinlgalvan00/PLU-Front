import { ApiError } from './api.js'
import { isSupabaseConfigured, supabase } from './supabaseClient.js'

/**
 * rpcErrors.js — PLU ARG
 *
 * Compartido entre ticketApi.js y athleteApi.js: traduce los códigos de
 * error personalizados (PLU01..PLU08) que levantan las funciones RPC
 * SECURITY DEFINER de supabase/migrations/*_rpc_functions.sql al mismo
 * ApiError que antes devolvía la API de Express/Prisma, para no tocar los
 * callers (useAppData.js, CredentialPage.jsx, checkinScanService.js).
 */

const ERROR_STATUS_BY_CODE = {
  PLU02: 404, // no encontrado (evento/orden/entrada/atleta/membresía/inscripción)
  PLU05: 409, // no pagada / cancelada / requisito no cumplido
  PLU06: 409, // ya usado (check-in duplicado)
  PLU07: 409, // atleta duplicado (documento/email)
  PLU08: 409, // ya inscripto a ese evento
}

export function throwAsApiError(error) {
  const status = ERROR_STATUS_BY_CODE[error.code] ?? 400
  throw new ApiError(error.message, {
    status,
    body: { alreadyUsed: error.code === 'PLU06', detail: error.details ?? undefined },
  })
}

export async function callRpc(fn, args) {
  if (!isSupabaseConfigured || !supabase) {
    throw new ApiError(
      'Supabase no está configurado. Agregá VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en tu .env.',
      { status: 503 },
    )
  }

  const { data, error } = await supabase.rpc(fn, args)
  if (error) throwAsApiError(error)
  return data
}
