# Pipeline de Creación de Contenido — Context

El dominio: detección y curación de videos de referentes (Reels/TikTok) para el equipo de redes.
Este glosario fija el lenguaje ubicuo del MVP de reels.

Este archivo es **un glosario y nada más** — el lenguaje ubicuo del proyecto. Sin detalles de
implementación, specs ni decisiones (esas van en [docs/adr/](../adr/)). Definiciones de una o dos
frases: qué **es** un término, no qué hace. Solo términos propios del dominio.

`/grill-with-docs` lo va llenando a medida que los términos se resuelven en cada alineación.

## Language

**Proyecto**:
Una temática aislada de búsqueda (ej: Comunicación, Ventas). Cada proyecto rankea y cura su propio
embudo. Un mismo video puede aparecer en más de un proyecto solo cuando **comparten el referente** que
lo trajo, y solo si pasa el juicio de relevancia de cada uno (ADR-013, ADR-015). Un Proyecto tiene
**una sola Voz**; una Voz puede servir a varios Proyectos.

**Voz**:
El personaje o marca para quien se cura contenido. Organiza la selección y el histórico, y le da al
gate el **contexto de persona/audiencia** (quién es, a quién le habla) — **no un criterio de filtro**:
el que discrimina el tema es el Proyecto (revisión de ADR-010, 2026-07-14). En el MVP no genera
guiones (scripts literales — ADR-009).

**Referente**:
Una cuenta de Instagram o TikTok de la que el motor trae videos. **La única fuente de descubrimiento**
(ADR-019): el motor solo busca por las cuentas de referente sembradas por el equipo — a mano o
promovidas desde los Referentes propuestos (ADR-020).

**Referente propuesto**:
Una cuenta candidata a Referente que el **workflow de descubrimiento** (ADR-020) propone cada semana a
partir de las **semillas** (los referentes activos que mejor convierten según la señal de selección):
en Instagram los sugeridos del propio IG (`relatedProfiles`), en TikTok los lookalikes del actor
dataovercoffee (ADR-020 §8, rama paralela). Veteados con Haiku contra los criterios del proyecto. Vive en
la tabla `Referentes propuestos`; el equipo la marca aprobado/descartado y los aprobados se promueven
solos a `Referentes`. Un handle propuesto no se re-propone (descartar es definitivo).

**Keyword**:
Término **retirado del dominio** (ADR-019). Era una palabra/frase de búsqueda (hashtag de TikTok) para
descubrimiento ciego; el eje se removió por completo y su reemplazo es el motor de descubrimiento de
referentes (ADR-020).

**Candidato**:
Un video ya transcrito y traducido al español, esperando que el equipo lo califique en el cockpit.
La unidad que el equipo cura es la dupla **(video, proyecto)**: un mismo video relevante para dos
proyectos es dos candidatos, cada uno con su voz, su heat-score y su juicio de relevancia (ADR-013).

**Videos por corrida** (el `N` del Proyecto):
Cuántos candidatos **pide** un Proyecto cada vez que corre el motor. Es la **única** perilla de
cantidad que existe (ADR-038 la dejó como la única *visible*; ADR-042 borró el default global
`Candidatos por corrida` que seguía compitiendo con ella). Es obligatoria.

⚠️ **Es un techo, no un contrato.** El motor nunca entrega más que `N` —el corte de `Armar
candidato` es exacto— pero entregar menos es lo normal: la entrega es *best-effort sobre el supply
real*, y el supply es `referentes activos × resultados por cuenta`, menos lo que mata el gate, menos
lo que el dedup ya mostró. Por eso **la pantalla nunca dice «hasta N»**: dice lo que se pidió y, al
lado, lo que la última corrida entregó de verdad. *Decir el número solo sería prometer algo que la
máquina no garantiza.* Cuando queda corto, la palanca casi siempre es **más referentes**, no un `N`
más alto.

**Techo de crudos**:
Cuántos videos llega a **mirar** una corrida para un Proyecto, antes de filtrar nada:
`referentes activos × resultados por cuenta de referente`. Es un límite superior aritmético, **no un
pronóstico** — sobreestima a propósito (ignora el dedup y el fan-out), y por eso es seguro: si el
`N` pedido no entra ni en el techo, no hay criterio que lo arregle y la palanca son las cuentas
(ADR-043). Es lo que la pantalla muestra al lado del `N`, en vez de la entrega estimada que
deliberadamente no se calcula.

