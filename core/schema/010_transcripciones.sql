-- 010_transcripciones.sql — el transcriptor a pedido (ADR-031).
-- Aplicar DESPUÉS de 001–009. SQL Editor de Supabase → pegar → Run.
--
-- Qué agrega: una sola tabla, `app.transcripciones`. Es el registro de los enlaces que el equipo
-- de redes pega a mano en la zona Transcribir, con su script literal (ADR-009: transcripción tal
-- cual, traducida al español solo si el original no lo estaba).
--
-- Lo que esta migración NO hace, a propósito:
--   · No toca `processed_items`. El dedup sigue siendo el mismo INSERT de siempre; la app deriva
--     el external_id desde la URL pegada (la invariante de ADR-031) y escribe ahí sin más. Que un
--     enlace haya venido a mano se sabe mirando esta tabla, no una columna nueva en el core.
--   · No escribe `outputs`. Ese histórico lo escribe solo el archivado (ADR-014).
--   · No se linkea a proyectos ni voces: un enlace pegado no pasó por el gate ni tiene heat-score,
--     así que NO es un Candidato (glosario). Es una lista suelta.

create table app.transcripciones (
  id           uuid primary key default gen_random_uuid(),
  plataforma   app.plataforma not null,
  external_id  text not null,          -- el mismo id que grabaría el motor (ADR-031)
  url          text not null,          -- canónica derivada, no la que pegaron
  estado       text not null default 'pendiente'
               check (estado in ('pendiente', 'listo', 'sin_transcript', 'fallo')),
  script       text,                   -- script literal, ya en español
  idioma       text,                   -- idioma detectado del original
  error        text,                   -- por qué falló, para que el equipo no adivine
  pedido_por   uuid references app.usuarios (id),
  creado_en    timestamptz not null default now(),
  procesado_en timestamptz,

  -- Espeja el unique de processed_items: pegar dos veces el mismo video es idempotente, devuelve
  -- el script que ya está en vez de volver a pagar Supadata + Haiku.
  unique (plataforma, external_id)
);

-- La cola: el procesador toma los pendientes más viejos primero.
create index transcripciones_pendientes_idx on app.transcripciones (estado, creado_en);

-- Mismo patrón que el resto de `app`: RLS activado SIN policies. Por REST solo entra el
-- service_role del BFF; la escritura pasa por Server Actions, nunca por el browser.
alter table app.transcripciones enable row level security;
