-- 011_grants_app_service_role.sql — reparación: el BFF nunca pudo leer el schema `app`.
-- Aplicar DESPUÉS de 010. SQL Editor de Supabase → pegar → Run.
--
-- El bug: 007 creó el schema y otorgó `usage` SOLO a `authenticated` (línea 39). 008 dio por
-- sentado lo contrario, por escrito: "Sin grants nuevos: por REST solo las lee el service_role
-- (bypassa RLS y tiene los suyos)". Eso es falso para un schema propio. `service_role` tiene
-- BYPASSRLS, pero saltear RLS NO otorga USAGE sobre el schema ni privilegios sobre las tablas:
-- Postgres los pide igual, y Supabase solo auto-otorga sobre `public`.
--
-- El síntoma: todo lo que el BFF lee con createAdminClient() sobre `app.*` devolvía
-- `42501 permission denied for schema app`. Login seguía andando porque va por la anon key con
-- el rol `authenticated`, que sí tenía su grant desde 007 — por eso pasó desapercibido.
--
-- Qué desbloquea: la zona Entender (v_metricas_calidad, v_embudo_semana, v_costos_semana), los
-- scripts de sombra (sombra:import / sombra:diff), y la zona Transcribir (010).
--
-- RLS sigue mandando para todos los demás roles: acá solo se habilita al service_role, que es el
-- único que entra por el BFF (plan-cockpit C2).

grant usage on schema app to service_role;

grant all privileges on all tables    in schema app to service_role;  -- incluye las vistas
grant all privileges on all sequences in schema app to service_role;

-- Para que las tablas futuras nazcan accesibles y no haya que acordarse de repetir esto.
alter default privileges in schema app grant all privileges on tables    to service_role;
alter default privileges in schema app grant all privileges on sequences to service_role;
