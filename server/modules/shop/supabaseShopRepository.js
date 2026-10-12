import { HttpError } from '../../lib/errors.js'
import { PRIMARY_ORGANIZATION_ID } from '../../lib/organizations.js'
import { assertSupabaseResult } from '../../lib/supabaseRpc.js'

export const SHOP_PRODUCT_BUCKET = 'shop-products'

/**
 * Catálogo de la tienda sobre Supabase. Toda lectura y escritura pasa por las
 * RPC `security definer` de 20261202100000_shop_catalog.sql: la tabla no tiene
 * policies y el navegador nunca habla con ella.
 *
 * Esto es solo catálogo: no cobra ni descuenta stock por compra.
 */
export function createSupabaseShopRepository(
  client,
  { organizationId = PRIMARY_ORGANIZATION_ID } = {},
) {
  if (!client) throw new HttpError(503, 'Supabase Admin no esta configurado.')

  const rpc = async (name, args, fallback) =>
    assertSupabaseResult(await client.rpc(name, args), fallback)

  /** Ruta de Storage → URL pública estable del bucket de productos. */
  function publicImageUrl(path) {
    if (!path) return null
    return client.storage.from(SHOP_PRODUCT_BUCKET).getPublicUrl(path).data.publicUrl
  }

  function withImageUrls(product) {
    const paths = Array.isArray(product.imagePaths) ? product.imagePaths : []
    return { ...product, imageUrls: paths.map(publicImageUrl).filter(Boolean) }
  }

  return {
    async listPublicProducts() {
      const rows = await rpc(
        'list_public_shop_products',
        { p_organization_id: organizationId },
        'No se pudo leer el catálogo.',
      )
      return (rows ?? []).map(withImageUrls)
    },

    async listAdminProducts() {
      const rows = await rpc(
        'list_admin_shop_products',
        { p_organization_id: organizationId },
        'No se pudo leer el catálogo.',
      )
      return (rows ?? []).map(withImageUrls)
    },

    async saveProduct(id, data, actor) {
      const row = await rpc(
        'upsert_shop_product',
        { p_id: id, p_data: data, p_actor: actor, p_organization_id: organizationId },
        'No se pudo guardar el producto.',
      )
      return row
    },

    deleteProduct: (id, actor) =>
      rpc(
        'delete_shop_product',
        { p_id: id, p_actor: actor, p_organization_id: organizationId },
        'No se pudo eliminar el producto.',
      ),

    /** URL firmada para que el panel suba una foto directo a Storage. */
    async createImageUpload(fileName) {
      const safeName = String(fileName)
        .replace(/[^\w.\-()+ ]/g, '_')
        .slice(0, 100)
      const path = `products/${Date.now()}-${safeName}`
      const signed = assertSupabaseResult(
        await client.storage.from(SHOP_PRODUCT_BUCKET).createSignedUploadUrl(path),
        'No se pudo preparar la carga de la imagen.',
      )
      return { path, token: signed.token, url: publicImageUrl(path) }
    },
  }
}
