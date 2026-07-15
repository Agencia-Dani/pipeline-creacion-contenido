# ADR-021 — Medición de desempeño del embudo: tabla Métricas + descartes del gate visibles

- **Estado:** aceptada — 2026-07-10 (grilling de mejoras de relevancia con Mani).
  Complementa [ADR-010](./ADR-010-scoring-semantico-y-etapa-calidad.md) (el scoring semántico gana
  su instrumento de medición) y [ADR-014](./ADR-014-outputs-historico-canonico-archivado.md) (la
  división motor-reporta-`runs` / archivado-escribe-histórico se respeta y se aprovecha).
- **Contexto:** la auditoría del run 07-09 (handoff cierre 27) demostró que el gate funciona pero que
  nadie puede saberlo sin una sesión de arqueología manual: el yield (11%) se calculó a mano, los
  descartes del gate viven en un `console.log` que nadie lee (los falsos negativos son invisibles: el
  sistema solo puede aprender de lo que dejó pasar, nunca de lo que mató), y el archivado **no copia**
  `relevancia_score`/`relevancia_razon` al histórico — la métrica "acuerdo gate vs equipo" no era
  computable. Sin medición visible, "mejorar la relevancia" es una conversación de sensaciones, y las
  mejoras que siguen (ADR-022) no tendrían forma de verificarse. Requisito explícito de Mani: que el
  desempeño histórico y semanal se pueda **ver** (página en el cockpit) sin poder editarse.
