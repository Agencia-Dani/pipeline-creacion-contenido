-- 021_rls_capa_2.sql — la Capa 2 de ADR-047: la base también dice que no.
-- Aplicar DESPUÉS de la `018`. SQL Editor de Supabase → pegar → Run.
--
-- Qué cambia de fondo: hasta acá el aislamiento entre empresas era **solo TypeScript**. Todo
-- `apps/dashboard/lib/*.ts` entra con `createAdminClient()` (service_role, que bypassa RLS por
-- definición) y `app.*` tenía RLS activado *sin una sola policy* — o sea una puerta cerrada, no un
-- filtro. Un `.eq(instance_id)` olvidado en una de las ~60 funciones de `lib/` no fallaba, no
-- avisaba, y devolvía datos verosímiles de otra empresa.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- ⚠️ ESTA MIGRACIÓN NO CAMBIA NADA HOY, Y ESO ES EL DISEÑO
--
-- El BFF sigue leyendo con `service_role`, que tiene BYPASSRLS: estas policies existen pero no se
-- evalúan en ningún camino de producción. Es el mismo expand/contract de la `016`/`017` y de la
-- `018`/`019` — **primero se escribe la red, después se salta**. El flip (que `scoped.ts` pase a
-- la sesión del usuario) es un cambio de código aparte, de una línea, y revertible.
--
-- Por qué en dos pasos y no en uno: ADR-047 dice que la Capa 2 es *"la fase con más riesgo de
-- romper lo que funciona"*. Partirla hace que el paso caro (los grants y las policies) se pueda
-- verificar en producción **sin que nadie pueda perder el cockpit**, y deja el paso peligroso
-- aislado en un solo commit.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
--
-- 🩸 EL HALLAZGO QUE MOTIVA LA §4, Y QUE NO ESTABA EN NINGÚN PLAN
--
-- Las 27 vistas del sistema se crearon sin `security_invoker`. En Postgres una vista corre con los
-- permisos de **su dueño**, no de quien la consulta: escribir policies sobre las tablas base y
-- dejar las vistas como estaban habría dejado **toda la zona Entender sin RLS**
-- (`v_metricas_calidad`, `v_embudo_semana`, `v_costos_semana`, `v_auditoria_descartes`,
-- `v_salud_referentes`) más las 6 de `public`. Y no se habría notado: con un solo tenant devuelven
-- exactamente las filas correctas igual.
--
-- Es la misma familia de fallo que la vista que daba 18 filas para 17 referentes (`015`), que lo
-- dice textual: *"no falla, no avisa, y deja un número que se ve razonable y está mal."*


-- ═══════════════════════ §0 · Guardas ═══════════════════════

do $guardas$
declare
  membresias int;
begin
  -- La `018` tiene que estar: todas las policies de acá cuelgan de `app.usuarios_clientes`.
  if to_regclass('app.usuarios_clientes') is null then
    raise exception '021: no existe app.usuarios_clientes — falta la 018 (membresías, ADR-051).';
  end if;

  if not exists (select 1 from information_schema.columns
                 where table_schema = 'app' and table_name = 'usuarios' and column_name = 'es_dueno') then
    raise exception '021: falta app.usuarios.es_dueno — la 018 quedó a medias.';
  end if;

  -- `security_invoker` en vistas es de Postgres 15. Abajo de eso la §4 no se puede aplicar y el
  -- aislamiento quedaría con un agujero del tamaño de la zona Entender, en silencio.
  if current_setting('server_version_num')::int < 150000 then
    raise exception '021: Postgres % — security_invoker necesita 15+. Sin eso las vistas ignoran RLS.',
      current_setting('server_version');
  end if;

  -- Una base sin membresías + policies = todo el mundo ve cero. Se avisa antes, no después.
  select count(*) into membresias from app.usuarios_clientes;
  if membresias = 0 then
    raise exception '021: app.usuarios_clientes está vacía. Con policies puestas, nadie vería nada.';
  end if;

  raise notice '021: % membresías vivas. Las policies no se evalúan hasta que el BFF deje el service_role.', membresias;
end
$guardas$;


