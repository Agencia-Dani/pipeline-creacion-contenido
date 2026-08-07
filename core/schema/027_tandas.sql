-- 027_tandas.sql — La tanda: el pegote como entidad.
-- Aplicar DESPUÉS de la `026`. SQL Editor de Supabase → pegar → Run.
--
-- Ejecuta [ADR-064](../../docs/adr/ADR-064-la-tanda-es-el-pegote-no-el-procesamiento.md).
--
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- ⚠️ ESTA MIGRACIÓN VA ANTES QUE LA PANTALLA, como la `024` y la `025`, y por lo mismo
--
-- Desde el flip de la Capa 2 (ADR-058) el cockpit lee con la sesión del usuario. Una tabla con
-- tenant y sin policy devuelve **cero filas** (si el grant está) o **`42501`** (si no), y el primero
-- es el peligroso: una pantalla de tandas vacía se lee como *"todavía no pegó nadie"*.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
--
-- 🩸 **Lo que se midió contra prod antes de escribir esto (2026-08-07), porque es lo que decide el
-- §3:** 110 transcripciones, **9 grupos** por `(instance_id, creado_en)` — 52, 48, 2, 2, 2 y cuatro
-- sueltas — todas en la misma instancia. Coincide exactamente con lo que la ADR predijo, así que el
-- backfill de abajo no está adivinando cuántas filas va a tocar.
--
-- 🔑 **El `titulo` es NULLABLE y el default NO se guarda, que es lo único que se aparta de la letra
-- de ADR-064 §2.** La ADR pide *"default: `20 links · 7 ago 14:32`"*, y guardar ese texto sería
-- congelar una **proyección de dos columnas que ya están en la fila** (la cantidad y el momento).
-- Este repo ya decidió esta pregunta en ADR-041 y le dio la respuesta contraria a copiar. Además
-- obligaría a que el formato de fecha exista **dos veces** —una en `to_char` acá y otra en
-- `lib/fechas.ts`— y esa duplicación tiene antecedente propio: la hora corrida 5 h de la zona
-- Entender salió justo de tener el formateo suelto en vez de en un lugar.
-- `titulo is null` **no es un caso sin manejar**: significa *"nadie la renombró"*, es el estado
-- normal de casi todas, y la pantalla lo dibuja. Lo que la ADR §4 quería muerto es `tanda_id is
-- null`, que es otra columna y sí lo mata el §3 de acá.


-- ═══════════════════════ §0 · Guardas ═══════════════════════
-- Afirmaciones sobre lo que TIENE que existir, con el mensaje diciendo qué correr. Mismo molde que
-- la `024` y la `025`: nada de `raise` sobre estado dudoso — la lección de la `019` es que un
-- `raise` aborta la transacción entera y deja la migración "corrida" sin haber entrado.

