# Plan — El modo selección, y que el Feed deje de ser una sala de espera

> **Estado:** acordado con Mani el 2026-08-21, sin construir. Sale de la sesión de `/grill-with-docs`
> posterior al cierre 114. Su decisión de fondo está en
> [ADR-075](../adr/ADR-075-agrupar-es-aprobar.md).
>
> **Qué lo motiva.** El plan de colecciones (`~/.claude/plans/bueno-entonces-pues-como-cryptic-cupcake.md`)
> se dio por agotado con sus fases 0–5 construidas, pero **su §Diseño de UI punto 2 nunca se
> construyó y ningún doc lo anotó**. Sin él, la única puerta a una colección es pegar links: para
> agrupar un video que ya está en pantalla hay que abrirlo, copiar la url, ir a Colecciones y
> pegarla. *La forma del error: una fase se dio por cerrada porque su pantalla nueva funcionaba, sin
> releer qué prometía el plan para las pantallas viejas.*

## 📏 Lo medido contra prod el 2026-08-21, que es lo que ordenó el plan

Todo lo de abajo se midió antes de escribir una línea. Cuatro de las cinco mediciones **corrigen un
doc que estaba mal**.

### 1. 🟢 El canario de ADR-070 se despertó, y el handoff decía lo contrario

`app.grabados` tiene **294 filas**, no las 6 que dice
[verificaciones-humanas §4-quater](../verificaciones-humanas.md). **288 las cargó Majo Duarte el
20/08**, en dos escrituras de 166 y 122.

No se dedujo de los timestamps: `app.eventos` guarda el autor. Dos filas
`historicos.marcar_masivo` con `usuario_id` de Majo, `{nuevos: 166}` y `{nuevos: 122}`, ~50 ms
después de los dos statements. **Es el primer uso real del sistema por alguien que no lo
construyó.**

### 2. La adopción tiene forma de ráfaga, no de hábito

| Persona | Eventos | Días distintos | Qué hizo |
|---|---|---|---|
| Jero | 81 | **1** (07/08) | 80 calificaciones |
| Juan José Gaitán | 23 | **1** (07/08) | 14 reintentar, 8 pegar |
| **Majo Duarte** | **2** | **1** (20/08) | los 288 grabados |
| Alejo Carvajal | 2 | 1 (01/08) | auditar, calificar |
| Alejandro Dávila | 1 | 1 (05/08) | crear una voz |

Nadie vuelve. Cada quien entró un día, resolvió una tarea puntual y no volvió.
*Caveat medido: `app.eventos` registra **escrituras**. Alguien que solo lee el Feed es invisible acá,
y la descarga de los `.xlsx` de Históricos es la única escritura que no emite evento.*

### 3. 🔴 "Archivar ahora" archiva 2 y borra 67

El botón **ya existe** en Operar y ya es como el archivado corre de verdad: **5 de las últimas 6
corridas fueron `on_demand`, no cron**. Majo lo ve (rol `operador` alcanza las 5 zonas,
`domain/roles.ts:57`) y nunca lo apretó.

Pero dispara el workflow entero, y ahí adentro está `Barrer candidatos sin calificar`, que borra
`estado = nuevo` con más de 20 días:

```
candidatos en el feed:   101   (99 sin calificar + 2 aprobados)
corte del barrido:       2026-08-01 18:55
>>> borraría HOY:         67   (los 67 del 01/08, que cumplieron 20 días justo hoy)
```

Y el mensaje de éxito del botón dice *"los aprobados aparecen en Históricos y salen del feed"* —
**no menciona el borrado**. La UI hoy miente por omisión, y eso ya pasa en Operar.

### 4. 🩸 El guion crudo que se pierde solo (→ ADR-075)