**Techo de gasto** (`cap_top_n` en el motor, *Videos a transcribir por corrida* en Ajustes):
Cuántos videos distintos se transcriben como máximo en **toda** la corrida, todos los Proyectos
juntos, ordenados por Heat-score. Muerde justo antes de transcribir y filtrar, que son los pasos que
se pagan. `0` = sin techo. No confundir con el `N` del Proyecto, que reparte; este limita el total, y
**corta global**: cuando muerde no recorta parejo, deja proyectos enteros en cero (ADR-042, medido en
ADR-044). 🚨 **Su nombre engaña: no es un presupuesto de plata, es el que raciona el pozo de videos
frescos** (enmienda de ADR-044). Todo lo que se transcribe entra a `processed_items` **para siempre**
—pase o no el gate, se entregue o no— y la entrega la topan los `N`, no esto: bajarlo a `0` no entrega
un video más, solo consume el pozo de una corrida en vez de tres. Se sube cuando sube `sum(N)` o
cuando el equipo vacía el feed, no cuando sobra cupo en Supadata.

**Presupuesto de nodo** (`presupuesto_transcribir_s`, `presupuesto_traducir_s`):
Cuánto tiempo puede gastar un Code node caro antes de dejar de arrancar trabajo nuevo. Existe porque
el watchdog del task runner de n8n mata el **nodo entero** a los 900 s y con él la corrida, sin
entregar nada. No es lo mismo que el Techo de gasto: aquel elige **qué** se procesa, este corta
**cuándo se deja de procesar**. Y los dos que hay no cuestan lo mismo (ADR-044): el de `Transcribir`
**quema** (el video ya está en la memoria de dedup, así que se pierde para siempre), el de `Traducir`
**degrada** (el video sale en su idioma original y se juzga igual). La palanca para procesar más no
es subir el presupuesto —tiene el watchdog encima— sino la **concurrencia** del pool.

**Apagar vs. borrar**:
Dos actos distintos sobre un registro de config. **Apagar** (`activo = false`) lo saca de las
corridas y lo deja en la lista: es reversible y es lo normal. **Borrar** lo saca de la base, y solo
se permite si el registro **nunca produjo nada** (ADR-045) — un Referente sale siempre, porque su
historia se guarda por handle en texto y no por FK; una Voz o un Proyecto, solo si no tienen
Candidatos ni Descartes colgando. La frase que rechaza el borrado dice **cuánta** historia hay y
ofrece apagar.

**Heat-score**:
El número con que el motor ordena los candidatos de caliente a frío. Combina la relevancia/calidad
del contenido (juicio semántico contra los criterios del Proyecto ⊕ la Voz) con su desempeño objetivo
(views/likes/engagement, percentil dentro de la corrida) y la señal de selección histórica **por
referente** (única señal de aprendizaje — ADR-019).

**Relevancia tópica**:
Qué tan genuinamente el video trata la temática del Proyecto, más allá de que use ganchos o etiquetas
de adorno. Garantizarla es trabajo de la máquina.

**Utilidad**:
Qué tanto aporta el contenido del video en sí, frente a lo viral-vacío (gancho sin sustancia).

**Criterios de relevancia**:
Las reglas, editables por el equipo en el cockpit, contra las que el motor juzga si un video sirve
para un **Proyecto**. Alimentan la evaluación semántica. Un buen criterio dice qué sirve, qué NO
sirve, y trae ejemplos reales; si no permite rechazar nada, es una descripción, no un criterio. La
Voz no aporta criterio sino **contexto de persona** (revisión de ADR-010, 2026-07-14).

**Criterios aprendidos**:
El complemento que la máquina destila cada semana de las decisiones reales del equipo (patrones de lo
aprobado y lo descartado, con ejemplos). Complementan los criterios de relevancia manuales, nunca los
reemplazan; el equipo los ve y puede editarlos o borrarlos (ADR-022). La misma destilación deja una
**advertencia de criterios** (lint de forma: criterio vago / sin lista negativa / Voz incoherente),
visible al equipo pero que el gate no lee.

