import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import PricingSection from '../src/pages/admin/PricingSection.jsx'
import { generateCredentialQr } from '../src/lib/credentialQr.js'

vi.mock('../src/lib/credentialQr.js', () => ({
  generateCredentialQr: vi.fn(async () => 'data:image/png;base64,promotion-qr'),
}))

beforeAll(() => {
  if (typeof window.matchMedia === 'function') return
  window.matchMedia = () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  })
})

it('copia el código con fallback, descarga su QR y expone un canje real tras validar', async () => {
  const writeText = vi.fn(async () => {
    throw new Error('Clipboard permission denied')
  })
  const execCommand = vi.fn(() => true)
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  })
  Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand })
  const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  const onSimulatePromotionCode = vi.fn(async () => ({
    simulation: {
      destination: { kind: 'account_offer' },
      checks: { active: true, withinWindow: true },
    },
  }))

  renderPricing({
    onSimulatePromotionCode,
    configuration: {
      ...configuration,
      discountCodes: [
        {
          id: 'coupon-actions',
          code: 'ONLY-PITBULL',
          kind: 'offer',
          fixedPrice: 120000,
          appliesTo: 'combo',
          redeemedCount: 0,
          active: true,
        },
      ],
    },
  })

  // Lo que se reparte es el código, no un enlace: no existe una página pública
  // que abra un canje. Se canjea desde el campo de Afiliación o Inscripción.
  expect(screen.queryByRole('button', { name: 'Copiar enlace' })).toBe(null)

  fireEvent.click(screen.getByRole('button', { name: 'Copiar código ONLY-PITBULL' }))
  expect(writeText).toHaveBeenCalledWith('ONLY-PITBULL')
  expect(await screen.findByText('Copiado')).toBeTruthy()
  expect(execCommand).toHaveBeenCalledWith('copy')

  // Y el QR codifica el código pelado, porque su destino es el botón de escaneo
  // de esos campos.
  fireEvent.click(screen.getByRole('button', { name: 'Descargar QR' }))
  expect(generateCredentialQr).toHaveBeenCalledWith('ONLY-PITBULL')
  expect(await screen.findByText('QR descargado')).toBeTruthy()
  expect(anchorClick).toHaveBeenCalled()

  fireEvent.click(screen.getByRole('button', { name: 'Probar flujo' }))
  expect(onSimulatePromotionCode).toHaveBeenCalledWith('coupon-actions')
  expect(await screen.findByText('Recorrido verificado')).toBeTruthy()
  expect(screen.queryByRole('link', { name: 'Abrir canje en otra pestaña' })).toBe(null)
  expect(
    screen.getByText('Se canjea desde el campo de código de Afiliación o Inscripción.'),
  ).toBeTruthy()
  anchorClick.mockRestore()
})

afterEach(cleanup)

const configuration = {
  availability: { editable: true, reason: null },
  plans: [
    {
      id: 'plan-active',
      familyCode: 'plu-annual',
      version: 6,
      name: 'Afiliacion PLU anual',
      description: '',
      price: 1,
      currency: 'ARS',
      billingFrequency: 'annual',
      collectionMode: 'one_time',
      intervalCount: 1,
      graceDays: 0,
      effectiveFrom: '2026-08-14T00:00:00.000Z',
      retiredAt: null,
      active: true,
    },
    {
      id: 'plan-inactive',
      familyCode: 'plu-annual',
      version: 5,
      name: 'Afiliacion PLU anual',
      description: '',
      price: 75000,
      currency: 'ARS',
      billingFrequency: 'annual',
      collectionMode: 'one_time',
      intervalCount: 1,
      graceDays: 0,
      effectiveFrom: '2026-08-13T00:00:00.000Z',
      retiredAt: '2026-08-14T00:00:00.000Z',
      active: false,
    },
  ],
  events: [
    {
      id: 'event-1',
      slug: 'pitbull-classic',
      title: 'Pitbull Classic',
      registrationPrice: 1,
      currency: 'ARS',
      comboOffer: null,
    },
  ],
}

function renderPricing(props = {}) {
  return render(
    <I18nProvider>
      <PricingSection
        canEdit
        configuration={configuration}
        onCreatePlanVersion={vi.fn(async () => ({}))}
        onRefresh={vi.fn()}
        onSetPlanActive={vi.fn(async () => ({}))}
        {...props}
      />
    </I18nProvider>,
  )
}

