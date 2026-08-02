# ADR-042 — El techo de gasto se toca desde el cockpit, y muere la perilla que no hacía nada

- **Estado:** aceptada — 2026-08-01 (decisión de Mani, arquitecto). **Enmienda a
  [ADR-016](./ADR-016-knobs-de-ejecucion-globales-y-tope-de-costo.md) y completa a
  [ADR-038](./ADR-038-una-sola-perilla-de-cantidad.md).** Toca `core/schema/` (migración
  [014](../../core/schema/014_criterios_voz_y_perillas.sql)) y **obliga a re-importar el motor.**

- **Contexto:** ADR-038 ordenó las perillas de cantidad para el equipo: el `N` del proyecto pasó a ser
  obligatorio y única, y los tres knobs globales que competían con él se escondieron en
  `visibilidad = 'dev'`. Funcionó para el equipo. Para un dev, la pantalla seguía siendo confusa, y al
  revisarla apareció por qué:

  1. **`Candidatos por corrida` no era un cap, y su descripción decía que sí lo era.** El texto en la
     base decía *"Cuántos videos distintos trae la corrida en total (no por proyecto). El corte va por
     el score final."* — eso describe a `cap_top_n`, que es otro knob. Lo que hacía de verdad era ser
     el default de `N` para proyectos con `N` vacío, y desde que el form exige `N` **no aplicaba a
     ninguno**: los 6 proyectos tienen el suyo. Estaba inerte y mentía.
  2. **De las cuatro perillas que gobiernan cuántos videos entran, la única que cuesta plata era la
     única que no estaba en la pantalla.** `cap_top_n` es el techo duro de transcripción: ordena por
     heat y se queda con los N videos más calientes de toda la corrida, justo antes de Supadata y
     Haiku, que son los pasos que se pagan. Vivía en el nodo `Config` del `workflow.json` por
     ADR-016, o sea que bajar la factura exigía editar un JSON y re-importar.

  La combinación es la peor posible: la perilla visible no hacía nada, y la que decidía el gasto no se
  podía tocar.

- **Decisión:** se cambia una por otra. La cuenta de knobs no se mueve: siguen siendo 18.

  1. **Muere `Candidatos por corrida`** — fila borrada, clave fuera del `check` de `app.ajustes`, fuera
     del `CATALOGO` del cockpit y fuera del `AJUSTE_MAP` del motor. El `N` del proyecto queda como la
     única perilla de cantidad **que existe**, no solo como la única visible.
  2. **Nace `Videos a transcribir por corrida`** (`cap_top_n` del lado del motor), `visibilidad='dev'`,
     valor 250. Se resuelve con la misma precedencia `ajustes > Config` que ya usan `dias_recencia`,
     `top_n` y `resultados_referente`.
  3. **La pantalla de Ajustes separa lo dev de lo del equipo.** Los dev-only bajan a un bloque
     *"Avanzado (solo devs)"* al final. Antes un rol `dev` veía los 18 mezclados sin ninguna marca, que
     es la razón por la que la perilla inerte seguía llamando la atención.

  **`cap_top_n` deja de estar bajo ADR-016; `cap_resultados_referente` sigue estando.** La línea es:
  un tope que **protege** a otro knob (que su valor no se vaya de rango) se queda en el `Config`; un
  tope que **es presupuesto** va a la pantalla. Son cosas distintas que ADR-016 metió en la misma
  bolsa.

- **Por qué borrar la fila es seguro acá y no lo sería con la recencia.** `Armar plan de corrida`
  resuelve con `pick(clave, default)` y precedencia `ajustes > Config`, así que borrar una fila hace
  caer el valor al del `Config` del workflow. Hay que mirarlo caso por caso:

  | Knob | `ajustes` | `Config` | ¿Se puede borrar? |
  |---|---|---|---|
  | `Candidatos por corrida` | 100 | `top_n: 100` | ✅ cae parada, en el mismo valor |
  | `Días de recencia` | 200 | `dias_recencia: 7` | ❌ **tiraría la recencia de 200 a 7 en silencio** |

  Es la trampa que ADR-038 avisó al esconder los knobs en vez de borrarlos. El aviso sigue vigente
  para la recencia; para esta no aplicaba, y verificarlo es lo que permitió cerrar el punto.

- **Consecuencias:**
  - **Un re-import del motor**, el primero desde D7. Son tres ediciones chicas en dos nodos:
    `AJUSTE_MAP` cambia una clave, `cap_top_n` pasa a resolverse por `pick()`, y `Heat-score v1` lee
    `cfg.cap_top_n` en vez de ir directo al `Config`. Esa última línea es de una sola palabra: `cfg`
    ya era, en la línea 1 de ese nodo, "Config pisado por los ajustes" — el código lo esquivaba a
    propósito.
  - **El orden importa:** la clave nueva tiene que estar en la fachada **antes** de re-importar. Si el
    workflow llega primero, `pick` no la encuentra y cae al `Config` (250). No rompe nada, pero el
    knob no hace nada hasta el deploy, y ese silencio es justo el que confunde.
  - `top_n` **se queda en el `Config` y en el plan**, como red para un proyecto con `n` en null. Deja
    de ser una perilla: la app ya no puede crear una fila así, y si alguna apareciera por fuera del
    cockpit, la corrida no revienta.
  - Se resuelve de paso un drift: el contrato congelado decía `cap_top_n = 100` y el JSON vivo decía
    250. Manda el que está corriendo.

- **El hecho-cuando:** poner el knob en **10**, correr, y confirmar en `runs.metricas` que se
  transcribieron 10 videos distintos y no 250. Es la única prueba de que las dos puntas quedaron
  conectadas: si el cambio no agarró, **la corrida sale verde igual** y transcribe 250.
