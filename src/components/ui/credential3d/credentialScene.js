import {
  ACESFilmicToneMapping,
  CanvasTexture,
  Color,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshPhysicalMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  Shape,
  SRGBColorSpace,
  WebGLRenderer,
} from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

/**
 * Escena de la credencial en 3D — PLU ARG
 *
 * Una tarjeta física (proporción de credencial, 85,6 × 54 mm) con canto
 * metálico dorado y dos caras dibujadas en canvas: frente con los datos del
 * atleta y dorso con el QR real, que se puede escanear desde la pantalla.
 *
 * Reglas de la casa para 3D:
 * - Se renderiza solo cuando algo se mueve (entrada, arrastre, inercia); en
 *   reposo no hay loop. Nada decorativo infinito.
 * - Una sola entrada (medio giro que muestra el dorso y vuelve) y después la
 *   tarjeta responde a la mano: arrastrar, flechas del teclado.
 * - `dispose()` libera geometrías, texturas, materiales y el contexto WebGL.
 */

const CARD_W = 3.2
const CARD_H = CARD_W / 1.585
const CARD_DEPTH = 0.035
const RADIUS = 0.16
const TEXTURE_W = 1600
const TEXTURE_H = Math.round(TEXTURE_W / 1.585)

function roundedRectShape(width, height, radius) {
  const shape = new Shape()
  const x = -width / 2
  const y = -height / 2
  shape.moveTo(x + radius, y)
  shape.lineTo(x + width - radius, y)
  shape.quadraticCurveTo(x + width, y, x + width, y + radius)
  shape.lineTo(x + width, y + height - radius)
  shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
  shape.lineTo(x + radius, y + height)
  shape.quadraticCurveTo(x, y + height, x, y + height - radius)
  shape.lineTo(x, y + radius)
  shape.quadraticCurveTo(x, y, x + radius, y)
  return shape
}

function roundedRectPath(context, width, height, radius) {
  context.beginPath()
  context.moveTo(radius, 0)
  context.arcTo(width, 0, width, height, radius)
  context.arcTo(width, height, 0, height, radius)
  context.arcTo(0, height, 0, 0, radius)
  context.arcTo(0, 0, width, 0, radius)
  context.closePath()
}

function loadImage(src) {
  return new Promise((resolve) => {
    if (!src) {
      resolve(null)
      return
    }
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => resolve(null)
    image.src = src
  })
}

/** Texto que entra en el ancho: achica la fuente antes que cortar el nombre. */
function fitText(context, text, maxWidth, size, weight, family) {
  let current = size
  context.font = `${weight} ${current}px ${family}`
  while (context.measureText(text).width > maxWidth && current > size * 0.55) {
    current -= 2
    context.font = `${weight} ${current}px ${family}`
  }
  return current
}

function paintBase(context, palette) {
  const radius = TEXTURE_H * 0.075
  roundedRectPath(context, TEXTURE_W, TEXTURE_H, radius)
  context.save()
  context.clip()
  const base = context.createLinearGradient(0, 0, TEXTURE_W, TEXTURE_H)
  base.addColorStop(0, '#1b1d23')
  base.addColorStop(1, '#0e0f12')
  context.fillStyle = base
  context.fillRect(0, 0, TEXTURE_W, TEXTURE_H)
  // Filete de marca arriba: el mismo acento que la credencial plana.
  context.fillStyle = palette.gold
  context.fillRect(0, 0, TEXTURE_W, 14)
  // Filete interior.
  context.strokeStyle = 'rgba(255,255,255,0.08)'
  context.lineWidth = 3
  roundedRectPath(context, TEXTURE_W, TEXTURE_H, radius)
  context.stroke()
  return () => context.restore()
}