**Salud por referente**:
Tres números por cuenta, **derivados de lo que ya pasó** (nadie los escribe a mano ni los guarda):
`tasa_gate` (qué fracción de sus videos pasó el gate), `tasa_aprobacion` (qué fracción terminó
aprobando el equipo) y `videos_evaluados` — con mínimo de muestra. Señalan qué fuente **podar**; la
poda siempre la ejecuta el equipo (ADR-022).

**Descarte del gate**:
Un video que el juicio de relevancia rechazó después de transcribirlo. **No es un Candidato** (nunca
esperó calificación). Los de score intermedio se exponen al equipo para auditoría; uno que el equipo
marca "era bueno" es un **falso negativo** y alimenta la revisión de criterios (ADR-021). A
diferencia de un Candidato, **un descarte no caduca**: queda esperando su auditoría el tiempo que
haga falta, porque nadie más guarda lo que se tiró (ADR-036).

**Precisión de entrega**:
La métrica norte de calidad: de lo que el equipo calificó en la semana, qué fracción aprobó. Mide si
lo que llega de verdad sirve (ADR-021).

**Separación del gate**:
Cuánto distingue el juicio de la máquina lo que el equipo aprueba de lo que descarta (distancia entre
los scores medios de ambos grupos). Separación baja en un proyecto = sus criterios no discriminan
(ADR-021).

**flag_viral**:
La marca de una cuenta muy grande (~700K+ seguidores). Marca "high-end", **no** excluye ni altera
el heat-score (ADR-009).

**Script literal**:
El texto de un candidato: la transcripción del video tal cual, traducida al español solo si el
original no lo está. Sin reescritura ni adaptación a voz (ADR-009). Es lo mismo que entrega el
transcriptor por un **enlace pegado**: la misma llamada, el mismo prompt, el mismo resultado.

**Enlace pegado**:
Un link de video que alguien del equipo trae **a mano** a la zona *Transcribir*, en vez de que lo
haya encontrado el motor. Es la **segunda fuente** de videos del sistema, junto al Referente
(ADR-031, que enmienda el "única fuente" de ADR-019). Su identidad —el `external_id` con el que
entra al dedup— se **deriva de la URL**, no de una llamada a Apify.

**Transcripción a pedido**:
Lo que produce el transcriptor por un enlace pegado: el video, su **script literal**, y el estado del
pedido (`pendiente` → `listo` | `sin_transcript` | `fallo` | `abandonado`). **No es un Candidato**: no
pasó por el gate, no tiene heat-score, no consume la `N` de ningún proyecto y no está atada a una
dupla (video, proyecto). Vive en `app.transcripciones`, no en el feed de calificación — pero cuando
queda `listo` **entra al Histórico**, porque el equipo la quiso (ADR-062).

**Tanda**:
Los enlaces que alguien pegó **de una sola vez** en *Transcribir*, como una unidad con nombre. Es la
unidad con la que el equipo piensa su propio trabajo (*"los 20 de competencia que pegué el martes"*),
y por eso existe: no la necesita la máquina, la necesita la persona que vuelve a buscar lo suyo.
Lleva un título que el equipo elige al pegar —opcional, con uno automático si lo dejan vacío— y que
puede cambiar después.

⚠️ **No confundir con la Corrida del transcriptor.** La tanda es el **pegote** y nace cuando alguien
aprieta el botón; la corrida es el **procesamiento**, trabaja de a 64 y se corta a los 45 s. Una
tanda de 100 enlaces se procesa en varias corridas, y una corrida puede tocar enlaces de varias
tandas. Agrupar por corrida daría grupos que no significan nada para el equipo (ADR-064).

**Abandonar** (una transcripción):
Declarar que un enlace pegado **nunca va a dar un script**, y dejar de ofrecer el reintento — el caso
típico es un video sin voz. Es distinto de **descartar**, que en este dominio siempre es un *juicio
de mérito* (el gate rechazó el video, o el equipo le puso 👎): abandonar dice que el insumo está
roto, no que no guste. Por eso no alimenta ningún aprendizaje. La fila **queda**, para que el mismo
link no se vuelva a colar ni a pagar (ADR-062).

