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
- [ ] Cambio de rol afecta permisos (PLU USA no edita)
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