export async function paintCardFaces(card, palette, family) {
  const front = document.createElement('canvas')
  front.width = TEXTURE_W
  front.height = TEXTURE_H
  const frontContext = front.getContext('2d')
  const restoreFront = paintBase(frontContext, palette)
  const pad = 110

  frontContext.fillStyle = '#ffffff'
  frontContext.font = `700 64px ${family}`
  frontContext.letterSpacing = '12px'
  frontContext.fillText('PLU', pad, 170)
  frontContext.fillStyle = palette.gold
  frontContext.font = `700 34px ${family}`
  frontContext.letterSpacing = '8px'
  frontContext.fillText('ARGENTINA', pad, 222)

  // Marca de agua.
  frontContext.fillStyle = 'rgba(255,255,255,0.035)'
  frontContext.font = `800 520px ${family}`
  frontContext.letterSpacing = '0px'
  frontContext.fillText('PLU', TEXTURE_W * 0.42, TEXTURE_H * 0.92)

  frontContext.fillStyle = palette.gold
  frontContext.font = `700 32px ${family}`
  frontContext.letterSpacing = '8px'
  frontContext.fillText(String(card.eyebrow ?? '').toUpperCase(), pad, 520)

  frontContext.fillStyle = '#ffffff'
  frontContext.letterSpacing = '-2px'
  fitText(frontContext, card.name ?? '', TEXTURE_W - pad * 2, 112, 700, family)
  frontContext.fillText(card.name ?? '', pad, 640)

  frontContext.letterSpacing = '6px'
  frontContext.font = `600 34px ui-monospace, 'JetBrains Mono', monospace`
  frontContext.fillStyle = 'rgba(255,255,255,0.55)'
  frontContext.fillText(String(card.codeLabel ?? '').toUpperCase(), pad, 730)
  frontContext.fillStyle = palette.gold
  frontContext.fillText(card.code ?? '', pad + 200, 730)

  frontContext.letterSpacing = '0px'
  frontContext.fillStyle = 'rgba(255,255,255,0.12)'
  frontContext.fillRect(pad, 790, TEXTURE_W - pad * 2, 2)
  frontContext.fillStyle = 'rgba(255,255,255,0.7)'
  frontContext.font = `500 38px ${family}`
  frontContext.fillText(card.season ?? '', pad, 870)
  frontContext.fillStyle = '#ffffff'
  frontContext.font = `600 36px ${family}`
  frontContext.fillText(card.status ?? '', pad, 940)
  restoreFront()

  const back = document.createElement('canvas')
  back.width = TEXTURE_W
  back.height = TEXTURE_H
  const backContext = back.getContext('2d')
  const restoreBack = paintBase(backContext, palette)
  const qrSize = TEXTURE_H * 0.62
  const qrX = (TEXTURE_W - qrSize) / 2
  const qrY = TEXTURE_H * 0.16
  // Placa blanca: el QR necesita contraste real para escanearse desde la pantalla.
  backContext.fillStyle = '#ffffff'
  backContext.save()
  backContext.translate(qrX - 24, qrY - 24)
  roundedRectPath(backContext, qrSize + 48, qrSize + 48, 28)
  backContext.fill()
  backContext.restore()
  const qr = await loadImage(card.qrSrc)
  if (qr) backContext.drawImage(qr, qrX, qrY, qrSize, qrSize)
  backContext.fillStyle = 'rgba(255,255,255,0.7)'
  backContext.font = `600 34px ${family}`
  backContext.textAlign = 'center'
  backContext.fillText(card.qrCaption ?? '', TEXTURE_W / 2, qrY + qrSize + 100)
  backContext.fillStyle = palette.gold
  backContext.font = `600 32px ui-monospace, 'JetBrains Mono', monospace`
  backContext.letterSpacing = '6px'
  backContext.fillText(card.code ?? '', TEXTURE_W / 2, qrY + qrSize + 150)
  restoreBack()

  return { front, back }
}

/**
 * Monta la escena en `container`. Devuelve controles para rotar y liberar.
 * `onSide` se llama cuando la tarjeta cambia de lado (para anunciarlo).
 */
