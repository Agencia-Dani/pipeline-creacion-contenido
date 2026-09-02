# ADR-089 — Una sola métrica: aprobados contra lo pedido, por proyecto

- **Estado:** aceptada — 2026-09-01 (decisión de Mani, en la sesión que retomó la cascada de entrega).
  **Enmienda la métrica de éxito de [ADR-088](./ADR-088-el-gate-ordena-no-veta.md)** y la del
  [plan de la cascada](../agents/plan-cascada-de-entrega.md) §4. **No toca `core/`, sin migración,
  sin código.** Es la definición contra la que se juzga todo lo demás.

## Contexto

Cada cambio del motor venía con su propia métrica: `+232 entregados` (ADR-088), `bajo_umbral`,
`processed_items` que deja de inflarse (ADR-087), `tasa_gate` por proyecto. Todas ciertas y ninguna
decide nada por sí sola — un cambio puede subir la entrega y bajar la calidad, o al revés, y cada
ADR se quedaba defendiendo su propio número.

Mani lo cerró así:

> *"Todos estos cambios se van a medir por medio de una sola métrica; que de los videos colectados
> se cumpla con lo que pide cada proyecto y que sean APROBADOS. Ese es el success meter principal de
> TODO el workflow (traer y aprobar)."*

## Decisión

**La métrica es `aprobados / N pedido`, por proyecto y por corrida.** Aprobado = `calificacion` en
`{🔥, 👍}`. Nada más cuenta como éxito: ni entregar, ni pasar el gate, ni ahorrar plata.

```sql
-- El norte, por corrida y por proyecto. Todo lo demás es diagnóstico de por qué da lo que da.
with d as (
  select r.id as run_id, r.inicio, v.key as pid,
         (v.value->>'nombre')::text     as proyecto,
         (v.value->>'n_objetivo')::int  as n_pedido,
         (v.value->>'entregados')::int  as entregados
  from public.runs r, jsonb_each(r.metricas->'por_proyecto') v
  where r.metricas ? 'por_proyecto'
)
select to_char(d.inicio,'DD/MM HH24:MI') as corrida, d.proyecto, d.n_pedido, d.entregados,
       count(c.calificacion) as calificados,
       count(*) filter (where c.calificacion in ('🔥','👍')) as aprobados,
       round(100.0*count(*) filter (where c.calificacion in ('🔥','👍'))/nullif(d.n_pedido,0),1) as pct_del_pedido
from d left join app.candidatos c on c.run_id = d.run_id and c.proyecto_id::text = d.pid
where d.n_pedido > 0
group by d.inicio, d.proyecto, d.n_pedido, d.entregados
order by d.inicio, pct_del_pedido desc;
```

### Se descompone en dos factores, y hay que reportar los dos

**`aprobados/N` = cobertura × precisión**, donde **cobertura = `entregados/N`** (¿el supply llega a
lo que se pide?) y **precisión = `aprobados/calificados`** (¿lo que llega sirve?). El producto es el
norte; los factores dicen **dónde** está la pérdida, y **casi siempre no están en el mismo lado**.

⚠️ **El tercer número no es opcional: `calificados/entregados`.** Un candidato sin calificar **no es
un rechazo**, y tratarlo como tal hace que el norte castigue al motor por algo que pasó (o no pasó)
en el Feed. Se reporta siempre, y cuando la cobertura de calificación es baja el norte se lee como
**piso**, no como resultado.

## 📏 La línea base, medida el 2026-09-01 contra prod

`run_id` existe desde ADR-081 y **sin backfill**, así que el norte por corrida sólo se puede calcular
sobre las **5 corridas** desde el 31/08 04:30. Es poco, y es todo lo que hay.

| corrida | colectados | N pedido | entregados | calificados | aprobados | **norte** |
|---|---|---|---|---|---|---|
| 31/08 04:30 | 520 | 80 | 32 | 3 | 2 | **2,5%** |
| 31/08 13:00 | 530 | 80 | 54 | 19 | 17 | **21,3%** |
| **31/08 17:22** | 1.088 | 80 | **80** | 47 | **36** | **45,0%** |
| 01/09 10:37 | 110 | 80 | 1 | 0 | 0 | **0%** |
| 01/09 14:17 | 1.178 | 100 | 13 | 5 | 5 | **5,0%** |

