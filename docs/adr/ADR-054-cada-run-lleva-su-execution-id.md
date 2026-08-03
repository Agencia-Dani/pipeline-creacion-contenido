# ADR-054 — Cada run lleva el id de su ejecución, y el error handler cierra por ese id

- **Estado:** aceptada — 2026-08-03. Enmienda [`ingesta-registro.md`](../../core/contracts/ingesta-registro.md)
  y repara el error handler que [ADR-053](./ADR-053-el-repo-es-la-forma-el-live-es-el-estado.md) sacó
  a la luz al versionarlo.

- **Contexto:** el *Error Workflow* de la instancia (`Workflows/workflow-registro-fallos/`) existe
  para que una corrida que se muere no se quede en `en_curso` para siempre. **Nunca funcionó.**
  Buscaba el run abierto por `instance_id=eq.<<INSTANCE_ID>>` —un placeholder que quedó literal— y
  [ADR-048](./ADR-048-run-plan-v2-motor-por-instancia.md) además le sacó el piso: la instancia dejó
  de ser una constante del workflow y pasa a viajar en el payload del webhook. **El Error Trigger no
  recibe ese payload**, así que no hay forma de resolverla desde ahí.

  Y aunque se resolviera, `instance_id` no alcanza: identifica al **tenant**, no a la **corrida**.
  Con el dispatcher dando una ejecución por instancia ([ADR-050](./ADR-050-dispatcher-una-ejecucion-por-instancia.md))
  y el motor, el archivado y el descubrimiento compartiendo instancia, `PATCH runs?instance_id=eq.X
  &estado=eq.en_curso` puede tocar el run de otro workflow, o varios a la vez. Es exactamente la
  ambigüedad que hace inútil un registro de fallos: decir *"algo de este cliente se cayó"* no sirve.

  Lo que sí identifica una corrida sin ambigüedad es la **ejecución de n8n**. Medido contra la
  instancia con dos workflows desechables (uno que se cae, otro que es su Error Workflow):

  | pregunta | respuesta verificada |
  |---|---|
  | ¿`$execution.id` existe dentro del workflow? | **sí** — string, ej `"116"`, disponible en expresiones y Code nodes |
  | ¿el payload del Error Trigger trae ese mismo id? | **sí** — `$json.execution.id === "116"`, el de la ejecución caída |
  | ¿hace falta migrar para guardarlo? | **no** — `runs.params` es `jsonb` y PostgREST filtra `params->>clave=eq.valor` (probado contra la tabla real) |

- **Decisión:** **cada run graba, al abrirse, el id de la ejecución que lo produjo**, y el error
  handler lo usa como llave.

  1. **`Abrir run en el registro`** (motor, descubrimiento, archivado) agrega `execution_id` a
     `params`: `params: { workflow: 'motor', execution_id: $execution.id }`.
  2. **El error handler** hace `PATCH /runs?params->>execution_id=eq.{{ $json.execution.id }}`.
     Un run, exacto, sin importar el tenant, el pipeline ni cuántas corridas haya en vuelo.

  **Va en `params` y no en una columna nueva.** `params` ya lleva `workflow`, que tampoco es un
  filtro pedido sino identidad de la corrida: el precedente está puesto y es el mismo caso. Una
  columna compraría un índice y un unique, y `runs` —una fila por corrida, semanal— no los necesita
  ni de cerca. Lo que sí costaría es real: la cola de migraciones está trabada (la `017` espera al
  re-import de la Fase 4, y la `018`/`019` ya están pedidas por ADR-051/052), así que una columna
  dejaría el error handler roto hasta que drene toda esa cola. **Disparador de graduación:** cuando
  `runs` crezca hasta que el seq scan moleste, o cuando algo necesite joinear por ejecución, pasa a
  columna con índice; el filtro cambia de `params->>execution_id` a `execution_id` y nada más.

  **El filtro NO lleva `estado=eq.en_curso`.** Si la corrida ya se había cerrado como `ok` y se cae
  después, el run pasa igual a `fallo` con su mensaje: la ejecución falló y el registro tiene que
  decirlo. `metricas` no se pisa, así que queda la foto completa —hasta dónde llegó y con qué murió—
  en vez de un `ok` que miente.

  **Se borra la rama `¿Había run abierto?` → `Insertar run de fallo`.** No se puede implementar:
  `runs.instance_id` es `not null references instances(id)`, así que inventar un run de fallo exige
  inventarle un tenant, y eso es justo lo que prohíbe la Capa 1 de
  [ADR-047](./ADR-047-aislamiento-en-dos-capas.md). Lo que la rama pretendía cubrir —caerse **antes**
  de abrir el run— es una ventana de 4 nodos (`Config`, barrer zombies, leer corridas vivas, guard),
  y dos de ellos ya son requests a Supabase: **si esa ventana falla, casi siempre es porque Supabase
  no responde, y entonces tampoco se podría escribir la fila del fallo.** Cubrir el caso costaría
  leer la ejecución caída por la API de n8n para recuperar el tenant, y no se paga por una ventana
  cuyo modo de falla dominante es el mismo que la deja sin registrar igual.

- **Consecuencias:**
  - Una corrida que se cae en cualquier punto **después** de abrir su run queda registrada como
    `fallo`, con el nodo y el mensaje, en la fila correcta. Era el agujero que dejó ADR-053.
  - El barredor de zombies (`Barrer runs zombie`) deja de ser el único que cierra corridas muertas y
    pasa a ser la red de atrás: sigue haciendo falta para las caídas del propio n8n (pod reiniciado,
    OOM), donde no hay Error Trigger que dispare.
  - El error handler baja de 5 nodos a 3 y deja de tener placeholders: `<<INSTANCE_ID>>` desaparece
    y `<<SUPABASE_URL>>` queda como el único, resuelto en el import.
  - **Es un cambio de topología**, así que ese workflow fue por re-import, no por `n8n:push`
    (ADR-053). Los 3 `Abrir run` sí son cambio de `parameters` y viajaron por `push`.
  - **Cerrado el 2026-08-03** y verificado end-to-end: los 4 workflows lo tienen en
    `settings.errorWorkflow` y el handler se dispara, captura el id de la ejecución caída y su
    PATCH sale limpio contra Supabase.
  - El re-import volvió a dejar `<<SUPABASE_URL>>` literal —el mismo modo de falla que este ADR
    venía a arreglar, silenciado otra vez por `onError: continue`— y lo agarró `n8n:diff`, no una
    corrida. **El diff después de cada import no es opcional.** Además creó un workflow con id
    nuevo (`gBcKmzxc4EgXMwzv`): importar en n8n nunca actualiza en el lugar.

- **Alternativas descartadas:**
  - **Buscar el run abierto por `params->>workflow`:** funciona hoy con un tenant y miente el día
    que dos corran en paralelo, que es precisamente cuando el registro importa. Cambia ambigüedad
    de tenant por ambigüedad de concurrencia.
  - **Columna `execution_id` con índice:** más limpia en abstracto, pero ata el arreglo a una cola
    de migraciones trabada por dos ADRs anteriores. Queda como graduación, con disparador escrito.
  - **`instance_id` nullable para poder insertar runs de fallo huérfanos:** debilita el tenant
    obligatorio, que es la Capa 1 de ADR-047. No se toca.
