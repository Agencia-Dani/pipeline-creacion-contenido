-- 007 — Schema `app` + usuarios y roles del cockpit propio (D0 del plan-cockpit-propio).
-- Gobernada por ADR-026 (stack) y ADR-027 (Postgres fuente única; la config vive en `app`).
-- Se aplica a mano en el SQL Editor de Supabase, como todas las migraciones.
--
-- ⚠️ Paso manual además del SQL: en el Dashboard de Supabase → Settings → API →
-- "Exposed schemas", agregar `app` (si no, supabase-js no puede leer app.usuarios).
--
-- Alta de un usuario (también manual, en dos pasos):
--   1. Authentication → Users → Invite user (con su mail).
--   2. Insertar su fila acá abajo con el uuid que le quedó en auth.users:
--      insert into app.usuarios (id, nombre, rol)
--      values ('<uuid de auth.users>', 'Majo', 'operador');

create schema if not exists app;

-- Los 3 roles de ADR-026: operador (Majo/Jero), dev (Mani), sponsor (el jefe).
create type app.rol_usuario as enum ('operador', 'dev', 'sponsor');

create table app.usuarios (
  id         uuid primary key references auth.users (id) on delete cascade,
  nombre     text not null,
  rol        app.rol_usuario not null,
  creado_en  timestamptz not null default now()
);

comment on table app.usuarios is
  'Quién es quién en el cockpit: rol y nombre visible. El alta es manual (invite + insert).';

-- RLS: cada quien lee su propia fila; nadie escribe desde el browser.
-- Las altas/bajas van por el SQL Editor (o el BFF con service_role cuando exista pantalla).
alter table app.usuarios enable row level security;

create policy "usuario lee su propia fila"
  on app.usuarios for select
  to authenticated
  using (id = auth.uid());

-- PostgREST necesita estos grants; RLS sigue mandando por encima.
grant usage on schema app to authenticated;
grant select on app.usuarios to authenticated;
