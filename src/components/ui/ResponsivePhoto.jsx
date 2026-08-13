/**
 * <img> con <picture> AVIF/WebP + srcset responsive, JPG como fallback.
 * `avif`/`webp` son mapas { ancho: url } (import estático de Vite). El
 * ancho mayor del mapa no lleva sufijo en el nombre de archivo generado por
 * scripts/generate-hero-images.mjs, pero acá no importa: srcset se arma a
 * partir de las claves del objeto.
 */
function buildSrcSet(variants) {
  if (!variants) return undefined
  return Object.entries(variants)
    .map(([width, url]) => `${url} ${width}w`)
    .join(', ')
}

export default function ResponsivePhoto({
  avif,
  webp,
  src,
  sizes = '100vw',
  className,
  alt = '',
  loading = 'lazy',
  decoding = 'async',
  fetchPriority,
  width,
  height,
  style,
  ...rest
}) {
  const avifSrcSet = buildSrcSet(avif)
  const webpSrcSet = buildSrcSet(webp)

  return (
    // display: contents — el <picture> es puro negociador de formato, no
    // debe participar del layout. Sin esto, al ser `inline` por defecto,
    // rompería el sizing de imágenes absolutas/100% que dependían de ser
    // hijas directas de su contenedor posicionado.
    <picture style={{ display: 'contents' }}>
      {avifSrcSet ? <source type="image/avif" srcSet={avifSrcSet} sizes={sizes} /> : null}
      {webpSrcSet ? <source type="image/webp" srcSet={webpSrcSet} sizes={sizes} /> : null}
      <img
        className={className}
        src={src}
        alt={alt}
        loading={loading}
        decoding={decoding}
        fetchPriority={fetchPriority}
        width={width}
        height={height}
        style={style}
        {...rest}
      />
    </picture>
  )
}
