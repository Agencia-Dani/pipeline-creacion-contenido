-- 035_search_path_triggers.sql — Los dos triggers resuelven sus tablas contra un search_path fijo.
-- Aplicar DESPUÉS de la `034`. SQL Editor de Supabase → pegar → Run.
--
-- Ejecuta [ADR-085](../../docs/adr/ADR-085-un-trigger-resuelve-sus-tablas-contra-un-camino-fijo.md).
--
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- QUÉ ARREGLA
--
-- `get_advisors` de Supabase marca 9 avisos de seguridad. Se leyeron los 9 uno por uno el
-- 2026-08-31 y **solo estos dos son reales**; los otros 6 son falsos positivos y queda escrito por
-- qué, para no volver a discutirlos:
--
--   · `clientes_visibles()`, `instancias_visibles()`, `ve_costos()` y `autores_de_tandas()` salen
--     marcadas por ser SECURITY DEFINER alcanzables por `/rpc/`. Se leyeron las cuatro
--     definiciones: **las cuatro filtran por `auth.uid()`** y devuelven exactamente lo que quien
--     llama ya podía ver, y **las cuatro ya fijan `search_path`**. Llamarlas por RPC no entrega
--     nada que RLS no entregara igual. No son vulnerabilidad: son el patrón correcto para que las
--     policies no se llamen a sí mismas.
--   · El noveno (`leaked password protection` apagada) es un toggle del panel de Auth, no SQL.
--
-- Los dos de acá sí: son triggers `plpgsql` **sin `SET search_path`**, y adentro nombran `clients`
-- y `runs` **sin calificar el esquema**. O sea que qué tabla resuelven depende del `search_path`
-- de quien dispare el trigger, que no es una decisión que deba tomar el llamador.
--
-- 🔒 Se arregla con `SET search_path` **y** calificando las tablas: el cinturón y los tirantes.
-- Cambia la resolución de nombres, no la lógica — los cuerpos son los mismos.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

create or replace function app.clients_sin_ciclos()
returns trigger
language plpgsql
set search_path to 'app', 'public', 'pg_temp'
as $function$
declare
  actual text := new.parent_id;
  saltos int  := 0;
begin
  if new.parent_id is null then
    return new;
  end if;
  if new.parent_id = new.id then
    raise exception 'clients: "%" no puede ser su propio padre', new.id;
  end if;

  while actual is not null loop
    saltos := saltos + 1;
    if saltos > 10 then
      raise exception
        'clients: el árbol pasa de 10 niveles desde "%" — o hay un ciclo o el modelo se fue de las manos', new.id;
    end if;
    if actual = new.id then
      raise exception 'clients: "%" → "%" cierra un ciclo', new.id, new.parent_id;
    end if;
    select parent_id into actual from public.clients where id = actual;
  end loop;

  return new;
end
$function$;

create or replace function app.outputs_hereda_instancia()
returns trigger
language plpgsql
set search_path to 'app', 'public', 'pg_temp'
as $function$
begin
  if new.instance_id is null then
    select r.instance_id into new.instance_id from public.runs r where r.id = new.run_id;
  end if;
  return new;
end
$function$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- VERIFICAR POR EFECTO, no por haber corrido (la regla de este repo).
--
-- 1) Que el search_path quedó fijo en las dos:
--
--      select p.proname, p.proconfig
--        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--       where n.nspname = 'app'
--         and p.proname in ('clients_sin_ciclos', 'outputs_hereda_instancia');
--
--    Esperado: las dos con `{"search_path=app, public, pg_temp"}` en `proconfig` (antes: null).
--
-- 2) Que la lógica sigue viva — el trigger de ciclos tiene que seguir rebotando:
--
--      begin;
--        insert into public.clients (id, nombre, estado) values ('zz-test', 'Test ciclo', 'activo');
--        update public.clients set parent_id = 'zz-test' where id = 'zz-test';  -- debe dar 'no puede ser su propio padre'
--      rollback;
--
-- 3) Y que `get_advisors` baje de 9 avisos a 7 (los 6 falsos positivos + el toggle de Auth siguen).
