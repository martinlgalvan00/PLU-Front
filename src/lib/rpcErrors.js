import { ApiError } from './api.js'
import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient.js'

/**
 * rpcErrors.js — PLU ARG
 *
 * Compartido entre ticketApi.js y athleteApi.js: traduce los códigos de
 * error personalizados (PLU01..PLU08) que levantan las funciones RPC
 * SECURITY DEFINER de supabase/migrations/*_rpc_functions.sql al mismo
 * ApiError que antes devolvía la API de Express/Prisma, para no tocar los
 * callers (useAppData.js, CredentialPage.jsx, checkinScanService.js).
 *
 * La distinción entre "el backend dijo que no existe" y "no pude preguntarle
 * al backend" es la parte importante de este archivo. Antes todo lo que no
 * tuviera un código PLU conocido caía en 400, incluida una caída de red: la
 * página de verificación leía eso como credencial inexistente y en la puerta
 * mostraba "Credencial no válida" a un atleta que había pagado. Un falso
 * negativo así es peor que no mostrar nada, porque parece una respuesta.
 */

const ERROR_STATUS_BY_CODE = {
  PLU02: 404, // no encontrado (evento/orden/entrada/atleta/membresía/inscripción)
  PLU05: 409, // no pagada / cancelada / requisito no cumplido
  PLU06: 409, // ya usado (check-in duplicado)
  PLU07: 409, // atleta duplicado (documento/email)
  PLU08: 409, // ya inscripto a ese evento
}

/** status 0 = no se pudo llegar al backend. Nunca significa "no existe". */
export const STATUS_UNREACHABLE = 0

/**
 * ¿Este error de supabase-js es de transporte y no de dominio?
 *
 * Un PostgrestError trae `code` (SQLSTATE o nuestro PLUxx). Cuando el fetch
 * falla —sin señal, DNS caído, CORS, el proyecto dormido— supabase-js
 * devuelve un error sin `code`, con el mensaje del TypeError adentro.
 */
function isTransportError(error) {
  if (error?.code) return false

  const message = String(error?.message ?? '').toLowerCase()
  return (
    message.includes('fetch') ||
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('abort') ||
    message.includes('connection') ||
    message === ''
  )
}

export function throwAsApiError(error) {
  if (isTransportError(error)) {
    throw new ApiError('No se pudo contactar al servidor de PLU ARG.', {
      status: STATUS_UNREACHABLE,
      body: { cause: error?.message ?? null },
    })
  }

  const status = ERROR_STATUS_BY_CODE[error.code] ?? 400
  throw new ApiError(error.message, {
    status,
    body: {
      code: error.code,
      alreadyUsed: error.code === 'PLU06',
      detail: error.details ?? undefined,
    },
  })
}

export async function callRpc(fn, args) {
  if (!isSupabaseConfigured) {
    throw new ApiError(
      'Supabase no está configurado. Agregá VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en tu .env.',
      { status: 503 },
    )
  }

  const supabase = await getSupabaseClient()
  let result
  try {
    result = await supabase.rpc(fn, args)
  } catch (error) {
    // supabase-js normalmente devuelve `{ error }` en vez de tirar, pero un
    // fallo de red durante el parseo de la respuesta sí escapa como excepción.
    throwAsApiError(error)
  }

  if (result?.error) throwAsApiError(result.error)
  return result?.data
}
