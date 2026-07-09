# Design Polish Checklist — PLU ARG

Checklist operativo para no reintroducir los problemas que ya se encontraron y corrigieron entre
Fase 1 y Fase 5.5. Usar antes de mergear cualquier cambio visual. Ver también
`UX_UI_GUIDELINES.md` (gramática visual base) y `PLU_BRAND_ALIGNMENT.md` (contexto de marca).

## Estados async — mapa real (Fase 6.0)

Se revisó todo el proyecto buscando operaciones async reales (no se inventó ninguna). Estado:

| Superficie | Async real | Estado |
|---|---|---|
| `TicketOrdersSection` (Pagos) | Sí — `refreshPendingTicketOrders`, aprobar pago, ver comprobante | ✅ `LoadingState`/`ErrorState` cableados con retry real. Verificado con Playwright contra un error real de backend (RPC `list_pending_ticket_orders` faltante en Supabase — reportar aparte, no es bug de frontend). |
| `TicketPurchaseSection` (checkout de entradas) | Sí — ya es la base del futuro checkout | ✅ Ya tenía `submitting`/`submitError`/`proofUploading`/`proofUploadError` bien implementados antes de esta fase. Es el patrón a replicar para Mercado Pago, no hace falta rehacerlo. |
| `CheckInSection` (Seguridad) | Sí — `refreshTickets` en background | 🔲 Pendiente. El refresh de fondo sigue en `console.error` silencioso. No se cableó un estado de error en esta fase porque requiere entender bien el layout ya complejo del componente (scanner + historial + feedback de sonido/vibración) para no romper el flujo crítico de escaneo, que ya tiene su propio manejo de resultado por intento (`SCAN_VERDICT_META`). Punto de entrada para la próxima vez: `useAppData.js` → `refreshTickets`, mismo patrón que `refreshPendingTicketOrders`. |
| Dashboard admin, Vista PLU USA, tablas de Atletas/Afiliaciones | No — todo viene de estado local ya cargado (seed/localStorage) | Sin cambios: no hay red de por medio, agregar loading/error acá sería fabricar un estado que nunca ocurre. |
| Exportaciones CSV (`createCsv`) | No — 100% síncrono, arma el archivo en memoria y dispara la descarga | Sin cambios, por la misma razón. |
| Login | Sí, para cuentas reales (no demo) | Ya tenía `isSubmitting`/`submitError` con manejo inline apropiado para un form — no se tocó, no necesita el `ErrorState` de panel completo. |

## Reglas anti "AI-generated"

- [ ] **Un solo énfasis por hover/focus.** Lift, glow o cambio de borde — nunca dos o tres a la vez.
      (Ver `cards.css`/`buttons.css` como referencia de la versión corregida.)
- [ ] **Sin emoji en UI de producción.** Ni en copy, ni como ícono decorativo. `lucide-react` para
      todo lo que necesite un símbolo.
- [ ] **Sin gradientes decorativos sin función.** Un gradiente vale si comunica algo (ej. barra
      tricolor = identidad ARG en un acento puntual). No vale como fondo genérico de card o botón.
- [ ] **Sin animaciones infinitas decorativas.** Si algo se mueve para siempre sin que el usuario lo
      pidió, sacarlo. (Se encontraron y sacaron dos: el ruido de fondo de `PageHero` muerto y el
      ícono flotante de `EmptyState`.)
- [ ] **Sin glassmorphism salvo scrim real.** `backdrop-filter` solo se justifica cuando hay contenido
      visible detrás de un overlay translúcido (modal, drawer). Si el fondo ya es ≥90% opaco, el blur
      no hace nada — sacarlo.
- [ ] **Cards con carácter, no perfectas.** Preferir tipografía + jerarquía + un acento de color por
      sobre sombra/glow/borde-gradiente apilados.
- [ ] **Copy factual, no marketinero.** Nada de "revolucionario", "de clase mundial", "unlock your
      potential". El copy actual del proyecto ya cumple esto — mantenerlo así.
- [ ] **Sin texto de desarrollo visible.** Nada de "dato de ejemplo", "lorem ipsum", "TODO" en
      producción. Si un dato no está confirmado, decirlo con lenguaje real ("a confirmar").
