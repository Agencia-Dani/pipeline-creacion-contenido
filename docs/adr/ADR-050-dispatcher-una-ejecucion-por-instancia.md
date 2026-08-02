# ADR-050 — El dispatcher dispara una ejecución por instancia (no un loop de tenants adentro de una)

- **Estado:** aceptada — 2026-08-02. Es la resolución de la tensión de la decisión **C** del
  [plan multi-tenant §2](../agents/plan-multi-tenant.md) (la fase, su §7.4). Es el hermano de
  **ejecución** de [ADR-048](./ADR-048-run-plan-v2-motor-por-instancia.md) (contrato) y **activa C9**
  de [PLAN §2.2](../../PLAN.md).

- **Contexto:** ADR-048 deja **una** definición de workflow parametrizada por instancia. Falta decidir
  **cómo corre para N tenants**, y la opción evidente —que el workflow recorra las instancias activas
  dentro de la misma ejecución— rompe dos cosas, una de diseño y otra medida:

  1. **El invariante #1 (aislamiento de fallos):** el error de un tenant se lleva puesta la corrida de
     los otros. Un referente caído en EstadoX no puede vaciarle la semana a 30X.
  2. **El presupuesto de tiempo, que es un límite duro y ya medido.**
     `N8N_RUNNERS_TASK_TIMEOUT` es **900 s en el pod** y **mata el Code node entero** — pasó 3 veces el
     07-10, y la corrida muere **sin entregar nada**. Por eso `Transcribir` tiene 840 s de presupuesto
     y `Traducir` los ganó en agosto ([ADR-044](./ADR-044-todo-nodo-caro-tiene-presupuesto.md)).
     **Tres tenants en serie dentro del mismo nodo es la corrida muerta garantizada**, y encima
     muerta *después* de pagar Apify y Supadata.

  Y hay una asimetría que empeora el loop interno: cuando `Transcribir` se queda sin presupuesto, cada
  video que quedó afuera es un video **quemado** — ya está en `processed_items` (el POST va antes de
  transcribir, ADR-029 enmienda del 31/07), vuelve con transcript vacío, el gate lo descarta
  `sin_guion` (ADR-030) y **no se reintenta nunca**. El presupuesto no posterga: quema. Repartirlo
  entre tres tenants es repartir la quemada.

- **Decisión:** **una definición de workflow, N ejecuciones.**

  Un **dispatcher** (workflow n8n nuevo, `Workflows/workflow-dispatcher/`) consulta las instancias
  activas y dispara el motor **una vez por instancia**, pasando `instancia` en el payload:

  ```
  [cron] → GET /api/engine/instancias?workflow=short-form-content
         → por cada instancia: POST al webhook del motor con { instancia }
  ```

  1. **Cada ejecución conserva el presupuesto completo que tiene hoy** — 840 s por corrida, **por
     tenant**, no 840 s repartidos. El cálculo vigente sigue valiendo tal cual: con `CONCURRENCIA=24`
     a ~27 s/video, 840 s cubren ~745 videos por tenant.
  2. **Continue-on-fail por iteración:** un tenant caído no corta a los otros. Invariante #1 intacto.
  3. **El single-flight de [ADR-023](./ADR-023-disparo-on-demand-boton-airtable.md) pasa a ser por
     instancia** (hoy es global por copia de workflow).
  4. **El dispatcher no procesa nada: solo dispara.** Si se cae, no hay pérdida de datos — se vuelve a
     disparar. No toca Apify, ni Supadata, ni Anthropic, ni escribe una fila.
  5. **La cola de n8n gobierna la concurrencia.** No se inventa un scheduler propio.

  ### Por qué esto NO es el "workflow padre" que ADR-006 descartó

  Es la objeción obvia y hay que responderla, porque el parecido es superficial.
  **[ADR-006](./ADR-006-plano-de-datos-sin-workflow-padre.md) descartó el workflow maestro como
  *centro del sistema* y en el mismo párrafo autorizó explícitamente el dispatcher**, textual:

  > *"Un **dispatcher** — formulario que lanza corridas bajo demanda con filtros y rutea al workflow
  > correspondiente — existe como componente opcional dentro de n8n (**C9**), no como centro del
  > sistema."*

  Lo que ADR-006 rechazó, punto por punto, y por qué acá no aplica:

  | Lo que ADR-006 rechazó del workflow padre | Este dispatcher |
  |---|---|
  | **Punto único de falla**: *"si el padre se rompe, nada corre"* | Si el dispatcher se cae, **el cron de cada motor y el botón ▶ del cockpit siguen disparando**. Es un atajo de conveniencia, no la única puerta |
  | **No puede orquestar OpenClaw** (conversacional, humano en el loop) | No lo intenta. Dispara **un** pipeline por invocación, contra su propio endpoint |
  | **Acopla la cadencia de todos los workflows a un solo trigger** | Cada workflow **conserva su trigger natural**. El dispatcher agrega uno, no reemplaza ninguno |
  | Ser **el centro del sistema** | El centro sigue siendo el plano de datos: repo (contrato) + Supabase (registro) + motores (ejecución). El dispatcher no tiene estado, no registra nada y **no sabe qué pasó adentro** de las corridas que disparó |

  **La diferencia de fondo, en una línea:** el workflow padre orquestaba **pipelines distintos** y era
  la única forma de que algo corriera; este dispara **el mismo pipeline para N tenants** y ninguna
  corrida depende de él para existir.

