-- 038 — La etiqueta métrica del video (ADR-092)
--
-- QUÉ: `app.candidatos.prescore_metrico` — el heat métrico crudo del video (percentil de
-- views/likes/engagement dentro del pool de SU corrida, con boost de idioma y señal del referente).
--
-- POR QUÉ AHORA. Mani: "el heat_score es una etiqueta que sirve como desempate PASIVO... no es la
-- voz final". Hasta hoy esa etiqueta NO EXISTÍA en ningún lado:
--   · `Heat-score v1` la calcula antes de transcribir,
--   · `Gate de relevancia` PISA `heat_score` con su veredicto (composite hasta ADR-090, relevancia
--     pura desde ADR-090), y
--   · `Preparar candidatos` guarda ese `heat_score`.
-- O sea que la métrica se moría en el gate. `prescore_metrico` viajaba en el item y no se escribía.
--
-- 🔑 Y NO SE PUEDE RECOMPUTAR DESPUÉS, que es lo que obliga a persistirla en vez de derivarla en el
-- cockpit: es un PERCENTIL RELATIVO AL POOL DE SU CORRIDA. `views` y `likes` sí están guardados,
-- pero el percentil depende de los otros ~1.000 videos de esa corrida, que no se guardan. Se pierde
-- con la corrida. Mismo caso que `run_id` en ADR-081: derivar a posteriori da un número equivocado
-- con cara de correcto.
--
-- SIN BACKFILL, a propósito: las filas viejas no tienen de dónde sacarlo (ver arriba). Quedan en
-- null y el barrido de 20 días las cura solo. `null` = "de antes de ADR-092", no "sin métrica".
--
-- 🔒 Modo de falla si NO se aplica antes del deploy: `Preparar candidatos` manda la columna y
-- PostgREST responde `PGRST204 - column not found`, que tumba el POST del lote ENTERO. O sea que la
-- corrida paga Apify + Supadata + Haiku y no entrega nada. Mismo orden obligatorio que la 014, la
-- 016 y la 037: LA MIGRACIÓN VA PRIMERO.

alter table app.candidatos add column if not exists prescore_metrico numeric;

comment on column app.candidatos.prescore_metrico is
  'ADR-092. Heat métrico del video (percentil views/likes/engagement dentro del pool de su corrida). '
  'Desempate PASIVO y etiqueta para el equipo: nunca invierte una diferencia de relevancia. '
  'No se recomputa: el percentil depende del pool de esa corrida. null = anterior a ADR-092.';

-- Verificación por EFECTO (no por haber corrido). Esperado antes del primer uso:
--   filas > 0  ·  con_prescore = 0   ← el "sin backfill" como hecho medido, no como intención
-- select count(*) as filas, count(prescore_metrico) as con_prescore from app.candidatos;
--
-- Y por el camino real del cockpit, que es el que puede fallar distinto:
--   GET /rest/v1/candidatos?select=id,prescore_metrico&limit=1  con Accept-Profile: app
--   → 200 (si da PGRST204, PostgREST no recargó su cache de esquema: notify pgrst, 'reload schema')
--
-- 🐤 Canario: `select count(*) from app.candidatos where prescore_metrico is not null` nace en CERO
--    y la primera fila la escribe el MOTOR, así que la primera ya es uso real y no una verificación.
