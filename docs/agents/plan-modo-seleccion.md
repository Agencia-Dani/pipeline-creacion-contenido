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

### 2. 🟢 Majo VOLVIÓ un segundo día — y estaba usando el cockpit mientras se escribía esto

> ⚠️ **Este párrafo decía lo contrario hace tres horas, y por eso está escrito así.** Medido a las
> 18:55 UTC, la conclusión era *"la adopción tiene forma de ráfaga, no de hábito: nadie vuelve"*.
> Re-medido a las **21:20 UTC del mismo día**, es falso: Majo entró de nuevo y **calificó 37 videos
> y creó 6 referentes**, con su último evento a las 20:52 — o sea **media hora antes**. *Un canario
> se re-mide, no se cita: el mío tenía tres horas y ya mentía.*

**Días distintos por persona** (la pregunta que ningún `count(*)` contesta), al 21/08 21:20:

| Persona | Días | Cuáles |
|---|---|---|
| *(Mani)* | 8 | del 29/07 al 21/08 |
| **Majo Duarte** | **2** | **20/08 y 21/08** ← la primera persona fuera de Mani que vuelve |
| Jero | 1 | 07/08 (80 calificaciones de una sentada) |
| Juan José Gaitán | 1 | 07/08 |
| Alejandro Dávila | 1 | 05/08 |
| Alejo Carvajal | 1 | 01/08 |

Lo que queda en pie de la lectura vieja: **los demás siguen sin volver.** Lo que se cayó: que eso
fuera una propiedad del equipo. Majo, que es quien pidió las features de esta semana, es también la
única que volvió — *la adopción sigue a lo pedido, no a lo construido.*

*Caveat medido: `app.eventos` registra **escrituras**. Alguien que solo lee el Feed es invisible acá,
y la descarga de los `.xlsx` de Históricos es la única escritura que no emite evento.*

🔴 **Consecuencia operativa inmediata: hay una persona trabajando en prod.** Un deploy a `main`
cambia la app abajo de sus pies. Cualquier push de este plan se coordina con ella o espera.

### 3. 🔴 "Archivar ahora" archiva 2 y borra 67

El botón **ya existe** en Operar y ya es como el archivado corre de verdad: **5 de las últimas 6
corridas fueron `on_demand`, no cron**. Majo lo ve (rol `operador` alcanza las 5 zonas,
`domain/roles.ts:57`) y nunca lo apretó.

Pero dispara el workflow entero, y ahí adentro está `Barrer candidatos sin calificar`, que borra
`estado = nuevo` con más de 20 días:

```
18:55 UTC →  101 candidatos (99 sin calificar + 2 decididos) ·  archivaría 2, borraría 67
21:20 UTC →  101 candidatos (64 sin calificar + 37 decididos) · archivaría 37, borraría 41
```

**Los dos renglones son del mismo día y la diferencia es Majo calificando en vivo.** Es exactamente
por eso que el botón cuenta **al apretar** y no muestra un número guardado: cualquier cifra que este
doc publique nace vieja.

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

### Fase 0 — Los docs que hoy están mal ✅

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

### Fase 1 — El modo selección, con una sola acción ✅

