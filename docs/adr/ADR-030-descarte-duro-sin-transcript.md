# ADR-030 — Descarte duro de los videos sin transcript (revierte la decisión #6)

- **Estado:** aceptada — 2026-07-24 (audit del run manual de Jero, con Mani). **Revierte la decisión #6**
  (2026-07-09: "sin transcript pasa igual, con marca `⚠️ SIN GUION`") y **acota el invariante #1**
  (fail-open) del [CLAUDE.md del motor](../../Workflows/workflow-short-form-content/CLAUDE.md).
- **Contexto:** el gate juzga el `script` (transcript traducido) o, si no hay, el caption como fallback,
  y el candidato salía igual con el título prefijado `⚠️ SIN GUION`. En el run del 23/07, **8 de 31
  candidatos (26%) llegaron sin guion** — casi siempre videos sin voz (música, texto en pantalla). El
  equipo de redes los descarta de una: no aportan (el entregable es el guion, ADR-009) y **queman
  cupo** (consumen un lugar de los N del proyecto). Upstream, 41 de 100 transcripciones volvieron
  vacías (41%): parte es Supadata fallando, parte son videos que no tienen voz que transcribir.
- **Decisión:**
  1. **Sin transcript = descarte duro, en la entrada del `Gate de relevancia`.** Es el punto exacto:
     ya se sabe si hay guion (post-Transcribir) y todavía no se gastó Haiku (pre-juicio). Los sin-guion
     salen marcados `_descarte: true, descarte_razon: 'sin_guion'`. Reusa la semántica `_descarte` de
     [ADR-021](./ADR-021-medicion-desempeno-embudo.md): `Armar candidato` ya los filtra → **no consumen
     N** (test en verde). No se les gasta ni una llamada a Haiku.
  2. **Se retira el fallback por caption en el gate.** Un caption no es un guion; juzgar por caption era
     lo que dejaba pasar los sin-voz. El gate solo juzga lo que tiene transcript.
  3. **Los descartes por sin_guion NO van a `Descartes del gate`.** Esa tabla es para auditar el
     *criterio* (veredicto "era bueno" = falso negativo); llenarla de videos mudos rompe ese loop
     (ADR-022) y se comería el `cap_descartes`.
  4. **El prefijo `⚠️ SIN GUION` en `Armar candidato` queda como tripwire:** si alguna vez aparece en el
     feed, es un bug upstream (ya no debería llegar ninguno).
  5. **Mitigación del 41% de vacías:** `Transcribir` reintenta 1 vez cuando la llamada falla o vuelve
     vacía (respetando el presupuesto) y **loguea la respuesta cruda** de las que quedan vacías, para
     distinguir "sin voz" (no reintentar nunca) de falla transitoria en la corrida de fuego.
- **Consecuencia dura, dicha sin eufemismo:** si Supadata se cae **entera**, la corrida entrega **0** —
  todo se descarta por sin_guion. Se prefiere una corrida vacía y **ruidosa** (aviso en
  `metricas.avisos`: "posible caída de Supadata: X% de transcripciones vacías") a un feed con 26% de
  basura que el equipo tira a mano. `Resumen del run` reporta `sin_guion` (videos descartados) y
  `transcripciones_vacias` (videos distintos sin transcript a la salida de Transcribir).
- **Interacción con la entrega (Falla 2 del audit):** descartar los sin-guion **baja el supply** que
  llega a candidato (~25% en el run del 23/07). Se compensa subiendo `cap_top_n` 100→250 y el
  presupuesto de transcripción a 840s (bajo el watchdog de 900s del pod) — más videos entran a
  transcribir. **N sigue siendo un techo exacto + meta best-effort** (ADR-016/024): garantizar N=40
  duro con supply finito es imposible sin bajar el gate a cero. Lo que se garantiza nuevo es
  **visibilidad**: `metricas.por_proyecto` reporta `tasa_gate` y `razon_faltante`
  (`supply`/`gate`/`mixta`) por proyecto. La palanca de fondo para llenar N es **más referentes
  activos** (el descubrimiento de ADR-020 los propone; el equipo aprueba).
