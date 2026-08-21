# ADR-075 — Agrupar es aprobar: meter un video a una colección lo califica 👍

- **Estado:** aceptada — 2026-08-21. Tapa un hueco de
  [ADR-073](./ADR-073-la-coleccion-es-una-bolsa-de-videos.md), que dejó la colección apuntando a la
  llave del video sin mirar qué le pasa a la **fila del candidato** mientras tanto. Se apoya en
  [ADR-022](./ADR-022-loop-aprendizaje-criterios.md) (qué aprende el motor de lo calificado)
  y [ADR-034](./ADR-034-calificar-es-un-solo-acto.md) (calificar es un juicio, no un archivador).

## Contexto

### 🩸 El hueco, encontrado midiendo y no leyendo

El archivado tiene dos escrituras que nadie había mirado juntas:

| Nodo | Qué hace |
|---|---|
| `Leer Candidatos calificados` → `outputs` | archiva **solo** lo que tiene `estado <> nuevo` |
| `Barrer candidatos sin calificar` | **borra** `estado = nuevo` con más de **20 días** |

Cruzadas, dejan una ventana por la que se cae un dato que nadie puede reconstruir:

> Un video **sin calificar** que alguien metió a una colección **pierde su guion crudo a los 20
> días**. La fila de `app.candidatos` se borra, nunca pasó por `outputs`, y `leerCrudo()`
> (`lib/guiones.ts:44`, que busca en `transcripciones` → `candidatos` → `outputs`) se queda sin
> dónde mirar.

Lo que sobrevive: la pertenencia a la colección (apunta a la llave), la miniatura
(`app.videos_meta`) y el guion limpio si alguien alcanzó a limpiarlo. **El crudo no.** La tarjeta
pasa a decir *"El sistema no tiene el guion de este video"* —el mismo cartel de los links cargados a
mano— sin que nadie haya borrado nada a propósito.

📏 **Medido contra prod el 2026-08-21, antes de decidir:** `app.colecciones` tiene **0 filas**, así
que **todavía no se perdió ni un guion**. El hueco es de diseño, no un incidente. Pero el modo
selección existe para que la gente agrupe en lote, así que lo iba a llenar de casos.

🔑 **Por qué no apareció en ADR-073:** esa ADR razonó sobre lo que la colección *guarda* (la llave,
que sobrevive a todo) y no sobre lo que la colección *lee al dibujarse* (el guion, que vive en la
fila que el barrido borra). *La bolsa sobrevive; lo que la bolsa muestra, no necesariamente.*

## Decisión

**1. 🔑 Agregar un video a una colección lo aprueba, si estaba sin calificar.**

En el mismo clic, un candidato con `estado = nuevo` pasa a `calificacion = 👍`, `estado = aprobado`,
`fecha_calificacion = now()` — por el camino que ya existe, `camposDeCalificacion()`
(`domain/feed.ts:51`), sin inventar una combinación de estados nueva.

La consecuencia es la que cierra el hueco, **por construcción y no por vigilancia**: un aprobado se
archiva a `outputs` en la próxima corrida, y ahí su guion vive para siempre. El barrido no lo
alcanza nunca porque el barrido solo mira `estado = nuevo`.

**2. 👍 y no 🔥, y la diferencia es lo que el motor aprende.**

`Destilar criterios` (ADR-022) le pasa a Haiku **los 🔥 como ejemplos positivos** para redefinir el
criterio de búsqueda del proyecto, y cae a *"los aprobados"* solo si no hay suficientes. Un 🔥
automático convertiría un gesto de logística —*"aparto estos 40 para bajarlos en un Word"*— en una
reescritura del norte del motor.

**Agrupar es una señal positiva débil y se registra como tal:** *alguien lo apartó para trabajarlo*,
no *esto es de lo mejor que encontramos*. Es la misma distinción que ADR-034 abrió con las notas.

**3. Nunca pisa una calificación existente.**

Si el video ya tiene 🔥, 👍 o 👎, agregarlo a una colección **no lo toca**. El juicio humano no se
sobrescribe con un efecto secundario. Sí: un 👎 puede estar en una colección, y es un caso legítimo
(*"guardá los malos para mostrarle a Dani qué no queremos"*).

**4. Solo aplica a los videos que tienen fila en `app.candidatos`.**

Los de Transcribir y los cargados a mano no tienen nada que aprobar, y tampoco corren riesgo: el
barrido solo borra de `app.candidatos`. `app.transcripciones` no se barre.

## Alternativas descartadas

- **🔥 automático.** Ver §2. Es la alternativa que más "respeta la intención" y la que más daño
  silencioso hace.
- **`estado = aprobado` con `calificacion = null`.** Lo más honesto —nadie lo juzgó, solo lo
  apartó— y hoy **ningún camino del código produce esa combinación**. Obliga a auditar todo lo que
  asume *"estado decidido ⇒ hay emoji"* (el Feed, `Armar filas archivado`, el destilador). Más
  barato de decidir que de sostener.
- **Que el barrido saltee lo que está en una colección.** Toca n8n —el `DELETE` de PostgREST no
  hace ese join, hay que leer las claves antes y excluirlas— y deja candidatos viejos acumulándose
  en el Feed para siempre. Además protege la fila, no el hecho: el guion sigue sin llegar a
  `outputs`.
- **Copiar el guion crudo a `colecciones_videos`.** Contradice ADR-073 (*"la bolsa es descartable,
  lo que se pagó no"*) y duplica el texto en dos lugares que pueden divergir. Pide migración.
- **Pedir la calificación antes de dejar agregar.** Fricción justo en el gesto que se quiere volver
  de un clic, y en Transcribir/Históricos no hay candidato que calificar.

## Consecuencias

- (+) El hueco se cierra **sin migración, sin tocar n8n y sin código de dominio nuevo**: es una
  llamada más a un camino que ya existe.
- (+) El Feed se limpia solo. Lo que alguien apartó deja de aparecer entre lo que falta mirar.
- (−) **Agrupar y aprobar dejan de ser acciones separadas.** Quien meta un video a una colección
  "solo para verlo después" lo está aprobando, y eso llega al histórico. Aceptado: no existe un
  caso real de *"apartar sin querer usarlo"* — para eso están las notas de ADR-034.
- (−) El destilador recibe 👍 que nadie tipeó. Mitigado porque son fallback y no ejemplos positivos;
  **el canario es** `Destilar criterios` produciendo criterios que nadie reconoce, visible en
  `criterios_aprendidos` de `app.proyectos`.
- (+) Deja de ser posible perder un guion crudo por inacción. Antes el reloj de 20 días corría en
  silencio contra un dato irrecuperable.
