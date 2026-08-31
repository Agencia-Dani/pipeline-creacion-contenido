# ADR-044 — Todo nodo caro tiene presupuesto, y la concurrencia es la palanca

- **Estado:** aceptada — 2026-08-02 (decisión de Mani, arquitecto). Toca dos Code nodes del motor y
  el `Config`. **Obliga a re-importar** `workflow-short-form-content`. No toca contratos ni datos.
  **Enmendada el mismo día** — ver §El techo se queda: la razón por la que existe no era la que
  decía el título del knob.

- **Contexto:** Mani pidió sacar `cap_top_n` (el techo de videos a transcribir por corrida): los
  planes pagos de Apify, Supadata y la API de Claude no llegan ni a la mitad de su cupo mensual y el
  cupo se resetea, así que frenar por costo estaba dejando plata sin usar. Al revisar qué pasaría con
  el techo en 0 aparecieron tres cosas que no se sabían.

  **1. `Traducir (Claude Haiku)` era el techo real, y el único nodo caro sin red.** Corría SERIAL con
  `sleep(1000)` entre llamadas: una llamada por video distinto no-español, y los referentes son casi
  todos ingleses — la corrida del 31/07 16:28 hizo **170 traducciones sobre 191 transcritos (89%)** y
  duró 31 min. `Transcribir` tenía presupuesto (`presupuesto_transcribir_s = 840`) justamente porque
  el watchdog del task runner (`N8N_RUNNERS_TASK_TIMEOUT`, 900 s en el pod) **mata el nodo entero** y
  la corrida muere sin entregar nada; pasó 3 veces el 07-10. `Traducir` no tenía ninguno. Al doble de
  volumen ese nodo se lleva la corrida puesta, y es el modo de falla más caro que tiene el motor:
  se paga Apify, se paga Supadata, y no llega un solo candidato.

  **2. El presupuesto de `Transcribir` no posterga: QUEMA.** El orden en serie es
  `Heat-score v1 → Preparar procesados → POST processed_items → Transcribir` (ADR-029, enmienda del
  31/07), o sea que **el video se marca como procesado ANTES de transcribirse**. El que se queda sin
  presupuesto vuelve con transcript vacío, el gate lo descarta duro como `sin_guion` (ADR-030), y como
  ya está en la memoria de dedup **no se reintenta nunca**. El corte de `cap_top_n`, en cambio, pasa
  *adentro* de `Heat-score v1`, antes de ese POST: lo capado vuelve la corrida siguiente. **El cap es
  seguro; el presupuesto es destructivo.** Sacar el uno sin mover el otro cambia un aplazamiento por
  una pérdida permanente.

  **3. Con `CONCURRENCIA = 8` y ~27 s/video, 840 s dan ~250 videos** — casualmente el mismo número que
  `cap_top_n = 250`. El techo de gasto y el techo de tiempo estaban calibrados al mismo punto, así que
  bajar uno no destrabaría nada.

  Y el aire que había sin usar era grande: el plan pago de Supadata da **10 req/s** y 8 en vuelo a
  27 s/video inician **~0.3 req/s**, treinta veces por debajo del límite.

- **Decisión:** tres cambios, ninguno de ellos un cap nuevo.

  1. **`Traducir` pasa a pool con presupuesto**, mismo patrón que `Transcribir`
     (`concurrencia_traducir = 8`, `presupuesto_traducir_s = 840`). **La asimetría es deliberada y es
     la parte importante de este ADR:** este presupuesto **degrada, no pierde**. Lo que queda afuera
     sale con el transcript en su idioma original y el gate lo juzga igual (Haiku lee inglés); el de
     `Transcribir` mata el video. Un presupuesto que degrada puede ser generoso; uno que quema, no.
  2. **La concurrencia de `Transcribir` sube de 8 a 24** (~0.9 req/s, todavía 11× por debajo del
     límite de Supadata). Con 24 en vuelo, los mismos 840 s cubren ~745 videos. **Esta es la única
     palanca de throughput que queda**, porque el presupuesto no puede pasar de ~880 s sin chocar con
     el watchdog de 900 s.
  3. **Las tres perillas salen de `Config`** (`concurrencia_transcribir`, `concurrencia_traducir`,
     `presupuesto_traducir_s`). `Config` se edita a mano en n8n, así que tunear el throughput deja de
     costar un re-import — y el handoff ya documenta que un re-import cuesta corridas muertas por
     placeholders sin rellenar.

  El `catch` mudo de `Traducir` pasa a contar y loguear. Una tanda entera podía fallar y la corrida
  salía verde con los scripts en inglés, indistinguible de *"casi todo era español"*.

