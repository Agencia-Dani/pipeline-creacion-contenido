# ADR-064 — La tanda es el pegote, no el procesamiento

- **Estado:** aceptada — 2026-08-07. **Extiende [ADR-031](./ADR-031-transcriptor-a-pedido.md)**
  (el transcriptor gana una unidad de agrupación) y **apoya en
  [ADR-062](./ADR-062-el-transcriptor-deja-de-ser-un-callejon-sin-salida.md)**, que es la que le dio
  corridas propias. Toca `core/`: una migración con tabla nueva, columna y policy. Sale de un grill
  con Mani.

> **Se escribe ANTES de construir.** No existe una línea de código de esta ADR.

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