-- ═══════════════════════ §1 · Las funciones de alcance ═══════════════════════
-- El corazón de la capa: qué empresas alcanza el usuario de la sesión.
--
-- Tres decisiones que no son de estilo:
--
--   · **`security definer`** — sin esto, la policy de `app.voces` obligaría al usuario a tener
--     `select` sobre `app.usuarios_clientes`, que a su vez tiene RLS: la policy necesitaría una
--     policy. Corriendo como dueño se sale de esa recursión, que es el motivo por el que este
--     patrón es el estándar de Supabase y no un atajo.
--
--   · **`stable`** — deja que el planner la evalúe **una vez por query** en lugar de una vez por
--     fila. Sin esto, una policy sobre `app.candidatos` con 153 filas hace 153 subqueries.
--
--   · **`set search_path`** — obligatorio en toda función `security definer`. Sin pinnearlo, quien
--     pueda crear objetos en un schema del path puede secuestrar lo que la función resuelve, y la
--     función corre con los permisos del dueño. Es la parte de `security definer` que se olvida.

create or replace function app.clientes_visibles()
returns setof text
language sql
stable
security definer
set search_path = app, public, pg_temp
as $$
  -- Los dueños (la agencia, ADR-051) alcanzan todo sin membresía. Es lo honesto: ya tienen la
  -- service_role key y las credenciales de n8n, o sea que pueden leer todo igual.
  select c.id
    from clients c
   where exists (select 1 from app.usuarios u where u.id = auth.uid() and u.es_dueno)
  union
  -- Todos los demás: exactamente las empresas donde tienen una fila.
  select uc.client_id
    from app.usuarios_clientes uc
   where uc.usuario_id = auth.uid()
$$;

comment on function app.clientes_visibles is
  'Las empresas que alcanza el usuario de la sesión (ADR-047 Capa 2). Membresías + el flag de la agencia.';

create or replace function app.instancias_visibles()
returns setof uuid
language sql
stable
security definer
set search_path = app, public, pg_temp
as $$
  select i.id from instances i where i.client_id in (select app.clientes_visibles())
$$;

comment on function app.instancias_visibles is
  'Los cockpits que alcanza el usuario de la sesión. Deriva de clientes_visibles(): la membresía es por EMPRESA, no por cockpit (ADR-051).';

-- Que las pueda ejecutar el rol de la sesión, y **solo** ese. `public` incluiría a `anon`.
revoke execute on function app.clientes_visibles()   from public;
revoke execute on function app.instancias_visibles() from public;
grant  execute on function app.clientes_visibles()   to authenticated;
grant  execute on function app.instancias_visibles() to authenticated;


-- ═══════════════════════ §2 · Grants para `authenticated` ═══════════════════════
-- La parte cara que ADR-047 avisó que había que saber antes de empezar: la `011` existe porque
-- *"service_role tiene BYPASSRLS, pero saltear RLS NO otorga USAGE sobre el schema ni privilegios
-- sobre las tablas: Postgres los pide igual, y Supabase solo auto-otorga sobre `public`"*.
--
-- O sea: RLS filtra lo que el rol ya tiene permiso de ver. Sin grant, el usuario no ve **cero
-- filas**, ve un `42501 permission denied` — que al menos falla fuerte, pero rompe la pantalla.
--
-- El `usage` sobre `app` ya lo dio la `007` (línea 39). Lo que falta son las tablas.

-- Lectura: todo lo que el cockpit muestra.
grant select on all tables in schema app to authenticated;      -- incluye las vistas

-- Escritura: solo donde el equipo edita de verdad. `usuarios`, `usuarios_clientes` y `tarifas`
-- quedan afuera a propósito — el alta de gente y las tarifas del proveedor van por el SQL Editor
-- o por el BFF con service_role, no desde el browser.
grant insert, update, delete on
  app.voces,
  app.proyectos,
  app.referentes,
  app.referentes_proyectos,
  app.ajustes,
  app.candidatos,
  app.descartes,
  app.referentes_propuestos,
  app.referentes_propuestos_proyectos,
  app.transcripciones,
  app.eventos
to authenticated;

-- El histórico de `public`: se lee desde el cockpit, lo escribe n8n con service_role (ADR-035).
grant select on runs, outputs, processed_items to authenticated;

-- 🩸 **El registro también, y esto se descubrió CORRIÉNDOLO, no razonándolo.**
-- Este archivo decía —y estaba mal— que `clients`/`instances`/`workflows` no necesitaban nada
-- porque solo los lee `lib/tenant.ts` con el admin. Lo desmiente la §4: con `security_invoker`, la
-- vista corre con los permisos de **quien pregunta**, así que las tablas que la vista cruza también
-- las tiene que alcanzar el usuario. Dos vistas las cruzan:
--   · `v_outputs_recientes` → `clients`, `instances`, `workflows`
--   · `v_salud_referentes`  → `instances`
-- Sin esto, la zona Entender entera devuelve `42501 permission denied for table instances` el día
-- del flip. Lo atrapó la prueba de fuga contra un Postgres 16 real; ningún typecheck lo veía.
grant select on clients, instances, workflows to authenticated;