- **Consecuencias:**
  - **`cap_top_n` se puede poner en 0 desde `/curar/ajustes` sin re-importar** (`pick` resuelve
    ajustes > Config y el nodo hace `if (CAP > 0)`), pero **recién después** de que el motor
    re-importado tenga estos dos nodos. Antes, la corrida muere en `Traducir`.
  - **`cap_top_n` sigue existiendo y sigue cortando GLOBAL, no por proyecto.** Medido en la corrida
    `191ddc8b` del 02/08 con el techo en 10: `Trading fast tips` se llevó los 10 lugares y los cuatro
    proyectos de comunicación quedaron en `evaluados: 0`. Mientras esté en un valor que muerda, mata
    proyectos enteros en vez de recortar parejo. Repartirlo por proyecto sería otro ADR; con el techo
    en 0 el problema no se plantea.
  - **Esto no acerca ningún proyecto a su `N`.** El cuello es el supply, no los cortes: todos los
    proyectos, en todas las corridas medidas, reportan `razon_faltante: supply` (ADR-043 §Contexto).
    Lo que esto compra es que sacar el techo **no rompa** la corrida ni queme videos. La palanca de
    verdad sigue siendo sumar referentes.
  - `runs.metricas.llamadas.haiku_traducciones` pasa a ser una **cota superior**: cuenta los videos
    no-español que entraron, y con presupuesto agotado algunos no se llamaron. La métrica ya estaba
    documentada como estimada; se deja así.
  - Si algún día 24 en vuelo empieza a dar 429 de Supadata, la respuesta es bajar
    `concurrencia_transcribir` desde `Config`, no volver a serializar el nodo.

- **Qué mirar después del primer re-import:** `[Traducir] Loop completo en …ms` en los logs de n8n, y
  que no aparezca `[Traducir] PRESUPUESTO agotado`. Si aparece con volúmenes normales, el techo real
  pasó a ser Anthropic y hay que subir `concurrencia_traducir`.

---

## Enmienda del 2026-08-02 (mismas horas) — el techo se queda en 250, y no por costo

Con el motor ya re-importado se puso `cap_top_n = 0`, se verificó punta a punta… y al mirar qué iba a
pasar en la corrida apareció lo que este ADR no había mirado: **`cap_top_n` no era solo un freno de
gasto, era el que racionaba el supply.** Se revirtió a 250 en el acto (decisión de Mani).

**El mecanismo:** `Leer procesados` lee `processed_items` **entera** (`limit=50000`, sin filtro de
fecha) y `POST processed_items` corre **antes** de transcribir. O sea que todo lo que se transcribe
entra a la memoria de dedup **para siempre**, pase o no el gate, se entregue o no. Y `Armar candidato`
corta cada proyecto a su `N`: los `N` de hoy suman **100**. Lo que sobra de ahí no se guarda en ningún
lado, y tampoco vuelve.

| | transcribe | pasa el gate (~73%, medido 31/07) | entrega | **quema para siempre** |
|---|---|---|---|---|
| `cap_top_n` 250 | 250 | ~180 | 100 | ~80 |
| `cap_top_n` 0 | ~500 (el backlog de 100 días entero) | ~365 | **100** | **~265** |

**Sacar el techo no entrega un solo video más** —el techo de entrega lo ponen los `N`, no el cap—
**y consume el pozo de una sola vez.** El backlog que la recencia en 100 días destapó dura 2-3
semanas con el cap puesto y una sola corrida sin él.

**Y el cuello real está río abajo, no río arriba.** Medido el 02/08: **143 candidatos sin calificar**
en el feed (49 · 34 · 31 · 24 · 5) contra **9 calificados en total** desde que el feed existe. Traer
más videos no es el problema de esta semana; cada corrida grande le suma backlog a un backlog.

**Lo que esto NO cambia:** todo lo de arriba sigue en pie. `Traducir` tenía que arreglarse igual — era
el modo de falla más caro del motor, y con el techo en 250 igual habría podido morder. Lo que cambia
es a cuánto conviene poner el techo, no si los nodos necesitan red.

**La regla que deja, y es la que evita la próxima vez:** antes de aflojar un límite, preguntá **qué
está limitando de verdad**, no qué dice su nombre. Este se llama *Videos a transcribir por corrida* y
se lee como presupuesto de plata; lo que gobierna es cuántas semanas dura el pozo de videos frescos.
El corolario operativo: **el techo se sube cuando sube `sum(N)` o cuando el equipo vacía el feed**, no
cuando sobra cupo en Supadata.

---

## Enmienda 2026-08-31 — el nodo caro que este ADR no miró era el más caro de todos

Este ADR le puso pool y presupuesto a `Transcribir` y a `Traducir`, y dejó al **`Gate de relevancia`
sin ninguno de los dos**: chunks de 25 uno atrás del otro, con un `sleep(1000)` entre medio. La
omisión no fue una decisión, fue no haberlo medido — y cuando se midió, resultó ser **el nodo más
lento de la corrida**.

📏 **Ejecución 150 (31/08), tiempos por nodo leídos de la API de n8n:**

| Nodo | Tiempo | Carga |
|---|---|---|
| **Gate de relevancia** | **492.7 s** | 26 chunks, serial |
| Apify — IG Reels | 456.8 s | 11 cuentas |
| Transcribir (Supadata) | 239.0 s | 164 videos, 8 en vuelo |
| Traducir (Claude Haiku) | 58.0 s | 143 traducciones, 8 en vuelo |
| Pre-trim relevancia | 55.1 s | 4 llamadas |