- **Decisión:**
  1. **El archivado computa; Airtable proyecta.** El archivado (que ya cierra el ciclo semanal y tiene
     ambas credenciales) computa las métricas de la semana — de los calificados que acaba de levantar y
     de los `runs` de la semana en Supabase — y escribe filas en una tabla Airtable nueva **`Métricas`**:
     una fila por (semana × proyecto) + una fila global. La tabla es una **proyección derivada y
     regenerable**; la verdad cruda sigue en Supabase. Cero workflows nuevos.
  2. **Métricas v1** — calidad (por proyecto): **precisión de entrega** (aprobados / calificados),
     **separación del gate** (score medio de aprobados vs descartados), volumen vs target; salud
     (global): embudo de corrida (colectados→pretrim→gate→entregados), % SIN GUION, runs fallidos,
     duración, **conteo de llamadas** por servicio (Apify/Supadata/Haiku; el costo en dólares queda
     como multiplicador opcional futuro, no se mantienen tarifas en v1).
  3. **Dos páginas solo-lectura** en el cockpit: *Métricas — Calidad* y *Métricas — Salud* (las
     páginas creadas por API nacen solo-lectura: acá es la semántica deseada, no una limitación).
  4. **Descartes del gate visibles:** el motor sube a una tabla Airtable nueva **`Descartes del gate`**
     solo la **banda borderline** (score ≈0.35–0.6, cap ~10/corrida; ambos knobs dev-only en `Config`)
     con transcript, score y razón. El equipo marca un campo `veredicto` (bien descartado / era bueno).
     El archivado cuenta los "era bueno" como **falsos negativos** en la fila de Métricas y limpia la
     tabla al cerrar la semana. Solo descartes del gate: los del pre-trim mueren por caption pobre y no
     dejan nada auditable.
  5. **El histórico se completa:** el archivado copia `relevancia_score` y `relevancia_razon` a
     `outputs.metadata` (y al Sheet). El motor agrega a `runs.metricas` un **desglose por referente**
     `{evaluados, gate_pass}` (habilita la higiene de fuentes de ADR-022; sigue siendo "el motor
     reporta `runs`", ADR-014 intacto).
  6. **Semana = semana de calificación:** la fila de Métricas se atribuye al ciclo que cierra el
     archivado del domingo (lo calificado esa semana), no a la semana de entrega del candidato.
- **Alternativas descartadas:**
  - *Workflow de métricas aparte:* más limpio en teoría, pero es un tercer workflow que importar,
    monitorear y barrer de zombies; el archivado ya está exactamente en el momento y lugar del cómputo.
  - *Vistas Supabase + dashboard del jefe (ADR-004):* el equipo no las vería en su cockpit; la
    audiencia primaria de estas métricas es quien carga fuentes y criterios, no solo el jefe.
  - *Subir todos los descartes del gate:* satura al equipo con descartes obvios (score 0.1) y el hábito
    de auditar muere en dos semanas. La banda borderline es donde viven los errores.
  - *Descartes como Candidatos con estado especial:* rompe el lenguaje — un Candidato es un video
    esperando calificación; un descarte de máquina no lo es.
- **Consecuencias:**
  - (+) Cada cambio de criterio, poda de referente o mejora del motor se verifica con un número en una
    semana; la separación del gate señala con data qué proyecto tiene criterios vagos.
  - (+) El loop de falsos negativos queda cerrado por primera vez (~2 min/semana de fricción al equipo).
  - (−) El archivado engorda: gana lectura de `runs` y dos escrituras Airtable más; sigue fail-soft
    (si Métricas falla, el archivado de candidatos no se cae).
  - (−) El contrato del cockpit pasa de 6 a 8 tablas (se actualiza `airtable-cockpit.md` +
    `setup-airtable.mjs` en el build de la Fase M1).
  - (−) La banda borderline capada es una **muestra**, no un censo: la tasa de falsos negativos es
    indicativa, no exacta. Aceptado: alcanza para detectar criterios que matan contenido bueno.
- **Toca `core/`:** sí — contrato cockpit (2 tablas nuevas) y este ADR es su autorización. El plan
  ejecutable (Fase M1) ya se completó (histórico en git).

## Enmienda 2026-07-13 — de banda fija a top-K por score

**Contexto:** el primer ciclo real de M1 mostró que la banda `[0.35, 0.6]` **nunca se pobló**: 40
rechazos históricos, 0 en la banda. Haiku no juzga con incertidumbre gradual — es **bimodal**:
aprueba en 0.8–0.9 y rechaza en 0.0–0.3. "Rechazo con score intermedio" es un conjunto vacío por
construcción, así que la página *Descartes (auditar)* quedaba muerta y el loop de falsos negativos
nunca arrancaba.

**Decisión (Mani):** se reemplaza la banda por **los top-K rechazos por score de Haiku** (los
near-miss: los que más cerca estuvieron de pasar = los candidatos más probables a falso negativo).
Garantiza que la muestra se pueble y apunta justo a lo auditable. Los knobs `banda_descarte_min` /
`banda_descarte_max` quedan **deprecados** (el gate ya no los lee); sobrevive `cap_descartes` como K.
El resto del ADR (semántica de la tabla, veredicto, limpieza semanal, falsos negativos) no cambia.

## Enmienda 2026-07-14 — diagnóstico legible + dos barridos de higiene

**Contexto (audit con Mani, dejar el pipeline listo para el equipo):** tres huecos operativos. (1) La
separación del gate ya vive en `Métricas` pero como decimal que nadie interpreta — la señal de "este
criterio no discrimina" existe (Trading Psychology 0.04, Storytelling 0.08 en el ciclo 07-13) y no
llega a nadie. (2) El archivado solo borra Candidatos *decididos*; los `nuevo` que nadie califica se
apilan en la pestaña "Nuevos". (3) `Métricas` es la única tabla que crece monótona (~7 filas/semana);
sin cota, es la fuga lenta hacia el tope de 1.000 registros del plan free.

**Decisión (Mani):**
1. **Columna `diagnostico` en `Métricas`** (solo filas de proyecto): el archivado traduce
   `separacion_gate`+`precision` a 🟢 sano / 🟡 mejorable / 🔴 flojo o invertido + qué hacer. **Regla,
   sin IA** (cero costo, cero latencia). Es el semáforo de *outcome* y **precede** al *lint de forma*
   con IA de [ADR-022](./ADR-022-loop-aprendizaje-criterios.md)/M2 (criterio vago / sin lista negativa
   / Voz incoherente): conviven — uno mira si el criterio discriminó esta semana, el otro si está bien
   escrito.
2. **Barrido de Candidatos `nuevo` > 20 días:** se purgan sin archivar (nunca hubo decisión humana que
   guardar). Umbral 20 días fijado por Mani. Mantiene limpia la pestaña "Nuevos".
3. **Cap de `Métricas` a 12 semanas (84 días):** historia *visible* en el cockpit; la verdad larga y
   canónica queda en Supabase (`runs.metricas`+`outputs`) y el Sheet, de donde `Métricas` es
   regenerable. Cap subible si el jefe quiere más trend.

Los dos barridos cuelgan de `Cerrar run` con `onError:continue` (el run ya cerró — no lo bloquean; si
fallan, reintentan el domingo siguiente), mismo patrón de lote-de-10 que `Borrar Descartes del gate`.
Archivado 24 → 30 nodos. No cambia el resto del ADR.

## Enmienda 2026-07-14 (bis) — visibilidad del descubrimiento, costo en $ y curación de las páginas

**Contexto (audit de métricas con Mani, sobre la base viva):** tres cosas. (1) Las dos páginas
*Métricas de Calidad* y *Salud del Sistema* muestran **el mismo set de campos** (calidad) y **ninguna**
expone el embudo/costo del punto 2 de la decisión — la fila GLOBAL tiene `colectados`/`gate_pass`/
`runs_ok`/llamadas pero no salen en ningún lado; la página de "salud" no muestra salud. (2) El equipo
lee decimales crudos (`separacion_gate` 0.04, `score_aprobados` 0.8) que no sabe interpretar. (3) El
workflow de descubrimiento (ADR-020) loguea su embudo en `runs.metricas` de Supabase pero **nada llega
al cockpit**: nadie ve si el banco de referentes crece — hueco que conecta con "¿recomendamos
contenido exitoso?".

**Decisión (Mani):**
1. **Fila `DESCUBRIMIENTO` en `Métricas`** (tercer ámbito, junto a proyecto y GLOBAL): el archivado
   proyecta el embudo del buscador de Supabase (semillas→sugeridos→propuestos→aprobados→promovidos),
   mismo patrón "el archivado computa, Airtable proyecta". Extiende el contrato del cockpit (`core/`).
2. **Costo en $**: se activa el "multiplicador opcional futuro" que v1 dejó pendiente (punto 2). Se
   implementa como **columnas-fórmula en Airtable** (`tarifa × conteo` sobre `supadata_llamadas` /
   `haiku_lotes` / `haiku_traducciones`), no en n8n: aproximado por-llamada, editable sin re-import.
3. **Curación por audiencia (tres páginas, cada una para su público):**
   - *Métricas de Calidad* (equipo): counts + `precision` como **%** + `diagnostico`. Se **ocultan**
     los decimales crípticos (`score_aprobados`, `score_descartados`, `separacion_gate`) y los campos
     GLOBAL-only que salen vacíos en filas de proyecto. `diagnostico` pasa a ser la señal principal.
   - *Salud del Sistema* (jefe): headline (`entregados`, precisión GLOBAL, `runs_ok`/`fallo`) +
     embudo. Los decimales se **calculan pero no se muestran** al equipo; la traducción a lenguaje es
     `diagnostico`.
   - *Costos* (jefe, **página dedicada** — decisión de Mani 2026-07-15): las columnas-fórmula `costo_*`
     en $, separadas de la salud operativa para que el gasto se lea solo. El costo **no** va como
     sección de *Salud del Sistema*.
   Las páginas se editan en la UI de Airtable (el MCP no configura layouts/filtros de interfaz).

**Alternativas descartadas:** *Fusionar las dos páginas de Métricas en una* — mezcla audiencias y deja
columnas vacías por fila (el embudo solo existe en GLOBAL, la precisión solo en proyecto). *Visibilidad
del descubrimiento solo contando `Referentes propuestos` en Airtable* — responde "¿el equipo aprueba?"
pero pierde la eficiencia del buscador (cuántos sugeridos por propuesta útil), que es justo lo que dice
si el motor de descubrimiento sirve.

**Secuencia:** la fila `DESCUBRIMIENTO` es código nuevo en el archivado → va al **siguiente** lote de
re-import, después de aterrizar el re-import pendiente y verificar M1 (incluido `diagnostico`, hoy
vacío) en una corrida real. Las columnas-fórmula de costo y la curación de páginas se pueden hacer ya
en la UI. **Toca `core/`:** sí (contrato cockpit — tercer ámbito de `Métricas` + columnas de costo);
este ADR es su autorización.

## Enmienda 2026-07-15 — `Métricas` se parte en dos tablas físicas

**Contexto (Mani):** la curación de la enmienda anterior (ocultar campos por página) no bastó: en la
UI de Airtable, cuando *Métricas de Calidad* y *Salud del Sistema* leen la **misma** tabla, terminan
mostrando el mismo set de campos y se pisan al configurarlas. El fondo es un *smell* de modelo: una
sola tabla mezcla **dos entidades** — calidad por proyecto vs. salud/costos de sistema — y ~30 de sus
40 campos solo se llenan en las filas GLOBAL/DESCUBRIMIENTO.

**Decisión (Mani 2026-07-15):** partir `Métricas` en dos tablas, una entidad cada una:
- **`Métricas Proyectos`** — filas de proyecto (calidad): `precision`, scores, `separacion_gate`,
  `diagnostico`. La lee *Métricas de Calidad*.
- **`Métricas Global`** — filas `GLOBAL` + `DESCUBRIMIENTO` (embudo, runs, salud del contenido, conteos
  y **las 9 columnas-fórmula de costo**). La leen *Salud del Sistema* y *Costos*.

Se reusa la tabla existente como `Métricas Global` (renombrada) para no recrear las fórmulas de costo.
El archivado (nodo *Computar métricas semana*) etiqueta cada batch con `_tabla` y el **único** nodo POST
routea a la tabla correcta por `$json._tabla` — sin duplicar nodos. El barrido de retención >12 semanas
apunta solo a `Métricas Proyectos` (la que crece ~7 filas/semana); `Métricas Global` (~2 filas/semana)
no se barre y así guarda más trend de costos/salud.

**Revierte** la "alternativa descartada" de fusionar en una: el problema real no era fusión, era que
una tabla servía a dos entidades. Partir es lo contrario de fusionar.

**Toca `core/`:** sí (contrato cockpit + `setup-airtable.mjs` + workflow de archivado). **Aplica al
re-importar** el archivado en n8n. La precisión decimal de las 5 columnas Apify (`costo_apify_*`,
`costo_perfiles_semilla`, `costo_detalle_sugeridos`, `costo_lookalikes_tt`) sigue en 0 y hay que
subirla a 2 a mano en la UI (la API no toca precisión de fórmulas).