**Histórico**:
El archivo de guiones del equipo: **todo guion que el equipo quiso guardar**, de todas las semanas y
venga de donde venga — un Candidato que aprobó en el feed o un **enlace pegado** que transcribió a
mano. Es lo que se descarga en el CSV, y cada fila dice de qué **origen** vino. *No es "lo aprobado"*:
ese era su significado mientras el archivado era su único escritor (ADR-062, que enmienda ADR-014).
Desde ADR-070 es además la superficie donde se marca lo **grabado**: dejó de ser solo lectura.

**Grabado**:
Que el equipo ya usó ese video para producir contenido. Es un hecho **del video**, no del guion ni
del carril por el que entró: vive en `app.grabados` con clave `(plataforma, external_id)`, y la
**presencia de la fila es la marca** — desmarcar la borra (ADR-070).

⚠️ **Es ortogonal a Transcrito, y confundirlos es el error que la palabra existe para evitar.**
*Transcrito* dice que existe el texto de ese video en el sistema; *grabado* dice que el equipo lo
usó. Las cuatro combinaciones son reales, y la cuarta es la que obligó a que esto fuera una tabla y
no una columna: un video **grabado y no transcrito** es un link que el equipo grabó por fuera de la
herramienta y cargó a mano, y no tiene fila en ninguna otra tabla donde colgarle la marca.

*Nació en ADR-069 como columna de `app.transcripciones`, o sea alcanzando un solo carril; ADR-070 la
mudó al video porque 55 de los 183 guiones del histórico venían del Feed y no tenían dónde marcarse.*

**Marca huérfana**:
Un **grabado** sin guion: el equipo grabó ese video por fuera del sistema y cargó su link a mano. Lo
que afirma es *"esto lo grabamos"* y nada más: no tiene título, ni proyecto, ni texto que mostrar.
*Hasta ADR-072 se dibujaba con una tarjeta propia para no afirmar lo que no sabe; hoy usa la misma
**tarjeta de video** que el resto, porque esa tarjeta ya dibuja lo que falta como falta.*

**Llave de video**:
La identidad de un video en todo el sistema: `(instance_id, plataforma, external_id)`, con
`external_id` derivado siempre de la URL. Es la misma en los tres orígenes —el Feed, un enlace pegado
y un link cargado a mano— y por eso es la llave de todo lo que se le cuelga a un video sin importar
por dónde entró: el **grabado** (ADR-070), su metadata comprada, su **guion limpio** y su pertenencia
a una **colección** (ADR-072). Lo que se guarda contra la llave **sobrevive al barrido del
archivado**, porque no apunta a la fila del candidato.

**Tarjeta de video**:
Cómo se ve un video en el cockpit, y es **una sola en todas las pantallas** (ADR-072): miniatura,
título, referente y un pie que cambia según lo que ahí se pueda hacer con él. Su propiedad definitoria
es que **degrada sin mentir** — lo que el sistema no sabe se dibuja como falta ("sin título", la
inicial del referente) y nunca se completa inventando, que es lo que permite que las tres fuentes
—que saben cosas distintas— compartan una misma forma.

**Modo selección**:
Cómo se actúa sobre **varios videos a la vez** sin que la pantalla lo pida siempre. Apagado —que es
como está en reposo— no existe: ni casillas ni barras. Encendido, cada **tarjeta de video** muestra
su casilla y aparece una barra con lo que esa pantalla puede hacerle a lo marcado, que **no es lo
mismo en todas**: en el Feed se califica y se archiva, en Transcribir e Históricos se marca grabado,
y en las tres se agrega a una **colección**. *Existe porque la única puerta a una colección era
pegar links: para agrupar un video que ya estaba en pantalla había que abrirlo, copiar su url e ir
a otra pantalla a pegarla.*

**Colección**:
Una bolsa de videos con nombre, armada a mano para trabajarlos juntos (ADR-073). Puede mezclar los
tres orígenes, apunta a la **llave de video** —así que no se vacía cuando el archivado barre el
Feed— y es **descartable**: borrarla no borra nada de lo que se pagó por sus videos. Es además el
momento en que el sistema **compra la metadata** que le falta a un video, porque agrupar es la señal
de que alguien lo va a usar de verdad.
*Y esa señal se registra: desde ADR-075 **agrupar es aprobar** — meter a una colección un video del
Feed que nadie calificó lo deja en 👍, nunca pisando un juicio que ya estaba. No es cosmético: un
video sin calificar lo borra el barrido a los 20 días y con él se va su guion crudo, porque solo lo
aprobado llega al histórico.*