El watchdog del task runner (`N8N_RUNNERS_TASK_TIMEOUT`, 900 s en el pod) mata el **nodo entero**, así
que el margen real es **1.8×** del volumen de hoy. Pasado eso, la corrida no entrega **nada** después
de haber pagado Apify, Supadata y las traducciones: es literalmente el modo de falla que este ADR
existe para evitar, en el único nodo que se salteó.

**Lo que cambia:** `concurrencia_gate` (8) y `presupuesto_gate_s` (600) en `Config`, y el `sleep`
serial se va. El pool es **cross-proyecto** a propósito: si cada proyecto corriera su propia tanda,
el que tiene 3 videos dejaría 7 workers parados mientras el de al lado tiene 300. Con 8 en vuelo, los
99 chunks que pediría un 4× del volumen pasan de ~1.870 s a ~235 s.

**El `sleep(1000)` no protegía de nada.** A 8 en vuelo con ~19 s por chunk son ~0,4 req/s contra la
cuenta de Anthropic, *más lento* que el pool de `Traducir` que ya corre a 8 desde este mismo ADR.

🔑 **Y su presupuesto no es igual al de los otros dos, aunque se escriba igual.** El de `Transcribir`
**posterga** trabajo a la próxima corrida (ADR-084) y el de `Traducir` **degrada** el idioma. El del
gate degrada el **juicio**: el chunk que no corre deja a sus videos sin score y pasan igual
(fail-open, lo mismo que ya pasaba con un chunk que fallaba). El problema de eso es que **un gate que
no llegó a juzgar y un gate generoso entregan lo mismo y se leen idéntico**. Por eso los videos salen
marcados `_gate_sin_presupuesto` y `Resumen del run` los cuenta en `metricas.gate_sin_presupuesto` +
un aviso. **Un fail-open sin contador es un fail-open invisible**, que es el hallazgo que ADR-029
§Enmienda ya había pagado una vez.

**Toca:** `Gate de relevancia` (pool cross-proyecto en dos pasadas + presupuesto + la marca), `Config`
(2 knobs), `Resumen del run` (contador + aviso). Probado en `test-nodos.mjs` (10 casos: paralelismo
real en vuelo, el pool cruzando proyectos con la rúbrica correcta de cada uno, la concurrencia desde
Config, y el presupuesto que degrada marcando). **No toca `core/`, sin migración.**

### Y el mismo día, el nodo caro que quedaba: el `Pre-trim`

El Gate no era el único que este ADR no había mirado. El `Pre-trim relevancia` mandaba **una sola
llamada por proyecto con TODOS sus captions**, y tenía dos techos, uno en cada punta:

📏 **Medido sobre la ejecución 150 (31/08), contando los items reales que entraron:**

| | |
|---|---|
| videos por llamada | **465, 465, 427, 380** |
| prompt de la más grande | ~158.000 chars ≈ **~40k tokens** |
| descartes del peor proyecto | 67 ids ≈ **~469 tokens de respuesta** |
| `max_tokens` de la respuesta | **1.000** ⇒ el peor proyecto usa el **47%** |

A 2× volumen la respuesta está al **94%** del techo. A 4× **trunca**, y a 5× el prompt se pasa de la
ventana de Haiku. **Las dos puntas terminan en el mismo síntoma, y es el peor posible:** un JSON
cortado no matchea el `/\{[\s\S]*\}/` de abajo, el `catch` se lo traga, y el nodo **descarta cero**
sin un error y sin una línea en el log. No falla: deja de filtrar.

**Lo que cambia:** chunks de 100 (≈8,5k tokens de entrada, ≈700 de salida en el peor caso, con
`max_tokens` en 2.000 de colchón), pool cross-proyecto con `concurrencia_pretrim` (8), y **el
fail-open deja de ser invisible**.

🩸 **Esto último es el hallazgo, y salió de mirar los números en vez del código.** En esa misma
ejecución **dos proyectos de 465 videos descartaron CERO**, y no hay manera de saber si el tema
estaba limpio o si la llamada se rompió: el código trataba *"no había nada off-topic"* y *"no pude
mirar"* exactamente igual — los dos hacían nada. Ahora un chunk que falla (o que vuelve truncado)
marca sus videos con `_pretrim_fallo`, y `Resumen del run` los cuenta en
`metricas.pretrim_sin_juicio` con su aviso. **Es la misma regla que el `_gate_sin_presupuesto` de
arriba, un paso más temprano: un fail-open sin contador es un fail-open invisible.**

**Toca:** `Pre-trim relevancia` (chunks + pool + la marca), `Config` (`concurrencia_pretrim`),
`Resumen del run` (contador + aviso). Probado en `test-nodos.mjs` (15 casos, con harness nuevo para
este nodo: el chunking, el pool cruzando proyectos, el `max_tokens`, y **la respuesta truncada
distinguiéndose de "no había nada que descartar"**). **No toca `core/`, sin migración.**
