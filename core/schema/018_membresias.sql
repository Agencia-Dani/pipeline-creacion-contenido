-- 018_membresias.sql — el acceso pasa a ser una membresía explícita (ADR-051).
-- Aplicar DESPUÉS de la `016`. SQL Editor de Supabase → pegar → Run.
--
-- Qué cambia de fondo: hasta acá una persona pertenecía a UNA empresa (`app.usuarios.client_id`) y
-- su rol era global (`app.usuarios.rol`). Con clientes externos eso no alcanza — una cuenta puede
-- trabajar para varias, y "qué puede hacer" tiene que tener una respuesta POR EMPRESA, que es la
-- forma de la pregunta cuando el que la hace es el dueño de una de ellas.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- ⚠️ TRES COSAS QUE HAY QUE SABER ANTES DE PEGAR ESTO
--
--   1. **Va DESPUÉS del renombre `piloto` → `retia`.** Si se corre antes, el `delete from clients
--      where id = 'piloto'` del renombre choca contra las membresías que esta migración acaba de
--      crear. Va a **fallar en vez de borrarlas** (ver el punto 2), que es lo correcto, pero es un
--      paso extra en el medio de una transacción que ya está escrita. Corré el renombre primero.
--
--   2. **La FK a `clients` es RESTRICT a propósito, no CASCADE.** Con cascade, borrar una empresa
--      le saca el acceso a todo su equipo **en silencio**; con restrict, hay que sacar a la gente
--      primero y eso es una decisión que alguien toma. Es la misma regla de ADR-045 —*se borra solo
--      lo que nunca produjo nada*— aplicada a las personas. La FK a `usuarios` sí cascadea: si la
--      cuenta no existe, sus membresías no significan nada.
--
--   3. **Esta migración NO borra `usuarios.rol` ni `usuarios.client_id`.** Las dos siguen vivas y
--      pobladas. Es el mismo expand/contract de la `016`: el código desplegado todavía las lee, y
--      dejarlas caer acá rompería el cockpit hasta que deploye el refactor de las guardias. Mueren
--      en la **`019_membresias_cierre.sql`**, después del deploy.
--      🩸 Mientras las dos convivan, `usuarios.rol` es una **copia congelada**: si alguien cambia un
--      rol, lo cambia en la membresía y la columna vieja queda vieja. Es aceptable porque el alta es
--      manual y la ventana es corta — pero por eso la `019` no es opcional.
-- ─────────────────────────────────────────────────────────────────────────────────────────────


-- ═══════════════════════ §0 · Guardas ═══════════════════════

do $guardas$
declare
  sin_cliente int;
  usuarios    int;
begin
  if to_regclass('app.usuarios') is null then
    raise exception '018: no existe app.usuarios — falta la 007.';
  end if;

  -- La `016` tiene que estar: el backfill copia `client_id`, que ella creó.
  if to_regclass('clients') is null
     or not exists (select 1 from information_schema.columns
                    where table_schema = 'app' and table_name = 'usuarios' and column_name = 'client_id') then
    raise exception '018: falta la 016 (app.usuarios.client_id no existe). Corré la 016 primero.';
  end if;

  -- Un usuario sin cliente no produce membresía y **pierde el cockpit el día del deploy**, sin
  -- ningún error: entra, no tiene a dónde ir, y cae en /sin-rol. Se aborta antes de que eso pase.
  select count(*) into sin_cliente from app.usuarios where client_id is null;
  if sin_cliente > 0 then
    raise exception '018: hay % usuario(s) sin client_id. Asignalos antes: si no, pierden el acceso al deployar.', sin_cliente;
  end if;

  select count(*) into usuarios from app.usuarios;
  raise notice '018: se van a crear % membresías (una por usuario).', usuarios;
end
$guardas$;


-- ═══════════════════════ §1 · La tabla de membresías ═══════════════════════
-- La unidad de acceso. Reemplaza a `usuarios.client_id` (a qué empresa) y a `usuarios.rol` (con qué
-- permisos), que eran dos columnas contestando la misma pregunta a medias.

create table app.usuarios_clientes (
  usuario_id uuid not null references app.usuarios (id) on delete cascade,
  client_id  text not null references clients (id),          -- sin cascade: ver la nota 2 de arriba
  rol        app.rol_usuario not null,
  creado_en  timestamptz not null default now(),
  primary key (usuario_id, client_id)
);

-- La PK cubre "¿a qué empresas entra esta persona?". Este índice cubre la pregunta que va a hacer
-- el cliente externo: **"¿quiénes pueden ver los datos de MI empresa?"**.
create index usuarios_clientes_cliente_idx on app.usuarios_clientes (client_id);

comment on table app.usuarios_clientes is
  'Quién trabaja en qué empresa y con qué rol (ADR-051). El acceso se enumera acá: si no hay fila, no hay acceso — salvo los dueños (app.usuarios.es_dueno).';

alter table app.usuarios_clientes enable row level security;


-- ═══════════════════════ §2 · La agencia ═══════════════════════
-- Dos personas que alcanzan todas las empresas SIN membresía, y que además no aparecen en ninguna
-- superficie que liste gente (la auditoría de `app.eventos`, la futura pantalla de accesos).
--
-- Por qué un flag y no tres membresías: sumar un cliente nuevo obligaría a acordarse de agregar dos
-- filas más, y olvidarse deja al dueño sin acceso a algo que él mismo opera — un fallo mudo. El flag
-- no se olvida. Y es lo honesto: la agencia tiene la `service_role` key y las credenciales de n8n,
-- o sea que puede leer todo igual. Nombrarlo es mejor que disfrazarlo de membresía normal.

alter table app.usuarios add column es_dueno boolean not null default false;

comment on column app.usuarios.es_dueno is
  'La agencia (ADR-051): alcanza todas las empresas sin membresía y queda FUERA de toda lista de personas.';


-- ═══════════════════════ §3 · Backfill ═══════════════════════
-- Nadie puede perder acceso por esta migración: cada usuario vivo se lleva su empresa y su rol tal
-- cual los tenía.

insert into app.usuarios_clientes (usuario_id, client_id, rol)
select id, client_id, rol from app.usuarios
on conflict do nothing;

-- El mapeo dueño = `rol = 'dev'` es el que vale HOY: los dos devs son las dos personas de la
-- agencia. No es una regla —un cliente externo puede tener su propio dev algún día— así que si esta
-- migración se corre en otro momento, revisá a mano quién queda marcado.
update app.usuarios set es_dueno = true where rol = 'dev';


-- ═══════════════════════ Verificación (correr y mirar) ═══════════════════════
-- 1. Nadie perdió acceso — los dos números tienen que ser iguales:
--      select (select count(*) from app.usuarios) as usuarios,
--             (select count(*) from app.usuarios_clientes) as membresias;
--
-- 2. Quién quedó marcado como agencia (esperado: 2, y tienen que ser las personas correctas —
--    este es el select que hay que LEER, no contar):
--      select nombre, rol, es_dueno from app.usuarios order by es_dueno desc, nombre;
--
-- 3. La pregunta que va a hacer el cliente, ya respondible:
--      select c.id as empresa, u.nombre, uc.rol
--      from app.usuarios_clientes uc
--      join app.usuarios u on u.id = uc.usuario_id
--      join clients c on c.id = uc.client_id
--      where not u.es_dueno            -- los dueños no se listan (ADR-051)
--      order by 1, 2;
--
-- 4. Lo que SIGUE en pie a propósito hasta la `019`: `app.usuarios.rol` y `app.usuarios.client_id`
--    existen y están poblados. El código desplegado todavía los lee.
