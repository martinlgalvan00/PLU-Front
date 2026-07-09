# Informe de avance — Plataforma PLU ARG / Maximal

**Proyecto:** Plataforma web de gestión para Powerlifting United Argentina  
**Integración:** Maximal  
**Versión del informe:** 1.3  
**Fecha:** 9 de julio de 2026  
**Estado general:** MVP avanzado — interfaz y lógica desarrolladas; infraestructura Supabase preparada pero aún no provisionada en producción

---

## 1. Resumen ejecutivo

Se desarrolló una plataforma web integral para PLU ARG que cubre tres grandes áreas:

1. **Sitio institucional y de eventos** — presencia pública, afiliación, calendario, reglamento, resultados y landing del Pitbull Classic.
2. **Área de atletas** — registro, perfil, afiliación, inscripción a competencias y credencial digital con QR.
3. **Panel operativo** — gestión de atletas, afiliaciones, inscripciones, eventos, pagos, check-in y acceso restringido para PLU USA.

**Punto clave para el cliente:** gran parte de la plataforma **ya se puede ver y recorrer hoy** (pantallas, flujos, diseño, reglas de negocio en la interfaz). Sin embargo, los módulos que dependen de **base de datos persistente** están **desarrollados y listos para integrar en Supabase**, pero **no son operativos hasta que se cree el proyecto Supabase, se apliquen las migraciones y se configuren las variables de entorno**.

En la práctica hay tres niveles de avance:

| Nivel | Significado | Ejemplo |
|-------|-------------|---------|
| **Operativo hoy** | Funciona sin crear infraestructura adicional | Navegar el sitio, registrar atletas en modo demo, panel admin con datos locales |
| **Listo para activar** | Código, pantallas y esquema de base listos; requiere crear Supabase | Compra de entradas, check-in de tickets, cupos, calendario operativo |
| **Pendiente** | Aún no desarrollado o sin datos | Récords oficiales, importación LiftingCast, auditoría en panel |

El **próximo paso crítico** es provisionar Supabase (proyecto en la nube + migraciones + variables de entorno). Sin ese paso, las secciones de entradas, eventos operativos y check-in con persistencia real **no quedan funcionales**.

---

## 2. Objetivo del proyecto

Centralizar en un solo sistema:

- La **comunicación pública** de PLU ARG (afiliación, eventos, reglamento, comunidad).
- La **operación diaria** de la federación (inscripciones, pagos, check-in, exportaciones).
- La **experiencia del atleta** (cuenta propia, credencial, historial).
- La **integración con socios** (PLU USA, Maximal) bajo roles y permisos definidos.

---

## 3. Arquitectura de datos

La infraestructura prevista para producción es **Supabase** (PostgreSQL gestionado + funciones de negocio + almacenamiento de archivos + reglas de seguridad).

### 3.1 Cómo está organizado el sistema

| Capa | Qué guarda / procesa | Estado real |
|------|----------------------|-------------|
| **Supabase** | Eventos operativos (fechas, cupos, directo), entradas Pitbull, órdenes, check-in, comprobantes | **Desarrollado y listo para activar** — requiere crear el proyecto y correr migraciones |
| **API propia (Express)** | Login, sesiones, OAuth, workflows de pagos y emails | **Desarrollado** — operativo cuando hay base de datos y variables configuradas |
| **Navegador (localStorage)** | Atletas, afiliaciones, inscripciones y pagos del dominio deportivo | **Operativo hoy en modo demo** — datos no centralizados; pendiente migrar a Supabase |

### 3.2 Qué ya está preparado en Supabase (sin estar activo)

En el repositorio ya existe el trabajo necesario para levantar la base:

- Migraciones SQL (`supabase/migrations/`) con tablas de eventos, entradas, órdenes, check-in y cupos.
- Funciones de negocio en base (RPC) para compra, verificación de QR, check-in y listados operativos.
- Políticas de seguridad (RLS) por rol.
- Bucket de almacenamiento para comprobantes de pago.
- Cliente frontend y servicios conectados a Supabase.
- Variables de entorno documentadas en `.env.example`.

**Hasta que no se ejecute este paso de infraestructura, esas funciones no persisten datos ni pueden usarse en un entorno real.**

### 3.3 Activación de Supabase (paso pendiente)

Para que las secciones dependientes de base de datos queden operativas:

