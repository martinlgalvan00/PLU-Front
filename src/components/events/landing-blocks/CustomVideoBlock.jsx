import { useState } from 'react'
import { Play } from 'lucide-react'
import { landingVideoEmbedUrl, landingVideoPoster } from '../../../lib/eventLandingLayout.js'
import BlockShell from './BlockShell.jsx'

/**
 * Video de YouTube o Vimeo, liviano: primero la portada con un botón de
 * reproducir y recién al tocarlo se carga el reproductor (sin cookies de
 * seguimiento). Así la landing no descarga nada del proveedor hasta que alguien
 * quiere ver el video. El link ya viene validado.
 */
export default function CustomVideoBlock({ block, ctx }) {
  const { title, body, video } = block.props ?? {}
  const [playing, setPlaying] = useState(false)
  const src = landingVideoEmbedUrl(video)
  if (!src) return null
  const poster = landingVideoPoster(video)
  const name = title || ctx?.t?.('pages.eventBuilder.videoFallbackTitle') || 'Video'
  const playLabel = ctx?.t
    ? ctx.t('pages.eventBuilder.videoPlay', { title: name })
    : `Reproducir ${name}`

  return (
    <BlockShell id={block.id} type="video" title={title || undefined} lead={body || undefined}>
      <div className="lb-video">
        {playing ? (
          <iframe
            allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            src={`${src}${src.includes('?') ? '&' : '?'}autoplay=1`}
            title={name}
          />
        ) : (
          <button type="button" className="lb-video__poster" onClick={() => setPlaying(true)}>
            {poster ? <img alt="" loading="lazy" src={poster} /> : null}
            <span className="lb-video__play" aria-hidden>
              <Play size={26} />
            </span>
            <span className="lb-video__label">{playLabel}</span>
          </button>
        )}
      </div>
    </BlockShell>
  )
}