-- Y las 6 vistas de `public`. Supabase auto-otorga sobre `public`, así que en prod esto
-- probablemente ya esté — se escribe igual: que la migración dependa de un default implícito del
-- proveedor es exactamente el tipo de supuesto que la `011` tuvo que venir a reparar.
grant select on
  v_outputs_recientes,
  v_corpus_aprobados,
  v_historico_seleccionados,
  v_selecciones_por_dia,
  v_senal_seleccion,
  v_senal_tema
to authenticated;

-- Para que una tabla futura nazca legible y no haya que acordarse de repetir esto. (Su policy sí
-- hay que escribirla — y si falta, la tabla devuelve cero filas, que es fail-closed y se ve.)
alter default privileges in schema app grant select on tables to authenticated;


-- ═══════════════════════ §3 · Las policies ═══════════════════════
-- 🔒 **Esto NO reemplaza al filtro de `scoped.ts`, y hay que entender por qué o alguien lo va a
-- borrar por redundante.**
--
--   · RLS acota a **todas las empresas del usuario** — es lo máximo que puede saber la base, que
--     no tiene forma de enterarse de qué cockpit hay abierto en el browser.
--   · `scoped.ts` acota **al cockpit abierto** (`eq(clientId)`), que es más angosto.
--
-- Son distintos a propósito (ADR-047: *"no son capas redundantes: cubren superficies distintas"*).
-- Sacar el filtro de `scoped.ts` porque "ya está RLS" haría que, apenas alguien alcance dos
-- empresas, una pantalla de EstadoX muestre también los proyectos de 30X. Sin error y sin aviso.

-- ── Grano empresa ──────────────────────────────────────────────────────────────────────────
create policy "tenant" on app.voces      for all to authenticated
  using (client_id in (select app.clientes_visibles()))
  with check (client_id in (select app.clientes_visibles()));

create policy "tenant" on app.proyectos  for all to authenticated
  using (client_id in (select app.clientes_visibles()))
  with check (client_id in (select app.clientes_visibles()));

create policy "tenant" on app.referentes for all to authenticated
  using (client_id in (select app.clientes_visibles()))
  with check (client_id in (select app.clientes_visibles()));

-- `app.usuarios` se queda con la policy de la `007` ("usuario lee su propia fila"), que es más
-- angosta y alcanza: `lib/auth.ts` solo lee la fila propia. Una pantalla de accesos —"quiénes
-- entran a mi empresa"— necesitaría una policy nueva; no existe todavía, así que no se escribe.

-- ── Grano cockpit ──────────────────────────────────────────────────────────────────────────
create policy "tenant" on app.ajustes               for all to authenticated
  using (instance_id in (select app.instancias_visibles()))
  with check (instance_id in (select app.instancias_visibles()));

create policy "tenant" on app.candidatos            for all to authenticated
  using (instance_id in (select app.instancias_visibles()))
  with check (instance_id in (select app.instancias_visibles()));

create policy "tenant" on app.descartes             for all to authenticated
  using (instance_id in (select app.instancias_visibles()))
  with check (instance_id in (select app.instancias_visibles()));

create policy "tenant" on app.referentes_propuestos for all to authenticated
  using (instance_id in (select app.instancias_visibles()))
  with check (instance_id in (select app.instancias_visibles()));

create policy "tenant" on app.eventos               for all to authenticated
  using (instance_id in (select app.instancias_visibles()))
  with check (instance_id in (select app.instancias_visibles()));

create policy "tenant" on app.transcripciones       for all to authenticated
  using (instance_id in (select app.instancias_visibles()))
  with check (instance_id in (select app.instancias_visibles()));

create policy "tenant" on runs            for all to authenticated
  using (instance_id in (select app.instancias_visibles()))
  with check (instance_id in (select app.instancias_visibles()));

create policy "tenant" on outputs         for all to authenticated
  using (instance_id in (select app.instancias_visibles()))
  with check (instance_id in (select app.instancias_visibles()));