1. Crear proyecto en Supabase (cloud) o levantar instancia local de desarrollo.
2. Aplicar migraciones y seed.
3. Configurar `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` y claves de servidor.
4. Verificar flujos de entradas, eventos operativos y check-in.

---

## 4. Leyenda de estados (usada en este informe)

| Estado | Qué significa para el cliente |
|--------|------------------------------|
| **Operativo** | Se puede usar hoy en la demo actual |
| **UI entregada** | Pantallas y flujo listos; datos mock o locales |
| **Listo para activar** | Desarrollo completo; requiere Supabase creado y configurado |
| **Pendiente** | No desarrollado o sin contenido/datos |

---

## 5. Módulos entregados

### 5.1 Sitio público

| Módulo | Descripción | Estado |
|--------|-------------|--------|
| Inicio | Hero, accesos a afiliación, Pitbull, resultados y reglamento | **Operativo** |
| Afiliación | Planes, beneficios, requisitos, pasos y FAQ | **Operativo** |
| Pitbull Classic | Landing del evento, información, precios, formulario de compra | **UI entregada** — compra real requiere Supabase |
| Eventos | Calendario, filtros, detalle, agendar en calendario personal | **UI entregada** — fechas/cupos/directo operativos requieren Supabase |
| Resultados | Archivo con búsqueda, filtros y detalle | **Operativo** (datos de demostración) |
| Records | Diferenciación resultados vs récords | **UI entregada** — sin datos oficiales |
| Reglamento | Documento navegable por secciones (ES/EN) | **Operativo** |
| Comunidad | Gimnasios, miembros recientes, estadísticas | **Operativo** (datos de demostración) |
| FAQ | Preguntas frecuentes | **Operativo** |
| Contacto | Formulario e información institucional | **Operativo** |
| Registro de atletas | Alta de nuevo atleta | **Operativo** (datos en navegador) |
| Inicio de sesión | Email/contraseña, OAuth, cuentas demo | **Operativo** (según entorno configurado) |

**Características transversales:** diseño responsive, tema claro/oscuro, español e inglés, branding PLU ARG, animaciones entre secciones.

---

### 5.2 Área privada del atleta

| Funcionalidad | Descripción | Estado |
|---------------|-------------|--------|
| Perfil y cuenta | Vista central con navegación por secciones | **Operativo** |
| Credencial digital (QR) | Código de afiliación para verificación | **Operativo** (datos en navegador; visible en el mismo dispositivo) |
| Próximos eventos | Eventos disponibles e inscripciones propias | **Operativo** |
| Historial | Inscripciones anteriores | **Operativo** |
| Afiliación | Compra o renovación de membresía | **Operativo** (datos en navegador) |
| Datos personales | Edición de perfil | **Operativo** |
| Inscripción a competencia | Orden de pago y validación de duplicados | **Operativo** (datos en navegador) |

**Precios configurados (ARS):** afiliación $38.000 · juvenil $28.000 · inscripción $45.000 · combo $78.000.

**Estados de negocio:** definidos e implementados en la lógica de la aplicación (atleta, afiliación, inscripción, pago).

---

### 5.3 Pitbull Classic — venta de entradas

| Funcionalidad | Descripción | Estado |
|---------------|-------------|--------|
| Landing y contenido del evento | Información, precios, beneficios, share card | **Operativo** |
| Formulario de compra (UI) | Asistentes, DNI, pase por día, add-ons | **UI entregada** |
| Creación de orden y emisión de tickets | Persistencia y QR único por entrada | **Listo para activar** (Supabase) |
| Pago manual + comprobante | Subida y revisión de transferencia | **Listo para activar** (Supabase Storage + panel) |
| Check-in en puerta | Verificación y uso único de entrada | **Listo para activar** (Supabase) |
| Canje de add-ons | Registro en evento | **Listo para activar** (Supabase) |
| Mercado Pago | Checkout automático | **Preparado** — requiere Supabase + credenciales MP |

> **Importante:** la interfaz de compra de entradas está terminada, pero **sin Supabase configurado la compra no guarda órdenes ni genera tickets reales**. El usuario verá la pantalla, pero la operación de fondo no completa.

---

### 5.4 Verificación por código QR

| Tipo de credencial | Qué verifica | Estado |
|--------------------|--------------|--------|
| Afiliación | Membresía activa del atleta | **Operativo** (datos en navegador) |
| Inscripción a evento | Estado de la inscripción | **Operativo** (datos en navegador) |
| Entrada Pitbull | Validez y check-in en puerta | **Listo para activar** (Supabase) |

