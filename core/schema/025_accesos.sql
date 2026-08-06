-- 025_accesos.sql — las policies que la `021` dejó explícitamente sin escribir.
-- Aplicar DESPUÉS de la `021`. SQL Editor de Supabase → pegar → Run.
--
-- Ejecuta [ADR-060](../../docs/adr/ADR-060-el-equipo-se-administra-desde-el-cockpit.md) y es la A1
-- de [plan-multi-tenant §15.A](../../docs/agents/plan-multi-tenant.md). Paga una deuda que la propia
-- `021` dejó anotada en su línea 216: *"una pantalla de accesos —quiénes entran a mi empresa—
-- necesitaría una policy nueva; no existe todavía, así que no se escribe"*. Ahora existe.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- ⚠️ ESTA MIGRACIÓN VA ANTES QUE LA PANTALLA, Y NO ES UNA PREFERENCIA DE ORDEN
--
-- La `021` podía entrar sin efecto porque el BFF leía con `service_role`. **Eso se terminó el
-- 2026-08-05** (`d8edea2`, ADR-058): el cockpit lee con la sesión del usuario. Una pantalla de
-- equipo sin estas policies devuelve **cero filas** (si el grant está) o **`42501`** (si no), y el
-- primero es el peligroso: una lista de equipo vacía se lee como *"todavía no invitamos a nadie"*.
--
-- Es la misma nota que abre la `024`, y por la misma razón.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
--
-- 🩸 LO QUE SE MIDIÓ ANTES DE ESCRIBIR ESTO, Y QUE CAMBIÓ UNA POLICY
--
-- La forma obvia de la policy de `app.usuarios_clientes` es *"las membresías de las empresas que
-- alcanzo"*. Contra la base real (2026-08-06) eso filtra mal, y de un modo que ninguna pantalla
-- habría delatado:
--
--   · 8 usuarios, **2 de ellos dueños** (ADR-051).
--   · 9 membresías: 7 en `retia`, 1 en `30x`, 1 en `estadox`.
--   · **2 de las 7 de `retia` son de los dueños**, con rol `dev` — las dejó el backfill de la `018`
--     (`insert … select id, client_id, rol from app.usuarios`), que corrió ANTES de que el flag
--     `es_dueno` existiera.
--
-- O sea que un `sponsor` de Retia habría visto **dos filas de más**: sin nombre ni mail (la policy
-- de `app.usuarios` no se los da) pero con `rol = 'dev'` y su `creado_en`. Dos cosas mal a la vez:
-- filas fantasma en la pantalla, y **la agencia asomando en una superficie que lista personas**,
-- que es exactamente lo que ADR-051 §3 puso como propiedad del sistema.
--
-- 👉 Por eso la exclusión de dueños va en las DOS policies, no solo en la de `app.usuarios`.


-- ═══════════════════════ §0 · Guardas ═══════════════════════
-- Afirmaciones sobre lo que TIENE que existir, con el mensaje diciendo qué correr. Mismo molde que
-- la `024`: nada de `raise` sobre estado dudoso — la lección de la `019` es que un `raise` aborta la
-- transacción entera y deja la migración "corrida" sin haber entrado.

do $guardas$
declare
  con_costos int;
begin
  if to_regprocedure('app.clientes_visibles()') is null then
    raise exception '025: falta app.clientes_visibles(). Corré la 021 primero.';
  end if;

  if not exists (select 1 from information_schema.columns
                 where table_schema = 'app' and table_name = 'usuarios' and column_name = 'es_dueno') then
    raise exception '025: falta app.usuarios.es_dueno — la 018 quedó a medias.';
  end if;

  -- 🔴 La §3 le QUITA acceso a `app.tarifas` a todo el que no sea dev o dueño. Si no queda nadie
  -- que califique, la tarjeta de costos de Entender muere para todos y el síntoma es un total en
  -- $0,00 — un número que se ve bien y está mal, la familia de la `015`.
  select count(*) into con_costos
    from app.usuarios u
   where u.es_dueno
      or exists (select 1 from app.usuarios_clientes uc
                  where uc.usuario_id = u.id and uc.rol = 'dev');
  if con_costos = 0 then
    raise exception '025: nadie es dev ni dueño — la §3 dejaría la tarjeta de costos vacía para todos.';
  end if;
end
$guardas$;


-- ═══════════════════════ §1 · Las funciones de alcance ═══════════════════════
-- Mismo molde que la `021` §1, y por las mismas tres razones que ahí están argumentadas:
-- `security definer` (sin esto, una policy sobre `app.usuarios` que consulte `app.usuarios_clientes`
-- necesitaría una policy para su policy), `stable` (el planner la evalúa una vez por query y no una
-- por fila) y `set search_path` (obligatorio en toda función definer: sin pinnearlo, quien pueda
-- crear objetos en un schema del path secuestra lo que la función resuelve).

