---
name: plu-frontend-design
description: >-
  Autoridad visual y operativa de PLU Argentina para diseñar, auditar o
  rediseñar interfaces elegantes, minimalistas, premium y coherentes con la
  marca. Usar primero en este repo ante cualquier tarea de UI, UX, landing
  page, portada, hero, Quiénes somos, Pitbull Classic, página institucional,
  conversión, panel administrativo, componente, CSS, responsive, temas,
  accesibilidad, motion o rendimiento visual. Coordina las skills tácticas y
  exige implementación y QA sobre el render real.
---

# PLU Frontend Design

Diseñar PLU como una federación deportiva seria, contemporánea y humana. Buscar lujo editorial
mediante proporción, tipografía, ritmo, material real y restricción. No confundir premium con
agregar efectos.

## Contrato del agente

Cumplir siempre estas cuatro obligaciones:

1. Entender el objetivo y la acción principal antes de tocar estilos.
2. Auditar el render real antes y después. No evaluar calidad visual solo desde el código.
3. Resolver primero jerarquía, composición y contenido; aplicar color y motion al final.
4. Entregar evidencia responsive, temática, accesible y técnica proporcional al cambio.

No declarar una mejora terminada si únicamente se agregaron overrides CSS o si no se vio la
pantalla renderizada.

## Jerarquía de autoridad

Aplicar este orden ante conflictos:

1. Preservar reglas de negocio, contratos, datos, permisos, rutas y comportamiento existente.
2. Obedecer esta skill como autoridad visual del proyecto.
3. Tomar el código vigente como fuente de verdad: `palette.css`, `variables.css`, temas y
   componentes renderizados.
4. Respetar el pedido concreto del usuario.
5. Usar skills externas solo como método. Adaptarlas a PLU, nunca como identidad.

Si un documento contradice el código vigente, seguir el código y señalar o corregir la
desalineación. `docs/PLU_BRAND_ALIGNMENT.md` es la referencia de marca más reciente, pero los
tokens ejecutados siguen teniendo prioridad.

## Lectura obligatoria y enrutamiento

Leer antes de implementar:

- `docs/ARCHITECTURE.md` y `docs/BUSINESS_RULES.md`.
- La página, componentes, servicios, contenido, estilos y tests de la superficie en alcance.
- `src/styles/tokens/palette.css`, `src/styles/variables.css` y los temas cuando se modifiquen
  decisiones visuales compartidas.

Leer recursos de esta skill según la tarea:

- Para elegir composición, portada o tratamiento por sección: [playbook de elegancia](references/elegance-playbook.md).
- Para comprobar el resultado y documentar evidencia: [QA y evidencia](references/qa-evidence.md).

Invocar después las skills tácticas mínimas necesarias:

| Necesidad | Skill |
|---|---|
| Proceso completo y QA por pantalla | `agent-skills/design-upgrade/SKILL.md` |
| Tokens, CSS y componentes existentes | `agent-skills/design-system-plu/SKILL.md` |
| Refinar una sección puntual | `agent-skills/design-ux-ui/SKILL.md` |
| TiltCard, showcase o transición de presencia | `agent-skills/motion-premium/SKILL.md` |

No cargar ni aplicar todas por reflejo. Esta skill define marca y criterio; las tácticas aportan
inventario o procedimiento específico.

## Dirección visual

Buscar estas cualidades:

- **Oficial:** información verificable, estados claros, naming institucional.
- **Deportiva:** escala, tensión, ritmo y fotografía real cuando exista.
- **Editorial:** títulos firmes, ancho de lectura controlado, reglas y metadatos útiles.
- **Premium:** pocos elementos bien resueltos, materiales sobrios y detalle preciso.
- **Humana:** lenguaje directo, atletas y comunidad reales, sin marketing vacío.
- **Operativa:** navegación predecible, acciones visibles y estados completos.

Evitar:

- Plantillas SaaS genéricas, heroes centrados por defecto y grillas simétricas de tres cards.
- Fitness amateur, neón, gradientes decorativos, partículas, fondos animados o falso 3D.
- Glow, glass, blur, bordes gradiente o sombras apilados para compensar mala jerarquía.
- Numeración, reglas técnicas, chips o iconos que no comuniquen información real.
- Copy aspiracional genérico, testimonios, precios, fechas o métricas inventadas.
- Repetir la misma portada, card o composición en todas las páginas.

## Presupuesto de elegancia

Usar estos límites como gate, no como sugerencia estética:

| Recurso | Límite operativo |
|---|---|
| Acción principal | Una por bloque; una secundaria como máximo en el mismo nivel |
| Acento de color | Uno por bloque visual |
| Niveles de superficie | Hasta tres por viewport: canvas, surface y elevated |
| Radios visibles | Hasta dos escalas dominantes por pantalla |
| Jerarquías tipográficas | Cuatro roles claros por sección como máximo |
| Efecto atmosférico | Uno, estático y solo si sostiene la composición |
| Motion de entrada | Una secuencia one-shot por sección |
| Loop infinito | Ninguno decorativo; uno solo si comunica estado operativo real |
| Cards anidadas | Cero |

