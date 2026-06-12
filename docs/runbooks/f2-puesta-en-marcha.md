# Runbook F2 — Puesta en marcha: workflow de reels + registro central

> El checklist ejecutable de la etapa F2 ([PLAN.md §5](../../PLAN.md)). Marca `[x]` al avanzar.
>
> **Trabajo a dos personas (2026-06-12):** los carriles **A (registro central)** y **B (workflow
> de reels)** son paralelos por diseño — el registro nunca es dependencia de ejecución
> (ADR-002/D6): si A se atrasa, B llega igual hasta la corrida sin registro. Hay un solo punto
> de sincronización, marcado 🔗. La convergencia y la activación se hacen juntos.
>
> **Prerequisitos:** cliente real elegido · timezone de los crons confirmada (PLAN.md §3.2).

---

## Parte 0 — Ya hecho por Claude (commiteado, no requiere acción)

- [x] M1–M3 del paquete de mejoras: filtro parametrizado, Form Trigger de búsqueda bajo demanda,
      métricas al Sheet ([MEJORAS.md](../../Workflows/workflow-short-form-content/MEJORAS.md)).
- [x] Patch de ingesta (M6): nodos *Abrir run / Reportar outputs / Cerrar run* en el template,
      todos **Continue On Fail** ([ingesta-registro.md](../../core/contracts/ingesta-registro.md)).
- [x] Error Workflow del registro: [`core/n8n/error-workflow-registro.json`](../../core/n8n/README.md).
- [x] Script de deploy: `node core/scripts/deploy.mjs <cliente>` → JSON importable en
      `Workflows/workflow-short-form-content/dist/` (valida config, resuelve placeholders,
      verifica la expresión del nodo Claude; NUNCA toca secretos).

## Carril A — Registro central en Supabase · ~45 min

- [ ] **A1.** Crear cuenta/proyecto en [supabase.com](https://supabase.com) (free tier, nombre
      sugerido: `pipeline-contenido`).
- [ ] **A2.** SQL Editor → pegar y correr
      [`core/schema/001_registro_inicial.sql`](../../core/schema/001_registro_inicial.sql).
      Verificar: `select * from workflows;` → deben salir los 2 seeds.
- [ ] **A3.** Guardar en el gestor de contraseñas (NUNCA en el repo): URL del proyecto +
      `service_role` key (Settings → API).
- [ ] **A4.** Insertar cliente + instancia (snippet comentado al final del `001_…sql`) y anotar
      el `instance_id` resultante (`select id from instances;`).
- [ ] 🔗 **A5. Sync → carril B:** pasar `supabase_url` + `instance_id` (van en
      `clients/<cliente>/short-form-content.yaml`) y la service_role key **por el gestor de
      contraseñas** (va en la credencial de n8n, jamás en el repo).

## Carril B — Workflow de reels montado en n8n · ~1–2 h

- [ ] **B1.** Crear cuenta en **InstaPods** (recomendado — $3/mes, SSH incluido; alternativa
      PikaPods $3.80/mes) y levantar la app n8n. Confirmar que la persistencia está incluida.
- [ ] **B2.** Llenar `clients/<cliente>/short-form-content.yaml` (copiar de `clients/_ejemplo/`)
      con datos reales: voz + guiones few-shot (lo más importante para la calidad), cuentas IG,
      hashtags TikTok, temas, categorías, umbrales, Sheet y email destino.
      *Si A5 todavía no llegó, dejá `supabase_url`/`instance_id` vacíos y seguí — el workflow
      corre sin registro y se redeploya después (es regenerar e importar de nuevo).*
- [ ] **B3.** `node core/scripts/validate.mjs` en verde → `node core/scripts/deploy.mjs <cliente>`
      → genera `dist/<cliente>.workflow.json`.
- [ ] **B4.** Importar el dist en n8n (*Workflows → Import from File*) y hacer los pasos manuales
      que imprime el script: pegar API keys (Apify ×2, Anthropic, Supadata), remapear OAuth de
      Google Sheets y Gmail, crear credencial **Supabase Registro** (tipo *Supabase API*: host +
      service_role key) para los 3 nodos de ingesta.
- [ ] **B5.** Importar `core/n8n/error-workflow-registro.json`, reemplazar sus 2 placeholders y
      asignarle la credencial (instrucciones en [core/n8n/README.md](../../core/n8n/README.md));
      fijarlo como **Error Workflow** del wf de reels (Settings del workflow).
- [ ] **B6.** Crear la pestaña del Google Sheet con los **20 encabezados exactos** del
      [README del workflow](../../Workflows/workflow-short-form-content/README.md).

## Convergencia — corrida de validación end-to-end (los dos juntos) · ~1 h

- [ ] **C1.** **Execute Workflow** manual → filas en el Sheet con las 20 columnas pobladas ·
      email resumen con los filtros · en Supabase: 1 run `ok` + N outputs
      (`select * from v_outputs_recientes limit 30;`).
- [ ] **C2.** Probar el **formulario** (Production URL del nodo *Form — Búsqueda bajo demanda*):
      lanzar una búsqueda con filtros propios → el email refleja esos filtros · el run queda con
      `trigger_type = 'on_demand'` y los filtros en `params`.
- [ ] **C3.** Simular un fallo (p. ej. deshabilitar temporalmente una credencial) → queda un run
      con `estado = 'fallo'` y su error (vía Error Workflow).
- [ ] **C4.** Probar la resiliencia (no-negociable): romper a propósito la credencial Supabase →
      el workflow IGUAL escribe el Sheet y manda el email (el registro es sumidero, nunca
      dependencia). Restaurarla.
- [ ] **C5.** Anotar el costo real de la corrida → actualizar `cost_per_run` en el
      `workflow.yaml` del workflow.

## Activación + capa visual

- [ ] **D1.** Validación explícita de timezone (las 3 preguntas del kit, aplicadas al cron:
      ¿a qué hora UTC corre? ¿próxima ejecución local y UTC? ¿la expresión se interpreta en qué
      TZ?) → activar el workflow (cron lunes 8:00 AM).
- [ ] **D2.** `status: active` en el manifest + en la tabla `workflows` · commit.
- [ ] **D3.** Dashboard por-workflow (M4): [lookerstudio.google.com](https://lookerstudio.google.com)
      → fuente de datos Google Sheets → la pestaña del workflow; páginas sugeridas en
      [MEJORAS.md §M4](../../Workflows/workflow-short-form-content/MEJORAS.md). Compartir
      solo-lectura.
- [ ] **D4.** Compartir la URL del formulario con quienes piden búsquedas.

---

**Hecho cuando (== PLAN F2 + focus shift 2026-06-12):** una corrida real aparece en Supabase con
sus guiones, consultable por SQL · una falla simulada queda registrada como `fallo` · una
búsqueda lanzada desde el formulario produce guiones con los filtros pedidos y el email lo dice ·
el dashboard muestra producción/referentes/operación.
