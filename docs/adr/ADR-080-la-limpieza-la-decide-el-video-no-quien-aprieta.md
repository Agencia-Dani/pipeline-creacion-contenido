# ADR-080 — La limpieza la decide el video, no quien aprieta el botón

- **Estado:** aceptada — 2026-08-29 (pedido de Mani: *"no debería ser necesario elegir la voz, sino
  que solo se aplican los criterios de cada voz sobre los videos respectivos"*).
  **Enmienda [ADR-074](./ADR-074-el-guion-limpio-es-un-artefacto-nuevo.md)**, que creó la limpieza
  con un selector de voz por tanda. **No toca `core/`, sin migración**: `app.guiones_limpios` ya
  tiene `voz_id` y `criterios_hash` desde la `032`; lo que cambia es **quién los decide**.

- **Contexto:** limpiar un guion aplica dos cosas — los **criterios de la casa** (7 reglas de la
  agencia, iguales para todos) y **cómo habla la voz** que va a grabar (`voces.perfil_limpieza`).
  Los criterios de la casa **ya se aplicaban siempre**, con voz y sin voz: `armarPrompt()` los pone
  de base y el perfil se **suma**, nunca reemplaza. Eso no era el problema.

  El problema era el selector: **una sola voz para toda la tanda**, elegida por quien aprieta.

  📏 **Medido contra prod el 2026-08-29, y ya estaba pasando:**

  | | |
  |---|---|
  | Guiones limpios en el sistema | **65** — 61 los hizo **Majo el 26/08** |
  | De ésos, limpiados **sin voz** | **26 de 57** en la colección *Test* |
  | Voz real de esos 57 videos | **los 57 son de Juan Pablo Vieira** — y él **sí** tiene perfil cargado |
  | Candidatos vivos en el feed | **209: 96 de Juan Pablo, 61 de Milena, 52 de Rosario** |

  🩸 **Los dos modos de falla, y los dos son silenciosos:**
  1. **El que ya ocurrió:** 26 guiones se limpiaron *sin voz* cuando su voz tenía perfil cargado.
     Salieron correctos pero neutros, y **nadie podía notarlo**: la pantalla no decía con qué
     criterios había salido cada guion.
  2. **El que iba a ocurrir:** una colección con videos de dos voces —el caso normal, porque el feed
     tiene las tres— recibe **la voz de una aplicada a los videos de la otra**. No pasó todavía sólo
     porque la única colección viva resultó ser de una sola voz.

  🔑 **Y el video sí sabe de quién es.** `app.candidatos` trae `voz_id`, y `outputs.metadata.voz`
  trae el nombre para lo ya archivado. **Medido: 57 de 57** resuelven voz. *La decisión se le estaba
  pidiendo a una persona teniendo el dato en la fila.*

- **Decisión:**
  1. **Se elimina el selector de voz.** `limpiarFaltantes` ya no recibe `vozId`: resuelve la voz
     **por video**, y arma su prompt con los criterios de la casa **más** el perfil de esa voz.
  2. **La voz sale de `leerLoQueSeSabe`, la misma fusión que pinta la grilla**, no de una consulta
     propia. Así *la voz con la que se limpia es la que la tarjeta muestra*: no hay una segunda
     derivación que pueda discrepar de lo que el equipo ve. La precedencia es la del array
     (candidatos → meta → histórico), o sea **el uuid del feed vivo le gana al nombre del archivo**.
  3. **`criterios_hash` pasa a calcularse por video**, no por tanda. Dos guiones de la misma
     colección limpiados con voces distintas tienen que quedar con huellas distintas, o `estaAlDia`
     diría que uno está al día contra el criterio del otro.
  4. **Un video sin voz se limpia igual, solo con los criterios de la casa.** No es un caso
     degradado: es un link pegado a mano que no salió de ningún proyecto, y es la mitad del uso real
     (27 de las 61 limpiezas de Majo).
  5. **Los criterios de la casa se muestran en la pantalla, solo lectura.** Gobiernan toda limpieza
     y hasta hoy no había forma de leerlos sin abrir el código. *Un criterio que no se puede leer no
     se puede discutir, y el que no se discute se sufre.*
  6. **Cada guion limpio dice con qué criterios salió** (*"con los criterios de la casa + cómo habla
     X"* / *"solo con los criterios de la casa"*). Es lo que vuelve visible el modo de falla #1.

- **Alternativas descartadas:**
  - *Atar la colección a una voz y no dejar mezclar* (la primera intuición de Mani): resuelve el
    modo de falla #2 rompiendo lo que la colección **es** — *"apartá los videos que vas a trabajar
    juntos, vengan de donde vengan"*. Y **no resuelve el #1**, que es el que ya ocurrió 26 veces. Un
    mismo video puede además servirle a dos voces, y la colección dejaría de poder decirlo.
  - *Dejar el selector y sólo avisar cuál voz corresponde:* documenta el error en vez de evitarlo, y
    pone la carga de acertar en quien menos contexto tiene en ese momento.
  - *Hacer editables los criterios de la casa desde un textarea:* pedido en la misma conversación y
    **aplazado a propósito**. La decisión de que vivan en código está escrita en `domain/limpieza.ts`
    y sigue en pie: son de la agencia, valen para toda voz, y el punto 4 del prompt tiene una trampa
    que costó descubrir (está escrito en voseo rioplatense, con un párrafo entero explicándole al
    modelo que **no lo copie** al guion). Un editor libre invita a borrar ese párrafo sin saber para
    qué estaba. **Se reabre cuando alguien choque contra un criterio**, no antes — y hoy nadie chocó:
    27 de 61 limpiezas se hicieron con los criterios de la casa puros y no hubo queja.
  - *Guardar un limpio por (video, voz):* cambiaría la PK de la `032` y con eso el modelo entero
    (`(instance_id, plataforma, external_id)`). Vale el día que un mismo video se grabe para dos
    voces distintas; hoy no pasó nunca y sale como su propia decisión, con la evidencia.

- **Consecuencias:**
  - (+) **Un acto menos y una forma menos de equivocarse.** El botón deja de tener una decisión
    adentro.
  - (+) **Los guiones salen mejor sin que nadie haga nada distinto:** los videos de una voz con
    perfil dejan de limpiarse en neutro por olvido.
  - (+) `criterios_hash` empieza a significar algo por fin: con la huella por video, `estaAlDia`
    puede señalar de verdad los limpios viejos.
  - (−) 🔴 **Los 65 guiones que ya existen no se re-limpian solos, y 26 quedaron neutros.**
    Re-limpiar cuesta plata y esa decisión es de una persona (ADR-074 ya lo estableció). Lo que sí
    cambia es que **ahora se ve**: cada guion dice con qué criterios salió.
  - (−) **La voz depende de que el video esté en `candidatos` u `outputs`.** El barrido del domingo
    vacía `candidatos`, pero lo calificado pasa a `outputs`, así que la cadena aguanta. Lo que no
    tiene voz es lo pegado a mano — y ése es el caso #4, que ya está resuelto.
  - (−) **Renombrar una voz deja huérfanas las filas viejas de `outputs`**, que guardan el nombre y
    no el uuid. Degrada a *sin voz* —criterios de la casa— y nunca a la voz equivocada: el único
    error que costaría plata y saldría mal escrito.

- **Toca `core/`:** no. Sin migración y sin cambio de contrato. Cambia `domain/video.ts` (el video
  gana `vozId`), `lib/videos.ts` (las fuentes lo aportan), `lib/guiones-limpios.ts`, y la zona
  `curar/colecciones` del cockpit.
