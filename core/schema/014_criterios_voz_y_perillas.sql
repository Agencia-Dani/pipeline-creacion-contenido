-- 014_criterios_voz_y_perillas.sql — la segunda ronda de revisión del cockpit live.
-- Aplicar DESPUÉS de 013. SQL Editor de Supabase → pegar → Run.
--
-- Cuatro cosas sin relación entre sí más que la sesión que las encontró, y las cuatro salieron de
-- mirar la pantalla ya deployada con ojos de equipo de redes:
--
--   1. `voces.criterios_relevancia` pasa a NOT NULL           → ADR-040
--   2. `v_salud_referentes` gana `seguidores`                  → ADR-041
--   3. el techo de gasto entra al cockpit y muere una perilla  → ADR-042
--   4. `visibilidad` deja de vivir solo en prod                → enmienda a ADR-038
--
-- ⚠️ **Esta migración va ANTES del deploy del código**, no después. El paso 1 hace que el zod de
-- `filaVoz` (`lib/proyectos.ts`) deje de aceptar null: si el código llega primero y alguna fila
-- todavía tuviera null, `leerVoces()` tira y se cae `/curar/voces` **y la fachada
-- `/api/engine/run-plan`, que es de donde n8n saca su config**.

-- ─────────────────── 1. Los criterios de la voz son obligatorios (ADR-040) ───────────────────
-- La voz es la espina dorsal (PLAN §2.5) y sus criterios se SUMAN a los del proyecto en el gate.
-- Una voz sin criterios no falla: aprueba por ruido, en verde y sin avisar — la misma familia de
-- fallo silencioso que los cuatro hallazgos de D7.
--
-- `proyectos.criterios_relevancia` ya era not null desde la 009; esto empareja el otro lado. Las
-- 3 voces vivas tienen entre 545 y 649 caracteres, así que corre limpio. Si en el futuro esto
-- fallara, el mensaje de Postgres dice qué fila: llenarla y volver a correr.
alter table app.voces
  alter column criterios_relevancia set not null;

-- ─────────────────── 2. Los seguidores del referente son DERIVADOS (ADR-041) ───────────────────
-- El equipo ve los seguidores de una cuenta en Sugeridos y los pierde al aprobarla: `app.referentes`
-- no tiene la columna y `crearReferente` solo inserta handle/plataforma/activo/notas.
--
-- La alternativa era agregarle `seguidores` a la tabla y copiarlo al aprobar. Se descartó: ese
-- número se congelaría el día de la aprobación y nadie lo refrescaría nunca — dato viejo con cara
-- de dato fresco. Acá se deriva de lo último que vio el motor, así que no hay ruta de escritura
-- nueva y no puede quedar desactualizado.
--
-- Consecuencia aceptada: una cuenta sembrada a mano que todavía no trajo ningún candidato muestra
-- «—». Es lo honesto; hoy son 8 de 17.
--
-- `create or replace` y no `drop + create`: Postgres deja AGREGAR columnas al final conservando las
-- existentes en orden y tipo, así que nada que lea la vista se entera.
create or replace view app.v_salud_referentes as
with semana as (
  select (jsonb_each(r.metricas->'por_referente')).key   as handle,
         (jsonb_each(r.metricas->'por_referente')).value as conteos
  from runs r
  where r.params->>'workflow' = 'motor'
    and r.inicio >= now() - interval '7 days'
),
gate as (
  select lower(handle) as handle,
         sum((conteos->>'evaluados')::int) as videos_evaluados,
         sum((conteos->>'gate_pass')::int) as gate_pass
  from semana group by 1
),
-- El último conteo que vio el motor al traer un video de esa cuenta. `distinct on` + `order by
-- creado_en desc` = la fila más nueva por handle.
ultimo_visto as (
  select distinct on (lower(replace(c.referente, '@', '')))
         lower(replace(c.referente, '@', '')) as handle,
         c.seguidores
  from app.candidatos c
  where c.referente is not null and c.seguidores is not null
  order by lower(replace(c.referente, '@', '')), c.creado_en desc
),
-- El fallback para lo recién aprobado desde Sugeridos, que todavía no produjo ningún candidato.
propuesto as (
  select distinct on (lower(replace(p.handle, '@', '')))
         lower(replace(p.handle, '@', '')) as handle,
         p.seguidores
  from app.referentes_propuestos p
  where p.seguidores is not null
  order by lower(replace(p.handle, '@', '')), p.creado_en desc
)
select
  ref.id,
  ref.handle,
  gate.videos_evaluados,
  case when gate.videos_evaluados > 0
       then round(gate.gate_pass::numeric / gate.videos_evaluados, 2) end as tasa_gate,
  sel.tasa_seleccion as tasa_aprobacion,
  -- Columna nueva, y va AL FINAL a propósito: es lo que permite el `create or replace`.
  coalesce(uv.seguidores, pr.seguidores) as seguidores