- **Alternativas descartadas:**
  - *Mantener la decisión #6 (marca visible, no descarte):* es lo que el equipo ya rechazó; los
    ⚠️ SIN GUION son descarte automático de ellos, así que la marca solo movía el trabajo aguas abajo.
  - *Descartar en `Armar candidato` en vez del gate:* más tarde, gastaría Haiku en videos mudos.
  - *"Modo reponer" (segunda pasada si entregados < N):* re-scrapea el mismo supply contra la misma
    memoria de dedup → mismo pool, doble costo, cero candidatos nuevos. Con `razon_faltante` visible, la
    respuesta correcta a un faltante es operativa (más referentes / aflojar criterios), no mecánica.
- **Toca:** `Gate de relevancia` (split sin-guion, sin fallback por caption, log por proyecto),
  `Preparar batch Descartes` (excluye sin_guion), `Transcribir (Supadata)` (retry + log crudo),
  `Armar candidato` (prefijo → tripwire), `Resumen del run` (`sin_guion` redefinido +
  `transcripciones_vacias` + aviso). Config: `cap_top_n` 250, `presupuesto_transcribir_s` 840
  (+ `workflow.yaml`). Docs: onboarding del equipo, dev-doc, CLAUDE.md. Probado en `test-nodos.mjs`
  (harness `runGate`, 5 casos + 2 de retry). Sin cambio de schema SQL (`runs.metricas` es jsonb).

---

## Enmienda 2026-08-31 — el §5 estaba a medias: se logueaba la diferencia y se actuaba igual

**Estado:** aceptada — 2026-08-31, del audit de la corrida `ecd33926` (Mani, a pedido de Majo).
Completa la decisión §5; no revierte nada.

### Qué decía el §5, y qué faltaba

El §5 mandaba reintentar 1 vez y **loguear la respuesta cruda** de las que quedan vacías *"para
distinguir «sin voz» (no reintentar nunca) de falla transitoria"*. La primera mitad se hizo. **La
segunda nunca:** el log distinguía los dos casos y el código los trataba idéntico, con un único
reintento **inmediato** que caía dentro de la misma ráfaga que había causado la falla.

Y esa mitad faltante no era cosmética. `metricas.avisos` venía diciendo *"posible caída de
Supadata: 53% de transcripciones vacías"* y **eso era un diagnóstico equivocado del propio motor**:
Supadata estaba sana, el que la saturaba era el motor.

### Lo medido (contra producción, la noche del 30/08)

De la corrida `ecd33926`: 51 videos entraron a transcribir, **27 volvieron vacíos (53%)**. Se
tomaron esos **27 URLs exactos** y se los volvió a pedir:

| Concurrencia | Con guion | Rechazados |
|---|---|---|
| **24** (lo que corría) | 9 / 27 | **17 con `429 limit-exceeded`** + 1 `transcript-unavailable` |
| **4** | **24 / 27** | 3 `transcript-unavailable` |

O sea que de las 27 "transcripciones vacías", **26 tenían guion** y una sola era un video mudo. La
pérdida no era de Supadata: era la ráfaga del motor.

**Y se pagaba dos veces.** Como `POST processed_items` corre ANTES de `Transcribir` (ADR-029 §2),
se verificó que **los 27 quedaron en la memoria de dedup**: no se reintentan nunca. Cada corrida no
perdía la mitad de su cosecha, la **quemaba**.

### Por qué pasaba (el razonamiento falso, que estaba escrito en el nodo)

> *"el plan da 10 req/s; con ~27 s/video, 24 en vuelo inician ~0.9 req/s — 11x por debajo del límite"*

**Un promedio de req/s no dice nada del pico, y el límite se cobra en el pico.** Los 24 workers
arrancan en el mismo milisegundo, y cuando un 429 vuelve rápido el worker queda libre y dispara el
siguiente al toque: la ráfaga se realimenta sola. Por eso los fallos no se agrupaban al principio
(58% en los primeros 24, 48% en el resto) y parecían una caída sostenida del proveedor.

### Decisión

1. **`transcript-unavailable` (HTTP 206, resuelve con cuerpo) es DEFINITIVO.** Se corta ahí: ni un
   reintento ni un segundo de presupuesto gastado en un video que no tiene voz. Esto es el *"no
   reintentar nunca"* que el §5 pedía.