`Leer Candidatos calificados` archiva `estado <> nuevo`; el barrido borra `estado = nuevo` a los 20
días. Un video **sin calificar** metido a una colección pierde su guion crudo en esa ventana:
`leerCrudo()` busca en `transcripciones → candidatos → outputs` y se queda sin dónde mirar.
**Hoy no hay daño: `app.colecciones` tiene 0 filas.** El modo selección lo iba a llenar de casos.

### 5. Pegar links ya dedupea, y por un mecanismo mejor del que se creía

`agregarMiembros()` hace upsert con `ignoreDuplicates` sobre la PK. Un link que ya está en esa
colección cuenta como *"ya estaba"*. Y **no hay import**: `leerLoQueSeSabe()` cruza
`candidatos + videos_meta + outputs` **en cada lectura**, así que un link del Feed entra y su tarjeta
sale completa sin copiar nada. Por eso el mismo video en dos colecciones cuesta cero.
*No hay nada que construir acá. Se documenta porque se preguntó y porque la respuesta parece un bug.*

---

## Las decisiones tomadas en la sesión

| # | Pregunta | Decisión |
|---|---|---|
| 1 | ¿Cómo se "manda al histórico ya"? | **Traer al Feed el botón que ya existe.** Cero lógica nueva: usa el workflow que ya corre así |
| 2 | ¿Y el barrido que borra 67? | **Que el botón diga la verdad**, con los números contados en el momento y confirmación explícita |
| 3 | ¿Qué acciones tiene la barra de lote? | Las cuatro, **pero filtradas por pantalla** — máximo 3 donde más hay |
| 4 | ¿Agregar a colección aprueba? | **Sí, 👍** (ADR-075). Nunca pisa una calificación existente |
| 5 | ¿Cómo se prende el modo? | **Botón `Seleccionar` en la cabecera.** En reposo la pantalla es idéntica a hoy |

### La matriz de acciones, que es lo que evita saturar

| Pantalla | Barra | Por qué no las otras |
|---|---|---|
| **Feed** | Agregar a colección · Calificar 🔥👍👎 · Archivar ahora | *Grabado* no aplica: todavía no se grabó |
| **Transcribir** | Agregar a colección · Marcar grabado | no hay candidato que calificar ni archivar |
| **Históricos** | Agregar a colección · Marcar grabado | ídem |
| **Detalle de colección** | Quitar seleccionados · (Limpiar y Descargar, que ya están) | ya está adentro de una bolsa |

**Ninguna pantalla muestra una acción que no puede ejecutar.** Es la regla, no una casualidad del
diseño actual: la barra recibe sus acciones como prop, igual que el slot de la tarjeta.

---

## Fases

Cada fase termina con `npm run typecheck && npm test` en verde y algo verificable en pantalla.

### Fase 0 — Los docs que hoy están mal ⬜

Va primero porque son 15 minutos y porque **dos de ellos disparan una falsa alarma si alguien los usa
hoy**. Cero código.

| Doc | Qué dice | Qué es verdad |
|---|---|---|
| `CLAUDE.md` + `handoff.md` | la `033` está *"escrita y SIN APLICAR"* | **está aplicada**: `transcripciones.grabado_en` da `42703` en PostgREST |
| `verificaciones-humanas.md` §4-quater | *"Grabados = 6"* | **294**, y el doc ya avisa que ese número se re-mide, no se lee |
| `CLAUDE.md` | *"el canario de ADR-069/070 sigue en CERO"* | **se despertó**: 288 marcas de Majo |
| `ROADMAP.md` §1 punto 7 | *"Descargar CSV"* | desde ADR-071 son **dos `.xlsx`**. Arrastre de otro cierre |
| `docs/adr/README.md` | índice hasta la **069** | faltan **070–075**, seis ADRs sin registrar |
| `CLAUDE.md` | *"ADRs 001–069"* | son 001–075 |

**Verifica:** `npm run validate` en verde, y `grep -c "^| \[ADR-" docs/adr/README.md` da 75.

### Fase 1 — El modo selección, con una sola acción 🔧 EN CURSO

