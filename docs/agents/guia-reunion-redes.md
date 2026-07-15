# Guía de reunión — pipeline de reels (backend ↔ Airtable ↔ equipo)

> Para Mani, antes de la reu con el equipo de redes. Un solo mapa que conecta las tres capas:
> **qué corre por detrás (n8n)** → **cómo está armado Airtable** → **qué toca el equipo**.
> No reemplaza los docs (dev-doc = nodo por nodo; onboarding = manual del equipo; contrato = las tablas);
> los condensa para tenerlos en la cabeza en 5 min.

---

## 0. Lo primero que tenés que tener claro al entrar (el estado real)

- **El sistema es referente-first.** Todo el contenido sale de la tabla **Referentes** (cuentas de IG y
  TikTok que el equipo cura a mano). El eje keyword/hashtag **se removió** (ADR-019): traía basura.
- **Son 3 robots, corren solos, encadenados por semana:**
  - **Motor** — lunes 8am — trae videos, transcribe, traduce, ordena → llena **Candidatos**.
  - **Buscador de cuentas** — lunes 9am — propone cuentas nuevas parecidas → llena **Referentes propuestos**.
  - **Archivador** — domingo 6pm — archiva lo calificado, limpia, mide → llena **Métricas**.
- **⚠️ CAVEAT PARA LA REU (no prometas de más):** los últimos cambios de código (loop de aprendizaje M2,
  contadores de Apify, costos en $, split de Métricas) **están en el repo pero NO importados en n8n todavía**.
  Hasta que re-importes los 3 workflows + corra un ciclo completo:
  - `criterios_aprendidos`, `advertencia_criterios` y la salud por referente (`tasa_gate`/`tasa_aprobacion`)
    **no se pueblan**.
  - Las columnas de Apify y costos quedan vacías (costo $0 mostrado).
  - Lo que el equipo SÍ puede hacer hoy: calificar Candidatos, curar Referentes, aprobar propuestas.
- **3 gaps de UI en Airtable que conviene cerrar antes de soltarlo del todo** (pendientes de tu próxima sesión):
  1. `veredicto` en la página **Descartes** está solo-lectura → el equipo **no puede** marcar "era bueno" aún.
  2. Las páginas **Métricas de Calidad** y **Salud del Sistema** no están curadas (muestran casi lo mismo).
  3. `precision` se muestra como decimal, no como %.

---

## 1. El flujo completo en una imagen mental

```
        REFERENTES (IG+TikTok, curados a mano)  ◄── el equipo agrega/poda
                 │
   [MOTOR · lun 8am] baja videos de esas cuentas
                 │  Apify → transcribe (Supadata) → traduce (Haiku) → gate de relevancia (Haiku)
                 ▼
        CANDIDATOS (videos a calificar)  ──►  el equipo califica (🔥/👍/👎 + aprobado/descartado)
                 │                              +  DESCARTES DEL GATE (los ~10 dudosos, auditar veredicto)
                 ▼
   [ARCHIVADOR · dom 6pm] archiva lo calificado a Supabase + Google Sheet, borra de Airtable,
                 │           computa MÉTRICAS, destila criterios aprendidos, mide salud por referente
                 ▼
        MÉTRICAS (solo lectura) + el sistema aprende para la próxima corrida

   [BUSCADOR · lun 9am] mira los mejores referentes → propone cuentas nuevas
                 ▼
        REFERENTES PROPUESTOS  ──►  el equipo aprueba/descarta  ──►  se siembran solas en Referentes
```

**La palanca #1 de calidad es la tabla Referentes.** Lo segundo es `criterios_relevancia` en cada Proyecto.
Todo lo demás es plomería.

---

## 2. Backend: los 3 workflows, nodo a nodo (versión condensada)

Fuente de verdad = los `workflow.json`. Detalle completo en [dev-doc.md](dev-doc.md).

### Motor (`short-form-content`) — 33 nodos, lunes 8am

