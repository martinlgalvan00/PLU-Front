# QA Checklist — PLU ARG MVP

## Landing pública

- [ ] Home carga con hero, misión e involucrate
- [ ] Navegación funciona en todas las vistas
- [ ] Responsive en mobile (720px, 1060px)

## Navegación pública

- [ ] Header inicial y scrolled conservan contraste en tema claro y oscuro
- [ ] Desktop no presenta colisiones en 1440, 1366, 1280 y 1152px
- [ ] Tablet/mobile activa el drawer sin overflow en 1024, 900, 768, 430, 390 y 360px
- [ ] Calendario oficial es un acceso directo y mantiene `aria-current="page"`
- [ ] Competencias y Recursos abren con click y teclado; flechas recorren el menú
- [ ] Escape, Tab, click afuera y selección de destino cierran cada dropdown
- [ ] Drawer bloquea scroll y fondo, contiene el foco y lo devuelve al botón hamburguesa
- [ ] Recursos mobile expande sin altura fija y conserva targets táctiles de 44px
- [ ] Tema, idioma, Acceder y Afiliarme siguen disponibles en desktop y drawer
- [ ] `prefers-reduced-motion` elimina stagger, blur y desplazamientos largos
- [ ] No hay overflow horizontal, errores de consola ni hydration warnings

## Registro

- [ ] Formulario valida campos requeridos
- [ ] Duplicado email/documento muestra error
- [ ] Combo/afiliación/solo evento calcula monto correcto
- [ ] Orden se crea y aparece en panel

## Panel admin

- [ ] Dashboard muestra métricas
- [ ] La jerarquía muestra exactamente Super Admin, Administrador, PLU y Seguridad
- [ ] Super Admin y Administrador conservan acceso total con matrices protegidas
- [ ] Administrador puede otorgar y remover permisos de PLU y Seguridad
- [ ] Super Admin puede asignar Administrador; Administrador sólo asigna PLU o Seguridad
- [ ] Cambiar el rol de un usuario persiste y actualiza su sesión efectiva
- [ ] PLU ve únicamente los módulos configurados para representar a la federación
- [ ] Seguridad inicia con eventos y check-in y admite permisos operativos adicionales
- [ ] PLU y Seguridad no pueden recibir gestión de usuarios ni de roles
- [ ] Un permiso `read` no habilita mutaciones y un permiso `write` no evita la
      validación server-side
- [ ] Nadie puede autoasignarse otro rol ni elevar a Super Admin
- [ ] Modificar permisos y reasignar usuarios genera auditoría
- [ ] La matriz no produce overflow horizontal en 1366, 390 y 360px
- [ ] Roles y permisos conservan contraste y foco visible en tema claro y oscuro
- [ ] Filtros de inscripciones funcionan
- [ ] Aprobar pago actualiza estados
- [ ] Export CSV admin y PLU USA descargan

## Integraciones (mock)

- [ ] Sin credenciales MP: modo mock sin errores
- [ ] Sin credenciales Brevo: emails en consola dev
- [ ] API `/health` responde 200

## Build

- [ ] `npm run build` exitoso
- [ ] `npm run lint` sin errores
- [ ] `npm run test` pasa