---

### 5.5 Panel administrativo

| Sección | Funcionalidad | Estado |
|---------|---------------|--------|
| Dashboard | KPIs, pendientes, actividad reciente | **Operativo** (datos locales/demo) |
| Atletas | Listado y ficha detallada | **Operativo** (datos locales/demo) |
| Afiliaciones | Vista de membresías | **Operativo** (datos locales/demo) |
| Inscripciones | Filtros, aprobación de pagos, export CSV | **Operativo** (datos locales/demo) |
| Eventos | Alta y edición de eventos | **UI entregada** — sync calendario/cupos/directo requiere Supabase |
| Check-in | Ingreso de atletas y entradas | **Parcial** — inscripciones locales OK; entradas requieren Supabase |
| Usuarios del panel | Alta y roles | **Operativo** (con API y DB configuradas) |
| Pagos de entradas | Aprobación de órdenes manuales Pitbull | **Listo para activar** (Supabase) |
| Exportación operativa | CSV admin | **Operativo** |
| Vista PLU USA | Lectura y exportación autorizada | **Operativo** |
| Resultados (admin) | Gestión e importación | **Pendiente** |
| Exportaciones avanzadas | Jobs y formatos adicionales | **Pendiente** |
| Auditoría (admin) | Vista centralizada de logs | **Pendiente** |

---

## 6. Qué se puede demostrar hoy (sin Supabase)

Con solo el frontend en marcha (`npm run dev`):

1. Recorrido completo del sitio público (diseño, contenido, navegación).
2. Registro de atleta, afiliación e inscripción en modo demo.
3. Panel admin con datos locales: dashboard, atletas, inscripciones, export CSV.
4. Credencial QR de afiliación (en el mismo navegador/dispositivo).
5. Landing del Pitbull Classic y formulario de compra (interfaz).
6. Reglamento, FAQ, comunidad y resultados con datos de ejemplo.

## 7. Qué se habilita al activar Supabase

Una vez creado y configurado el proyecto:

1. Compra real de entradas al Pitbull con persistencia.
2. Generación y verificación de QR de entradas desde cualquier dispositivo.
3. Check-in en puerta con garantía de uso único.
4. Cupos, ventanas de venta y fechas operativas de eventos.
5. Transmisión en vivo y campos de calendario sincronizados.
6. Comprobantes de pago almacenados y revisables desde el panel.
7. Base para migrar atletas, afiliaciones e inscripciones al mismo sistema.

---

## 8. Perfiles de usuario y permisos

| Perfil | Acceso |
|--------|--------|
| Atleta PLU | Perfil, afiliación, inscripciones, credencial QR |
| Operador PLU ARG | Panel completo excepto gestión de usuarios |
| Administrador PLU ARG | Operación + gestión de usuarios |
| Administrador Maximal | Acceso total |
| Seguridad / Check-in | Control de ingreso en eventos |
| Partner PLU USA | Solo lectura y exportación autorizada |

---

## 9. Integraciones

| Integración | Estado | Observación |
|-------------|--------|-------------|
| **Supabase** | **Listo para activar** | Migraciones, RPC, RLS y storage desarrollados; falta crear proyecto y configurar entorno |
| Mercado Pago | Preparado | Requiere credenciales de producción + Supabase operativo |
| Brevo (emails) | Preparado | Requiere API key y plantillas |
| Auth0 (OAuth) | Preparado | Opcional; requiere configuración |
| LiftingCast | Pendiente | Estructura de datos definida |

---

## 10. Diseño y experiencia de usuario

**Operativo hoy:**

- Identidad visual PLU ARG (logo, emblema, paleta).
- Más de 60 componentes reutilizables documentados en Storybook.
- Páginas editoriales con jerarquía clara y animaciones.
- Soporte bilingüe ES/EN.
- Estados de carga, error y vacío definidos.

---

## 11. Seguridad (desarrollada, activable con Supabase)

- RLS y funciones RPC con permisos controlados (Supabase).
- Sesiones HTTP-only y rate limit en login (API Express).
- Validación de datos en servidor.
- Comprobantes en bucket privado con URL firmada.
- Cabeceras de seguridad y CORS.

*Estas medidas de Supabase aplican cuando el proyecto está provisionado.*

---

## 12. Estado de madurez por área

