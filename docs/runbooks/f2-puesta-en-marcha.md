# Runbook — Puesta en marcha del MVP de reels (cockpit Airtable + motor n8n + registro)

> El checklist ejecutable para construir el MVP del workflow de reels con la arquitectura de
> [ADR-008](../adr/ADR-008-airtable-cockpit-equipo-redes.md): el equipo de redes opera un
> **cockpit en Airtable**, el **motor n8n** busca/scorea/genera, y **Supabase** guarda historial +
> dedup. Marca `[x]` al avanzar.
>
> **Reparto a dos personas:** **Carril A (capa de datos)** y **Carril B (motor)** son paralelos.
> Hay un punto de sincronización, marcado 🔗. La convergencia y la activación se hacen juntos.
>
> | Carril | Dueño | Qué monta | Tiempo |
> |---|---|---|---|
> | **A — Capa de datos** | 👤 **Compañero** | Supabase (registro + dedup) + Airtable (cockpit) + datos semilla | ~1.5 h |
> | **B — Motor** | 👤 **Mani** | InstaPods online + rework del workflow n8n (lee Airtable → dedup → heat → candidatos) | ~3–4 h |

> **Prerequisito (gating) — antes de construir:** ✅ **visto bueno del jefe** sobre
> [one-pager-reels-mvp.md](../one-pager-reels-mvp.md) + sus 2 confirmaciones: **umbral del flag
> viral** (~700K) y **voces reales** (Cora/Alma/30X — cuál primero). La **timezone** ya está
> resuelta: `America/Bogota`.

---

## Parte 0 — Ya hecho (formalización, commiteado)

- [x] Decisión y estructura: [ADR-008](../adr/ADR-008-airtable-cockpit-equipo-redes.md) (Airtable cockpit, revisa D4).
- [x] Modelo de datos del cockpit + setup por API: [airtable-cockpit.md](../../core/contracts/airtable-cockpit.md) + `core/scripts/setup-airtable.mjs`.
- [x] Schema de dedup + corpus: [002_cockpit_y_dedup.sql](../../core/schema/002_cockpit_y_dedup.sql).
- [x] Piloto del motor base (smoke-test): `clients/piloto/short-form-content.yaml` → `deploy.mjs` valida COLECTAR→Claude→entrega. Sirve para probar el espinazo antes del rework de B.

## Carril A — Capa de datos · 👤 Compañero · ~1.5 h