- **Alternativas descartadas:**
  - **Loop de tenants dentro de una ejecución.** La opción sin componentes nuevos. Descartada por las
    dos razones del contexto: rompe el invariante #1 y **choca de frente con los 900 s del watchdog**,
    que no es una estimación sino algo que ya mató 3 corridas.
  - **Un cron por instancia configurado a mano en n8n.** Sin componente nuevo y con aislamiento real.
    Descartada porque devuelve el trabajo manual que ADR-048 vino a sacar —cada empresa nueva es
    tocar n8n— y porque **la lista de instancias activas ya vive en la base**: duplicarla en
    configuración de cron es tener dos verdades sobre quién corre.
  - **Un scheduler propio en la app** (un cron de Vercel que postee a cada webhook). Técnicamente
    equivalente. Descartada porque metería a la app en el camino de **ejecución** además del de
    arranque, y porque el aislamiento por corrida, la cola y los reintentos son lo que n8n ya hace.
  - **Disparar todo en paralelo sin cola.** Descartada: N ejecuciones simultáneas saturan el pod
    managed, y el disparador para irse a VPS ([ADR-005](./ADR-005-hosting-n8n-managed-fase1.md) fase 2)
    tiene que ser **medido, no anticipado**. La cola de n8n absorbe eso sin decisiones nuevas.

- **Consecuencias:**
  - (+) **El aislamiento de fallos entre empresas es real, no una promesa de código.** Son procesos
    distintos: un tenant que muere no toca a los otros.
  - (+) El presupuesto por corrida no se diluye con cada empresa que entra. Sumar tenants no le baja
    el techo a los que ya estaban.
  - (+) Sumar una empresa es **una fila en `instances`** — el dispatcher la levanta sola en la próxima
    corrida. Nada que tocar en n8n. Es el invariante #3 hecho verificable.
  - (−) **Un workflow más que operar y auditar.** Entra al `auditar-workflows.mjs` y a la disciplina de
    re-import como cualquier otro.
  - (−) **N ejecuciones simultáneas es una carga que hoy no existe** en el pod managed. Es el eje que
    hay que **medir** para saber cuándo se dispara la fase 2 de ADR-005. Se mide, no se anticipa.
  - (−) Deja de haber "una corrida" que mirar: el estado de la semana pasa a ser N filas de `runs`. Lo
    absorbe el registro, que es donde de verdad se mira (ADR-006).
  - ⚠️ **El reflejo que hay que guardar al verificarlo, textual del handoff:** *"`runs` no distingue
    'colgada' de 'muerta', Apify sí."* Con N ejecuciones eso se multiplica por N: una fila en `en_curso`
    para siempre por cada tenant que arrancó mal. **Cero llamadas en Apify ⇒ murió antes de scrapear.**

- **Toca:** `Workflows/workflow-dispatcher/` (nuevo, con su `workflow.yaml`) · el endpoint
  `GET /api/engine/instancias` de [ADR-048](./ADR-048-run-plan-v2-motor-por-instancia.md) ·
  `app/(zonas)/operar/actions.ts` (single-flight por instancia) · `PLAN §2.2` — **C9 deja de ser
  "se construye en F5" y pasa a construido**.