| Área | Avance UI/lógica | Operativo en producción | Observación |
|------|------------------|-------------------------|-------------|
| Sitio público | Alto | Sí (contenido demo donde aplica) | Listo para revisión de textos e imágenes |
| Área del atleta | Alto | Parcial | Flujos OK; datos en navegador |
| Pitbull (landing) | Alto | Sí | Solo contenido |
| Pitbull (venta entradas) | Alto | No | Requiere Supabase |
| Eventos (calendario/cupos) | Alto | No | Requiere Supabase |
| Check-in entradas | Alto | No | Requiere Supabase |
| Panel admin (core) | Alto | Parcial | Demo local; entradas pendientes de Supabase |
| Supabase (infra) | Alto | No | Todo preparado; falta provisionar |
| Pagos automáticos (MP) | Medio | No | Adaptador listo |
| Emails (Brevo) | Medio | No | Adaptador listo |
| Resultados LiftingCast | Medio | No | UI lista |
| Records | Bajo | No | Sin datos |
| Despliegue | — | No | Falta hosting + Supabase cloud |

---

## 13. Trabajo pendiente recomendado

| Prioridad | Tarea | Por qué es crítica |
|-----------|-------|-------------------|
| **Alta** | Crear proyecto Supabase + aplicar migraciones + configurar `.env` | Desbloquea entradas, eventos operativos y check-in |
| **Alta** | Smoke test de flujos Supabase (compra → QR → check-in) | Validar que la integración funciona end-to-end |
| **Alta** | Despliegue frontend + variables de producción | Disponibilidad pública |
| **Alta** | Migrar atletas/afiliaciones/inscripciones a Supabase | Datos centralizados y confiables |
| Media | Activar Mercado Pago con webhooks | Pagos automáticos |
| Media | Activar Brevo con plantillas | Emails transaccionales |
| Media | Importación LiftingCast | Resultados reales |
| Baja | Módulo de récords oficiales | Contenido pendiente |
| Baja | Secciones admin: auditoría y exportaciones avanzadas | Operación extendida |

---

## 14. Estimación de esfuerzo para activación

Estimación orientativa para pasar de **demo navegable** a **sistema operativo**. Los plazos asumen que el código actual se mantiene sin cambios de alcance y que hay acceso a cuentas Supabase, hosting y credenciales de terceros cuando corresponda.

### Fase A — Activar Supabase y flujos de entradas *(crítica)*

| Tarea | Esfuerzo estimado | Entregable |
|-------|-------------------|------------|
| Crear proyecto Supabase (cloud) y vincular entorno | 2–4 h | Proyecto activo con URL y keys |
| Aplicar migraciones (7 archivos) + seed inicial | 2–4 h | Tablas, RPC, RLS y datos base |
| Configurar variables de entorno (frontend + servidor) | 1–2 h | `.env` de staging/producción |
| Smoke test: compra → QR → check-in → panel de pagos | 4–8 h | Flujo entradas validado end-to-end |
| Ajustes menores post-prueba (si aparecen) | 4–8 h | Buffer de corrección |

**Subtotal Fase A: 1,5 a 2,5 días hábiles**

> Con esto el Pitbull Classic pasa de “pantalla lista” a **venta y control de ingreso real**.

### Fase B — Puesta online del sitio

| Tarea | Esfuerzo estimado | Entregable |
|-------|-------------------|------------|
| Deploy frontend (Vercel u otro) + dominio | 4–6 h | URL pública del sitio |
| Deploy API Express + variables de producción | 4–6 h | Auth y endpoints complementarios |
| Verificación cruzada staging → producción | 2–4 h | Checklist de smoke en vivo |

**Subtotal Fase B: 1 a 1,5 días hábiles**

### Fase C — Migrar dominio deportivo a Supabase *(siguiente hito)*

| Tarea | Esfuerzo estimado | Entregable |
|-------|-------------------|------------|
| Modelar y migrar atletas, afiliaciones e inscripciones | 2–3 días | Datos centralizados (sin localStorage) |
| Adaptar panel admin y área de atleta a la nueva fuente | 1–2 días | Mismos flujos, persistencia real |
| Credencial QR multi-dispositivo + pruebas | 0,5–1 día | QR válido desde cualquier celular |

**Subtotal Fase C: 4 a 6 días hábiles**

### Fase D — Integraciones y cierre operativo *(opcional / posterior)*

