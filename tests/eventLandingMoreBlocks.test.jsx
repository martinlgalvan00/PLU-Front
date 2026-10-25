import { cleanup, fireEvent, render } from '@testing-library/react'
import { z } from 'zod'
import { afterEach, describe, expect, it } from 'vitest'
import { LANDING_BLOCK_COMPONENTS } from '../src/components/events/landing-blocks/index.js'
import {
  addCustomBlock,
  customBlockImageKeys,
  isSafeLandingVideoUrl,
  landingMapHref,
  landingVideoEmbedUrl,
  layoutPayloadForMerge,
  normalizeLandingBlocks,
  withLandingBlockImageUrls,
} from '../src/lib/eventLandingLayout.js'
import { buildLandingLayoutSchema } from '../src/lib/schemas/landingLayoutSchema.js'

afterEach(cleanup)

const schema = buildLandingLayoutSchema(z)
const t = (key, params = {}) =>
  ({
    'pages.eventBuilder.directions': 'Cómo llegar',
    'pages.eventBuilder.videoPlay': `Reproducir ${params.title}`,
  })[key] ?? key

function renderBlock(block) {
  const Component = LANDING_BLOCK_COMPONENTS[block.type]
  return render(<Component block={block} ctx={{ t }} />)
}

describe('video', () => {
  it.each([
    [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    ],
    ['https://youtu.be/dQw4w9WgXcQ', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'],
    [
      'https://www.youtube.com/shorts/dQw4w9WgXcQ',
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    ],
    ['https://vimeo.com/123456789', 'https://player.vimeo.com/video/123456789?dnt=1'],
  ])('%s se embebe sin cookies de seguimiento', (url, embed) => {
    expect(isSafeLandingVideoUrl(url)).toBe(true)
    expect(landingVideoEmbedUrl(url)).toBe(embed)
  })

  it.each([
    'http://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://evil.example/watch?v=dQw4w9WgXcQ',
    'javascript:alert(1)',
    'https://www.youtube.com/channel/abc',
  ])('rechaza %s', (url) => {
    expect(isSafeLandingVideoUrl(url)).toBe(false)
    expect(landingVideoEmbedUrl(url)).toBeNull()
  })

  it('el esquema rechaza un link que no es de YouTube ni Vimeo', () => {
    const block = { id: 'video-1', type: 'video', props: { video: 'https://evil.example/x' } }
    expect(schema.safeParse({ blocks: [block] }).success).toBe(false)
  })
})

describe('cómo llegar', () => {
  it('usa el link cargado o arma la búsqueda con la dirección', () => {
    expect(landingMapHref({ href: 'https://maps.app.goo.gl/abc', body: 'x' })).toBe(
      'https://maps.app.goo.gl/abc',
    )
    expect(landingMapHref({ body: 'Av. Siempreviva 742, Rosario' })).toBe(
      'https://www.google.com/maps/search/?api=1&query=Av.%20Siempreviva%20742%2C%20Rosario',
    )
    expect(landingMapHref({})).toBeNull()
  })
})

describe('galería y sponsors', () => {
  it('tienen 6 y 8 lugares de imagen', () => {
    expect(customBlockImageKeys('gallery')).toHaveLength(6)
    expect(customBlockImageKeys('sponsors')).toHaveLength(8)
  })

  it('las URL derivadas no se guardan y se resuelven al leer', () => {
    const [block] = normalizeLandingBlocks([
      {
        id: 'gallery-1',
        type: 'gallery',
        props: {
          title: 'El meet',
          path1: 'events/a/1.webp',
          url1: 'https://cdn.example/1.webp',
          path3: 'events/a/3.webp',
        },
      },
    ]).filter((item) => item.type === 'gallery')
    const payload = layoutPayloadForMerge({ blocks: [{ id: 'hero', type: 'hero' }, block] })
    const saved = payload.blocks.find((item) => item.type === 'gallery').props
    expect(saved.path1).toBe('events/a/1.webp')
    expect(saved).not.toHaveProperty('url1')
    expect(schema.safeParse(payload).success).toBe(true)

    const rules = withLandingBlockImageUrls(
      { landing: { layout: { blocks: [{ ...block, props: saved }] } } },
      (path) => `https://cdn.example/${path}`,
    )
    const props = rules.landing.layout.blocks[0].props
    expect(props.url1).toBe('https://cdn.example/events/a/1.webp')
    expect(props.url3).toBe('https://cdn.example/events/a/3.webp')
    expect(props.url2).toBeUndefined()
  })

  it('una ruta con ".." se descarta al normalizar', () => {
    const [, block] = normalizeLandingBlocks([
      { id: 'hero', type: 'hero' },
      { id: 'sponsors-1', type: 'sponsors', props: { path1: '../secreto.png' } },
    ])
    expect(block.props.path1).toBe('')
  })

  it('se agregan como cualquier bloque propio', () => {
    const blocks = addCustomBlock([{ id: 'hero', type: 'hero', visible: true }], 'map')
    expect(blocks.at(-1)).toMatchObject({ id: 'map-1', type: 'map' })
  })
})

describe('render público', () => {
  it('la galería muestra solo las fotos subidas, con texto alternativo', () => {
    const { container } = renderBlock({
      id: 'gallery-1',
      type: 'gallery',
      props: { title: 'Copa Norte', url1: 'https://cdn/1.webp', url4: 'https://cdn/4.webp' },
    })
    const images = container.querySelectorAll('img')
    expect(images).toHaveLength(2)
    expect(images[0].getAttribute('alt')).toBe('Copa Norte · 1')
    expect(container.querySelector('.lb-gallery__grid').dataset.count).toBe('2')
  })

  it('sin fotos ni logos no dibuja nada', () => {
    expect(renderBlock({ id: 'gallery-1', type: 'gallery', props: {} }).container.innerHTML).toBe(
      '',
    )
    expect(renderBlock({ id: 'sponsors-1', type: 'sponsors', props: {} }).container.innerHTML).toBe(
      '',
    )
  })

  it('el video muestra la portada y recién al tocarla carga youtube-nocookie', () => {
    const { container, getByRole } = renderBlock({
      id: 'video-1',
      type: 'video',
      props: { title: 'Resumen', video: 'https://youtu.be/dQw4w9WgXcQ' },
    })
    expect(container.querySelector('iframe')).toBeNull()
    expect(container.querySelector('img').getAttribute('src')).toBe(
      'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    )
    fireEvent.click(getByRole('button', { name: /Resumen/ }))
    const iframe = container.querySelector('iframe')
    expect(iframe.getAttribute('src')).toBe(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1',
    )
    expect(iframe.getAttribute('title')).toBe('Resumen')
  })

  it('un video con link inválido no se dibuja', () => {
    const { container } = renderBlock({
      id: 'video-1',
      type: 'video',
      props: { video: 'https://evil.example/x' },
    })
    expect(container.innerHTML).toBe('')
  })

  it('cómo llegar muestra la dirección y el link al mapa en otra pestaña', () => {
    const { getByRole, container } = renderBlock({
      id: 'map-1',
      type: 'map',
      props: { title: 'La sede', body: 'Av. Siempreviva 742' },
    })
    expect(container.textContent).toContain('Av. Siempreviva 742')
    const link = getByRole('link', { name: 'Cómo llegar' })
    expect(link.getAttribute('href')).toContain('google.com/maps/search')
    expect(link.getAttribute('rel')).toBe('noreferrer noopener')
  })
})
