-- 036_candidatos_huella.sql — Con qué se va a poder decidir si dos posts son el mismo video.
-- Aplicar DESPUÉS de la `035`. SQL Editor de Supabase → pegar → Run.
--
-- Ejecuta el rung 2 de [ADR-086](../../docs/adr/ADR-086-la-identidad-de-un-video-no-es-la-de-su-post.md).
--
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 🔑 ESTAS DOS COLUMNAS NO LAS USA NADIE TODAVÍA. EXISTEN PARA PODER MEDIR.
--
-- El problema, medido contra prod el 2026-09-01 sobre 422 candidatos: el dedup del motor recuerda
-- el **id del post**, no el video, así que una re-subida del mismo reel entra como nueva. Son **17
-- pares** en `app.candidatos` y **18 más** en `app.descartes`; 11 estaban en el Feed sin calificar
-- con su gemelo ya calificado y **3 de esos 11 con el gemelo ya grabado**.
--
-- La pregunta que esta migración habilita, y que HOY NO SE PUEDE CONTESTAR, es cuál llave aguanta
-- un bloqueo pre-pago:
--
--   · `duracion_seg` llega GRATIS desde `Normalizar IG` (`item.videoDuration`) y hoy se TIRA: no la
--     guarda ninguna tabla. Es la única señal disponible ANTES de pagar Supadata. Su riesgo es la
--     colisión — con ~100 posts por perfil, dos videos distintos del mismo creador pueden durar lo
--     mismo — y ese riesgo **no se puede cuantificar sin el dato**. Por eso se guarda antes de
--     decidir nada, y no al revés.
--
--   · `huella_guion` es el hash del guion **de Supadata, el original**, no el traducido. La
--     traducción de Haiku NO sirve como llave: el mismo audio sale con palabras distintas cada vez
--     (medido — el hash exacto del guion traducido caza 1 de 17 pares), mientras que el ASR sobre
--     el mismo archivo es determinista. Es post-pago, así que no ahorra la transcripción: ahorra
--     que la persona lo vuelva a juzgar y que el equipo lo vuelva a grabar.
--
-- ⚠️ **Ninguna de las dos autoriza un bloqueo por estar guardada.** Con una corrida real adentro se
-- mide la colisión de la duración y la cobertura de la huella, y RECIÉN AHÍ se decide si alguna
-- entra a `Heat-score v1` como filtro duro. Medir el martes no autoriza a bloquear el jueves.
--
-- Mientras tanto el Feed avisa con lo que ya tiene (caption + referente, ~7 de cada 17), que es lo
-- que está en producción desde hoy. Ver `apps/dashboard/domain/repetidos.ts`.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
--
-- Idempotente: `add column if not exists`. No toca datos, no hay backfill.
--
-- 🔴 SIN BACKFILL, a propósito: las dos columnas se llenan cuando el motor las escriba. Las filas
-- viejas quedan en null y el barrido de 20 días las cura solo, igual que hizo la `034`.


-- ═══════════════════════ §0 · Guardas ═══════════════════════

do $$
begin
  if to_regclass('app.candidatos') is null then
    raise exception 'app.candidatos no existe: falta correr las migraciones anteriores';
  end if;
end $$;


-- ═══════════════════════ §1 · Las dos columnas ═══════════════════════

alter table app.candidatos
  add column if not exists huella_guion text,
  add column if not exists duracion_seg numeric;

comment on column app.candidatos.huella_guion is
  'Hash del guion ORIGINAL de Supadata (no el traducido por Haiku, que no es determinista). '
  'Sirve para reconocer una re-subida del mismo reel, que trae otro external_id. ADR-086.';

comment on column app.candidatos.duracion_seg is
  'Duración del video en segundos, tal como la da Apify. Única señal de contenido disponible ANTES '
  'de pagar Supadata. Se guarda para poder medir su tasa de colisión, no para filtrar todavía. ADR-086.';

-- Un índice parcial: las consultas que importan buscan gemelos por referente + huella, y las filas
-- sin huella (todas las de hoy) no aportan nada al índice.
create index if not exists candidatos_huella_idx
  on app.candidatos (instance_id, referente, huella_guion)
  where huella_guion is not null;


-- ═══════════════════════ §2 · Verificación (por efecto, no por haber corrido) ═══════════════════════
--
-- Correr esto DESPUÉS y pegar el resultado en el handoff:
--
--   select count(*) as filas,
--          count(huella_guion) as con_huella,
--          count(duracion_seg) as con_duracion
--   from app.candidatos;
--
-- Esperado JUSTO DESPUÉS de aplicar: filas = las que haya, con_huella = 0, con_duracion = 0.
-- El 0 es el dato: prueba que el "sin backfill" es un hecho medido y no una intención.
--
-- 🐤 Canario: la primera fila con `duracion_seg` no nula la escribe el motor, o sea que la primera
-- es uso real y no una verificación. Si alguien la llena a mano, este canario deja de servir y hay
-- que redefinirlo por fecha — como ya pasó con los de ADR-069 y ADR-074.
