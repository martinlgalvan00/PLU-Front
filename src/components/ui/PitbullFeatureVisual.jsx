export default function PitbullFeatureVisual({ alt, src }) {
  return (
    <figure className="pitbull-feature__media">
      <img
        src={src}
        alt={alt}
        className="pitbull-feature__media-img"
        loading="lazy"
        decoding="async"
      />
    </figure>
  )
}