> **⏸️ Cortada a mitad el 2026-08-21 (Mani tuvo que cerrar el computador). El repo compila, los 368
> tests pasan y el build sale — es seguro retomar desde acá.**
>
> **Hecho y commiteado:**
> - `components/video/seleccion.tsx` — `usarSeleccion()` (el estado, con `Set` para que `marcado()`
>   no sea lineal en 400 tarjetas), `BotonSeleccionar`, `CasillaSeleccion`, `BarraSeleccion`.
> - `components/video/tarjeta.tsx` — prop `seleccion` opcional: con ella la tarjeta **marca en vez
>   de abrir** y el blanco es la tarjeta entera, no una casilla de 20 px. Sin ella se comporta
>   idéntico a antes.
> - `lib/candidatos.ts` — `aprobarSiEstanSinCalificar()`, o sea ADR-075. Es **sumidero**: si falla,
>   el video igual quedó en la colección.
> - `curar/colecciones/actions.ts` — `agregarSeleccionados()` (crea la colección en el mismo acto si
>   le pasás `nombreNuevo`) y `coleccionesParaElegir()`.
> - `components/video/agregar-a-coleccion.tsx` — el diálogo, compartido por las cuatro pantallas.
> - **El Feed ya está cableado entero** (`curar/feed/mazo.tsx` + `tarjeta.tsx`).
>
> **Lo que falta, en orden:**
> 1. **Verificarlo en el navegador.** Nada de esto se probó en pantalla todavía — es lo primero.
>    (Mani tiene que entrar él y dejar la sesión abierta.)
> 2. **Cablear Transcribir** (`transcribir/tanda.tsx` + `tarjeta-cola.tsx`) y **Históricos**
>    (`curar/historicos/lista.tsx`). Las dos ya dibujan `TarjetaVideo`, así que es pasarle la prop
>    `seleccion` y montar `BarraSeleccion` + `AgregarAColeccion`. **Ojo con la clave**: el Feed usa
>    el `id` del candidato como clave de selección y resuelve la url por `urlPorClave`; esas dos
>    pantallas tienen `Video`, así que su clave natural es `v.clave` y la url sale de `v.url`.
> 3. **El detalle de la colección**, que hoy tiene su propio mecanismo de marcado para
>    `Quitar seleccionados` — unificarlo es la Fase 3.
>
> ⚠️ **Antes de dar la fase por cerrada, releer qué promete el plan para las pantallas que no se
> tocaron.** Es exactamente así como se perdió el modo selección la primera vez.



El corazón. Se construye **completo pero con una sola acción en la barra** (*Agregar a colección*),
que es lo que destraba el pedido de Majo. Las otras tres entran en la Fase 3 sobre la misma máquina.

- `components/video/seleccion.tsx`: el hook de estado (qué está marcado, prendido/apagado) + la barra
  fija. Recibe sus acciones como prop; **no sabe de colecciones ni de nada**.
- El botón `Seleccionar` en la cabecera de las tres pantallas.
- La casilla entra por el **slot de la tarjeta que ya existe**, sin tocar `TarjetaVideo`.
- La acción *Agregar a colección*: selector de las colecciones existentes + *crear una nueva*.
- **ADR-075**: si el video es un candidato con `estado = nuevo`, el mismo clic lo deja en 👍 por
  `camposDeCalificacion()`. Si ya tenía calificación, **no se toca**.

**Verifica en pantalla:** marcar 3 videos en el Feed, agregarlos a una colección nueva, y (a) abrir
la colección y ver las 3 tarjetas con su guion, (b) volver al Feed y ver que los 3 quedaron en 👍,
(c) marcar uno que ya tenía 👎 y confirmar que **sigue en 👎**.
**Verifica en la base:** `app.colecciones_videos` con 3 filas y `candidatos.calificacion` movida
solo en los que estaban en `nuevo`.

### Fase 2 — Archivar ahora en el Feed, diciendo la verdad ⬜

