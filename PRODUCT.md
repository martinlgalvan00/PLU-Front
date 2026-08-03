# PLU Argentina

PLU Argentina es la plataforma pública y operativa para afiliaciones, competencias, entradas,
credenciales y resultados de Powerlifting United en Argentina. La experiencia debe transmitir
estándar federativo, fuerza deportiva y confianza, con una identidad local sobria.

## Audiencias

- Atletas que consultan el calendario, se afilian y se inscriben.
- Público que consulta eventos y compra entradas.
- Organizadores y equipo PLU ARG que publican y operan competencias.
- Lectores institucionales que consultan reglamento, resultados y comunidad.

## Reglas durables de producto

- El calendario público es la fuente principal y accesible para descubrir eventos.
- Pitbull Classic es el meet destacado de la temporada, pero el sistema debe admitir otros eventos.
- Los datos operativos se muestran sólo cuando están confirmados; no se inventan sedes,
  coordenadas, horarios, precios ni disponibilidad.
- Toda acción de inscripción, ticket o resultados responde al estado real del evento.
- La información esencial debe seguir disponible sin proveedores externos, JavaScript avanzado o
  credenciales de terceros.
- La interfaz pública soporta español e inglés y temas claro y oscuro.

## Dirección visual

La fuente operativa de marca es `.claude/skills/plu-frontend-design/SKILL.md` y los tokens del
repositorio. La marca usa negro o grafito como estructura, azul institucional para información y
selección, dorado para acción o jerarquía premium y rojo únicamente para error o peligro.

## Integraciones

- La cartografía pública usa MapLibre y OpenFreeMap, sin API key ni Map ID. Sólo crea marcadores
  cuando existen coordenadas verificadas y conserva dirección y acciones externas como fallback.
- Mercado Pago confirma pagos sólo desde backend.
- Supabase y los servicios del proyecto son la fuente operativa para eventos publicados.
