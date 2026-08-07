# ADR-064 — La tanda es el pegote, no el procesamiento

- **Estado:** aceptada — 2026-08-07. **Extiende [ADR-031](./ADR-031-transcriptor-a-pedido.md)**
  (el transcriptor gana una unidad de agrupación) y **apoya en
  [ADR-062](./ADR-062-el-transcriptor-deja-de-ser-un-callejon-sin-salida.md)**, que es la que le dio
  corridas propias. Toca `core/`: una migración con tabla nueva, columna y policy. Sale de un grill
  con Mani.

> ~~**Se escribe ANTES de construir.** No existe una línea de código de esta ADR.~~
> ✅ **Construida el 2026-08-07**: migración [`027`](../../core/schema/027_tandas.sql), `domain/tanda.ts`,
> `lib/tandas.ts` y la pantalla. Construirla **corrigió dos cosas de este texto**, marcadas abajo en
> el §2 y el §5. Falta que Mani aplique la `027`.

## Contexto

El pedido llegó como *"esto es puramente visual para el equipo, que sea más fácil de entender"*: que
los enlaces pegados de una vez se agrupen abajo, con un título que se pueda poner, y que los grupos
se puedan colapsar.

**Medir antes de construir mostró que la mitad no es visual.**

`leerTranscripciones` trae **las últimas 50 filas y punto** — sin paginación y sin avisar. Al
2026-08-07 hay **110 transcripciones**, o sea que la pantalla **ya oculta más de la mitad de lo que
existe** y no hay nada en la interfaz que lo diga. Esa misma ventana de 50 ya causó un bug con
consecuencias: la única transcripción fallada de la tanda del 07/08 cayó en la posición 49 de 50 y
el pegote siguiente la habría empujado afuera, dejando su botón de reintento inalcanzable (por eso
hoy las fallidas se leen en una consulta aparte, sin ventana).

## Decisión

### 1. La tanda es una entidad, y es el **pegote**

Tabla `app.tandas` (id, título, instancia, quién, cuándo) y una columna `tanda_id` en
`app.transcripciones`.

🩸 **La alternativa barata era reusar el `run` que ADR-062 ya crea, y es incorrecta.** Ese run lo
abre `procesarPendientes`, o sea **el procesamiento**: trabaja de a 64 enlaces y se corta a los 45 s.
Una tanda de 100 enlaces produce dos o tres runs; una tanda que se procesa hoy a medias y mañana el
resto produce runs de días distintos; y un run puede tocar enlaces de tandas distintas. Agrupar por
run le mostraría al equipo **grupos que no significan nada**: no son sus pegotes, son los pedazos en
que la máquina decidió trabajar.

**La tanda nace cuando alguien aprieta el botón.** Es una unidad del usuario, no de la máquina, y por
eso necesita su propia entidad aunque haya otra que se le parezca.

### 2. El título es opcional, con default, y editable siempre

Default: **`"20 links · 7 ago 14:32"`** — tamaño y momento, que son las dos cosas con las que alguien
reconoce su propia tanda. No colisiona nunca (dos del mismo día se distinguen por hora) y ordena
natural.

> 🩸 **CORREGIDO al construir (2026-08-07): el default NO se guarda, se dibuja.** Esta sección decía
> *"el título es opcional, **con default**"*, y la lectura natural —la que casi se implementa— era
> escribir ese texto en la fila al crearla. Es incorrecto por dos razones que aparecieron recién al
> escribir la migración: (1) el default es una **proyección de dos columnas que ya están en la fila**
> (cuántos links y cuándo), y guardarla la congela — la misma pregunta que ADR-041 ya contestó al
> revés; (2) obligaba a que el formato de fecha existiera **dos veces**, un `to_char` en SQL y
> `lib/fechas.ts` en la app, y de ahí salió la hora corrida 5 h de la zona Entender.
> En el esquema `titulo` es **nullable**, `null` significa *"nadie la renombró"* y lo dibuja
> `tituloDeTanda` (`domain/tanda.ts`, con tests). Vaciar el campo al renombrar **vuelve al default**
> en vez de dejar una cabecera en blanco.

**Editable después.** Si el campo es opcional y aparece justo cuando la persona está apurada pegando
50 links, la mayoría de las tandas va a quedar con el nombre automático. Sin renombrar, "recomendado"
se vuelve una única oportunidad que se pierde por apuro.

### 3. La página carga **cabeceras**, y las filas al expandir

Se acabó el techo de 50: se ven **todas** las tandas, porque una cabecera es título + contadores.
Las filas —con sus `script`, que son el peso— bajan cuando alguien abre esa tanda.

Es el patrón que ya arregló el feed en el cierre 98: ahí el **71%** del payload eran tres campos de
texto que la tarjeta cerrada no dibujaba, y sacarlos lo llevó de ~405 KB a ~16 KB. Acá la situación
es idéntica y el `script` es el campo gordo. **Una tanda colapsada no necesita sus guiones.**

### 4. Las 110 existentes se backfillean a sus tandas reales

`creado_en` las separa limpio: un pegote inserta todas sus filas en un solo INSERT, así que comparten
el `now()` exacto. Medido: **9 grupos** (52, 48, 2, 2, 2 y cuatro sueltas). Se les arma su tanda con
el nombre por defecto.

