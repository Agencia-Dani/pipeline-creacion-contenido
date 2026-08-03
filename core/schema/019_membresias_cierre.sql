-- 019_membresias_cierre.sql — mueren las dos columnas que la `018` reemplazó (ADR-051).
--
-- ⛔ **NO se corre junto con la `018`.** Va DESPUÉS de que el refactor de las guardias esté
--    deployado y funcionando. Antes de eso, el cockpit vivo todavía lee `app.usuarios.rol` y
--    `app.usuarios.client_id`: dejarlas caer acá deja a todo el mundo en `/sin-rol`.
--
-- Por qué no es opcional, aunque "funcione igual" sin correrla: mientras las dos formas convivan,
-- `usuarios.rol` es una **copia congelada** de la membresía. El día que alguien cambie un rol, lo
-- cambia en `usuarios_clientes` y la columna vieja se queda vieja — y a partir de ahí hay dos
-- respuestas a la misma pregunta, que es exactamente lo que ADR-027 llama tener dos dueños del
-- mismo dato. La ventana es corta a propósito.

-- ═══════════════════════ §0 · La confirmación humana ═══════════════════════
-- Igual que la `017`: desde la base no hay forma de saber si el deploy ya pasó. El gate se firma.

create temporary table if not exists _cierre_membresias (confirmado boolean);
delete from _cierre_membresias;

-- ⬇️ DESCOMENTAR solo si las dos son ciertas:
--    1. el refactor de las guardias (ADR-051) está deployado en Vercel;
--    2. entraste al cockpit con una cuenta real y viste tu zona — o sea que el rol ya sale de la
--       membresía y no de la columna que estamos por borrar.
-- insert into _cierre_membresias values (true);

do $gate$
begin
  if not exists (select 1 from _cierre_membresias where confirmado) then
    raise exception
      '019: falta confirmar el deploy del refactor. Leé la cabecera y descomentá el insert. (Si el cockpit todavía lee usuarios.rol, no corras esto.)';
  end if;
end
$gate$;


-- ═══════════════════════ §1 · Una última red antes de borrar ═══════════════════════
-- Si alguna membresía se perdió en el camino, esto lo dice ANTES de tirar la única copia que queda
-- de "a qué empresa pertenecía esta persona".

do $red$
declare
  huerfanos int;
begin
  select count(*) into huerfanos
  from app.usuarios u
  where not u.es_dueno
    and not exists (select 1 from app.usuarios_clientes uc where uc.usuario_id = u.id);

  if huerfanos > 0 then
    raise exception
      '019: hay % usuario(s) sin membresía y sin es_dueno. Si borro las columnas viejas, pierden el acceso Y el rastro de a dónde pertenecían.', huerfanos;
  end if;
end
$red$;


-- ═══════════════════════ §2 · Mueren las dos columnas ═══════════════════════
-- Un dato, un dueño (ADR-027). `client_id` y `rol` ahora viven en la membresía.

alter table app.usuarios drop column client_id;
alter table app.usuarios drop column rol;


-- ═══════════════════════ Verificación ═══════════════════════
-- 1. La forma nueva es la única (esperado: solo `id`, `nombre`, `creado_en`, `es_dueno`):
--      select column_name from information_schema.columns
--      where table_schema = 'app' and table_name = 'usuarios' order by ordinal_position;
--
-- 2. Y entrá al cockpit una vez más. Un `select` que da bien y un login que no entra son
--    compatibles: esta migración toca justo la fila que decide si alguien pasa.