> ✅ **Verificado en el navegador el 2026-08-21 21:30–21:45, en las cuatro pantallas.** Todo contra
> prod, con la base como segunda señal de cada cosa que se vio en pantalla.
>
> | Qué | Cómo se vio | Qué dijo la base |
> |---|---|---|
> | El modo prende y apaga | el botón desaparece, 64 tarjetas pasan a *"Seleccionar…"*, aparece la barra | — |
> | Agregar 3 **ya calificados** | *"Colección creada · 3 agregados."* | 3 miembros con su `(plataforma, external_id, url)`, y el evento con **`aprobados: 0`** |
> | Agregar 1 **sin calificar** | mismo flujo | evento con **`aprobados: 1`**, y el candidato en `calificacion: 👍`, `estado: aprobado`, con `fecha_calificacion` — **los tres campos juntos** |
> | Sacar 2 de una colección de 3 | *"2 videos sacados de la colección"*, queda 1 tarjeta | `{pedidos: 2, idas: 2}` y 1 miembro |
> | Transcribir | `Seleccionar` **solo aparece con la tanda abierta**, que es el diseño: las filas bajan al expandir | — |
> | Históricos | los 3 chips cierran: **88 + 294 = 382** | — |
>
> 🔑 **ADR-075 quedó verificada en sus DOS direcciones**, que es lo que importaba: aprueba lo que
> estaba en `nuevo` (`aprobados: 1`) y **no toca** lo que ya tenía juicio (`aprobados: 0`).
>
> 💰 **Cero gasto:** `app.videos_meta` valía 5 antes y 5 después. Las dos colecciones de prueba se
> borraron, así que los canarios quedan en cero y `guiones_limpios` intacto en 4.
>
> 🩸 **Dos cosas que solo aparecieron mirando:**
> 1. **Dos botones con el mismo texto en Históricos.** El de la barra decía *"Marcar como grabados"*,
>    igual que el del cuadro de pegar links, haciendo cosas distintas. Ahora dice *"Marcar los
>    seleccionados como grabados"*.
> 2. **Los números de este doc estaban mal.** Ver la medición 3 y la §4-quater de
>    [verificaciones-humanas](../verificaciones-humanas.md).

### Fase 2 — Archivar ahora en el Feed, diciendo la verdad ✅

- El botón entra en la cabecera del Feed, al lado de `Seleccionar`.
- **Antes de disparar, cuenta contra la base** y lo dice: *"Archiva N aprobados y **borra M** sin
  calificar de más de 20 días. ¿Seguimos?"*. La cuenta se hace en el momento, no se cachea —
  *medir el martes no autoriza a borrar el jueves*.
- El mismo aviso se corrige **en Operar**, donde el botón ya existe y ya miente.

**Verifica:** con los números de hoy tiene que decir **2 y 67**. Y después de correrlo, `outputs`
sube 2 y `candidatos` baja 69.
⚠️ **Esto gasta y borra: la corrida de verificación la aprieta Mani, no un agente.**

### Fase 3 — Las tres acciones que faltan en la barra ✅

Sobre la máquina de la Fase 1, sin tocarla:

- **Marcar grabado** en lote (Transcribir e Históricos) — `marcarMuchos()` ya existe.
- **Calificar 🔥👍👎** en lote (solo Feed).
- **Quitar seleccionados** en el detalle de la colección, unificando el patrón: hoy esa barra es un
  mecanismo aparte del modo selección.

**Verifica:** las 4 pantallas muestran exactamente las acciones de la matriz de arriba, y ninguna
muestra una que no puede ejecutar.

### Fase 4 — Los canarios, redefinidos para que midan algo ✅

🔑 **El canario de `app.grabados` se contaminó el mismo día en que se escribió como métrica.** Con
288 marcas de una carga masiva, `count(*)` ya no distingue adopción de backfill. Los tres se
redefinen **por fecha y por autor**, no por total:

```sql
-- Grabados: marcas nuevas desde que se midió, sin contar la carga masiva de Majo.
select count(*) from app.grabados where grabado_en > '2026-08-21';

-- Guion limpio (ADR-074): 🟢 DESPIERTO. Este renglon decia "las 4 que hay son de Mani, adopcion =
-- la fila 5" y era falso desde el 26/08: hay 65 filas y 61 son de MAJO (34 con voz, 27 sin voz).
-- Redefinido, como el de grabados, por fecha:
select count(*) from app.guiones_limpios where actualizado_en > '2026-08-29';

-- Metadata comprada (ADR-072): las 5 que hay son verificaciones. Adopción = la fila 6.
select count(*) from app.videos_meta;

-- Colecciones (ADR-073): ya no nace limpio. Al 29/08 queda 1 ("Test", de Mani) y Majo la USO el
-- 26/08 (5 agregar + 5 limpiar + 3 descargar + 2 quitar), asi que el uso no se lee del count.
-- La bolsa es descartable por diseno: se lee de app.eventos, no de la tabla.
select count(*) from app.colecciones;   -- <- ya no distingue adopcion de "hoy hay una".
```

**A revisar el 2026-09-04.**

### 📏 Re-medidos el 2026-08-29 (y dos de los cuatro estaban mal)