-- Quiénes son "mi equipo": las personas que comparten empresa conmigo, **sin la agencia**.
--
-- 🔒 La exclusión de `es_dueno` vive ACÁ y no en un `.filter()` de React porque ADR-051 §3 la puso
-- como propiedad del sistema: *"la agencia queda fuera de toda superficie que liste personas"*. Una
-- propiedad del sistema que se implementa en el render dura hasta la próxima pantalla que se olvide.
--
-- Un dueño tampoco ve a los otros dueños. Es la misma regla sin excepción para uno mismo: son dos
-- personas que ya saben que existen (ADR-051 §3), y una excepción acá sería una rama que hay que
-- volver a justificar cada vez que alguien lea esta función.
create or replace function app.usuarios_visibles()
returns setof uuid
language sql
stable
security definer
set search_path = app, public, pg_temp
as $$
  select distinct uc.usuario_id
    from app.usuarios_clientes uc
    join app.usuarios u on u.id = uc.usuario_id
   where uc.client_id in (select app.clientes_visibles())
     and not u.es_dueno
$$;

comment on function app.usuarios_visibles is
  'Las personas que comparten empresa con la sesión, EXCLUIDA la agencia (ADR-051 §3, ADR-060). El equipo que una pantalla de accesos puede listar.';

-- El mail no está en `app.usuarios` (sus columnas son `id, nombre, creado_en, es_dueno`): vive en
-- `auth.users`, que es de Supabase y a la que **no se le da `select` a `authenticated` jamás** —
-- ahí adentro hay hashes de contraseña y tokens de recuperación.
--
-- 🔑 Por qué una función y no una columna `email` copiada en `app.usuarios`, que sería más simple:
-- este repo ya decidió esta misma pregunta en ADR-041 y le dio la respuesta contraria a copiar —
-- *"una columna copiada al aprobar se congela ese día y nadie la refresca: dato viejo con cara de
-- fresco"*. El mail es el identificador con el que la persona entra; una copia que discrepe de
-- `auth.users` haría que la pantalla de accesos muestre una dirección a la que nadie puede loguearse.
--
-- Se filtra sola por `usuarios_visibles()`, así que llamarla no revela nada que la policy no dé.
create or replace function app.emails_visibles()
returns table (usuario_id uuid, email text)
language sql
stable
security definer
set search_path = app, public, pg_temp
as $$
  select u.id, au.email::text
    from app.usuarios u
    join auth.users au on au.id = u.id
   where u.id in (select app.usuarios_visibles())
$$;

comment on function app.emails_visibles is
  'El mail de cada persona del equipo, leído de auth.users (ADR-060). No se copia a app.usuarios: ADR-041, un dato copiado se congela.';

-- ¿Esta sesión puede ver lo que cuestan los proveedores? Dev en alguna empresa, o dueño.
--
-- 🔑 **Esto y `veCostos(rol)` de `domain/roles.ts` NO son la misma regla duplicada**, y hay que
-- saberlo antes de "unificarlas": contestan preguntas distintas, que es la asimetría de la `021` §3.
--   · Acá, la base contesta **"¿esta persona puede ver costos alguna vez?"** — es lo máximo que
--     puede saber, porque no tiene forma de enterarse de qué cockpit hay abierto en el browser.
--   · `veCostos(rol)` contesta **"¿acá?"**, con el rol de ESTE cockpit, y es más angosto.
-- Ninguna sobra. Borrar la de TypeScript porque "ya está la policy" haría que alguien que es dev en
-- su empresa vea el costo desde el cockpit de otra donde es operador.
create or replace function app.ve_costos()
returns boolean
language sql
stable
security definer
set search_path = app, public, pg_temp
as $$
  select exists (select 1 from app.usuarios u
                  where u.id = auth.uid() and u.es_dueno)
      or exists (select 1 from app.usuarios_clientes uc
                  where uc.usuario_id = auth.uid() and uc.rol = 'dev')
$$;

comment on function app.ve_costos is
  'Si la sesión alcanza app.tarifas: dev en alguna empresa, o dueño (ADR-052 endurecida por ADR-060 §5).';

-- Que las ejecute el rol de la sesión y **solo** ese. `public` incluiría a `anon`.
revoke execute on function app.usuarios_visibles() from public;
revoke execute on function app.emails_visibles()   from public;
revoke execute on function app.ve_costos()         from public;
grant  execute on function app.usuarios_visibles() to authenticated;
grant  execute on function app.emails_visibles()   to authenticated;
grant  execute on function app.ve_costos()         to authenticated;


-- ═══════════════════════ §2 · Las policies del equipo ═══════════════════════
-- `drop … if exists` antes de cada `create`, igual que la `024`: Postgres no tiene
-- `create or replace policy`, así que sin esto el segundo intento muere con `42710` — justo cuando
-- uno no está seguro de si el primero entró. Correr esta migración dos veces es inofensivo.