describe('Tarifas — alta de planes y combo', () => {
  it('abre el formulario de plan nuevo desde el CTA principal', () => {
    renderPricing()
    fireEvent.click(screen.getByRole('button', { name: 'Nuevo plan' }))
    expect(screen.getByRole('heading', { name: 'Publicar plan' })).toBeTruthy()
    expect(screen.getByLabelText(/Familia del plan/)).toBeTruthy()
    expect(screen.getByLabelText(/^Precio$/)).toBeTruthy()
  })

  it('publica una versión nueva en vez de editar el monto cobrado', () => {
    renderPricing()
    fireEvent.click(screen.getAllByRole('button', { name: 'Nueva versión' })[0])
    expect(
      screen.getByRole('heading', { name: 'Nueva versión de Afiliacion PLU anual' }),
    ).toBeTruthy()
    expect(screen.getByLabelText(/Familia del plan/).disabled).toBe(true)
  })

  it('explica el recorrido secreto y acepta cualquier torneo', async () => {
    renderPricing({
      configuration: {
        ...configuration,
        plans: [{ ...configuration.plans[0], price: 75000 }, configuration.plans[1]],
        events: [
          {
            ...configuration.events[0],
            registrationPrice: 75000,
            comboOffer: {
              membershipPlanId: 'plan-active',
              price: 140000,
              active: true,
              audience: 'code',
              accessCode: 'ONLY-PITBULL',
            },
          },
          {
            id: 'event-sin-combo',
            slug: 'torneo-nuevo',
            title: 'Torneo nuevo',
            registrationPrice: 75000,
            comboOffer: null,
          },
        ],
      },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Nuevo código' }))
    // Tres tipos, en el vocabulario de quien reparte el código: la diferencia
    // interna entre una oferta con precio propio y una sin él la decide el
    // importe, no el operador.
    fireEvent.change(screen.getByLabelText(/^Tipo de código/), {
      target: { value: 'offer_access' },
    })
    expect(screen.getByLabelText(/^Tipo de código/).value).toBe('offer_access')
    expect(
      screen.getByRole('option', { name: 'Combo u oferta (afiliación + inscripción)' }),
    ).toBeTruthy()
    expect(screen.queryByRole('option', { name: /Oferta exclusiva/ })).toBeNull()
    // Y la oferta se instancia: se nombra el paquete que abre.
    expect(screen.getByLabelText(/Oferta que abre/).value).toBe('membership_registration')
    expect(
      screen.getByRole('option', { name: 'Afiliación + inscripción a un evento' }),
    ).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Página privada de la oferta' })).toBeTruthy()
    // El alcance ya lo dijo la oferta: preguntarlo de nuevo con una sola opción
    // era ruido.
    expect(screen.queryByLabelText('Aplica a')).toBeNull()
    expect(screen.getByLabelText(/Quién accede/).value).toBe('code')
    fireEvent.change(screen.getByRole('textbox', { name: /^Código/ }), {
      target: { value: 'only-pitbull' },
    })
    fireEvent.change(screen.getByLabelText(/Precio de la oferta por Mercado Pago/), {
      target: { value: '120000' },
    })
    fireEvent.change(await screen.findByLabelText(/Inscripción de la oferta/), {
      target: { value: 'event-1' },
    })

    expect(screen.getByRole('heading', { name: 'Página privada de la oferta' })).toBeTruthy()
    expect(screen.getByText('ONLY-PITBULL')).toBeTruthy()
    expect(screen.getAllByText(/Pitbull Classic ·/).length).toBeGreaterThan(0)
    expect(screen.getByText('Mi cuenta · Oferta exclusiva · Procesar pago')).toBeTruthy()
    // Y no hay torneos de segunda: el que no tiene nada cargado también sirve,
    // porque el código trae el paquete entero.
    expect(screen.getByRole('option', { name: /Torneo nuevo/ })).toBeTruthy()
  })

  it('permite crear un código que aplique a afiliaciones e inscripciones', async () => {
    const onUpsertDiscountCode = vi.fn(async () => ({}))
    renderPricing({ onUpsertDiscountCode })

    fireEvent.click(screen.getByRole('button', { name: 'Nuevo código' }))
    expect(screen.getByRole('heading', { name: 'Nuevo código' })).toBeTruthy()
    expect(screen.queryByText('Todavía no hay códigos cargados.')).toBeNull()

    fireEvent.change(screen.getByRole('textbox', { name: /^Código/ }), {
      target: { value: 'club-25' },
    })
    fireEvent.change(screen.getByLabelText('Descuento (%)'), { target: { value: '25' } })
    fireEvent.change(screen.getByLabelText('Aplica a'), { target: { value: 'both' } })
    fireEvent.change(screen.getByRole('spinbutton', { name: /Límite de canjes/ }), {
      target: { value: '12' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Publicar código' }))

    expect(onUpsertDiscountCode).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'CLUB-25',
        kind: 'percent',
        percentOff: 25,
        fixedPrice: undefined,
        appliesTo: 'both',
        maxRedemptions: 12,
      }),
    )
  })

  it('crea una promo de precio fijo para el combo y no manda el porcentaje', async () => {
    const onUpsertDiscountCode = vi.fn(async () => ({}))
    renderPricing({ onUpsertDiscountCode })

    fireEvent.click(screen.getByRole('button', { name: 'Nuevo código' }))
    fireEvent.change(screen.getByRole('textbox', { name: /^Código/ }), {
      target: { value: 'pitbull' },
    })
    fireEvent.change(screen.getByLabelText(/^Tipo de código/), {
      target: { value: 'fixed_price' },
    })
    // El campo de porcentaje deja lugar al del precio promocional.
    expect(screen.queryByLabelText('Descuento (%)')).toBeNull()
    fireEvent.change(screen.getByLabelText(/Precio promocional por Mercado Pago/), {
      target: { value: '120000' },
    })
    fireEvent.change(screen.getByLabelText('Aplica a'), { target: { value: 'combo' } })
    fireEvent.click(screen.getByRole('button', { name: 'Publicar código' }))

    expect(onUpsertDiscountCode).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'PITBULL',
        kind: 'fixed_price',
        fixedPrice: 120000,
        percentOff: undefined,
        appliesTo: 'combo',
        // Sin precio manual cargado: transferencia y efectivo cobran lo mismo que
        // Mercado Pago. Es el default y el caso que pidió Administración.
        fixedPriceManual: undefined,
      }),
    )
  })

  it('deja pactar el mismo importe en Mercado Pago y en transferencia', async () => {
    // El precio del canal manual no tiene por qué ser menor: cargar $120.000 en
    // los dos campos tiene que guardarse tal cual, sin que nada lo rechace.
    const onUpsertDiscountCode = vi.fn(async () => ({}))
    renderPricing({ onUpsertDiscountCode })

    fireEvent.click(screen.getByRole('button', { name: 'Nuevo código' }))
    fireEvent.change(screen.getByRole('textbox', { name: /^Código/ }), {
      target: { value: 'pacto' },
    })
    fireEvent.change(screen.getByLabelText(/^Tipo de código/), {
      target: { value: 'fixed_price' },
    })
    fireEvent.change(screen.getByLabelText(/Precio promocional por Mercado Pago/), {
      target: { value: '120000' },
    })
    fireEvent.change(screen.getByLabelText(/Precio promocional por transferencia/), {
      target: { value: '120000' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Publicar código' }))

    expect(onUpsertDiscountCode).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'PACTO',
        kind: 'fixed_price',
        fixedPrice: 120000,
        fixedPriceManual: 120000,
      }),
    )
  })

  it('un precio manual mayor que el de Mercado Pago tambien se guarda', async () => {
    const onUpsertDiscountCode = vi.fn(async () => ({}))
    renderPricing({ onUpsertDiscountCode })

    fireEvent.click(screen.getByRole('button', { name: 'Nuevo código' }))
    fireEvent.change(screen.getByRole('textbox', { name: /^Código/ }), {
      target: { value: 'caro' },
    })
    fireEvent.change(screen.getByLabelText(/^Tipo de código/), {
      target: { value: 'fixed_price' },
    })
    fireEvent.change(screen.getByLabelText(/Precio promocional por Mercado Pago/), {
      target: { value: '120000' },
    })
    fireEvent.change(screen.getByLabelText(/Precio promocional por transferencia/), {
      target: { value: '135000' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Publicar código' }))

    expect(onUpsertDiscountCode).toHaveBeenCalledWith(
      expect.objectContaining({
        fixedPrice: 120000,
        fixedPriceManual: 135000,
      }),
    )
  })

  it('el precio promocional por canal no existe en una promo de porcentaje', () => {
    renderPricing()

    fireEvent.click(screen.getByRole('button', { name: 'Nuevo código' }))
    expect(screen.queryByLabelText(/Precio promocional por transferencia/)).toBeNull()

    fireEvent.change(screen.getByLabelText(/^Tipo de código/), {
      target: { value: 'fixed_price' },
    })
    expect(screen.getByLabelText(/Precio promocional por transferencia/)).toBeTruthy()
  })

  it('programa la apertura y rechaza una ventana invertida', async () => {
    const onUpsertDiscountCode = vi.fn(async () => ({}))
    renderPricing({ onUpsertDiscountCode })

    fireEvent.click(screen.getByRole('button', { name: 'Nuevo código' }))
    fireEvent.change(screen.getByRole('textbox', { name: /^Código/ }), {
      target: { value: 'preventa' },
    })
    fireEvent.change(screen.getByLabelText('Descuento (%)'), { target: { value: '20' } })
    fireEvent.change(screen.getByLabelText(/^Apertura/), { target: { value: '2026-09-10T00:00' } })
    fireEvent.change(screen.getByLabelText(/^Vencimiento/), {
      target: { value: '2026-09-01T00:00' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Publicar código' }))

    expect(onUpsertDiscountCode).not.toHaveBeenCalled()
    expect(
      screen.getByText('El cierre de la promoción tiene que ser posterior a su apertura.'),
    ).toBeTruthy()

    fireEvent.change(screen.getByLabelText(/^Vencimiento/), {
      target: { value: '2026-09-30T00:00' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Publicar código' }))

    expect(onUpsertDiscountCode).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'PREVENTA',
        startsAt: '2026-09-10T00:00',
        expiresAt: '2026-09-30T00:00',
      }),
    )
  })

  it('convierte la lista de invitados en exclusividad y rechaza un email invalido', async () => {
    const onUpsertDiscountCode = vi.fn(async () => ({}))
    renderPricing({ onUpsertDiscountCode })

    fireEvent.click(screen.getByRole('button', { name: 'Nuevo código' }))
    fireEvent.change(screen.getByRole('textbox', { name: /^Código/ }), { target: { value: 'gym' } })
    fireEvent.change(screen.getByLabelText('Descuento (%)'), { target: { value: '15' } })
    fireEvent.change(screen.getByLabelText(/Exclusiva para/), {
      target: { value: 'ana@plu.ar\nno-es-un-mail' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Publicar código' }))

    expect(onUpsertDiscountCode).not.toHaveBeenCalled()
    expect(screen.getByText('no-es-un-mail no es una dirección de correo válida.')).toBeTruthy()

    // Un solo invitado conserva el código tipeado: la exclusividad es nominal,
    // no cambia el material que se reparte.
    fireEvent.change(screen.getByLabelText(/Exclusiva para/), {
      target: { value: 'Ana@PLU.ar' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Publicar código' }))

    expect(onUpsertDiscountCode).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'GYM', invitees: ['ana@plu.ar'] }),
    )
  })

  it('con varios invitados genera un código por persona, con el prefijo elegido', async () => {
    // Se aceptan los separadores que trae pegar una columna de planilla, y se
    // normaliza a minúsculas sin repetidos. Con más de uno el código no se
    // tipea: cada invitado recibe el suyo, así que la exclusividad es real y no
    // una lista compartiendo una sola llave.
    const onUpsertDiscountCode = vi.fn(async () => ({}))
    renderPricing({ onUpsertDiscountCode })

    fireEvent.click(screen.getByRole('button', { name: 'Nuevo código' }))
    fireEvent.change(screen.getByLabelText('Descuento (%)'), { target: { value: '15' } })
    fireEvent.change(screen.getByLabelText(/Exclusiva para/), {
      target: { value: 'Ana@PLU.ar, bruno@plu.ar; ana@plu.ar' },
    })

    // El campo de código deja lugar al prefijo, y la pantalla dice cuántos sale.
    expect(screen.queryByRole('textbox', { name: /^Código/ })).toBeNull()
    fireEvent.change(screen.getByLabelText(/Prefijo/), { target: { value: 'club' } })
    expect(screen.getByText(/Se generan 2 códigos individuales/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Publicar código' }))

    await waitFor(() => expect(onUpsertDiscountCode).toHaveBeenCalledTimes(2))
    const [first, second] = onUpsertDiscountCode.mock.calls.map(([payload]) => payload)
    expect(first.invitees).toEqual(['ana@plu.ar'])
    expect(second.invitees).toEqual(['bruno@plu.ar'])
    for (const payload of [first, second]) {
      // Dos bloques de cuatro, sin caracteres que se confundan al dictarlo, y
      // sorteados con `crypto`: el código ES el secreto de la oferta.
      expect(payload.code).toMatch(/^CLUB-[ABCDEFGHJKMNPQRTUVWXY2346789]{4}-[ABCDEFGHJKMNPQRTUVWXY2346789]{4}$/)
    }
    expect(first.code).not.toBe(second.code)
  })

  /**
   * Un evento con combo habilitado y restringido. Los precios son coherentes
   * con lo que acepta el catálogo —el combo nunca puede costar más que la suma
   * de sus partes (`staff_save_event_combo_offer`)— porque el formulario ahora
   * calcula con ellos el techo de la oferta.
   */
  const restrictedComboConfiguration = {
    ...configuration,
    plans: [{ ...configuration.plans[0], price: 75000 }, configuration.plans[1]],
    events: [
      {
        ...configuration.events[0],
        registrationPrice: 75000,
        comboOffer: {
          membershipPlanId: 'plan-active',
          price: 140000,
          active: true,
          audience: 'code',
          accessCode: 'ONLY-PITBULL',
        },
      },
    ],
  }

  it('el importe de la oferta es obligatorio: es todo su contrato', async () => {
    // Antes una oferta sin importe cobraba el precio del combo del torneo. Sin
    // combo como objeto aparte, un código sin precio no dice qué cobra.
    const onUpsertDiscountCode = vi.fn(async () => ({}))
    renderPricing({ onUpsertDiscountCode, configuration: restrictedComboConfiguration })

    fireEvent.click(screen.getByRole('button', { name: 'Nuevo código' }))
    fireEvent.change(screen.getByRole('textbox', { name: /^Código/ }), {
      target: { value: 'sin-precio' },
    })
    fireEvent.change(screen.getByLabelText(/^Tipo de código/), {
      target: { value: 'offer_access' },
    })
    fireEvent.change(screen.getByLabelText(/Inscripción de la oferta/), {
      target: { value: 'event-1' },
    })
    expect(screen.getByLabelText(/Precio de la oferta por Mercado Pago/).required).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Publicar código' }))

    expect(onUpsertDiscountCode).not.toHaveBeenCalled()
    expect(screen.getByText(/El precio promocional tiene que ser un número entero/)).toBeTruthy()
  })

  it('poner un precio convierte la misma oferta en una con importe propio', async () => {
    const onUpsertDiscountCode = vi.fn(async () => ({}))
    renderPricing({ onUpsertDiscountCode, configuration: restrictedComboConfiguration })

    fireEvent.click(screen.getByRole('button', { name: 'Nuevo código' }))
    fireEvent.change(screen.getByRole('textbox', { name: /^Código/ }), {
      target: { value: 'only-pitbull-gold' },
    })
    fireEvent.change(screen.getByLabelText(/^Tipo de código/), {
      target: { value: 'offer_access' },
    })
    fireEvent.change(screen.getByLabelText(/Precio de la oferta por Mercado Pago/), {
      target: { value: '120000' },
    })
    fireEvent.change(screen.getByLabelText(/Inscripción de la oferta/), {
      target: { value: 'event-1' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Publicar código' }))

    expect(onUpsertDiscountCode).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'ONLY-PITBULL-GOLD', kind: 'offer', fixedPrice: 120000 }),
    )
  })

  /**
   * El pedido que originó 20260913100000: crear la oferta era el segundo paso
   * de un trámite de dos objetos. Un torneo sin combo cargado ahora se elige
   * igual, y el código es la oferta.
   */
  it('una oferta con precio propio no necesita que el torneo tenga combo', async () => {
    const onUpsertDiscountCode = vi.fn(async () => ({}))
    renderPricing({
      onUpsertDiscountCode,
      configuration: {
        ...configuration,
        plans: [{ ...configuration.plans[0], price: 75000 }, configuration.plans[1]],
        events: [{ ...configuration.events[0], registrationPrice: 75000, comboOffer: null }],
      },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Nuevo código' }))
    fireEvent.change(screen.getByRole('textbox', { name: /^Código/ }), {
      target: { value: 'only-pitbull' },
    })
    fireEvent.change(screen.getByLabelText(/^Tipo de código/), {
      target: { value: 'offer_access' },
    })
    // El torneo se lista aunque no tenga combo: es el punto del cambio.
    fireEvent.change(screen.getByLabelText(/Inscripción de la oferta/), {
      target: { value: 'event-1' },
    })
    fireEvent.change(screen.getByLabelText(/Precio de la oferta por Mercado Pago/), {
      target: { value: '120000' },
    })
    // Con una sola afiliación vigente no se pregunta cuál se empaqueta.
    expect(screen.queryByLabelText(/Afiliación que empaqueta/)).toBeNull()
    // Y el techo es un número real: la suma de las partes.
    expect(screen.getByText(/Tiene que ser menor a \$\s?150\.000/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Publicar código' }))

    expect(onUpsertDiscountCode).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'ONLY-PITBULL',
        kind: 'offer',
        fixedPrice: 120000,
        appliesTo: 'combo',
        eventId: 'event-1',
      }),
    )
  })

  it('cobrar más que el paquete de lista no es una oferta', async () => {
    const onUpsertDiscountCode = vi.fn(async () => ({}))
    renderPricing({
      onUpsertDiscountCode,
      configuration: {
        ...configuration,
        plans: [{ ...configuration.plans[0], price: 75000 }, configuration.plans[1]],
        events: [{ ...configuration.events[0], registrationPrice: 75000, comboOffer: null }],
      },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Nuevo código' }))
    fireEvent.change(screen.getByRole('textbox', { name: /^Código/ }), {
      target: { value: 'no-es-oferta' },
    })
    fireEvent.change(screen.getByLabelText(/^Tipo de código/), {
      target: { value: 'offer_access' },
    })
    fireEvent.change(screen.getByLabelText(/Inscripción de la oferta/), {
      target: { value: 'event-1' },
    })
    fireEvent.change(screen.getByLabelText(/Precio de la oferta por Mercado Pago/), {
      target: { value: '150000' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Publicar código' }))

    expect(onUpsertDiscountCode).not.toHaveBeenCalled()
    expect(screen.getByText(/tiene que ser menor a lo que ya se paga sin el código/)).toBeTruthy()
  })

  it('con dos afiliaciones vigentes pregunta cuál se empaqueta y la manda', async () => {
    const onUpsertDiscountCode = vi.fn(async () => ({}))
    renderPricing({
      onUpsertDiscountCode,
      configuration: {
        ...configuration,
        plans: [
          { ...configuration.plans[0], price: 75000 },
          {
            ...configuration.plans[0],
            id: 'plan-lifetime',
            familyCode: 'plu-lifetime',
            name: 'Afiliacion PLU vitalicia',
            price: 200000,
          },
        ],
        events: [{ ...configuration.events[0], registrationPrice: 75000, comboOffer: null }],
      },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Nuevo código' }))
    fireEvent.change(screen.getByRole('textbox', { name: /^Código/ }), {
      target: { value: 'only-pitbull-vip' },
    })
    fireEvent.change(screen.getByLabelText(/^Tipo de código/), {
      target: { value: 'offer_access' },
    })
    fireEvent.change(screen.getByLabelText(/Inscripción de la oferta/), {
      target: { value: 'event-1' },
    })
    fireEvent.change(screen.getByLabelText(/Precio de la oferta por Mercado Pago/), {
      target: { value: '180000' },
    })

    // Sin elegir, el importe no se puede validar contra ningún paquete.
    fireEvent.click(screen.getByRole('button', { name: 'Publicar código' }))
    expect(onUpsertDiscountCode).not.toHaveBeenCalled()
    expect(screen.getByText(/Elegí qué afiliación empaqueta la oferta/)).toBeTruthy()

    fireEvent.change(screen.getByLabelText(/Afiliación que empaqueta/), {
      target: { value: 'plan-lifetime' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Publicar código' }))

    expect(onUpsertDiscountCode).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'ONLY-PITBULL-VIP',
        kind: 'offer',
        fixedPrice: 180000,
        membershipPlanId: 'plan-lifetime',
      }),
    )
  })

  it('una oferta sin torneo elegido no se guarda', async () => {
    // Instanciar la oferta ES elegir el torneo: sin eso el código no abre nada.
    const onUpsertDiscountCode = vi.fn(async () => ({}))
    renderPricing({ onUpsertDiscountCode, configuration: restrictedComboConfiguration })

    fireEvent.click(screen.getByRole('button', { name: 'Nuevo código' }))
    fireEvent.change(screen.getByRole('textbox', { name: /^Código/ }), {
      target: { value: 'sin-torneo' },
    })
    fireEvent.change(screen.getByLabelText(/^Tipo de código/), {
      target: { value: 'offer_access' },
    })
    fireEvent.change(screen.getByLabelText(/Precio de la oferta por Mercado Pago/), {
      target: { value: '120000' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Publicar código' }))

    expect(onUpsertDiscountCode).not.toHaveBeenCalled()
    expect(screen.getByText(/Elegí a qué inscripción aplica la oferta/)).toBeTruthy()
  })

  it('no ofrece el alcance combinado para una promo de precio fijo', () => {
    renderPricing()

    fireEvent.click(screen.getByRole('button', { name: 'Nuevo código' }))
    expect(screen.getByRole('option', { name: 'Afiliación e inscripción' })).toBeTruthy()

    fireEvent.change(screen.getByLabelText(/^Tipo de código/), {
      target: { value: 'fixed_price' },
    })
    expect(screen.queryByRole('option', { name: 'Afiliación e inscripción' })).toBeNull()
    expect(screen.getByRole('option', { name: 'Combo (afiliación + inscripción)' })).toBeTruthy()
  })

  it('el modo de cobro es una sola decisión: sin canales sueltos que contradecirla', async () => {
    // Antes eran cuatro casillas cuya validez dependía entre sí. El modo por
    // defecto es la pasarela, y en ese modo no hay ningún canal manual que
    // elegir: no hay forma de guardar un contrato a medio armar.
    const onUpsertDiscountCode = vi.fn(async () => ({}))
    renderPricing({ onUpsertDiscountCode })

    fireEvent.click(screen.getByRole('button', { name: 'Nuevo código' }))
    fireEvent.change(screen.getByRole('textbox', { name: /^Código/ }), {
      target: { value: 'solo-mercado-pago' },
    })
    fireEvent.change(screen.getByLabelText('Descuento (%)'), { target: { value: '10' } })

    expect(screen.getByLabelText(/Cómo se cobra/).value).toBe('mercado_pago')
    expect(screen.queryByRole('checkbox', { name: 'Efectivo en Pitbull' })).toBeNull()
    expect(screen.queryByRole('checkbox', { name: /Permitir delegar el pago/ })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Publicar código' }))
    expect(onUpsertDiscountCode).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'SOLO-MERCADO-PAGO',
        manualChannels: [],
        mercadoPagoEnabled: true,
        financed: false,
      }),
    )
  })

  it('cobrar sí o sí a mano cierra la pasarela y abre los dos canales', async () => {
    // El caso que antes había que armar a mano destildando Mercado Pago y
    // marcando canales: ahora es una opción del selector.
    const onUpsertDiscountCode = vi.fn(async () => ({}))
    renderPricing({ onUpsertDiscountCode })

    fireEvent.click(screen.getByRole('button', { name: 'Nuevo código' }))
    fireEvent.change(screen.getByRole('textbox', { name: /^Código/ }), {
      target: { value: 'pactado-a-mano' },
    })
    fireEvent.change(screen.getByLabelText('Descuento (%)'), { target: { value: '10' } })
    fireEvent.change(screen.getByLabelText(/Cómo se cobra/), { target: { value: 'manual' } })

    expect(screen.getByRole('checkbox', { name: 'Transferencia bancaria' }).checked).toBe(true)
    expect(screen.getByRole('checkbox', { name: 'Efectivo en Pitbull' }).checked).toBe(true)
    expect(screen.getByRole('checkbox', { name: /Aceptar también Mercado Pago/ }).checked).toBe(
      false,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Publicar código' }))
    expect(onUpsertDiscountCode).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'PACTADO-A-MANO',
        manualChannels: ['bank_transfer', 'cash_pitbull'],
        mercadoPagoEnabled: false,
        financed: false,
      }),
    )
  })

  it('el modo que habilita al avisar el pago no puede quedar inerte', async () => {
    // El agujero que reportó Precios: se podía marcar financiamiento con sólo
    // Mercado Pago, y el atleta canjeaba, pagaba con la pasarela —que acredita
    // sola— y nunca delegaba nada. Ahora el financiamiento ES un modo de cobro
    // manual: elegirlo abre los canales que el atleta puede declarar.
    const onUpsertDiscountCode = vi.fn(async () => ({}))
    renderPricing({ onUpsertDiscountCode })

    fireEvent.click(screen.getByRole('button', { name: 'Nuevo código' }))
    fireEvent.change(screen.getByRole('textbox', { name: /^Código/ }), {
      target: { value: 'only-pitbull-gold' },
    })
    fireEvent.change(screen.getByLabelText('Descuento (%)'), { target: { value: '10' } })
    fireEvent.change(screen.getByLabelText(/Cómo se cobra/), {
      target: { value: 'manual_financed' },
    })

    expect(screen.getByRole('checkbox', { name: 'Transferencia bancaria' }).checked).toBe(true)
    expect(screen.getByRole('checkbox', { name: 'Efectivo en Pitbull' }).checked).toBe(true)
    // Y lo que hace queda dicho en el formulario, no en un tooltip.
    expect(screen.getByText(/queda habilitado en afiliación e inscripción/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Publicar código' }))
    expect(onUpsertDiscountCode).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'ONLY-PITBULL-GOLD',
        financed: true,
        manualChannels: ['bank_transfer', 'cash_pitbull'],
        mercadoPagoEnabled: false,
      }),
    )
  })

  it('volver a Mercado Pago limpia el financiamiento en vez de dejarlo guardado', async () => {
    const onUpsertDiscountCode = vi.fn(async () => ({}))
    renderPricing({ onUpsertDiscountCode })

    fireEvent.click(screen.getByRole('button', { name: 'Nuevo código' }))
    fireEvent.change(screen.getByRole('textbox', { name: /^Código/ }), {
      target: { value: 'sin-delegar' },
    })
    fireEvent.change(screen.getByLabelText('Descuento (%)'), { target: { value: '10' } })
    fireEvent.change(screen.getByLabelText(/Cómo se cobra/), {
      target: { value: 'manual_financed' },
    })
    fireEvent.change(screen.getByLabelText(/Cómo se cobra/), { target: { value: 'mercado_pago' } })

    fireEvent.click(screen.getByRole('button', { name: 'Publicar código' }))
    expect(onUpsertDiscountCode).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'SIN-DELEGAR',
        financed: false,
        manualChannels: [],
        mercadoPagoEnabled: true,
      }),
    )
  })

  it('un código pactado a mano puede además aceptar la pasarela', async () => {
    // Es la excepción, no el punto de partida: la reapertura vive dentro del
    // modo manual y no como una casilla suelta que contradice al selector.
    const onUpsertDiscountCode = vi.fn(async () => ({}))
    renderPricing({ onUpsertDiscountCode })

    fireEvent.click(screen.getByRole('button', { name: 'Nuevo código' }))
    fireEvent.change(screen.getByRole('textbox', { name: /^Código/ }), {
      target: { value: 'como-quiera' },
    })
    fireEvent.change(screen.getByLabelText('Descuento (%)'), { target: { value: '10' } })
    fireEvent.change(screen.getByLabelText(/Cómo se cobra/), { target: { value: 'manual' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /Aceptar también Mercado Pago/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Transferencia bancaria' }))

    fireEvent.click(screen.getByRole('button', { name: 'Publicar código' }))
    expect(onUpsertDiscountCode).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'COMO-QUIERA',
        manualChannels: ['cash_pitbull'],
        mercadoPagoEnabled: true,
      }),
    )
  })

  it('no habilita ningún canal manual por defecto', async () => {
    const onUpsertDiscountCode = vi.fn(async () => ({}))
    renderPricing({ onUpsertDiscountCode })

    fireEvent.click(screen.getByRole('button', { name: 'Nuevo código' }))
    fireEvent.change(screen.getByRole('textbox', { name: /^Código/ }), {
      target: { value: 'solo-mp' },
    })
    fireEvent.change(screen.getByLabelText('Descuento (%)'), { target: { value: '10' } })
    fireEvent.click(screen.getByRole('button', { name: 'Publicar código' }))

    expect(onUpsertDiscountCode).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'SOLO-MP', manualChannels: [], mercadoPagoEnabled: true }),
    )
  })

  it('sólo en efectivo: se estrecha el canal sin tocar la pasarela', async () => {
    // El caso que no se podía cargar sin armar la matriz a mano: una oferta que
    // sólo cierra cobrada en efectivo y que no debe poder pagarse online.
    const onUpsertDiscountCode = vi.fn(async () => ({}))
    renderPricing({ onUpsertDiscountCode })

    fireEvent.click(screen.getByRole('button', { name: 'Nuevo código' }))
    fireEvent.change(screen.getByRole('textbox', { name: /^Código/ }), {
      target: { value: 'pactado-efectivo' },
    })
    fireEvent.change(screen.getByLabelText('Descuento (%)'), { target: { value: '10' } })
    fireEvent.change(screen.getByLabelText(/Cómo se cobra/), { target: { value: 'manual' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Transferencia bancaria' }))
    fireEvent.click(screen.getByRole('button', { name: 'Publicar código' }))

    expect(onUpsertDiscountCode).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'PACTADO-EFECTIVO',
        manualChannels: ['cash_pitbull'],
        mercadoPagoEnabled: false,
      }),
    )
  })

  it('no guarda un código sin ningún medio de pago', async () => {
    // El único callejón que queda alcanzable: modo manual y los dos canales
    // destildados, con la pasarela cerrada. Se avisa en el mismo fieldset.
    const onUpsertDiscountCode = vi.fn(async () => ({}))
    renderPricing({ onUpsertDiscountCode })

    fireEvent.click(screen.getByRole('button', { name: 'Nuevo código' }))
    fireEvent.change(screen.getByRole('textbox', { name: /^Código/ }), {
      target: { value: 'sin-medios' },
    })
    fireEvent.change(screen.getByLabelText('Descuento (%)'), { target: { value: '10' } })
    fireEvent.change(screen.getByLabelText(/Cómo se cobra/), { target: { value: 'manual' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Transferencia bancaria' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Efectivo en Pitbull' }))
    expect(screen.getByText(/Elegí al menos un medio de pago/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Publicar código' }))
    expect(onUpsertDiscountCode).not.toHaveBeenCalled()
  })

  it('la fila dice qué es lo único con lo que se puede pagar', () => {
    renderPricing({
      configuration: {
        ...configuration,
        discountCodes: [
          {
            id: 'coupon-cash',
            code: 'PACTADO-EFECTIVO',
            percentOff: 10,
            appliesTo: 'membership',
            manualChannels: ['cash_pitbull'],
            mercadoPagoEnabled: false,
            redeemedCount: 0,
            active: true,
          },
        ],
      },
    })

    expect(screen.getByText('Sólo efectivo')).toBeTruthy()
    expect(screen.queryByText('Habilita efectivo')).toBeNull()
  })

  it('resume en la fila qué canales destraba el código', () => {
    renderPricing({
      configuration: {
        ...configuration,
        discountCodes: [
          {
            id: 'coupon-transfer',
            code: 'SOLO-TRANSFER',
            percentOff: 10,
            appliesTo: 'membership',
            manualChannels: ['bank_transfer'],
            redeemedCount: 0,
            active: true,
          },
        ],
      },
    })

    expect(screen.getByText('Habilita transferencia')).toBeTruthy()
    expect(screen.queryByText('Habilita transferencia y efectivo')).toBeNull()
  })

  it('muestra el importe de la promo en la fila, no un porcentaje', () => {
    renderPricing({
      configuration: {
        ...configuration,
        discountCodes: [
          {
            id: 'coupon-pitbull',
            code: 'PITBULL',
            kind: 'fixed_price',
            percentOff: 0,
            fixedPrice: 120000,
            appliesTo: 'combo',
            redeemedCount: 0,
            active: true,
          },
        ],
      },
    })

    expect(screen.getByText('Combo (afiliación + inscripción)')).toBeTruthy()
    expect(screen.getByText(/120\.000/)).toBeTruthy()
    expect(screen.queryByText('−0%')).toBeNull()
  })

  it('muestra los canjes restantes y desactiva el control al agotar el cupón', () => {
    renderPricing({
      configuration: {
        ...configuration,
        discountCodes: [
          {
            id: 'coupon-first-ten',
            code: 'PRIMEROS-10',
            percentOff: 20,
            appliesTo: 'both',
            maxRedemptions: 10,
            redeemedCount: 10,
            active: false,
          },
        ],
      },
    })

    expect(screen.getByText('0 disponibles')).toBeTruthy()
    expect(screen.getByText('Agotado')).toBeTruthy()
    expect(screen.getByRole('progressbar', { name: '0 de 10 cupos disponibles' })).toHaveProperty(
      'value',
      0,
    )
    // Agotada queda en "Deshabilitada" y las dos opciones abiertas fuera de
    // alcance: reabrirla sin ampliar el cupo no habilita nada y la RPC la
    // rechaza, así que el panel no ofrece el click.
    const states = screen.getByRole('radiogroup', { name: 'Estado de la promoción PRIMEROS-10' })
    expect(within(states).getByRole('radio', { name: 'Deshabilitada' }).checked).toBe(true)
    expect(within(states).getByRole('radio', { name: 'Para todos' }).disabled).toBe(true)
    expect(within(states).getByRole('radio', { name: 'Con código' }).disabled).toBe(true)
    expect(
      screen.getByText(
        'Agotó su cupo y se cerró sola. Ampliá el límite de canjes para volver a habilitarla.',
      ),
    ).toBeTruthy()
  })

  it('cambia la promoción a pública desde la fila', async () => {
    const onSetDiscountCodeState = vi.fn(async () => ({}))
    renderPricing({
      onSetDiscountCodeState,
      configuration: {
        ...configuration,
        discountCodes: [
          {
            id: 'coupon-open',
            code: 'VERANO',
            percentOff: 15,
            appliesTo: 'membership',
            redeemedCount: 0,
            active: true,
            audience: 'code',
          },
        ],
      },
    })

    const states = screen.getByRole('radiogroup', { name: 'Estado de la promoción VERANO' })
    expect(within(states).getByRole('radio', { name: 'Con código' }).checked).toBe(true)

    fireEvent.click(within(states).getByRole('radio', { name: 'Para todos' }))
    await screen.findByText('Configuración actualizada.')

    expect(onSetDiscountCodeState).toHaveBeenCalledWith('coupon-open', 'public')
  })

  it('marca la promoción que se aplica sola', () => {
    renderPricing({
      configuration: {
        ...configuration,
        discountCodes: [
          {
            id: 'coupon-public',
            code: 'TODOS',
            percentOff: 10,
            appliesTo: 'both',
            redeemedCount: 0,
            active: true,
            audience: 'public',
          },
        ],
      },
    })

    expect(screen.getByText('Se aplica sola')).toBeTruthy()
    const states = screen.getByRole('radiogroup', { name: 'Estado de la promoción TODOS' })
    expect(within(states).getByRole('radio', { name: 'Para todos' }).checked).toBe(true)
  })

  // El error de cambiar el estado se mostraba dentro del formulario de edición,
  // que en este flujo está cerrado: el rechazo quedaba invisible y el control
  // volvía solo a su lugar sin explicar nada.
  it('muestra en la propia fila el rechazo al cambiar de estado', async () => {
    const onSetDiscountCodeState = vi.fn(async () => ({
      error: 'La promoción agotó su cupo (10 de 10).',
    }))
    renderPricing({
      onSetDiscountCodeState,
      configuration: {
        ...configuration,
        discountCodes: [
          {
            id: 'coupon-rejected',
            code: 'RECHAZO',
            percentOff: 15,
            appliesTo: 'membership',
            redeemedCount: 0,
            active: true,
            audience: 'code',
          },
        ],
      },
    })

    const states = screen.getByRole('radiogroup', { name: 'Estado de la promoción RECHAZO' })
    fireEvent.click(within(states).getByRole('radio', { name: 'Deshabilitada' }))

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'La promoción agotó su cupo (10 de 10).',
    )
  })

  it('copia el código y confirma la acción en la misma fila', async () => {
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })

    renderPricing({
      configuration: {
        ...configuration,
        discountCodes: [
          {
            id: 'coupon-copy',
            code: 'CLUB-25',
            percentOff: 25,
            appliesTo: 'membership',
            redeemedCount: 0,
            active: true,
          },
        ],
      },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Copiar código CLUB-25' }))

    expect(writeText).toHaveBeenCalledWith('CLUB-25')
    expect(await screen.findByText('Copiado')).toBeTruthy()
  })

  it('presenta el estado vacío de suscripciones y conserva la actualización accesible', () => {
    renderPricing()

    expect(screen.getByText('Todavía no hay suscripciones activas.')).toBeTruthy()
    expect(screen.getByText(/Las afiliaciones recurrentes van a aparecer acá/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeTruthy()
  })
})