| Bloque | Nodos clave | Qué hace |
|---|---|---|
| **Arranque** | Config → Abrir run → Barrer zombies | Carga IDs + knobs (defaults), registra la corrida en Supabase `runs`, mata runs colgados. |
| **Leer config** | Leer Proyectos / Voces / Referentes / Ajustes → **Armar plan** | Lee la base (paginando) y arma el plan: qué cuentas, qué criterios, qué knobs. `Ajustes` pisa los defaults. |
| **Descubrir** | Split IG → Apify IG Reels · Apify TikTok Perfil → Normalizar → Merge | Baja videos **1× por referente**. Solo referentes (sin hashtags). |
| **Asignar + colar** | Asignar proyecto+voz → **Pre-trim** (Haiku laxo) | Fan-out: 1 video → N proyectos que lo reclaman. Pre-trim tira lo obviamente off-topic (recall, fail-open). |
| **Rankear** | Leer señal selección → Leer procesados → **Heat-score v1** | Prescore métrico (views/likes/eng + bonus idioma + señal de lo que el equipo eligió antes), dedup, corta a `cap_top_n` (100). |
| **Enriquecer** | Transcribir (Supadata) → Traducir (Haiku) | Transcribe cada video distinto 1×; traduce al español solo si no está en español (literal). |
| **Filtrar fino** | **Gate de relevancia** (Haiku, chunks de 25) | Jurado estricto (precision) sobre el transcript. Deja pasar lo relevante; expone los **top-K descartes** (near-miss) a auditar. |
| **Entregar** | Armar candidato → POST Candidatos · Resumen del run → Cerrar run | 1 copia por video (gana el mejor score), escribe a Airtable, arma métricas del run. |

Cuellos que conviene saber: **Supadata free tier = 100 créditos/mes** (~1-2/video) → el throughput real
está limitado por eso, no por el código. Transcribir es serial (1 req/s) bajo un watchdog de 900s con
presupuesto propio de tiempo.

### Buscador (`descubrimiento-referentes`) — 27 nodos, lunes 9am

- **Promoción primero:** los `aprobado` de la semana pasada se crean solos como Referentes (`promovido`).
- **IG:** perfiles semilla → sugeridos del propio algoritmo de IG (`relatedProfiles`) → dedup → detalle → vetting Haiku.
- **TikTok:** rama paralela, actor lookalike (`dataovercoffee`) → vetting Haiku (sin captions, más conservador).
- **Vetting FAIL-CLOSED** (al revés del motor): si Haiku falla, NO propone (el riesgo acá es inundar al equipo).
- Propone hasta 10/semana con afinidad ≥0.6 → tabla **Referentes propuestos**. **No toca Candidatos.**

### Archivador (`archivado`) — ~37 nodos (24 live, +M2/costos tras re-import), domingo 6pm

- Toma los Candidatos calificados → `outputs` (Supabase) + append al **Google Sheet Histórico** → los borra de Airtable.
- Computa las filas semanales de **Métricas Proyectos** (calidad) + **Métricas Global** (salud + costos).
- Limpia `Descartes del gate` (cuenta los "era bueno" como falsos negativos).
- **M2 (tras re-import):** destila los calificados a `criterios_aprendidos` + lint (`advertencia_criterios`),
  y actualiza la salud por referente (`tasa_gate`/`tasa_aprobacion`/`videos_evaluados`).
- Higiene: barre Candidatos `nuevo` >20 días y Métricas >12 semanas.
- **Todo fail-soft:** el run cierra `ok` aunque falle una pata externa.

---

## 3. Airtable: cómo está armado (9 tablas, interfaz "Cockpit Redes")

El equipo **no ve las tablas crudas** — ve la interfaz **Cockpit Redes** con páginas. Ojo: **algunas
páginas se llaman distinto a la tabla** que muestran.

| Página en el menú | Tabla real | El equipo edita | Robot que la llena |
|---|---|---|---|
| **Feed de Calificación** | Candidatos | `calificacion`, `estado`, `notas_equipo` | Motor |
| **Referentes Buscados** | Referentes propuestos | `estado` (aprobado/descartado) | Buscador |
| **Descartes** | Descartes del gate | `veredicto` ⚠️(hoy solo-lectura, hay que abrirlo) | Motor |
| **Referentes** | Referentes | todo (arman la lista) | equipo + Buscador |
| **Proyectos** | Proyectos | todo (temas + criterios) | equipo |
| **Voces** | Voces | todo | equipo |
| **Configuración Global** | Ajustes (los `Mostrar al equipo`) | solo el `valor` | — |
| **Ajustes Dev-Only** | Ajustes (el resto) | nada (solo lectura) | — |
| **Métricas de Calidad** | Métricas Proyectos | nada | Archivador |
| **Salud del Sistema** | Métricas Global | nada | Archivador |
| **Costos** (borrador, sin publicar) | Métricas Global | nada | Archivador |

**Las 9 tablas por rol:**

- **Config (se arma una vez):** `Proyectos` (tema + `criterios_relevancia` + voz), `Voces` (para quién),
  `Referentes` (las cuentas fuente), `Ajustes` (las perillas).