| Tarea | Esfuerzo estimado | Entregable |
|-------|-------------------|------------|
| Mercado Pago producción + webhooks | 1–2 días | Pagos automáticos |
| Brevo + plantillas de email | 1 día | Notificaciones transaccionales |
| Importación LiftingCast en admin | 2–3 días | Resultados reales |
| Récords oficiales + contenido | 1–2 días | Módulo Records con datos |
| Auditoría y exportaciones avanzadas en panel | 1–2 días | Secciones admin pendientes |

**Subtotal Fase D: 6 a 10 días hábiles** (según qué ítems se prioricen)

### Resumen de plazos

| Hito | Plazo estimado | Qué desbloquea |
|------|----------------|----------------|
| **Mínimo viable operativo** (Fase A) | **1,5–2,5 días** | Entradas Pitbull, check-in, eventos operativos |
| **Sitio en producción** (A + B) | **3–4 días** | URL pública + flujos reales de entradas |
| **Plataforma unificada** (A + B + C) | **7–10 días** | Todo el dominio deportivo en Supabase |
| **Operación completa** (A + B + C + D) | **13–20 días** | Pagos auto, emails, resultados, récords |

*Las estimaciones no incluyen tiempos de espera del cliente (aprobación de dominio, alta de cuenta Mercado Pago, plantillas Brevo, contenido de récords).*

---

## 15. Conclusión

La plataforma PLU ARG / Maximal tiene **el producto visual y la lógica de negocio muy avanzados**: el cliente puede recorrer casi toda la experiencia hoy. Lo que falta para considerar el sistema **operativo de punta a punta** no es rediseñar pantallas, sino **activar la infraestructura Supabase** que ya está preparada en el código.

**En síntesis:**

- **Hecho:** sitio, panel, flujos de atleta, diseño, permisos, esquema Supabase, migraciones, integraciones preparadas.
- **Falta activar:** proyecto Supabase (cloud), variables de entorno, prueba de flujos reales de entradas y eventos.
- **Falta desarrollar:** récords, LiftingCast en admin, auditoría centralizada, despliegue final.

Una vez creado Supabase, el salto de "demo navegable" a "sistema operativo" es principalmente de **configuración e infraestructura**, no de desarrollo de interfaz desde cero. Según la estimación del §14, el hito mínimo operativo (entradas + check-in) está en el orden de **1,5 a 2,5 días hábiles**; el sitio público en producción, en **3 a 4 días**.

---

## 16. Anexo — Matriz de entregables

| # | Entregable | UI / lógica | Operativo sin Supabase | Operativo con Supabase |
|---|------------|-------------|------------------------|------------------------|
| 1 | Sitio institucional (12 páginas) | Entregado | Sí | Sí |
| 2 | Sistema de diseño y Storybook | Entregado | Sí | Sí |
| 3 | Internacionalización ES/EN | Entregado | Sí | Sí |
| 4 | Registro y perfil de atleta | Entregado | Sí (local) | Pendiente migración |
| 5 | Flujo de afiliación | Entregado | Sí (local) | Pendiente migración |
| 6 | Flujo de inscripción | Entregado | Sí (local) | Pendiente migración |
| 7 | Credencial QR afiliación | Entregado | Sí (local) | Pendiente migración |
| 8 | Landing Pitbull Classic | Entregado | Sí | Sí |
| 9 | Compra de entradas Pitbull | Entregado | No | Sí |
| 10 | QR y check-in de entradas | Entregado | No | Sí |
| 11 | Eventos: cupos, calendario, directo | Entregado | No | Sí |
| 12 | Panel admin (core) | Entregado | Sí (local) | Parcial |
| 13 | Pagos entradas (panel) | Entregado | No | Sí |
| 14 | Exportación CSV | Entregado | Sí | Sí |
| 15 | Esquema Supabase (migraciones, RPC, RLS) | Entregado | — | Requiere provisionar |
| 16 | API Express (auth, pagos, emails) | Entregado | Parcial | Sí |
| 17 | Mercado Pago | Preparado | No | Con config |
| 18 | Brevo | Preparado | No | Con config |
| 19 | LiftingCast | Pendiente | No | No |
| 20 | Récords oficiales | Pendiente | No | No |
| 21 | Despliegue producción | Pendiente | — | — |

---

*Documento para presentación a cliente. Versión 1.3 — incluye estimación de esfuerzo para activación de Supabase.*