create policy "tenant" on processed_items for all to authenticated
  using (instance_id in (select app.instancias_visibles()))
  with check (instance_id in (select app.instancias_visibles()));

-- ── Puentes: no llevan columna, cuelgan por FK ─────────────────────────────────────────────
-- `scoped.ts` las marca `heredado` y avisa que leerlas solas trae los pares de todos los tenants.
-- Acá esa advertencia deja de depender de que el llamador se acuerde.

create policy "tenant" on app.referentes_proyectos for all to authenticated
  using (exists (select 1 from app.referentes r
                  where r.id = referente_id
                    and r.client_id in (select app.clientes_visibles())))
  with check (exists (select 1 from app.referentes r
                       where r.id = referente_id
                         and r.client_id in (select app.clientes_visibles())));

create policy "tenant" on app.referentes_propuestos_proyectos for all to authenticated
  using (exists (select 1 from app.referentes_propuestos p
                  where p.id = propuesto_id
                    and p.instance_id in (select app.instancias_visibles())))
  with check (exists (select 1 from app.referentes_propuestos p
                       where p.id = propuesto_id
                         and p.instance_id in (select app.instancias_visibles())));

-- ── De nadie ───────────────────────────────────────────────────────────────────────────────
-- `app.tarifas` es lo que nos cobra el proveedor, no un dato de la empresa (el mapa de `scoped.ts`
-- lo dice así). La lee `v_costos_semana`, que a partir de la §4 corre como el usuario.
create policy "cualquiera autenticado lee" on app.tarifas for select to authenticated using (true);

-- ── El registro ────────────────────────────────────────────────────────────────────────────
-- Quien los resuelve sigue siendo `lib/tenant.ts` con el cliente **admin**, y tiene que seguir
-- siendo así: scopear la tabla con la que se decide el scope es circular, y por eso no están en el
-- mapa de `scoped.ts`. Pero las policies hacen falta igual, por la razón de la §2: dos vistas
-- `security_invoker` los cruzan, y ahí quien pregunta es el usuario.
--
-- Las funciones de la §1 no se ven afectadas por estas policies: son `security definer`, o sea que
-- corren como el dueño. Si dependieran de estas policies, `clientes_visibles()` necesitaría poder
-- leer `clients` para decidir quién puede leer `clients`.

create policy "tenant" on clients   for select to authenticated
  using (id in (select app.clientes_visibles()));

create policy "tenant" on instances for select to authenticated
  using (client_id in (select app.clientes_visibles()));

-- `workflows` es el catálogo de pipelines (reels, substack, linkedin), no un dato de nadie: qué
-- pipelines existen es lo mismo para todas las empresas. Lo que decide quién ve qué cockpit es
-- `instances`, que sí está scopeada acá arriba.
create policy "catalogo legible" on workflows for select to authenticated using (true);

-- `app.usuarios_clientes`: cada quien lee sus propias membresías. Hoy no lo lee nadie con la
-- sesión (`lib/tenant.ts` va con admin), pero la policy va igual para que la verificación #1 de
-- abajo pueda exigir **cero excepciones** — una lista de excepciones es donde se esconde la
-- policy que sí faltaba.
create policy "usuario lee sus membresias" on app.usuarios_clientes for select to authenticated
  using (usuario_id = auth.uid());


-- ═══════════════════════ §4 · Las vistas ven lo que ve quien pregunta ═══════════════════════
-- Ver el hallazgo del encabezado. Sin esto, todo lo de arriba es decorativo para la zona Entender.
--
-- `security_invoker = true` hace que la vista se evalúe con los permisos y las policies de **quien
-- la consulta**. Para `service_role` no cambia nada (tiene BYPASSRLS y todos los privilegios desde
-- la `011`), así que el camino de hoy sigue igual.

alter view app.v_metricas_calidad      set (security_invoker = true);
alter view app.v_embudo_semana         set (security_invoker = true);
alter view app.v_embudo_descubrimiento set (security_invoker = true);
alter view app.v_costos_semana         set (security_invoker = true);
alter view app.v_auditoria_descartes   set (security_invoker = true);
alter view app.v_salud_referentes      set (security_invoker = true);

alter view v_outputs_recientes        set (security_invoker = true);
alter view v_corpus_aprobados         set (security_invoker = true);
alter view v_historico_seleccionados  set (security_invoker = true);
alter view v_selecciones_por_dia      set (security_invoker = true);
alter view v_senal_seleccion          set (security_invoker = true);
alter view v_senal_tema               set (security_invoker = true);