Así la pantalla se ve bien desde el día uno y **el caso `tanda_id is null` no queda vivo** para que
alguien tenga que entenderlo en seis meses.

### 5. Quién pegó se muestra, y eso abre una excepción angosta a ADR-051 §3

*(Sección agregada el 2026-08-07 al construir. El §1 nombraba **"quién"** en una lista de columnas y
nada más; construirlo obligó a decidir dos cosas que esa palabra no decía.)*

**Primero: si `creada_por` existe, es porque la pantalla la muestra.** La `023` acababa de dropear
`transcripciones.pedido_por` —tres días antes— justamente por write-only, con el argumento de que
*"quién pidió qué no se pierde: el acto queda en `app.eventos`"*. Repetir esa columna sin leerla
habría sido reabrir lo que ADR-059 cerró. **Decisión de Mani:** se muestra. *"Sería bueno saber de
quién es la tanda"* — y no es auditoría, es información de trabajo: dice a quién preguntarle por
esos 50 links.

**Segundo, y es lo que no era obvio: mostrarla no se podía con lo que había.** La policy de la `025`
solo deja ver `usuarios_visibles()`, que **excluye a los dueños** porque ADR-051 §3 puso *"la agencia
queda fuera de toda superficie que liste personas"* como propiedad del sistema. Con el embed normal,
toda tanda pegada por un dueño diría *"(sin acceso a la ficha)"*. Mani lo resolvió de frente: **"no
importa si es dueño, sponsor u operador"**.

La excepción se hace **angosta**, y la línea está en la palabra *listar*:

- **No se afloja `usuarios_visibles()`.** Sigue gobernando las superficies que **listan** personas
  (la pantalla de equipo de ADR-060), y ahí la agencia sigue afuera.
- `app.autores_de_tandas()` (`027` §6) **no lista a nadie**: resuelve el nombre de quien **firmó un
  trabajo que la sesión ya ve**. Nadie aparece por existir, solo por haber pegado una tanda en una
  instancia alcanzable. Medido contra un Postgres real: una sesión que no alcanza esa instancia
  obtiene **cero nombres**.

Es la diferencia entre un directorio y una firma, y es la que hace que esto no sea ADR-051 por la
puerta de atrás.

## Alternativas descartadas

**Agrupar por `creado_en` sin tabla nueva.** Hoy funcionaría —los 9 grupos son limpios— y ahorra la
migración entera. Se descarta porque el timestamp es una **coincidencia de implementación, no una
identidad**: dos personas pegando en el mismo segundo quedan fusionadas para siempre, sin forma de
separarlas, y el título tendría que vivir en una tabla llaveada por (instancia, timestamp), que es
una tabla nueva igual pero con una clave frágil.

**Solo agrupar las 50 filas que ya se traen** (el pedido literal: "puramente visual"). Es lo más
barato y deja la pantalla mintiendo sobre más de la mitad del contenido. Se descartó al medir: con
110 filas y creciendo, el agrupado visual haría **más** convincente una lista incompleta.

**Traer las 5 tandas más recientes completas.** Arregla el techo de 50 igual y es más simple que
cargar al expandir, pero manda los `script` de todo lo colapsado — con dos tandas de ~50 son cientos
de KB que nadie mira. Es exactamente el error que el feed ya cometió y corrigió.

## Consecuencias

- **La tarjeta de fallidas se queda como está**, arriba y sin ventana: cruza tandas a propósito
  ("lo que necesita tu atención") y su razón de ser es que una fila fallada no se pierda en la lista.
  Agruparla por tanda la volvería a esconder.
- **`tanda_id` es nullable en el esquema** aunque el backfill lo deje lleno: las escrituras del
  transcriptor y las del backfill son dos caminos, y un `not null` obligaría a que el orden de la
  migración y el deploy sea perfecto. Lo que garantiza que no haya huérfanas es el backfill, no el
  constraint.
- **La tanda es del cockpit** (`instance_id`), como el resto de `app.transcripciones`, y necesita su
  policy de RLS: una tabla con tenant y sin policy es cero filas o `42501` desde el flip de ADR-058.
  El check #1 de la `021` la va a encontrar si falta.
- Esto **no toca** el histórico: una transcripción sigue entrando a `outputs` por sí misma (ADR-062).
  La tanda agrupa la pantalla de trabajo, no el archivo.
- *(Agregado al construir.)* **La cabecera es una vista, `app.v_tandas`, y no una cuenta en la app.**
  La alternativa era traer `(tanda_id, estado)` de todas las transcripciones y contar en memoria:
  hoy son 110 filas y ~5 KB, o sea que **se vería bien y volvería a crecer sin techo** — el mismo
  error que el feed cometió y corrigió en el cierre 98. Con la vista, el payload es una fila por
  tanda pase lo que pase con el volumen.
- *(Agregado al construir.)* **Crear la tanda es best-effort, y por eso hay un canario.** Nace
  *después* del encolado y solo si entró algo (el `ignoreDuplicates` es quien decide cuántos eran
  nuevos; al revés, un pegote de puros repetidos dejaría una tanda vacía imborrable). Como la
  asignación es sumidero —invariante #1— una falla suya dejaría filas fuera de toda cabecera, o sea
  **guiones ya pagados invisibles**. `leerSueltas` las busca y su tarjeta solo se dibuja si aparece
  alguna: tiene que dar cero siempre.