- **Trabajo diario/semanal:** `Candidatos` (calificar), `Referentes propuestos` (aprobar), `Descartes del gate` (auditar).
- **Solo lectura:** `Métricas Proyectos` (calidad/precisión por proyecto) + `Métricas Global` (salud + costos).
  *(Antes era una sola tabla `Métricas`; se separó el 15-07 para que Calidad y Salud no se pisen.)*

**Campos que el motor escribe en Candidatos** (el equipo NO los toca): `titulo`, `script`, `idioma`,
`thumbnail`, `referente`, `url_referente`, métricas, `heat_score`, `relevancia_score`, `relevancia_razon`,
`viral_por_tamano`, `estado:'nuevo'`, links a `proyecto`/`voz`.

**Perillas que el equipo sí toca (Configuración Global):** Candidatos por corrida (100), Días de recencia (7),
Resultados por cuenta de referente (20), y 4 toggles (Buscar en IG/TikTok, Descubrir en IG/TikTok).
Todo tiene tope de seguridad dev-only para que nadie dispare el gasto.

---

## 4. Qué hace el equipo (y qué NO)

**SÍ:**
- Entrar a Airtable cada 1-3 días y **calificar** Candidatos: `calificacion` (🔥/👍/👎) + `estado` (aprobado/descartado).
- Calificar **también lo que descartan** (el "no" enseña).
- Curar **Referentes** (agregar buenas cuentas de IG y TikTok; podar destildando `activo`).
- 1×/semana: revisar **Referentes propuestos** (aprobar/descartar) y auditar **Descartes** (`veredicto`).
- Escribir buenos `criterios_relevancia` en cada Proyecto (define la calidad de lo que llega).

**NO:**
- Llenar Candidatos a mano (la máquina la llena).
- Entrar a n8n/Supabase (sala de máquinas).
- Dejar un Proyecto activo **sin Referentes** (proyecto muerto).
- Asignar una Voz que no pega con el tema del Proyecto.
- Tocar Ajustes Dev-Only sin avisar.

**Loop de aprendizaje (por qué calificar importa):** lo que el equipo aprueba alimenta la señal de
selección (heat-score de la próxima corrida) y, tras M2, la destilación de `criterios_aprendidos`.
El 🔥 es el "ejemplo ideal" que se le enseña a la máquina.

---

## 5. Preguntas que probablemente te hagan (y la respuesta corta)

- **"¿De dónde salen los videos?"** — Solo de la tabla Referentes (cuentas que ustedes eligen). No hay
  búsqueda por hashtag: la sacamos porque traía basura.
- **"¿Por qué llegó poco esta semana?"** — Poco material reciente, o un proyecto sin referentes, o las
  cuentas no publicaron. Chequear que los proyectos activos tengan referentes. También hay un tope real:
  Supadata free tier limita cuántos videos transcribimos.
- **"¿Qué pasa si califico mal?"** — Se puede cambiar hasta el domingo (antes del archivado). Después ya
  se fue al Histórico.
- **"¿La traducción está adaptada a la marca?"** — No. Es literal. La adaptación de voz la hacen ustedes.
- **"¿Un candidato sin guion?"** — La máquina no pudo transcribirlo (viene marcado ⚠️ SIN GUION). Miran el
  video original y deciden a mano.
- **"¿Cómo mejoro lo que me llega?"** — Curar Referentes + afinar `criterios_relevancia`. Esas son las dos palancas.
- **"¿Cuánto cuesta?"** — Página Costos (borrador). ~$2/semana hoy; se puebla en $ tras el re-import.
- **"¿Cómo sé si un proyecto está funcionando?"** — Página Métricas de Calidad, columna `diagnostico`
  (🟢 sano / 🟡 mejorable / 🔴 flojo) te dice si el criterio distingue bien.

---

## 6. Tus pendientes para dejarlo 100% (post-reu)

1. **Re-importar los 3 workflows en n8n** (mapear credenciales a los nodos nuevos + `<ANTHROPIC_API_KEY>`/`<SUPADATA_API_KEY>`) → recién ahí M2 + costos + contadores Apify son live.
2. **Airtable UI (la API no lo hace):** abrir `veredicto` editable en Descartes; curar Métricas de Calidad +
   Salud del Sistema; publicar Costos; precision como %; filtro Referentes Buscados → `estado=propuesto`.
3. **Rotar credenciales** (PAT Airtable, service_role Supabase, Anthropic, Supadata).
4. **Equipo:** sembrar 3-5 referentes de TikTok, aprobar las propuestas pendientes.
</content>
</invoke>