-- ═══════════════════════ Verificación (correr y LEER) ═══════════════════════
--
-- 1. 🔴 La que importa: ¿queda alguna tabla con tenant, RLS activado y SIN policy? Tiene que dar
--    cero filas. Una tabla acá es una pantalla que va a devolver vacío el día del flip.
--
--      select c.table_schema, c.table_name
--        from information_schema.columns c
--        join pg_class pc on pc.relname = c.table_name
--        join pg_namespace pn on pn.oid = pc.relnamespace and pn.nspname = c.table_schema
--       where c.column_name in ('client_id', 'instance_id')
--         and c.table_schema in ('app', 'public')
--         and pc.relrowsecurity
--         and not exists (select 1 from pg_policies p
--                          where p.schemaname = c.table_schema and p.tablename = c.table_name)
--       group by 1, 2 order by 1, 2;
--
-- 2. 🔴 ¿Quedó alguna vista sin `security_invoker`? Cada fila con `invoker = false` es un agujero
--    silencioso del tamaño de esa vista. Todas tienen que dar `true`.
--
--      select n.nspname, c.relname,
--             coalesce('security_invoker=true' = any(c.reloptions), false) as invoker
--        from pg_class c
--        join pg_namespace n on n.oid = c.relnamespace
--       where c.relkind = 'v' and n.nspname in ('app', 'public')
--       order by invoker, 1, 2;
--
-- 3. Las funciones responden lo que se espera. Corriendo como service_role en el SQL Editor
--    `auth.uid()` es null, así que esto tiene que dar **cero filas** (y eso está bien: prueba que
--    no hay un `true` colado en el predicado).
--
--      select * from app.clientes_visibles();
--
-- 4. La prueba de fuga con sesión real. En prod se corre con la anon key y un usuario de verdad
--    (§11.2 del plan); en el SQL Editor se simula así, que es como se verificó esta migración:
--
--      begin;
--        set local role authenticated;
--        set local request.jwt.claim.sub = '<uuid de un usuario NO dueño>';
--        select * from app.clientes_visibles();      -- solo sus empresas
--        select count(*) from app.voces;             -- solo las suyas
--        select count(*) from app.voces where client_id = '<otra empresa>';  -- tiene que dar 0
--      rollback;
--
--
-- ═══════════════════════ Lo que ya se verificó (2026-08-03) ═══════════════════════
--
-- Contra un **Postgres 16 real en Docker**, corriendo `001→018` + esta `021` de cero, con el mismo
-- seed que prod (5 usuarios, 2 dueños ⇒ 5 membresías) y **una segunda empresa con datos propios**,
-- que es el escenario que en producción todavía no existe:
--
--   ✅ Verificación 1 da **cero filas, sin excepciones**: no queda tabla con tenant sin policy.
--   ✅ Las 12 vistas dan `security_invoker = true`.
--   ✅ **Operador de Retia:** ve 1 fila donde hay 2; `clientes_visibles()` devuelve solo su empresa;
--      y pedir explícitamente `where client_id = 'estadox'` devuelve **0**, no un error — o sea que
--      el filtro no depende de que el llamador se acuerde de nada.
--   ✅ **Dueño (agencia, sin membresías):** ve las 2. El flag de ADR-051 funciona sin filas.
--   ✅ **Anónimo:** `permission denied for schema app`. Fail-closed.
--   ✅ **Las 12 vistas responden** como el operador (ninguna con `42501`) y el dueño ve **el doble**
--      en todas. Ese "el doble" es la señal: la vista está scopeando, no devolviendo todo.
--
-- 🩸 **La prueba A/B que convierte el hallazgo del encabezado en un hecho:** apagando
-- `security_invoker` en `v_metricas_calidad` —o sea dejándola como estaban las 27 vistas antes de
-- esta migración— el operador de Retia pasa a ver **2 filas en vez de 1**: las de EstadoX incluidas.
-- Sin error y sin aviso. Es la fuga, medida.
--
-- ⚠️ **Dos cosas las encontró la corrida, no el diseño**, y las dos habrían roto la zona Entender el
-- día del flip: los grants sobre `clients`/`instances`/`workflows` (§2) y los de las 6 vistas de
-- `public`. Las vistas `security_invoker` necesitan que **el usuario** alcance todo lo que cruzan.