- El botón entra en la cabecera del Feed, al lado de `Seleccionar`.
- **Antes de disparar, cuenta contra la base** y lo dice: *"Archiva N aprobados y **borra M** sin
  calificar de más de 20 días. ¿Seguimos?"*. La cuenta se hace en el momento, no se cachea —
  *medir el martes no autoriza a borrar el jueves*.
- El mismo aviso se corrige **en Operar**, donde el botón ya existe y ya miente.

**Verifica:** con los números de hoy tiene que decir **2 y 67**. Y después de correrlo, `outputs`
sube 2 y `candidatos` baja 69.
⚠️ **Esto gasta y borra: la corrida de verificación la aprieta Mani, no un agente.**

### Fase 3 — Las tres acciones que faltan en la barra ⬜

Sobre la máquina de la Fase 1, sin tocarla:

- **Marcar grabado** en lote (Transcribir e Históricos) — `marcarMuchos()` ya existe.
- **Calificar 🔥👍👎** en lote (solo Feed).
- **Quitar seleccionados** en el detalle de la colección, unificando el patrón: hoy esa barra es un
  mecanismo aparte del modo selección.

**Verifica:** las 4 pantallas muestran exactamente las acciones de la matriz de arriba, y ninguna
muestra una que no puede ejecutar.

### Fase 4 — Los canarios, redefinidos para que midan algo ⬜

🔑 **El canario de `app.grabados` se contaminó el mismo día en que se escribió como métrica.** Con
288 marcas de una carga masiva, `count(*)` ya no distingue adopción de backfill. Los tres se
redefinen **por fecha y por autor**, no por total:

```sql
-- Grabados: marcas nuevas desde que se midió, sin contar la carga masiva de Majo.
select count(*) from app.grabados where grabado_en > '2026-08-21';

-- Guion limpio (ADR-074): las 4 que hay son de Mani. Adopción = la fila 5, de otra persona.
select count(*) from app.guiones_limpios where creado_por <> '<mani>';

-- Metadata comprada (ADR-072): las 5 que hay son verificaciones. Adopción = la fila 6.
select count(*) from app.videos_meta;

-- Colecciones (ADR-073): hoy CERO. El canario más limpio de los cuatro, porque nace sin ruido.
select count(*) from app.colecciones;
```

**A revisar el 2026-09-04.** Y la pregunta que ninguno de los cuatro contesta: *¿alguien volvió un
segundo día?* Eso se lee de `app.eventos`, contando **días distintos por persona**, no eventos.

### Fase 5 — Las verificaciones humanas ⬜

[§4-quater](../verificaciones-humanas.md) sin re-correr sobre el build nuevo, más lo que agrega este
plan. Cada una necesita ojos, no un agente: apretar el botón y mirar.

- Los 7 pasos de §4-quater, **con los números re-medidos** (no los 6 que dice el doc).
- Abrir el `.docx` de la colección **en Word**. `file` y `textutil` son dos señales de que el
  paquete es válido; ninguna es Word.
- El modo selección **en celular**. Majo cura desde donde puede, y el botón `Seleccionar` se eligió
  justamente porque el hover no existe ahí.

---

## Fuera de alcance (dicho, no hecho)

- **Sacar el barrido del disparo manual.** Se evaluó y se descartó a favor de decir la verdad: toca
  n8n, y ahí un cambio de topología sigue siendo re-import manual.
- **Que el barrido saltee lo que está en una colección.** Descartado en ADR-075: protege la fila, no
  el hecho. El guion sigue sin llegar a `outputs`.
- **Copiar el guion crudo a `colecciones_videos`.** Contradice ADR-073.
- **Editar el guion limpio**, **enriquecer al pegar** y el **backfill de las 172 miniaturas**. Siguen
  fuera, por las mismas razones del plan anterior.
- **Virtualizar las grillas.** 100 tarjetas se recorren; el plegado por grupo ya difiere la carga.
