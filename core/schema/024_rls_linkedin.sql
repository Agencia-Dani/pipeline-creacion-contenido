-- 024_rls_linkedin.sql — las policies que la `020` dejó pendientes y la `021` no nombró.
-- Aplicar DESPUÉS de la `021`. SQL Editor de Supabase → pegar → Run.
--
-- Ejecuta [plan-multi-tenant §14.6](../../docs/agents/plan-multi-tenant.md). No decide nada nuevo:
-- es ADR-047 (Capa 2) aplicado a las cuatro tablas de ADR-049/ADR-055 que nacieron después de que
-- se escribiera la red. Por eso no lleva ADR propio — lleva el molde de la `021`, igual.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 🩸 EL AGUJERO, Y POR QUÉ NO LO CAZÓ LA VERIFICACIÓN QUE EXISTÍA PARA CAZARLO
--
-- La `020` §6 creó las 4 tablas con `enable row level security` y **cero policies**, apoyada en que
-- la Capa 2 las cubriría: *"estas cuatro tablas nacen del lado correcto del disparador y NO hay que
-- acordarse de volver"*. Pero la `021` **no las nombra ni una vez** (`grep -c linkedin` da 1, y es
-- un comentario sobre `workflows`).
--
-- Y el check #1 de la propia `021` —*"¿queda alguna tabla con tenant, RLS activado y sin policy?"*—
-- es EXACTAMENTE el que lo habría cazado. Dio *"cero filas, sin excepciones"* porque corrió en
-- Docker sobre `001→018` + `021`, **sin la `020` en el medio**.
--
--   👉 El agujero no estaba en la verificación: estaba en el CORPUS sobre el que se corrió.
--
-- Es la tercera vez que este sistema sub-cuenta por el corpus y no por el método (las otras dos:
-- ADR-059, con los runbooks y los `.mjs` de herramientas fuera del grep). La lección que queda
-- escrita: **una verificación de esquema vale lo que valga la base contra la que corre.** El check
-- #1 de acá abajo va contra PROD, con la `020` aplicada, y por eso sirve.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- ⚠️ QUÉ CAMBIA HOY, QUE NO ES "NADA" COMO EN LA `021`
--
-- La `021` no cambiaba nada porque el BFF todavía leía con `service_role`. **Eso ya no es cierto:**
-- el flip vive en producción desde el 2026-08-05 (`d8edea2`, ADR-058), así que el cockpit lee con
-- la sesión y estas policies se evalúan **desde el minuto que entran**.
--
-- Hoy eso no rompe nada porque ninguna pantalla toca estas 4 tablas (el mapa `TABLAS` de
-- `scoped.ts` no tenía ninguna entrada `*_linkedin`). Pero el orden correcto es **esta migración
-- primero, la pantalla después**: al revés, la primera pantalla de LinkedIn devuelve vacío sin
-- error y sin aviso — la familia de la `015`, y encima disfrazada de *"todavía no hay datos"*, que
-- es justo lo que uno espera ver en un pipeline nuevo.
-- ─────────────────────────────────────────────────────────────────────────────────────────────


-- ═══════════════════════ §0 · Guardas ═══════════════════════
-- Sin `raise exception` suelto: la lección de la `019` es que un `raise` en un `do` aborta la
-- transacción entera y la migración se da por corrida sin haber entrado. Acá las guardas son
-- afirmaciones sobre lo que TIENE que existir, y si algo falta el mensaje dice qué correr.

do $guardas$
begin
  if to_regclass('app.referentes_linkedin') is null then
    raise exception '024: falta app.referentes_linkedin. Corré la 020 primero.';
  end if;
  if to_regprocedure('app.instancias_visibles()') is null then
    raise exception '024: falta app.instancias_visibles(). Corré la 021 primero.';
  end if;
end
$guardas$;


-- ═══════════════════════ §1 · Grants para `authenticated` ═══════════════════════
-- **La lectura probablemente ya esté**, y conviene saber por qué antes de leer esto como
-- redundante: la `020` se aplicó ANTES que la `021`, así que el `grant select on all tables in
-- schema app` de la `021` §2 las alcanzó. Se repite igual —es idempotente— porque depender del
-- orden en que se corrieron dos migraciones es exactamente el supuesto implícito que la `011` tuvo
-- que venir a reparar.
--
-- 🔎 Y ese orden es lo que decide el SÍNTOMA de hoy: con el grant y sin policy dan **cero filas**
-- (fallo silencioso); sin el grant darían **42501** (fallo ruidoso). Salió el silencioso.

grant select on
  app.referentes_linkedin,
  app.voces_linkedin,
  app.candidatos_linkedin,
  app.descartes_linkedin
to authenticated;