Si una sección necesita superar el presupuesto, justificarlo por contenido o interacción real.
Antes de sumar un recurso, intentar quitar uno.

## Marca y sistema visual

### Color

Usar alias semánticos, nunca valores sueltos en JSX:

- Grafito y superficies: `--color-bg-*`.
- Identidad, navegación, links y foco: `--color-brand-celeste`.
- Acción principal: `--color-brand-action` igual a oro PLU.
- Distinción, membresía y resultados destacados: `--color-brand-gold`.
- Rojo: error o peligro real únicamente. Nunca marca, CTA o decoración.

Aplicar como máximo un acento por bloque. Reservar `--gradient-brand` para una firma breve y
puntual, no como fondo genérico. Crear un token nuevo solo cuando ninguna variable existente
exprese el rol y definirlo en ambos temas.

### Tipografía

Usar Poppins mediante `--font-family` y `--font-display`. No introducir otra familia sin una
guía oficial de PLU USA.

- H1: `clamp(28px, 4.2vw, 46px)`, peso 700, línea corta y segura.
- H2: `clamp(22px, 3.2vw, 36px)`, peso 700.
- H3: 16 a 18px, peso 600.
- Body: 14 a 16px, peso 400, ancho de lectura controlado.
- Eyebrow o badge: 10 a 11px, peso 600 a 700, único uso regular de uppercase.

No usar uppercase o tracking amplio como decoración repetida. La escala, el ancho de línea y el
espacio deben construir jerarquía antes que el color.

### Superficies y componentes

Reutilizar `src/components/ui`, `src/components/layout` y `src/components/admin` antes de crear.
Usar cards solo para colecciones comparables, selección o acciones contenidas. Para contenido
editorial preferir flujo abierto, reglas, listas y columnas.

- No anidar card dentro de card.
- No convertir automáticamente cada sección en una grilla.
- No crear una variante nueva si una existente admite una extensión semántica.
- No mantener dos capas de overrides premium sobre la misma pantalla; consolidar reglas.
- Usar `lucide-react` para iconografía funcional. No usar emoji en producción.

## Familias de página

Elegir una familia antes de diseñar la portada:

| Familia | Uso | Composición dominante |
|---|---|---|
| Showcase | Home, Pitbull | Protagonista visual o tipográfico, datos clave y un CTA |
| Conversión | Afiliación, registro, entradas | Beneficio, condición o precio y acción inmediata |
| Índice | Eventos, resultados, récords | Título editorial, contexto operativo y acceso al contenido |
| Institucional | Quiénes somos, comunidad, FAQ, contacto | Copy factual, manifiesto breve y evidencia, con foto solo si aporta |
| Operativa | Admin, seguridad, reportes | Densidad legible, filtros, estados y acciones por permiso |

No usar el hero de una familia como plantilla para otra. Compartir tokens y ritmo, no el mismo
dibujo. Ver recetas y contraejemplos en el [playbook de elegancia](references/elegance-playbook.md).

## Método obligatorio

### 1. Fijar alcance y preservar comportamiento

- Identificar la superficie exacta, usuario principal, objetivo y acción primaria.
- Leer el servicio o contrato asociado si existe.
- Enumerar estados reales: default, loading, empty, error, success, disabled y sin permiso.
- No ampliar el alcance funcional por una decisión estética.

### 2. Obtener evidencia base

- Ejecutar la aplicación y abrir el flujo real.
- Capturar al menos un viewport representativo antes de modificar.
- Registrar overflow, colisiones, densidad, jerarquía, controles pequeños y errores de consola.
- Medir el build antes de una ronda amplia o sensible a rendimiento.

### 3. Escribir una tesis de diseño

Definir en una frase:

> Esta pantalla debe sentirse `[cualidad]` porque ayuda a `[usuario]` a `[objetivo]` mediante
> `[composición dominante]`.

Definir además:

- Qué debe verse primero, segundo y tercero.
- Qué puede eliminarse, agruparse o pasar a segundo plano.
- Qué familia de página y patrón dominante se usarán.
- Qué recurso visual no se usará para mantener restricción.

No implementar hasta poder responder estas decisiones.

### 4. Resolver por capas

Aplicar en este orden y detenerse cuando el problema quede resuelto:

1. Contenido y orden de lectura.
2. Layout, ancho, ritmo y espacio.
3. Tipografía y contraste.
4. Componentes, estados y controles.
5. Color, imagen y tratamiento de superficie.
6. Motion funcional.

No empezar por sombras, gradientes o animaciones.

### 5. Implementar el cambio mínimo coherente