**A-Supabase (registro + dedup):**
- [ ] **A1.** Crear proyecto en [supabase.com](https://supabase.com) (free, nombre `pipeline-contenido`).
- [ ] **A2.** SQL Editor → correr [`001_registro_inicial.sql`](../../core/schema/001_registro_inicial.sql) y luego [`002_cockpit_y_dedup.sql`](../../core/schema/002_cockpit_y_dedup.sql). Verificar: `select * from workflows;` (2 seeds) y `select * from processed_items;` (existe, vacía).
- [ ] **A3.** Guardar en el gestor (NUNCA en git): URL del proyecto + `service_role` key (Settings → API).
- [ ] **A4.** Insertar cliente + instancia (snippet comentado al final del `001`) → anotar `instance_id`.

**A-Airtable (cockpit del equipo):**
- [ ] **A5.** Crear cuenta [airtable.com](https://airtable.com) (free) + un workspace → copiar el `workspaceId` (`wsp...`) del URL.
- [ ] **A6.** Generar un **Personal Access Token** (Builder Hub → Personal access tokens) con scopes `schema.bases:write`, `data.records:read`, `data.records:write`, acceso al workspace. Guardar en el gestor (es secreto).
- [ ] **A7.** Crear la base de un comando:
      ```bash
      export AIRTABLE_PAT='pat...'; export AIRTABLE_WORKSPACE_ID='wsp...'
      node core/scripts/setup-airtable.mjs        # imprime el baseId (app...)
      ```
- [ ] **A8.** Dar acceso de **editor** a Mamo y Jero (Share — hasta 5 en el plan free).
- [ ] **A9.** Cargar datos semilla en Airtable: 1+ `Proyectos`, las `Voces` confirmadas con el jefe, y `Keywords`/`Referentes` iniciales del nicho.
- [ ] 🔗 **A10. Sync → carril B:** pasar a Mani por el gestor — `supabase_url` + `service_role` key + `instance_id` (Supabase) y `baseId` + `PAT` (Airtable). Nada de esto va al repo.

## Carril B — Motor n8n · 👤 Mani · ~3–4 h

- [ ] **B1.** Levantar n8n online: cuenta [InstaPods](https://instapods.com) → deploy n8n (~$7/mes, confirmar storage persistente). Setear envs `GENERIC_TIMEZONE=America/Bogota` y `TZ=America/Bogota` + reiniciar.
- [ ] **B2. (smoke-test opcional)** Importar `dist/piloto.workflow.json`, pegar keys, Execute Workflow → confirma que el espinazo Apify→Claude→entrega corre antes de rehacerlo.
- [ ] **B3. Rework del workflow** (el build del MVP) — sobre el JSON del piloto, reemplazar las puntas:
  - **Config:** en vez de leer del `Set` de params, **leer de Airtable** (nodo Airtable: Proyectos activos + sus Keywords/Referentes/Voz/filtros).
  - **COLECTAR:** Apify con ventana `dias_recencia` (backfill=180 en la 1ª corrida, diario=1–2). Cuentas/hashtags salen de `Referentes`/`Keywords`.
  - **DEDUP:** antes de generar, consultar `processed_items` de Supabase y descartar lo ya visto; al final, insertar lo nuevo (`Prefer: resolution=ignore-duplicates`).
  - **SCOREAR (heat, no corte):** ordenar caliente→frío por `views + likes + tema + señal de aprendizaje`; `min_*` ponderan, no cortan. Marcar `flag_viral` si seguidores > umbral (no excluir).
  - **GENERAR:** Claude escribe `top_n` candidatos en la `Voz` del proyecto, usando el corpus de aprobados (`v_corpus_aprobados`) como few-shot.
  - **ENTREGAR:** escribir candidatos a Airtable `Candidatos` (estado `nuevo`, batch 10/call) **+** registrar en Supabase (`runs` + `outputs` + `processed_items`) con los nodos de [ingesta-registro.md](../../core/contracts/ingesta-registro.md).
- [ ] **B4.** Credenciales en n8n: Apify ×2, Anthropic, Supadata, **Airtable (PAT)**, **Supabase Registro** (service_role).
- [ ] **B5.** Importar [`error-workflow-registro.json`](../../core/n8n/README.md), fijarlo como Error Workflow.

## Convergencia — corridas de validación (los dos juntos) · ~1.5 h

- [ ] **C1. Backfill:** corrida con `dias_recencia=180` → N candidatos aparecen en Airtable `Candidatos` · `runs` ok en Supabase · `processed_items` poblada.
- [ ] **C2. Curación:** Mamo/Jero califican unos candidatos (🔥/👍/👎 + estado) → confirmar que el archivado lleva los `aprobado` a `outputs` y los limpia de Airtable.
- [ ] **C3. Incremental + dedup:** correr otra vez con `dias_recencia=1` → **no reaparece** contenido ya procesado (el dedup funciona).
- [ ] **C4. Fallo + resiliencia:** romper a propósito la credencial Supabase → el workflow IGUAL escribe a Airtable (el registro es sumidero, no dependencia). Restaurar. Un fallo real queda como `run` estado `fallo`.

## Activación + loop de mejora

- [ ] **D1.** Validación explícita de timezone (las 3 preguntas del kit sobre el cron `America/Bogota`) → activar el cron diario/cada-2-días.
- [ ] **D2.** `status: active` en el manifest + tabla `workflows` · commit.
- [ ] **D3. Loop de mejora v1 (manual):** Mani refresca el `few_shot` de cada `Voz` desde `v_corpus_aprobados` (lo que el equipo aprueba). *v2 automatiza este refresco.*

---

**Hecho cuando:** una corrida de backfill deja N candidatos en Airtable que Mamo/Jero califican ·
una corrida incremental no reprocesa lo ya visto · los aprobados quedan en el corpus de Supabase ·
una falla simulada no tumba la entrega a Airtable · el cron corre en `America/Bogota`.