-- Escritura: las cuatro se editan desde el cockpit, al revés que en reels donde `usuarios` y
-- `tarifas` quedaron afuera a propósito. Acá no hay ninguna que sea "del sistema":
--   · referentes_linkedin → el banco se construye a mano desde la pantalla (ADR-055: hoy NO EXISTE
--     el listado en ninguna marca, hay que construirlo)
--   · voces_linkedin      → la firma, el espaciado y las franjas las escribe el equipo
--   · candidatos_linkedin → calificar (ADR-034) y las notas
--   · descartes_linkedin  → el veredicto de la auditoría de falsos negativos
grant insert, update, delete on
  app.referentes_linkedin,
  app.voces_linkedin,
  app.candidatos_linkedin,
  app.descartes_linkedin
to authenticated;


-- ═══════════════════════ §2 · Las policies ═══════════════════════
-- Las cuatro son de **grano instancia**, y eso NO es simetría con reels: es la regla de ADR-049 §5
-- (*"¿el dato tiene sentido sin saber de qué pipeline vino?"*) dando la respuesta contraria en un
-- caso que parece igual.
--
--   · `app.referentes`          (reels)    → grano EMPRESA: el banco de cuentas es de la empresa.
--   · `app.referentes_linkedin` (LinkedIn) → grano INSTANCIA: un filtro de Pinterest es del
--                                            pipeline, no de la empresa.
--
-- Copiar el `client_id in (select app.clientes_visibles())` de su hermana de reels —que es lo que
-- va a querer hacer quien lea las dos seguidas— **no compila**: estas tablas no tienen `client_id`.
-- Que falle fuerte es suerte, no diseño; queda escrito para que nadie lo "arregle" agregando la
-- columna.
--
-- 🔒 Y lo mismo que dice la `021` §3, que hay que repetir o alguien lo borra por redundante: esto
-- **no reemplaza** al filtro de `scoped.ts`. RLS acota a todas las empresas del usuario (es lo
-- máximo que puede saber la base); `scoped.ts` acota al cockpit abierto, que es más angosto. Con
-- una cuenta que alcance EstadoX y 30X —y esa cuenta EXISTE desde el 05/08— sacar el filtro de
-- `scoped.ts` mezclaría los dos cockpits de LinkedIn en una sola pantalla, sin error y sin aviso.

create policy "tenant" on app.referentes_linkedin for all to authenticated
  using      (instance_id in (select app.instancias_visibles()))
  with check (instance_id in (select app.instancias_visibles()));

create policy "tenant" on app.voces_linkedin      for all to authenticated
  using      (instance_id in (select app.instancias_visibles()))
  with check (instance_id in (select app.instancias_visibles()));

create policy "tenant" on app.candidatos_linkedin for all to authenticated
  using      (instance_id in (select app.instancias_visibles()))
  with check (instance_id in (select app.instancias_visibles()));

create policy "tenant" on app.descartes_linkedin  for all to authenticated
  using      (instance_id in (select app.instancias_visibles()))
  with check (instance_id in (select app.instancias_visibles()));


-- ═══════════════════════ Verificación (correr y LEER) ═══════════════════════
--
-- 1. 🔴 **La que importa, y la que esta migración existe para poder aprobar.** Es el check #1 de la
--    `021`, pero corrido CONTRA PROD, o sea con la `020` aplicada — que es la diferencia entera.
--    Tiene que dar **cero filas**. Cualquier fila acá es una pantalla que va a devolver vacío.
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
-- 2. Las 4 policies existen y son de instancia (tiene que dar 4 filas, todas con `instancias_`):
--
--      select tablename, policyname, qual
--        from pg_policies
--       where schemaname = 'app' and tablename like '%linkedin%'
--       order by tablename;
--
-- 3. 🩸 **La prueba que de verdad cierra §14.6, y que ninguna pantalla puede dar.**
--    Después del flip, la Capa 1 filtra por el cockpit abierto ANTES de que la base opine, así que
--    una pantalla se ve IGUAL con RLS funcionando y con RLS inerte. Hay que preguntar sin el filtro
--    de tenant, con una sesión real, y comparar contra el total:
--
--      begin;
--        set local role authenticated;
--        set local request.jwt.claim.sub = '<uuid de un usuario NO dueño>';
--        select count(*) from app.referentes_linkedin;   -- solo las de SUS instancias
--      rollback;
--
--    ⚠️ **No sirve con una cuenta `es_dueno`**: `app.clientes_visibles()` le devuelve todas las
--    empresas, así que su resultado es indistinguible del de RLS apagado. **Por diseño.**
--
-- 4. El "hecho cuando" de §14.6, que necesita datos y por eso va con la primera pantalla:
--    sembrar UNA fila en `app.referentes_linkedin` de la instancia de 30X, y verificar que la
--    cuenta que alcanza 30X y EstadoX la ve **en el cockpit de 30X y no en el de EstadoX**.
--    Ese es el par que prueba las dos mitades: que RLS deja pasar lo propio, y que `scoped.ts`
--    acota al cockpit abierto.