-- `app.usuarios`: **se SUMA a la de la `007`** (*"usuario lee su propia fila"*), no la reemplaza.
-- Las policies se OR-ean, así que un dueño —que no está en `usuarios_visibles()`— sigue leyendo su
-- propia fila, que es de lo que depende `lib/auth.ts` para saber quién entró. Tocar la de la `007`
-- dejaría a los dos dueños fuera del cockpit.
drop policy if exists "equipo de mis empresas" on app.usuarios;
create policy "equipo de mis empresas" on app.usuarios for select to authenticated
  using (id in (select app.usuarios_visibles()));

-- `app.usuarios_clientes`: amplía la de la `021` (*"usuario lee sus membresias"*), que solo dejaba
-- ver las propias. Las dos condiciones son necesarias:
--   · `client_id in (clientes_visibles())` → las membresías de MIS empresas y no las de todas.
--   · `usuario_id in (usuarios_visibles())` → **sin las de los dueños**. Ver el bloque medido del
--     encabezado: hay 2 filas así en `retia` hoy, y sin esta mitad asomarían en la pantalla.
drop policy if exists "equipo de mis empresas" on app.usuarios_clientes;
create policy "equipo de mis empresas" on app.usuarios_clientes for select to authenticated
  using (
        client_id  in (select app.clientes_visibles())
    and usuario_id in (select app.usuarios_visibles())
  );

-- ⚠️ **Sin grants de escritura, y es una decisión, no un olvido** (ADR-060 §4). La `021` §2 dejó
-- `usuarios` y `usuarios_clientes` fuera de los `grant insert/update/delete` a propósito y se
-- mantiene: el alta la escribe la Server Action con `service_role`, porque
-- `auth.admin.inviteUserByEmail` es la Admin API y **no existe con la clave anon** — invitar crea
-- una fila en `auth.users`, que ninguna policy de `app` puede autorizar. La autoridad la ponen los
-- tres gates de la Server Action (`exigirTenant` → `puedeAdministrarEquipo` → `rolesQuePuedeOtorgar`),
-- no la base. Si alguna vez algo que no sea el cockpit escribe membresías, se reabre.


-- ═══════════════════════ §3 · El costo del proveedor deja de ser público ═══════════════════════
-- 🔴 El hallazgo del Carril 0 (2026-08-06), y la razón por la que esta sección existe.
--
-- La `021:280` dice `create policy "cualquiera autenticado lee" on app.tarifas … using (true)`, o
-- sea que **cualquier persona logueada alcanza lo que nos cobran los proveedores**. Y
-- `v_costos_semana` es `security_invoker` desde la `021` §4, así que corre con los permisos de quien
-- pregunta: un `operador` de Retia que consulte PostgREST con su propia sesión llega al margen de la
-- agencia, aunque la pantalla ya no se lo muestre.
--
-- El gate que se arregló en `entender/page.tsx` es de UI. La regla de la casa es *"la UI esconde, el
-- servidor impide"*, y hasta acá solo estaba la primera mitad.
--
-- 🔎 **No rompe nada, y está medido:** n8n nunca lee `app.tarifas` (`grep` sobre `Workflows/` y
-- `core/`: la única mención es una línea de prosa en `ingesta-registro.md`) — el costo de este
-- sistema **se calcula, no se guarda**. La fachada y las escrituras de n8n van con `service_role`,
-- que bypassa RLS. El único consumidor con sesión es la tarjeta de Entender.
--
-- Efecto medido hoy: pasan de leer tarifas **8 personas a 2** (los dos dueños; los 2 roles `dev` que
-- existen son de ellos mismos). Los 7 `operador` dejan de alcanzarla, y eso incluye a Majo y a Jero.
-- Es intencional: el gate no puede depender de quién trabaja dónde.

drop policy if exists "cualquiera autenticado lee" on app.tarifas;
drop policy if exists "solo dev ve el costo del proveedor" on app.tarifas;
create policy "solo dev ve el costo del proveedor" on app.tarifas for select to authenticated
  using (app.ve_costos());