export async function createCredentialScene(container, card, { palette, family, onSide } = {}) {
  const renderer = new WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.outputColorSpace = SRGBColorSpace
  renderer.toneMapping = ACESFilmicToneMapping
  renderer.toneMappingExposure = 1
  container.appendChild(renderer.domElement)

  const scene = new Scene()
  const pmrem = new PMREMGenerator(renderer)
  const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  scene.environment = environment

  const camera = new PerspectiveCamera(32, 1, 0.1, 50)
  camera.position.set(0, 0, 6.3)

  const faces = await paintCardFaces(card, palette, family)
  const frontTexture = new CanvasTexture(faces.front)
  const backTexture = new CanvasTexture(faces.back)
  for (const texture of [frontTexture, backTexture]) {
    texture.colorSpace = SRGBColorSpace
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy()
  }

  const bodyGeometry = new ExtrudeGeometry(roundedRectShape(CARD_W, CARD_H, RADIUS), {
    depth: CARD_DEPTH,
    bevelEnabled: false,
    curveSegments: 12,
  })
  bodyGeometry.translate(0, 0, -CARD_DEPTH / 2)
  const edgeMaterial = new MeshPhysicalMaterial({
    color: new Color(palette.gold),
    metalness: 1,
    roughness: 0.32,
  })
  const capMaterial = new MeshPhysicalMaterial({ color: '#111216', roughness: 0.6 })
  const body = new Mesh(bodyGeometry, [capMaterial, edgeMaterial])

  const faceGeometry = new PlaneGeometry(CARD_W, CARD_H)
  const faceMaterial = (map) =>
    new MeshPhysicalMaterial({
      map,
      transparent: true,
      // Mate, con poco especular: el brillo vive en el canto dorado. Con
      // laca, el reflejo del entorno lavaba el negro y bajaba el contraste
      // del QR, que tiene que poder escanearse desde la pantalla.
      roughness: 0.9,
      specularIntensity: 0.15,
      clearcoat: 0.12,
      clearcoatRoughness: 0.7,
      side: DoubleSide,
    })
  const frontMaterial = faceMaterial(frontTexture)
  const backMaterial = faceMaterial(backTexture)
  const front = new Mesh(faceGeometry, frontMaterial)
  front.position.z = CARD_DEPTH / 2 + 0.001
  const back = new Mesh(faceGeometry, backMaterial)
  back.position.z = -CARD_DEPTH / 2 - 0.001
  back.rotation.y = Math.PI

  const cardGroup = new Group()
  cardGroup.add(body, front, back)
  scene.add(cardGroup)

  // Estado de rotación con inercia y un leve retorno a "plano".
  const state = { rotY: -0.9, rotX: 0.18, velY: 0, velX: 0, targetY: 0, entering: true }
  let frame = null
  let lastSide = 'front'
  const entranceStart = performance.now()
  const ENTRANCE_MS = 1100

  function resize() {
    const width = container.clientWidth || 1
    const height = container.clientHeight || 1
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    // En pantallas angostas la tarjeta se aleja para entrar completa.
    camera.position.z = camera.aspect < 1 ? 6.3 / Math.max(camera.aspect, 0.55) : 6.3
    camera.updateProjectionMatrix()
    render()
  }

  function render() {
    cardGroup.rotation.set(state.rotX, state.rotY, 0)
    renderer.render(scene, camera)
    const facing = Math.cos(state.rotY) * Math.cos(state.rotX) >= 0 ? 'front' : 'back'
    if (facing !== lastSide) {
      lastSide = facing
      onSide?.(facing)
    }
  }

  function step(now) {
    let moving = false
    if (state.entering) {
      // Entrada: de -0,9 rad a una vuelta completa que pasa por el dorso.
      const progress = Math.min(1, (now - entranceStart) / ENTRANCE_MS)
      const eased = 1 - Math.pow(1 - progress, 3)
      state.rotY = -0.9 + (Math.PI * 2 + 0.9) * eased
      state.rotX = 0.18 * (1 - eased)
      if (progress >= 1) {
        state.entering = false
        state.rotY = 0
      }
      moving = true
    } else {
      state.rotY += state.velY
      state.rotX += state.velX
      state.velY *= 0.93
      state.velX *= 0.88
      // La inclinación vertical vuelve sola; la horizontal queda donde la dejaron.
      state.rotX += (0 - state.rotX) * 0.08
      moving =
        Math.abs(state.velY) > 0.0005 ||
        Math.abs(state.velX) > 0.0005 ||
        Math.abs(state.rotX) > 0.001
    }
    render()
    frame = moving ? requestAnimationFrame(step) : null
  }

  function wake() {
    if (frame == null) frame = requestAnimationFrame(step)
  }

  const resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(container)
  resize()
  wake()

  return {
    /** Gira por un delta (radianes): arrastre o teclado. */
    nudge(deltaY, deltaX = 0) {
      state.entering = false
      state.velY += deltaY
      state.velX += deltaX
      wake()
    },
    /** Arrastre directo, sin inercia acumulada. */
    drag(deltaY, deltaX = 0) {
      state.entering = false
      state.rotY += deltaY
      state.rotX = Math.max(-0.5, Math.min(0.5, state.rotX + deltaX))
      state.velY = deltaY
      state.velX = 0
      wake()
    },
    flip() {
      state.entering = false
      state.velY += Math.PI * 0.07
      wake()
    },
    dispose() {
      if (frame != null) cancelAnimationFrame(frame)
      resizeObserver.disconnect()
      bodyGeometry.dispose()
      faceGeometry.dispose()
      for (const material of [edgeMaterial, capMaterial, frontMaterial, backMaterial]) {
        material.dispose()
      }
      frontTexture.dispose()
      backTexture.dispose()
      environment.dispose()
      pmrem.dispose()
      renderer.dispose()
      renderer.forceContextLoss?.()
      renderer.domElement.remove()
    },
  }
}