**El techo medido es la corrida del 31/08 17:22**, la única en la que los 4 proyectos entregaron su
N completo (`razon_faltante: null` en los 4). Por proyecto, donde el equipo sí calificó:

| proyecto | N | entregados | calificados | aprobados | **norte** |
|---|---|---|---|---|---|
| Ansiedad | 20 | 20 | 20 | **18** | **90%** |
| Depresión | 20 | 20 | 20 | 12 | **60%** |
| Emociones | 20 | 20 | 5 | 4 | ≥20% (15 sin calificar) |
| Psicología | 20 | 20 | 2 | 2 | ≥10% (18 sin calificar) |

🔑 **Cuando la cobertura llega a N y el equipo califica, la precisión es 60–90%.** O sea que **el
norte no está limitado por la precisión: está limitado por la cobertura.** En 15 de los 21
(proyecto × corrida) medidos, `razon_faltante` es `supply` o `mixta` — el motor no junta ni para
llenar N. **1.088 colectados dieron 36 aprobados: ~30 videos crudos por cada aprobado.**

## Consecuencias

- **Ordena los pendientes por su efecto en el norte.** El escalón 2 (segunda oportunidad
  cross-proyecto) y el catálogo de referentes atacan **cobertura**, que es el factor que muerde. Las
  peleas de ordenamiento dentro de N atacan **precisión**, que hoy no es el cuello — y sólo muerden
  cuando hay más candidatos que N, que pasó en **6 de 21** (proyecto × corrida).
- **Un cambio que sube la entrega y baja la precisión no es una mejora hasta que el producto sube.**
  Eso mata la trampa de las dos direcciones: ni "entregué más" ni "fui más preciso" son defensa.
- **Enmienda ADR-088.** Su métrica de éxito era *"cuántos 🔥/👍 ABSOLUTOS por corrida"*, que era la
  corrección correcta a *"cuántos entregó"* pero seguía sin denominador: 36 aprobados es un techo si
  se pidieron 40 y un fracaso si se pidieron 400. **El denominador es lo que se pidió.**
- **Deja de haber métrica por ADR.** `bajo_umbral_entregados`, `tasa_gate`, `registro_dedup` y las
  demás siguen existiendo y siguen siendo útiles — pero como **diagnóstico de por qué el norte da lo
  que da**, no como evidencia de que un cambio sirvió.

## Alternativas descartadas

- **`aprobados` absolutos por corrida** (lo que decía ADR-088). Sin denominador no se puede comparar
  entre corridas ni entre proyectos, y premia a quien pide poco.
- **Precisión sola (`aprobados/entregados`)**. Premia al sistema por entregar menos, que es
  exactamente lo que ADR-088 quería evitar. Es un **factor** del norte, no el norte.
- **Cobertura sola (`entregados/N`)**. Es la que el motor ya reporta (`razon_faltante`) y la que
  ADR-088 hizo subir. Llenar N con basura la deja en 100% y no sirve para nada.
- **Medir sobre `colectados` como denominador.** Suena a la frase de Mani, pero `colectados` lo mueve
  el scrape (520 → 1.178 según cuántos referentes tenga cada cuenta) y haría que agregar referentes
  **empeore** el número aunque el equipo reciba más videos buenos. Colectados es el **insumo** que se
  reporta al lado, no el denominador. *(La razón de 30 crudos por aprobado sí se reporta: es la que
  dice cuánto cuesta un aprobado.)*

## Hecho cuando

1. El norte se puede leer sin escribir SQL a mano — hoy la pantalla **Entender** muestra
   `entregados/pedidos` y **no muestra aprobados contra pedido**, que es el número que importa.
2. Cada cierre que toque el motor reporta el norte antes y después, con la cobertura de calificación
   al lado.

🐤 **Canario del propio ADR:** si un cierre vuelve a defenderse con una métrica propia y no con el
norte, esto no se adoptó.