2. **429 / timeout / red (rechaza la promesa) es TRANSITORIO.** `RETRIES` 1 → **4**, con **backoff
   exponencial y jitter** (`backoff_transcribir_ms`, default 500 ms, en `Config`). El jitter no es
   adorno: sin él los N workers que se comieron el mismo 429 esperan lo mismo y **reconstruyen la
   ráfaga** que los tumbó. El presupuesto manda sobre el backoff: agotado el tiempo, no espera ni
   reintenta.
3. **Se re-dimensionan las perillas con números medidos, no con el promedio de 07-17.** Latencia
   real contra URLs vírgenes: **mediana 15–18 s**, no 27 s. A **8 en vuelo**: 0,43 videos/s y
   **cero** rechazos por límite (24 URLs). `concurrencia_transcribir` 24 → **8** (también el default
   del código, que era la misma trampa para quien re-importe sin `Config`) y
   `presupuesto_transcribir_s` 840 → **870** (sigue bajo el watchdog de 900 s del pod).

### La regla de dimensionamiento que queda escrita

🔑 **CAPACIDAD > `cap_top_n`.** El corte de `cap_top_n` **posterga** (pasa dentro de `Heat-score
v1`, antes del `POST processed_items`); el del presupuesto **quema**. Mientras el presupuesto
alcance para más videos que el tope, el que muerde es siempre el que posterga. Al 30/08: 870 s a 8
en vuelo ≈ **370 videos** contra un `cap_top_n` de **250**. Si el cap sube de ~350, se sube antes la
concurrencia.

*Se descartó bajar `cap_top_n` para que entrara en el presupuesto: arregla el síntoma bajando el
techo de la corrida, cuando la capacidad medida daba de sobra.*

> ⚠️ **La condición se cumplió el mismo día, y por la UI: el tope real ya es 350, no 250.**
> `cap_top_n` sale de `pick('cap_top_n', 250)`, y **el ajuste del cockpit gana sobre `Config`**
> (`AJUSTE_MAP`: *"Videos a transcribir por corrida"* → `cap_top_n`). Mani lo subió a **350** el
> 31/08 junto con el umbral de vistas. O sea que el margen que este ADR dejó escrito como *370 vs
> 250* (48%) hoy es **374 vs 350: 7%**, justo en el borde que la propia regla nombraba.
>
> **No es una alarma todavía** —el cap no ha mordido en ninguna corrida real: la del 00:56 llegó a
> 164 videos distintos y la del 04:30 a 90, porque el supply corta antes— **pero el colchón se
> gastó**. Si el supply crece (más referentes, umbral más bajo) y el cap muerde de verdad, 350
> videos piden ~814 s de los 870 y cualquier lentitud de Supadata pasa a **quemar**. La palanca es
> subir `concurrencia_transcribir`, midiendo primero los 429 como se midió acá — no bajar el cap.
>
> 🔑 *Y el aprendizaje portable: una regla de dimensionamiento escrita contra dos números no
> sobrevive sola si **uno de los dos se toca desde una UI**. Este ADR fijó la capacidad en el código
> y dejó el tope en manos del equipo, sin nada que los compare en tiempo real. Lo correcto sería que
> el motor calcule su propio margen y lo avise en `metricas.avisos`, como ya hace con las
> transcripciones vacías.*

### Lo que esta enmienda NO toca

**`processed_items` sigue escribiéndose antes de transcribir** (ADR-029 §2 intacto). Se elimina la
*causa* de la quema, no el orden. Queda vivo el caso residual: si alguna vez el presupuesto vuelve a
morder, esos videos se siguen quemando. La regla de arriba es lo que lo mantiene lejos, y si algún
día deja de alcanzar, la conversación es un ADR nuevo sobre compensar la memoria, no un parche acá.

### Toca

`Transcribir (Supadata)` (retry con backoff + corte definitivo en `transcript-unavailable` + los
comentarios falsos corregidos), `Config` (`concurrencia_transcribir` 8, `presupuesto_transcribir_s`
870, `backoff_transcribir_ms` 500 nuevo). Docs: CLAUDE.md del motor. Probado en `test-nodos.mjs`
(4 casos nuevos: sin-voz no reintenta, 429 recupera, aguanta 4 rechazos seguidos, el backoff no
pisa el presupuesto). Sin cambio de schema.