do $guardas$
begin
  if to_regclass('app.transcripciones') is null then
    raise exception '027: falta app.transcripciones. Corré la 010 primero.';
  end if;

  if to_regprocedure('app.instancias_visibles()') is null then
    raise exception '027: falta app.instancias_visibles(). Corré la 021 primero.';
  end if;

  if to_regprocedure('app.usuarios_visibles()') is null then
    raise exception '027: falta app.usuarios_visibles(). Corré la 025 primero.';
  end if;

  -- 🔴 La vista del §4 es `security_invoker`, así que corre con los permisos de **quien pregunta** y
  -- cruza `app.transcripciones`: sin `select` sobre ella, la pantalla entera muere con `42501`. En
  -- prod está desde el `grant select on all tables in schema app` de la `021` §2 — pero ese grant es
  -- una foto del momento en que corrió, no una regla, así que afirmarlo cuesta menos que asumirlo.
  -- Es literalmente el modo de falla que la `021` §4 documenta ("la zona Entender entera devuelve
  -- 42501"), y se reprodujo contra un Postgres local antes de escribir esta guarda.
  if not has_table_privilege('authenticated', 'app.transcripciones', 'select') then
    raise exception '027: authenticated no puede leer app.transcripciones — v_tandas daría 42501. Corré la 021 primero.';
  end if;

  -- El backfill agrupa por `(instance_id, creado_en)`. Una fila sin instancia no puede entrar a
  -- ninguna tanda y quedaría con `tanda_id is null` para siempre, que es justo el caso que ADR-064
  -- §4 quiere que no exista. La `017` lo dejó `not null`; si alguna vez dejara de serlo, esto grita.
  if exists (select 1 from app.transcripciones where instance_id is null) then
    raise exception '027: hay transcripciones sin instance_id — el backfill las dejaría huérfanas.';
  end if;
end
$guardas$;


-- ═══════════════════════ §1 · La tanda ═══════════════════════
--
-- 🩸 **Por qué una tabla nueva y no el `run` que la `026`/ADR-062 ya crea** (la alternativa barata,
-- y es incorrecta): ese run lo abre `procesarPendientes`, o sea **el procesamiento** — trabaja de a
-- 64 enlaces y se corta a los 45 s. Una tanda de 100 enlaces produce dos o tres runs, una tanda que
-- se procesa hoy a medias y mañana el resto produce runs de días distintos, y un run puede tocar
-- enlaces de tandas distintas. La tanda nace cuando alguien **aprieta el botón**: es una unidad del
-- usuario, no de la máquina. El porqué largo, en ADR-064 §1.

create table if not exists app.tandas (
  id          uuid primary key default gen_random_uuid(),
  instance_id uuid not null references instances (id),
  -- `null` = nadie la renombró ⇒ la pantalla dibuja el default (cantidad + momento). Ver el
  -- encabezado: el default es una proyección, no un dato.
  titulo      text,
  -- Quién pegó. **Decisión de Mani el 2026-08-07, y se aparta de lo que este repo venía haciendo:**
  -- la `023` acababa de dropear `transcripciones.pedido_por` por write-only, con el argumento de que
  -- el acto ya queda en `app.eventos`. Acá la columna se queda porque **la pantalla la muestra** —
  -- que es la condición que ADR-059 pone para que algo exista— y porque el dueño de una tanda es
  -- información de trabajo, no auditoría: dice a quién preguntarle por esos 50 links.
  -- `null` es legítimo: las 9 del backfill son anteriores a la columna.
  creada_por  uuid references app.usuarios (id),
  creado_en   timestamptz not null default now()
);

comment on table app.tandas is
  'Un pegote de enlaces del transcriptor (ADR-064). NO es el run: el run es el procesamiento (de a 64, corte a los 45 s) y una tanda puede dar varios, de días distintos.';
comment on column app.tandas.titulo is
  'null = sin renombrar; la pantalla dibuja el default (cantidad + momento), que no se guarda a propósito (ADR-041: un dato copiado se congela).';

-- La pantalla pide las cabeceras de un cockpit, de la más nueva a la más vieja. Es su única query.
create index if not exists tandas_instancia_idx on app.tandas (instance_id, creado_en desc);

alter table app.tandas enable row level security;


-- ═══════════════════════ §2 · La transcripción sabe de qué pegote vino ═══════════════════════
--
-- Nullable **aunque el §3 lo deje lleno**, y es la consecuencia escrita en ADR-064: las escrituras
-- del transcriptor y las del backfill son dos caminos, y un `not null` obligaría a que el orden de
-- migración y deploy sea perfecto. Lo que garantiza que no haya huérfanas es el backfill, no el
-- constraint.
--
-- Sin `on delete cascade` a propósito: borrar una tanda borraría los guiones que ya se pagaron. No
-- hay superficie de borrado y el `restrict` implícito es la respuesta correcta si alguien lo intenta.

alter table app.transcripciones
  add column if not exists tanda_id uuid references app.tandas (id);

comment on column app.transcripciones.tanda_id is
  'El pegote del que vino (ADR-064). Nullable en el esquema; lo que lo mantiene lleno es el backfill de la 027 y el insert de la app, no un constraint.';

-- El acceso de la pantalla al expandir una tanda: sus filas, de la más nueva a la más vieja.
create index if not exists transcripciones_tanda_idx on app.transcripciones (tanda_id, creado_en desc);


-- ═══════════════════════ §3 · Backfill: las 110 existentes a sus 9 tandas ═══════════════════════
--
-- 🔑 **`creado_en` las separa limpio porque un pegote inserta todas sus filas en un solo INSERT**,
-- así que comparten el `now()` exacto — al microsegundo, no al segundo. Medido contra prod: 9 grupos.
--
-- ⚠️ Esto es lo único de la migración que **no** se puede correr dos veces con el mismo resultado si
-- se le saca el `where tanda_id is null`: sin él, un segundo pase crearía 9 tandas más y les
-- reasignaría las filas. Con él, el segundo pase no encuentra nada que agrupar y no hace nada.
--
-- Las 9 quedan **sin título** (se dibuja el default) y **sin `creada_por`**: son anteriores a la
-- columna y no hay de dónde sacar quién las pegó. Inventarlo sería peor que el hueco.

with grupos as (
  select instance_id, creado_en
    from app.transcripciones
   where tanda_id is null
   group by instance_id, creado_en
), nuevas as (
  insert into app.tandas (instance_id, creado_en)
  select instance_id, creado_en from grupos
  returning id, instance_id, creado_en
)
update app.transcripciones t
   set tanda_id = n.id
  from nuevas n
 where t.instance_id = n.instance_id
   and t.creado_en   = n.creado_en
   and t.tanda_id is null;


-- ═══════════════════════ §4 · La cabecera: título + contadores ═══════════════════════
--
-- 🔑 **Esta vista ES el arreglo del techo de 50** (ADR-064 §3), no un adorno. La pantalla vieja traía
-- las últimas 50 filas **con sus `script`** y ocultaba el resto sin avisar. Ahora carga cabeceras:
-- se ven **todas** las tandas y las filas bajan al expandir una.
--
-- 🩸 **Por qué la cuenta vive acá y no en la app.** La alternativa era traer `(tanda_id, estado)` de
-- todas las transcripciones y contar en memoria: hoy son 110 filas y ~5 KB, o sea que se vería bien
-- y **volvería a crecer sin techo**. Es literalmente el error que el feed cometió y corrigió en el
-- cierre 98 (405 KB → 16 KB), con la misma forma: pagar el detalle para dibujar el resumen. Con la
-- vista, el payload de la pantalla es **una fila por tanda**, pase lo que pase con el volumen.
--
-- `left join` y no `join`: una tanda cuyos enlaces se borraran a mano tiene que seguir apareciendo
-- con 0, no desaparecer. Una cabecera que se esfuma es peor que una en cero.

create or replace view app.v_tandas as
select t.id,
       t.instance_id,
       t.titulo,
       t.creada_por,
       t.creado_en,
       count(tr.id)                                                    as total,
       count(*) filter (where tr.estado = 'pendiente')                 as pendientes,
       count(*) filter (where tr.estado = 'listo')                     as listos,
       count(*) filter (where tr.estado in ('fallo', 'sin_transcript')) as fallidas,
       count(*) filter (where tr.estado = 'abandonado')                as abandonadas
  from app.tandas t
  left join app.transcripciones tr on tr.tanda_id = t.id
 group by t.id;

-- 🔴 `security_invoker` o la vista **ignora RLS**: sin esto corre con los permisos de su dueño y le
-- muestra a cualquiera las tandas de todas las empresas. Es la §4 de la `021`, y el motivo por el
-- que aquella tuvo que pasar por las 27 vistas que ya existían. Una vista nueva sin esta línea
-- reabre el agujero entero.
alter view app.v_tandas set (security_invoker = true);

comment on view app.v_tandas is
  'Cabecera de cada tanda: título, quién, cuándo y el reparto por estado (ADR-064 §3). Es lo que carga la pantalla; las filas bajan al expandir.';


-- ═══════════════════════ §5 · Quién puede ver una tanda ═══════════════════════
-- Grano **instancia**, como el resto de `app.transcripciones`: una tanda es del cockpit.
-- `drop … if exists` antes del `create` (Postgres no tiene `create or replace policy`), igual que
-- la `024` y la `025`: correr esto dos veces es inofensivo.

grant select, insert, update on app.tandas to authenticated;
grant select on app.v_tandas to authenticated;

drop policy if exists "tenant" on app.tandas;
create policy "tenant" on app.tandas for all to authenticated
  using (instance_id in (select app.instancias_visibles()))
  with check (instance_id in (select app.instancias_visibles()));

-- ⚠️ Sin `delete` en el grant, y es una decisión: no hay superficie de borrado y una tanda borrada
-- se llevaría por delante el `restrict` del §2 o —si alguien lo aflojara— guiones ya pagados.


-- ═══════ §6 · El nombre del autor, y la excepción a ADR-051 §3 que esto abre ═══════
--
-- 🔴 **LEER ANTES DE TOCAR ESTA FUNCIÓN.** La pantalla muestra *"pegada por X"*, y `app.usuarios`
-- no alcanza para resolver ese nombre: la policy de la `025` deja ver solo `usuarios_visibles()`,
-- que **excluye a los dueños** porque ADR-051 §3 puso *"la agencia queda fuera de toda superficie
-- que liste personas"* como propiedad del sistema. Sin esto, las tandas que pegó un dueño dirían
-- *"(sin acceso a la ficha)"*.
--
-- **Decisión de Mani (2026-08-07):** *"no importa si es dueño, sponsor u operador, sería bueno saber
-- de quién es la tanda"*. Así que la excepción se hace, y se hace **angosta**:
--
--   · NO se afloja `usuarios_visibles()`, que sigue siendo la que gobierna las superficies que
--     LISTAN personas (la pantalla de equipo). Esa regla queda intacta.
--   · Esta función no lista a nadie: **resuelve el nombre de quien ya firmó un trabajo que la sesión
--     puede ver**. Nadie aparece acá por existir, solo por haber pegado una tanda en una instancia
--     que la sesión alcanza.
--
-- La diferencia importa porque es la que hace que esto no sea un directorio por la puerta de atrás:
-- una empresa sin tandas de la agencia no obtiene un solo nombre.
--
-- `security definer` + `stable` + `set search_path` por las mismas tres razones de la `021` §1 y la
-- `025` §1.

create or replace function app.autores_de_tandas()
returns table (usuario_id uuid, nombre text)
language sql
stable
security definer
set search_path = app, public, pg_temp
as $$
  select distinct u.id, u.nombre
    from app.usuarios u
    join app.tandas t on t.creada_por = u.id
   where t.instance_id in (select app.instancias_visibles())
$$;

comment on function app.autores_de_tandas is
  'El nombre de quien pegó cada tanda visible, dueños incluidos (ADR-064 §5). Excepción angosta a ADR-051 §3: no lista personas, resuelve la firma de un trabajo que la sesión ya ve.';

revoke execute on function app.autores_de_tandas() from public;
grant  execute on function app.autores_de_tandas() to authenticated;


-- ═══════════════════════ Verificación (correr y LEER) ═══════════════════════
--
-- 🩸 **Una migración no se da por aplicada porque haya corrido: se da por aplicada cuando se mide su
-- efecto.** Es la lección de la `019`, que se corrió el 03/08 sin error visible y NO había entrado.
--
-- 1. El backfill dejó **9 tandas y cero huérfanas** (los números son de prod al 2026-08-07; si la
--    tabla creció entre medio, lo que no puede cambiar es que la segunda consulta dé 0):
--
--      select count(*) from app.tandas;                                  -- esperado: 9
--      select count(*) from app.transcripciones where tanda_id is null;  -- esperado: 0
--
--    Y que ninguna tanda haya fusionado dos pegotes — cada una tiene UN `creado_en` y sus filas
--    comparten ese mismo momento:
--
--      select t.id, count(distinct tr.creado_en) as momentos, count(*) as filas
--        from app.tandas t join app.transcripciones tr on tr.tanda_id = t.id
--       group by t.id having count(distinct tr.creado_en) > 1;           -- esperado: cero filas
--
--    El reparto medido antes de la migración, para que "se ve bien" no pase por verificación:
--    **52, 48, 2, 2, 2, 1, 1, 1, 1**.
--
-- 2. 🔴 **El aislamiento, y la pantalla NO lo puede probar**: después del flip la Capa 1 filtra por
--    el cockpit abierto antes de que la base opine, así que se ve igual con RLS funcionando y con
--    RLS inerte. Hay que preguntar **sin** el filtro de tenant:
--
--      begin;
--        set local role authenticated;
--        set local request.jwt.claim.sub = '<uuid de una cuenta NO dueña de Retia>';
--        select count(*) from app.tandas;   -- esperado: 9 (las 110 transcripciones son de Retia)
--        select count(*) from app.autores_de_tandas();  -- esperado: 0 (el backfill no puso autores)
--      rollback;
--
--      begin;
--        set local role authenticated;
--        set local request.jwt.claim.sub = '<uuid de una cuenta de EstadoX>';
--        select count(*) from app.tandas;   -- esperado: 0
--      rollback;
--
--    ⚠️ **No sirve con una cuenta `es_dueno`**: alcanza todas las empresas, así que su resultado es
--    indistinguible del de RLS apagado (ADR-058: un dueño no bypassa RLS).
--
-- 3. 🔴 **El check #1 de la `021`** — *"¿queda alguna tabla con tenant, RLS y sin policy?"*. Esta
--    migración crea justo esa clase de tabla, así que es el check que la caza si el §5 no entró.
--    Tiene que seguir dando **cero filas**. El SQL está al pie de la [`024`](./024_rls_linkedin.sql).
--
-- 4. La escritura funciona con sesión (no solo con `service_role`), que es lo que el `grant` del §5
--    compra. Sin escribir nada que quede:
--
--      begin;
--        set local role authenticated;
--        set local request.jwt.claim.sub = '<uuid de una cuenta de Retia>';
--        insert into app.tandas (instance_id) values ('<instance_id de Retia>');  -- 1 fila
--        insert into app.tandas (instance_id) values ('<instance_id de EstadoX>');-- 42501: el
--        -- `with check` de la policy la rechaza. Si ESTA pasa, el §5 está mal.
--      rollback;