from app.referentes ref
left join gate on gate.handle = lower(replace(ref.handle, '@', ''))
left join v_senal_seleccion sel on lower(coalesce(sel.referente, '')) = lower(replace(ref.handle, '@', ''))
left join ultimo_visto uv on uv.handle = lower(replace(ref.handle, '@', ''))
left join propuesto  pr on pr.handle = lower(replace(ref.handle, '@', ''));

-- ─────────────────── 3. Se cambia una perilla por otra (ADR-042) ───────────────────
-- ADR-038 dejó el `N` del proyecto como la única perilla de cantidad que el equipo VE, pero no la
-- única que existe: quedaron un default global compitiendo con él y un techo de gasto fuera de la
-- pantalla. Esta migración cierra las dos puntas.
--
-- **Sale `Candidatos por corrida`.** No era un cap: era el default de N para proyectos con N vacío,
-- y desde que el form exige N no aplica a ninguno (los 6 proyectos tienen el suyo). Encima su
-- `descripcion` describía a `cap_top_n`, que es OTRO knob — por eso se leía como si fuera el tope
-- de la corrida.
--
-- **Entra `Videos a transcribir por corrida`** (`cap_top_n` en el motor). Es el techo duro de
-- transcripción: ordena por heat y se queda con los N videos más calientes de toda la corrida,
-- justo antes de Supadata y Haiku, que son los pasos que se pagan. O sea: de las cuatro perillas de
-- cantidad, la ÚNICA que cuesta plata era la única que no estaba en la pantalla, y para moverla
-- había que editar el `workflow.json` y re-importar.
--
-- 🚨 Borrar una fila de `app.ajustes` NO siempre es seguro, y la diferencia importa: `Armar plan de
-- corrida` resuelve con precedencia `ajustes > Config`, así que la fila que se borra cae al valor
-- del `Config` del workflow. Para `Candidatos por corrida` eso es 100, que es lo que valía — cae
-- parada. Para `Días de recencia` sería 7 contra los 200 de hoy, y por eso ESA no se toca (es la
-- trampa que avisa ADR-038).

-- El delete va PRIMERO: si el check se recrea con la fila vieja todavía adentro, falla.
delete from app.ajustes where clave = 'Candidatos por corrida';

alter table app.ajustes drop constraint ajustes_clave_check;
alter table app.ajustes add constraint ajustes_clave_check check (clave in (
  'Peso de vistas', 'Peso de likes', 'Peso de interacción', 'Peso de relevancia',
  'Bonus idioma extranjero', 'Seguidores para marcar viral',
  'Mínimo de vistas', 'Mínimo de likes', 'Relevancia mínima',
  'Videos a transcribir por corrida', 'Días de recencia', 'Resultados por cuenta de referente',
  'Buscar por referentes en Instagram', 'Buscar por referentes en TikTok',
  'Propuestas por corrida', 'Afinidad mínima de propuesta',
  'Descubrir en Instagram', 'Descubrir en TikTok'
));

-- 250 es el valor del `Config` vivo del `workflow.json`. El contrato congelado
-- (`core/contracts/airtable-cockpit.md`) dice 100: manda el que está corriendo.
insert into app.ajustes (clave, valor, descripcion, visibilidad) values (
  'Videos a transcribir por corrida', 250,
  'EL FRENO DE GASTO. Cuántos videos distintos se transcriben como máximo en toda la corrida ' ||
  '(todos los proyectos juntos), ordenados de más caliente a menos. Transcribir y filtrar son los ' ||
  'pasos que se pagan, así que bajarlo baja la factura. 0 = sin techo.',
  'dev'
);

-- ─────────────────── 4. `visibilidad` deja de vivir solo en prod (enmienda a ADR-038) ───────────
-- ADR-038 mandó los tres knobs globales a `visibilidad = 'dev'`, pero el flip se aplicó a mano en
-- el SQL Editor y no quedó en ninguna migración. Como el DEFAULT de la columna es 'dev', una base
-- recreada desde `core/schema/` salía con TODO en dev y **el equipo no veía ni una perilla**.
--
-- Esto no cambia nada en vivo: copia el estado verificado en prod el 2026-08-01. Es para que el
-- repo pueda reproducir la base.
update app.ajustes set visibilidad = 'equipo' where clave in (
  'Mínimo de vistas', 'Mínimo de likes',
  'Buscar por referentes en Instagram', 'Buscar por referentes en TikTok',
  'Propuestas por corrida', 'Afinidad mínima de propuesta',
  'Descubrir en Instagram', 'Descubrir en TikTok'
);
update app.ajustes set visibilidad = 'dev' where clave in (
  'Peso de vistas', 'Peso de likes', 'Peso de interacción', 'Peso de relevancia',
  'Bonus idioma extranjero', 'Seguidores para marcar viral', 'Relevancia mínima',
  'Videos a transcribir por corrida', 'Días de recencia', 'Resultados por cuenta de referente'
);