| Canario | Lo que decía | Lo que da |
|---|---|---|
| `grabados > '2026-08-21'` | 2 | **2** ✅ |
| `guiones_limpios` | *"4, todas de Mani"* | 🟢 **65, y 61 son de Majo** — despierto hace 3 días |
| `videos_meta` | *"5 verificaciones, adopción = la 6"* | **5** ✅ (se contó 4 una vez por pedir una columna que no existe: **un canario mal consultado miente igual que uno mal escrito**) |
| `colecciones` | *"hoy CERO"* | **1** — pero Majo ya las usó, así que el `count(*)` dejó de medir adopción |

**Y la pregunta que ninguno de los cuatro contesta —*¿alguien volvió un segundo día?*— se lee de
`app.eventos` contando DÍAS DISTINTOS por persona.**

⚠️ **Acá vivía la tabla con los números, y se borró a propósito el 2026-08-31.** Estaba copiada
igual en `CLAUDE.md` y en `verificaciones-humanas.md`, y las tres vencían juntas cada vez que
alguien usaba el cockpit: decían *"374 eventos, volvieron dos"* cuando ya eran 613 y cuatro. **El
dueño de este dato es `app.eventos`**; la consulta está en
[verificaciones-humanas.md](../verificaciones-humanas.md). Un canario se re-mide, no se cita — y
copiarlo a tres lugares es garantizar que dos estén mal.

🔑 **Son DOS los que volvieron, no una.** Majo (3 días) y Manuel 30X (2). Y el más productivo en un
solo día sigue siendo **Jero, con 81 eventos el 07/08 — y no volvió nunca.** *Ésa es la pregunta
viva del producto, y no la contesta ningún `count(*)`.*

⚠️ **Cómo se rompió esta medición dos veces el 29/08, para que no se repita:** primero un loop que
se murió imprimiendo un `usuario_id` nulo y dejó una lista **parcial** que parecía completa (Juan
José desaparecía); después la sospecha de que PostgREST había truncado a 1000 filas, que también era
falsa (son 374). **La verificación que la cerró no fue mirar de nuevo: fue que la suma por persona
diera el total exacto de la tabla.**

### Fase 5 — Las verificaciones humanas ⬜

[§4-quater](../verificaciones-humanas.md) sin re-correr sobre el build nuevo, más lo que agrega este
plan. Cada una necesita ojos, no un agente: apretar el botón y mirar.

- Los 7 pasos de §4-quater, **con los números re-medidos** (no los 6 que dice el doc).
- Abrir el `.docx` de la colección **en Word**. `file` y `textutil` son dos señales de que el
  paquete es válido; ninguna es Word.
- El modo selección **en celular**. Majo cura desde donde puede, y el botón `Seleccionar` se eligió
  justamente porque el hover no existe ahí.

---

### Fase 6 — El motor: el emoji partido ✅

> Entró el 2026-08-21 sin estar planeado: Majo apretó ▶ y la corrida murió a los 33 minutos.

**✅ Hecho:** la causa está encontrada, arreglada en el repo, con test de regresión, y **las 70 filas
se rescataron de los datos de la ejecución sin volver a pagar nada** (`app.candidatos` 101 → 171).
El detalle vive en el commit y en el handoff.

**Lo que quedó:**

1. ✅ ~~n8n caído~~ — volvió el 22/08 02:45 UTC. El fix se empujó con `n8n:push` y **`n8n:diff` da
   los 5 workflows en verde**. Rollback: `.n8n-snapshots/motor-2026-08-22T02-47-30-975Z.json`.
2. ⬜ **Una corrida real con el fix adentro.** La 136 fue la última y murió; nada probó todavía el
   camino completo en vivo. Cuesta plata, así que la aprieta Mani.
3. ⬜ **Mirar si la caída y la corrida están relacionadas.** Es una hipótesis, no un hallazgo: la
   ejecución 136 dejó un payload de **37 MB** y murió 20:24; el 502 se midió 21:50. *No se midió
   nada que las conecte* — hace falta el log del pod.
4. ⚠️ **Los ~250 videos quemados no vuelven.** Están en `processed_items`, así que el motor no los
   va a proponer nunca más. Los 70 que importaban ya están en el Feed; el resto se perdió.

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