-- ═══════════════════════ Verificación (correr y LEER) ═══════════════════════
--
-- 🩸 **Una migración no se da por aplicada porque haya corrido: se da por aplicada cuando se mide su
-- efecto.** Es la lección de la `019`, que se corrió el 03/08 sin error visible y NO había entrado
-- (§14.1). Estos cuatro checks son el gate humano de ADR-060.
--
-- 1. Las 3 funciones y las 3 policies existen (esperado: 3 y 3):
--
--      select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--       where n.nspname = 'app' and proname in ('usuarios_visibles','emails_visibles','ve_costos');
--
--      select tablename, policyname, qual from pg_policies
--       where schemaname = 'app' and tablename in ('usuarios','usuarios_clientes','tarifas')
--       order by tablename, policyname;
--
--    ⚠️ En `app.usuarios` tienen que quedar **DOS** (la de la `007` y la de acá). Si quedó una sola,
--    los dueños perdieron el cockpit.
--
-- 2. 🔴 **La que de verdad prueba el aislamiento**, y que ninguna pantalla puede dar: después del
--    flip, la Capa 1 filtra por el cockpit abierto antes de que la base opine, así que la pantalla
--    se ve igual con RLS funcionando y con RLS inerte. Hay que preguntar **sin** el filtro de tenant:
--
--      begin;
--        set local role authenticated;
--        set local request.jwt.claim.sub = '<uuid de una cuenta NO dueña de Retia>';
--        select count(*) from app.usuarios_clientes;   -- esperado hoy: 5
--        select count(*) from app.usuarios;            -- esperado hoy: 5 (su equipo; ella incluida)
--        select count(*) from app.tarifas;             -- esperado: 0 si es operador
--      rollback;
--
--    Los números de hoy (2026-08-06), para que "se ve bien" no pase por verificación: **9 membresías
--    en total** (7 `retia` + 1 `30x` + 1 `estadox`), de las cuales **2 son de los dueños** ⇒ una
--    cuenta de Retia tiene que ver **5**, y una de EstadoX, **1** (la suya). Si Retia devuelve 7,
--    los dueños se están filtrando; si devuelve 9, la policy no está acotando por empresa.
--
--    ⚠️ **No sirve con una cuenta `es_dueno`**: alcanza todas las empresas, así que su resultado es
--    indistinguible del de RLS apagado. **Por diseño** (ADR-058: un dueño no bypassa RLS, `es_dueno`
--    es un predicado adentro de las funciones).
--
--    ✅ **ESTOS NÚMEROS NO SON UNA PREDICCIÓN: SE MIDIERON** antes de escribir esto, sobre un
--    **Postgres 16.13 real** con un fixture que reproduce la forma exacta de prod (8 usuarios / 2
--    dueños / 9 membresías / 7 en `retia` con 2 de dueño). Es la prueba de fuga de la `021`, otra
--    vez, y con el corpus correcto — la lección de la `024`.
--
--      | sesión                  | membresías | personas | tarifas | emails |
--      |-------------------------|-----------:|---------:|--------:|-------:|
--      | dueño (×2)              |          8 |        7 |       2 |      6 |
--      | Retia, operador (×4)    |          5 |        5 |       0 |      5 |
--      | Majo (Retia + 30X)      |          6 |        5 |       0 |      5 |
--      | EstadoX, operador       |          1 |        1 |       0 |      1 |
--
--    Cómo se leen los tres números que sorprenden, porque son la prueba de que las policies se
--    OR-ean bien y no de que algo se escapa:
--      · **El dueño ve 8 membresías y no 7**: las 7 de los no-dueños (policy de la `025`) **más la
--        suya** (policy de la `021`).
--      · **El dueño ve 7 personas y no 8**: los 6 no-dueños más su propia fila (policy de la `007`).
--        **No ve al otro dueño**, que es la regla de §1 sin excepción para uno mismo. Y que siga
--        viendo su propia fila es lo que prueba que la `007` sobrevivió: si diera 6, los dos dueños
--        habrían perdido el cockpit.
--      · **Majo ve 6 membresías pero 5 personas**: alcanza `retia` y `30x`, y en `30x` la única
--        no-dueña es ella misma — una persona, dos membresías.
--
--    Y las dos que cierran el argumento de ADR-060:
--      · **cero dueños asoman** en un `join` de `usuarios_clientes` con `usuarios` desde una sesión
--        de Retia (el bug que la medición encontró y que cambió esta policy).
--      · a esa misma persona, **hecha `dev` en una transacción con rollback, tarifas le devuelve 2**.
--        O sea que el techo de roles de `domain/permisos.ts` **es lo único** entre un `sponsor` de
--        Retia y el margen de la agencia. No es higiene: es la mitad de este arreglo.
--
-- 3. El mail sale por la función y no por la tabla (esperado: 5 filas para esa misma sesión, y
--    ningún dueño entre ellas):
--
--      begin;
--        set local role authenticated;
--        set local request.jwt.claim.sub = '<el mismo uuid>';
--        select * from app.emails_visibles();
--      rollback;
--
-- 4. 🔴 **El check #1 de la `021`, que sigue teniendo que dar CERO filas.** Corrélo después de esta
--    migración: es el que caza una tabla con tenant, RLS y sin policy. El SQL está al pie de la
--    [`024`](./024_rls_linkedin.sql).
--    ⚠️ Es la B2 del carril B, y por eso B2 va **después** de esta migración: corrido antes, reporta
--    lo que esta migración viene a arreglar.
