# QA y evidencia de diseño PLU

Usar este archivo para validar cambios visuales sobre el render real y entregar evidencia útil.
Elegir la matriz proporcional al alcance; no ejecutar controles irrelevantes por rutina.

## Contenidos

1. [Niveles de validación](#niveles-de-validación)
2. [Evidencia base](#evidencia-base)
3. [Matriz visual](#matriz-visual)
4. [Interacción y accesibilidad](#interacción-y-accesibilidad)
5. [Motion](#motion)
6. [Rendimiento](#rendimiento)
7. [Rúbrica de calidad](#rúbrica-de-calidad)
8. [Plantilla de entrega](#plantilla-de-entrega)

## Niveles de validación

### Cambio puntual

Aplicar a una sección, card o control:

- 390px, 768 o 1024px y 1440px.
- Light y dark en al menos el viewport más sensible.
- Estados de interacción del componente.
- Captura del bloque antes y después.
- Lint, test relacionado y build.

### Página completa

Aplicar a una landing, portada o flujo:

- 360, 390, 768, 1024 y 1440px.
- Light y dark.
- Movimiento normal y reducido.
- Navegación, estados y CTAs principales.
- Captura de página y capturas de secciones críticas.
- Lint, unitarios, Storybook relevante y build.

### Sistema compartido

Aplicar a tokens, navbar, footer, botones o componentes reutilizados:

- 360, 390, 430, 768, 900, 1024, 1152, 1280, 1366 y 1440px.
- Agregar 1920px si el componente usa full bleed o fondos de viewport.
- Light y dark en páginas representativas.
- Consumidores principales del componente.
- Teclado, lector semántico básico y reduced motion.
- Suite técnica completa.

## Evidencia base

Antes de editar, registrar:

- URL o flujo para llegar a la superficie.
- Viewport, tema y estado de datos.
- Screenshot base.
- Altura de página o sección cuando la densidad sea un problema.
- Overflow horizontal y ancho responsable.
- Errores de consola o de página.
- Targets menores de 44px dentro del alcance.
- Orden de headings y landmarks.
- Peso de build si la ronda es amplia.

No comparar capturas tomadas con datos, idioma o viewport diferentes.

## Matriz visual

Verificar en cada viewport elegido:

- H1 visible y sin corte.
- Acción principal reconocible.
- Texto sin líneas huérfanas graves o columnas demasiado angostas.
- Imagen con recorte intencional.
- Sin vacíos accidentales causados por `min-height`, grid o reveal.
- Sin contenido detrás de header o navegación sticky.
- Sin scroll horizontal del documento.
- Grillas que cambian antes de comprimir contenido.
- Tablas o tracks con scroll contenido cuando corresponde.
- Footer separado y sin colisiones.

En mobile verificar además:

- Prioridad de contenido, no solo apilado.
- CTAs alcanzables y targets de 44px.
- Navegación horizontal con affordance suficiente.
- Formularios en una columna y teclado adecuado por input.
- Modales y drawers dentro del viewport dinámico.
- Texto usable al 200% de zoom cuando el flujo sea crítico.

En light y dark verificar:

- Igual jerarquía, no solo ausencia de colores rotos.
- Contraste de texto, borde, foco, placeholder y disabled.
- Imágenes y scrims compatibles con ambos temas.
- Elevaciones legibles sin depender de glow.
- Tokens nuevos definidos con el mismo nombre.

## Interacción y accesibilidad

Probar con teclado:

1. Recorrer controles con `Tab` y `Shift+Tab`.
2. Activar botones y links con teclado.
3. Abrir y cerrar menús, modales o drawers.
4. Cerrar overlays con `Escape`.
5. Confirmar retorno de foco al disparador.
6. Revisar que sticky headers no oculten el destino de anchors.

Inspeccionar:

- Focus visible y consistente.
- Nombre accesible en icon buttons.
- Label asociado a cada campo.
- `aria-current`, `aria-selected`, `aria-expanded` y estados cuando correspondan.
- Headings sin saltos usados únicamente por tamaño visual.
- Landmarks `header`, `nav`, `main`, `aside` y `footer` con función real.
- Estados que no dependan solo del color.
- Mensajes de error cercanos al campo y anunciables.

Probar interacciones reales:

- Hover y active sin layout shift.
- Touch sin depender del hover.
- Tabs, filtros y acordeones cambian contenido correcto.
- CTA ejecuta el flujo existente.
- Loading, empty, error, success y disabled si pueden activarse con seguridad.
- Sin permiso cuando la superficie depende de RBAC.

## Motion

Con movimiento normal:

- Confirmar que la entrada ocurre una vez.
- Verificar que el contenido termina con `opacity: 1` y `transform: none` o estado equivalente.
- Evitar que el reveal deje grandes vacíos en screenshots o navegación por anchor.
- Confirmar que elementos sticky y fondos permanecen estables.
- Revisar que dos transforms no compitan en el mismo nodo.

Con `prefers-reduced-motion: reduce`:

- El contenido debe aparecer inmediatamente.
- Desactivar tilt, parallax, blur y desplazamientos largos.
- Mantener feedback de estado sin movimiento innecesario.
- Usar scroll automático en navegación programática si el smooth scroll se desactiva.

No aprobar loops decorativos, scroll hijacking, parallax pesado ni fondos animados.

## Rendimiento

Para una ronda amplia, registrar antes y después:

- CSS principal raw y gzip.
- JS principal raw y gzip.
- Chunk de la página modificada.
- Assets nuevos o reemplazados.
- Cantidad de dependencias nuevas.
- Warning de chunks o assets grandes.

Revisar imágenes:

- Dimensiones declaradas.
- Recurso LCP con prioridad correcta.
- Fuera del viewport con `loading="lazy"`.
- `object-position` probado por breakpoint.
- Sin descargar una imagen decorativa que no se muestra.
- Preferir el asset optimizado existente antes que el original pesado.

Revisar CSS y JS:

- CSS de ruta pesada fuera del entry global cuando sea viable.
- Sin hojas de overrides acumulativas para una misma pantalla.
- Sin dependencia nueva para una transición o utilidad resoluble con el stack.
- Sin listeners, observers o timers duplicados.
- Sin animar propiedades que fuerzan layout de forma continua.

Toda regresión de bundle debe informarse. Si el aumento no se explica por valor visible o
funcional, reducirlo antes de cerrar.

## Rúbrica de calidad

Puntuar cada dimensión de 0 a 2:

| Dimensión | 0 | 1 | 2 |
|---|---|---|---|
| Jerarquía | Confusa | Entendible | Inmediata |
| Restricción | Recargada | Algún ruido | Cada recurso tiene función |
| Marca | Genérica | Parcial | PLU clara y sobria |
| Composición | Plantilla | Correcta | Propia del contenido |
| Responsive | Se rompe | Funciona | Reordena prioridad |
| Accesibilidad | Falla | Básica | Completa en el alcance |
| Rendimiento | Regresión | Neutral | Optimizado o más liviano |
| Evidencia | No existe | Parcial | Reproducible |

No aceptar ninguna dimensión con 0. Para una página completa, apuntar a 13 puntos o más sobre
16. La puntuación no reemplaza criterio: obliga a hacer explícito dónde falta calidad.

## Plantilla de entrega

```markdown
Problema
- Evidencia base:
- Riesgo para el usuario:

Tesis de diseño
- Esta pantalla debe sentirse... porque...
- Patrón dominante:
- Elementos retirados o subordinados:

Implementación
- Archivos:
- Cambios visuales:
- Cambios funcionales: ninguno / detallar

QA
- Viewports:
- Temas:
- Teclado y touch:
- Motion normal y reducido:
- Estados:
- Consola y overflow:

Técnico
- Lint:
- Tests:
- Build:
- Bundle antes/después:

Rúbrica
- Puntaje:
- Dimensión más débil:

Pendientes reales
- ...
```

No informar como verificado algo que no se ejecutó. Diferenciar errores nuevos, warnings
preexistentes y limitaciones del entorno.