- [ ] **Íconos con propósito.** Cada ícono acompaña una etiqueta o acción concreta — no decoración
      suelta rellenando espacio.

## Reglas de componentes

- [ ] Antes de crear un componente nuevo, buscar si ya existe uno reutilizable (`DataTable`,
      `StatusBadge`, `StatusPill`, `AdminListSection`, `EmptyState`, `SectionHeading`, `CTASection`).
- [ ] Si un componente se marca como "preparado para más adelante" (prop opcional, variante sin uso),
      **documentarlo acá y en el archivo**, no dejarlo mudo. Este proyecto ya tuvo tres casos de
      componentes fantasma (`PageHero.jsx`, `tables.css`, `LoadingState`/`ErrorState` sin conectar)
      que consumían mantenimiento sin dar valor.
- [ ] Todo componente visual nuevo se verifica con captura real (Playwright o navegador manual) antes
      de darlo por terminado — la lectura de código no detecta CSS no importado ni colisiones de
      layout en mobile. Ver Fase 5.5 para el procedimiento.
- [ ] Reutilizar tokens de `variables.css`/`palette.css` — nunca hex sueltos en JSX o CSS nuevo.

## Reglas de movimiento / transiciones

- [ ] Transiciones con propósito: indicar ubicación (nav activo), dar feedback de acción (hover de
      botón), o revelar contenido al hacer scroll (`Reveal`). No animación "porque sí".
- [ ] Respetar `prefers-reduced-motion` en cualquier animación nueva.
- [ ] El indicador deslizante del nav y el reveal de scroll son las únicas microinteracciones con
      licencia para "llamar la atención" — todo lo demás debe ser sobrio.

## Reglas de copy institucional

- [ ] Nombrar "Powerlifting United" explícitamente en header, footer, meta tags y cualquier pantalla
      de cara a PLU USA (vista partner, exports). Ver `PLU_BRAND_ALIGNMENT.md` §1.
- [ ] Identidad argentina sutil, nunca dominante (una franja celeste, no una bandera).
- [ ] Si el copy menciona a "Maximal" (operador), que sea la mención secundaria de la frase, nunca la
      primera — y nunca duplicada en la misma pantalla (ver fix de Fase 5.5 en el hero).
- [ ] Todo dato "no confirmado" se marca como tal con lenguaje profesional, no con placeholder de dev.

## Reglas de subdomain readiness

- [ ] No hardcodear el dominio `.com.ar` en ningún lado del código (revisar antes de cada release).
- [ ] Meta tags (`title`, `description`) siempre mencionan Powerlifting United, no solo "PLU ARG".
- [ ] Cualquier pantalla nueva de cara a PLU USA (como la vista partner) usa naming institucional
      completo, no abreviaturas internas.
- [ ] No asumir paleta/tipografía "final" en decisiones difíciles de revertir — ver
      `PLU_BRAND_ALIGNMENT.md` §5 antes de comprometerse a algo que dependa de guidelines oficiales.

## Reglas de records management readiness

- [ ] `/records` se mantiene explícitamente separado de `/results` — nunca mezclar "resultado de
      evento" con "récord histórico" en el mismo componente o tabla sin distinguir cuál es cuál.
- [ ] No inventar lógica de cálculo de récords (fórmulas, elegibilidad, categorías) hasta recibir el
      estándar oficial de PLU USA. El estado actual es intencionalmente "Coming soon".
- [ ] La vista PLU USA debe seguir mencionando records en su copy de resumen aunque el módulo no
      tenga datos todavía — señaliza que está contemplado, no ausente.

## Antes de cerrar cualquier pantalla nueva (recordatorio de `UX_UI_GUIDELINES.md`)

1. ¿Acción principal evidente?
2. ¿Mobile usable sin zoom, verificado con captura real?
3. ¿Usa tokens CSS, no hex sueltos?
4. ¿Estados vacío/error/loading contemplados (aunque hoy no se disparen)?
5. ¿Coherente con el naming de `PLU_BRAND_ALIGNMENT.md`?
6. ¿El CSS que usa está realmente importado en `index.css`? (Verificar — ya hubo casos que no.)