- Reutilizar tokens y componentes.
- Mantener lógica de negocio en `src/services` y UI en componentes.
- Ubicar CSS exclusivo de ruta junto a su página lazy cuando corresponda.
- Consolidar reglas heredadas en vez de apilar parches al final de hojas extensas.
- Preservar contenido, traducciones, rutas y acciones existentes salvo pedido explícito.

### 6. Verificar el render final

Seguir la matriz proporcional de [QA y evidencia](references/qa-evidence.md). Como mínimo:

- Mobile, tablet y desktop.
- Tema claro y oscuro.
- Teclado, foco, hover y touch.
- Movimiento normal y `prefers-reduced-motion`.
- Sin overflow horizontal, errores de consola ni contenido oculto después del settle.
- Estados reales que puedan activarse de forma segura.

Iterar sobre la captura final. No cerrar con el primer render correcto.

## Responsive y accesibilidad

Usar los breakpoints reales del proyecto: 360, 390 y 430; 768, 900 y 1024; 1152, 1280,
1366 y 1440; 1920 cuando la superficie lo justifique.

- Mantener targets táctiles de al menos 44 por 44px.
- Asegurar contraste WCAG AA para texto y controles en ambos temas.
- Mantener headings y landmarks en orden lógico.
- Asociar labels, nombres accesibles y estados además del color.
- Atrapar y devolver foco en modales o drawers; cerrar con `Escape`.
- Evitar que mobile sea solo desktop apilado: reordenar prioridad cuando ayude al flujo.

## Motion

Animar únicamente para comunicar respuesta, continuidad, ubicación, jerarquía, estado o
progreso. Usar el sistema existente de `motion/react` y los tokens de `variables.css` y
`src/motion/tokens.ts`.

- Preferir `transform` y `opacity`.
- No usar `transition: all`.
- No animar fondos completos, layout estable o decoración permanente.
- Mantener entradas entre 240 y 480ms; reservar 700ms para un showcase excepcional.
- Desactivar desplazamiento, blur y tilt bajo `prefers-reduced-motion`.
- Restringir 3D a piezas protagonistas, con tilt de hasta 6 grados y sin coarse pointer.

Usar `motion-premium` cuando la pieza requiera tilt, stagger cinematográfico o settle.

## Rendimiento como parte del diseño

- No agregar dependencias si CSS y Motion existentes alcanzan.
- Cargar eager solo el recurso LCP; usar lazy para imágenes fuera del primer viewport.
- Declarar dimensiones, `object-position` y formatos optimizados en imágenes.
- No importar CSS exclusivo de una ruta pesada desde el entry global.
- Comparar JS, CSS, assets y gzip antes y después de una ronda amplia.
- Justificar cualquier regresión perceptible; si no aporta al objetivo, revertir complejidad.

## Restricciones funcionales absolutas

No modificar por una mejora visual:

- Mercado Pago, backend, endpoints, modelos, contratos o confirmación de pagos.
- Roles, permisos, guards, auditoría o navegación funcional.
- Precios, fechas, cupos, sedes, beneficios, testimonios o estados de negocio.
- Separación entre resultados de evento y récords históricos.
- Copy institucional confirmado, salvo que el usuario pida editar contenido.

No copiar layouts o assets de `powerliftingunited.com`. Adaptar fielmente el copy institucional
cuando corresponda, según `docs/PLU_BRAND_ALIGNMENT.md`.

## Gates de aceptación

Aceptar el cambio solo si todas son verdaderas:

- La acción principal se entiende en menos de cinco segundos.
- La pantalla tiene una composición dominante y una jerarquía inequívoca.
- La mejora se sostiene sin explicar los efectos aplicados.
- El presupuesto de elegancia se cumple o la excepción está justificada.
- Light y dark tienen el mismo nivel de terminación.
- Mobile, tablet y desktop no presentan overflow ni pérdida de funcionalidad.
- Foco, contraste, labels, estados y reduced motion están cubiertos.
- No se inventaron datos ni se alteró lógica funcional.
- El render final fue inspeccionado con evidencia.
- Lint, tests relevantes y build fueron ejecutados, no supuestos.

## Validación técnica

Ejecutar proporcionalmente al cambio:

```bash
npm run lint
npm run test:unit
npm run test:storybook
npm run build
```

Agregar tests de interacción o integración cuando el cambio altere comportamiento observable.
Ejecutar `git diff --check` antes de cerrar. Reportar warnings preexistentes por separado de
errores introducidos.

## Formato de entrega

Informar:

1. Problema observado y evidencia.
2. Solución y tesis de diseño aplicada.
3. Archivos modificados.
4. Impacto visual e impacto funcional.
5. Viewports, temas, interacciones y reduced motion verificados.
6. Resultado real de lint, tests y build.
7. Variación de bundle o assets en rondas amplias.
8. Pendientes reales, sin ideas aspiracionales de relleno.
