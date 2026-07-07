import { HttpError } from '../../lib/errors.js'
import { getSupabaseAdmin, isSupabaseAdminConfigured, PROOF_BUCKET } from '../../lib/supabaseAdmin.js'

const SIGNED_URL_TTL_SECONDS = 3600

async function loadProofPathFromSupabase(orderId) {
  const supabase = getSupabaseAdmin()
  if (!supabase) return null

  const { data, error } = await supabase
    .from('ticket_orders')
    .select('payment_proof_path')
    .eq('id', orderId)
    .maybeSingle()

  if (error) throw new HttpError(500, error.message)
  return data?.payment_proof_path ?? null
}

async function resolveOrderProofPath({ prisma, orderId }) {
  const localOrder = await prisma.ticketOrder.findUnique({
    where: { id: orderId },
    select: { paymentProofPath: true },
  })
  if (localOrder?.paymentProofPath) return localOrder.paymentProofPath

  return loadProofPathFromSupabase(orderId)
}

export async function createTicketPaymentProofSignedUrl({ prisma, orderId }) {
  const proofPath = await resolveOrderProofPath({ prisma, orderId })
  if (!proofPath) {
    throw new HttpError(404, 'Esta orden no tiene comprobante adjunto.')
  }

  if (!isSupabaseAdminConfigured()) {
    throw new HttpError(
      503,
      'Storage de comprobantes no configurado. Definí SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en el servidor.',
    )
  }

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.storage
    .from(PROOF_BUCKET)
    .createSignedUrl(proofPath, SIGNED_URL_TTL_SECONDS)

  if (error) {
    throw new HttpError(400, error.message ?? 'No se pudo abrir el comprobante.')
  }

  return { url: data.signedUrl, expiresIn: SIGNED_URL_TTL_SECONDS }
}
