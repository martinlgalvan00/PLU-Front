import logoPitbullWordmark from '../../assets/brand/logo-letra-transparente.png'
import logoPitbullEmblem from '../../assets/brand/logo-pitbullclassic2.png'

/**
 * Lockup oficial Pitbull Classic: emblema del club + wordmark del meet.
 * size: sm (lista), md (detalle), lg (hero)
 */
export default function PitbullBrandMark({
  size = 'md',
  className = '',
  label = 'Pitbull Classic',
  decorative = false,
  priority = false,
}) {
  const classes = ['pitbull-brand-mark', `pitbull-brand-mark--${size}`, className]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={classes}
      {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': label })}
    >
      <img
        className="pitbull-brand-mark__emblem"
        src={logoPitbullEmblem}
        alt=""
        width={398}
        height={391}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        fetchPriority={priority ? 'high' : undefined}
      />
      <img
        className="pitbull-brand-mark__wordmark"
        src={logoPitbullWordmark}
        alt=""
        width={1154}
        height={460}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
      />
    </div>
  )
}
