import { describe, expect, it } from 'vitest'
import {
  addCustomBlock,
  CORE_BLOCK_ORDER,
  defaultLandingBlocks,
  isSafeLandingHref,
  LANDING_BLOCK_LIMITS,
  layoutPayloadForMerge,
  moveBlock,
  normalizeLandingBlocks,
  normalizeLandingLayout,
  patchBlockProps,
  removeBlock,
  setBlockVisible,
} from '../src/lib/eventLandingLayout.js'

const types = (blocks) => blocks.map((block) => block.type)

describe('bloques de la landing', () => {
  it('sin layout arma todos los bloques integrados, portada primero', () => {
    const { blocks } = normalizeLandingLayout(undefined)
    expect(types(blocks)).toEqual(CORE_BLOCK_ORDER)
    expect(blocks.every((block) => block.visible)).toBe(true)
    expect(blocks[0].type).toBe('hero')
  })

  it('descarta tipos desconocidos, ids inválidos y repetidos', () => {
    const blocks = normalizeLandingBlocks([
      { id: 'hero', type: 'hero' },
      { id: 'x', type: 'iframe' },
      { id: 'text-1', type: 'text' },
      { id: 'text-1', type: 'text' },
      { id: 'Bad Id!', type: 'text' },
      { id: 'faq', type: 'faq', visible: false },
      { id: 'faq-otro', type: 'faq' },
    ])
    expect(blocks.map((block) => block.id)).toEqual(['hero', 'text-1', 'faq'])
    expect(blocks.find((block) => block.id === 'faq').visible).toBe(false)
  })

  it('la portada siempre existe, es primera y no se puede ocultar', () => {
    const blocks = normalizeLandingBlocks([
      { id: 'faq', type: 'faq' },
      { id: 'hero', type: 'hero', visible: false },
    ])
    expect(blocks[0]).toEqual({ id: 'hero', type: 'hero', visible: true })
    expect(normalizeLandingBlocks([{ id: 'faq', type: 'faq' }])[0].type).toBe('hero')
    expect(setBlockVisible(blocks, 'hero', false)[0].visible).toBe(true)
  })

  it('respeta el tope de bloques', () => {
    const many = Array.from({ length: 60 }, (_, index) => ({
      id: `text-${index + 1}`,
      type: 'text',
    }))
    expect(normalizeLandingBlocks(many)).toHaveLength(LANDING_BLOCK_LIMITS.maxBlocks)
  })

  it('agrega bloques propios con id único y no pasa del tope', () => {
    let blocks = defaultLandingBlocks()
    blocks = addCustomBlock(blocks, 'text')
    blocks = addCustomBlock(blocks, 'text')
    expect(blocks.filter((block) => block.type === 'text').map((block) => block.id)).toEqual([
      'text-1',
      'text-2',
    ])
    // Los integrados no se agregan dos veces.
    expect(addCustomBlock(blocks, 'faq')).toBe(blocks)
    let full = blocks
    for (let index = 0; index < 40; index += 1) full = addCustomBlock(full, 'cta')
    expect(full).toHaveLength(LANDING_BLOCK_LIMITS.maxBlocks)
  })

  it('solo se borran los bloques propios; los integrados se ocultan', () => {
    const blocks = addCustomBlock(defaultLandingBlocks(), 'image')
    expect(removeBlock(blocks, 'faq')).toBe(blocks)
    expect(removeBlock(blocks, 'image-1').some((block) => block.id === 'image-1')).toBe(false)
  })

  it('mueve bloques sin sacar la portada del primer lugar ni pasarse de los bordes', () => {
    const blocks = normalizeLandingBlocks([
      { id: 'hero', type: 'hero' },
      { id: 'faq', type: 'faq' },
      { id: 'location', type: 'location' },
    ])
    expect(moveBlock(blocks, 'location', -1).map((block) => block.id)).toEqual([
      'hero',
      'location',
      'faq',
    ])
    expect(moveBlock(blocks, 'location', -5).map((block) => block.id)[0]).toBe('hero')
    expect(moveBlock(blocks, 'location', -5)[1].id).toBe('location')
    expect(moveBlock(blocks, 'faq', -1)).toBe(blocks) // ya está primero tras la portada
    expect(moveBlock(blocks, 'hero', 1)).toBe(blocks)
    expect(moveBlock(blocks, 'location', 3).map((block) => block.id).at(-1)).toBe('location')
  })

  it('recorta al tope y descarta props desconocidas', () => {
    const [, block] = normalizeLandingBlocks([
      { id: 'hero', type: 'hero' },
      { id: 'cta-1', type: 'cta', props: { title: 'x'.repeat(400), label: 'Ir', script: '<script>' } },
    ])
    expect(block.props.title).toHaveLength(LANDING_BLOCK_LIMITS.title)
    expect(block.props).not.toHaveProperty('script')
  })

  it('conserva lo tipeado (espacios y links a medio escribir) mientras se edita', () => {
    const [, block] = normalizeLandingBlocks([
      { id: 'hero', type: 'hero' },
      { id: 'cta-1', type: 'cta', props: { title: 'Hola ', label: 'Ir', href: 'htt' } },
    ])
    expect(block.props.title).toBe('Hola ')
    expect(block.props.href).toBe('htt')
  })

  it('al guardar recorta los textos y descarta el link inseguro', () => {
    const payload = layoutPayloadForMerge({
      blocks: [
        { id: 'hero', type: 'hero' },
        { id: 'cta-1', type: 'cta', props: { title: '  Hola ', label: 'Ir', href: 'javascript:alert(1)' } },
        { id: 'cta-2', type: 'cta', props: { label: 'Ir', href: ' https://plu.com/x ' } },
      ],
    })
    expect(payload.blocks[1].props.title).toBe('Hola')
    expect(payload.blocks[1].props.href).toBe('')
    expect(payload.blocks[2].props.href).toBe('https://plu.com/x')
  })

  it('fuera del Constructor el payload lleva solo la paleta', () => {
    expect(
      layoutPayloadForMerge(
        { blocks: [{ id: 'hero', type: 'hero' }], palette: { accent: '#FF8800' } },
        { templateId: 'editorial' },
      ),
    ).toEqual({ blocks: [], palette: { accent: '#ff8800' }, motion: 'soft' })
  })

  it('acepta links https e internos y rechaza el resto', () => {
    for (const ok of ['', 'https://plu.com.ar/x', '/calendario', '/evento/otro?x=1']) {
      expect(isSafeLandingHref(ok), ok).toBe(true)
    }
    for (const bad of ['http://x.com', 'javascript:alert(1)', '//evil.com', 'data:text/html,1', 'mailto:a@b.c', 'https://a b']) {
      expect(isSafeLandingHref(bad), bad).toBe(false)
    }
  })

  it('rutas de imagen: solo caracteres seguros y sin ..', () => {
    const [, image] = normalizeLandingBlocks([
      { id: 'hero', type: 'hero' },
      { id: 'image-1', type: 'image', props: { path: '../../etc/passwd' } },
    ])
    expect(image.props.path).toBe('')
    const [, ok] = normalizeLandingBlocks([
      { id: 'hero', type: 'hero' },
      { id: 'image-1', type: 'image', props: { path: 'evt-1/hero-1.webp', alt: 'Tarima' } },
    ])
    expect(ok.props.path).toBe('evt-1/hero-1.webp')
  })

  it('patchBlockProps edita solo el bloque pedido', () => {
    const blocks = addCustomBlock(addCustomBlock(defaultLandingBlocks(), 'text'), 'text')
    const next = patchBlockProps(blocks, 'text-2', { title: 'Hola' })
    expect(next.find((block) => block.id === 'text-2').props.title).toBe('Hola')
    expect(next.find((block) => block.id === 'text-1').props.title).toBe('')
  })

  it('el payload no guarda la URL derivada de la imagen', () => {
    const payload = layoutPayloadForMerge({
      blocks: [
        { id: 'hero', type: 'hero' },
        {
          id: 'image-1',
          type: 'image',
          props: { path: 'evt/x.webp', url: 'https://cdn.test/x.webp', alt: 'a' },
        },
      ],
    })
    expect(payload.blocks[1].props).toEqual({ path: 'evt/x.webp', alt: 'a', caption: '' })
  })
})