**Guion limpio**:
Una versión pulida del guion, **al lado del crudo y nunca encima** (ADR-074): el guion literal que
entrega la corrida se sigue guardando igual y se sigue viendo. Es derivado, opcional y desechable —
se puede tirar y rehacer— y el cockpit muestra los dos, porque una limpieza puede romper la
estructura de lo que se dijo (el caso real: un video de dos voces convertido en monólogo) y eso hay
que poder verlo antes de grabar. Enmienda ADR-009 sin retirarlo.

**Perfil de limpieza**:
Cómo habla una Voz, escrito para que el limpiador la imite (ADR-074). Es de la **empresa** y no del
cockpit —cómo habla Milena no depende del pipeline abierto— y es independiente de los **criterios de
relevancia**, que dicen qué videos sirven y no cómo suena el texto. Sin él la limpieza sale correcta
pero neutra, y el cockpit lo avisa **antes** de gastar.

**El transcriptor**:
Cómo se llama de cara al equipo la máquina que atiende los enlaces pegados, en la familia de *el
motor*, *el buscador de cuentas* y *el archivador*. A diferencia de las otras tres, no corre en n8n:
corre en el cockpit (ADR-031).

**Corrida**:
Una ejecución de una de las máquinas del sistema. Casi siempre es **del motor**, y el resto de este
término habla de esa; pero el archivador, el buscador de cuentas y —desde ADR-062— **el transcriptor**
también abren la suya, que es lo que hace que su gasto se vea en Entender.
Dos modos que **coexisten** en el motor: el **cron semanal** (autónomo, barre los
proyectos activos — el norte "corre sola" de ROADMAP §1) y la **corrida on-demand** (el equipo
prende los proyectos que quiere, fija la `N` de cada uno, y dispara con un botón que corre
**todos los proyectos activos** — la selección se expresa con los toggles, no con un payload).
El on-demand se suma; no retira al cron (decisión 2026-07-15). Cada corrida deja rastro en
`runs`/`outputs`.

**Estado**:
El campo canónico de "decidido" de un Candidato: **nuevo → aprobado | descartado** (binario tras
calificar; ya no existe "publicado"). Es lo que el archivado levanta (`NOT nuevo`) y lo que alimenta
el aprendizaje (`aprobado` = seleccionado; `descartado` = clase negativa). **Se deriva de la
Calificación**, no se decide aparte: un Candidato calificado está decidido.

**Calificación**:
El emoji 🔥/👍/👎 que el equipo le pone a un Candidato, y **el único acto que el equipo hace sobre
él**: 🔥 = aprobado y ejemplar · 👍 = aprobado · 👎 = descartado. De ahí sale el Estado. El 🔥 no
cambia el Estado respecto del 👍; lo que agrega es prioridad como ejemplo positivo al destilar los
criterios aprendidos (ADR-022). Un Candidato sin calificar es un Candidato **sin decidir**, y como
tal se pierde: el archivado nunca lo lleva al histórico.


**Cockpit**:
Un pipeline de una empresa, visto como espacio de trabajo: la unidad que alguien **abre**. No es la
empresa (que cruza pipelines) ni el pipeline (que cruza empresas), sino el cruce de los dos. La
distinción ordena de quién es cada dato: Voces, Proyectos y Referentes son de la **empresa**; los
knobs, el feed y las corridas son del **cockpit**. Y la regla que se sigue de ahí: a qué cockpits
entra alguien lo decide su membresía, pero **qué filas ve adentro lo decide el cockpit abierto**,
nunca el conjunto de empresas que alcanza (ADR-051).

**Fachada**:
El único camino por el que una **máquina** pregunta su config antes de gastar créditos (ADR-028).
Detrás no hay persona: su autoridad es un header compartido más la instancia que dice ser, no una
sesión. Es lo que parte al sistema en **dos clases de lector con autoridades distintas** —quien abrió
un cockpit y quien va a correr un pipeline— y por eso ninguna regla que dependa de "quién está
logueado" alcanza sola (ADR-058).
