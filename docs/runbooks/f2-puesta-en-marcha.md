# Runbook F2 — Puesta en marcha: workflow de reels + registro central

> El checklist ejecutable de la etapa F2 ([PLAN.md §5](../../PLAN.md)). Marca `[x]` al avanzar.
> Reparto: **[Mani]** = requiere cuentas/credenciales/decisiones humanas · **[Claude]** = se
> ejecuta en sesión · **[Ambos]** = interactivo.
>
> **Prerequisitos:** cliente real elegido y presupuesto OK (conversación F0 con el jefe) ·
> timezone de crons confirmada (PLAN.md §3.2).

---

## Parte A — Supabase (registro central) · ~20 min

- [ ] [Mani] Crear cuenta/proyecto en [supabase.com](https://supabase.com) (free tier, nombre
      sugerido: `pipeline-contenido`).
- [ ] [Mani] SQL Editor → pegar y correr [`core/schema/001_registro_inicial.sql`](../../core/schema/001_registro_inicial.sql).
- [ ] [Mani] Guardar en el gestor de contraseñas (NUNCA en el repo): URL del proyecto +
      `service_role` key (Settings → API).
- [ ] [Ambos] Verificar: `select * from workflows;` debe mostrar los 2 seeds.

## Parte B — n8n hosteado · ~30 min

- [ ] [Mani] Crear cuenta en **InstaPods** (recomendado — $3/mes, SSH incluido; alternativa
      PikaPods $3.80/mes) y levantar la app n8n. Confirmar persistencia incluida.
- [ ] [Mani] Importar `Workflows/workflow-short-form-content/workflow.json`
      (n8n → Workflows → Import from File).
- [ ] [Mani] Crear credenciales en n8n: Apify token · Anthropic API key · Supadata key ·
      Google Sheets OAuth · Gmail OAuth · **Supabase Registro** (Header Auth, ver
      [`ingesta-registro.md`](../../core/contracts/ingesta-registro.md)).

## Parte C — Configurar el cliente real

- [ ] [Mani] Llenar `clients/<cliente>/short-form-content.yaml` (copiar de `clients/_ejemplo/`)
      con los datos reales: voz, guiones few-shot, cuentas, hashtags, temas, Sheet destino.
- [ ] [Mani] Insertar cliente + instancia en Supabase (snippet comentado al final del
      `001_registro_inicial.sql`) y anotar el `instance_id` resultante.
- [ ] [Claude] Script que resuelve los `<<placeholders>>` del `workflow.json` desde la config
      del cliente → JSON deployable (mutando por nodo según el CLAUDE.md del workflow, con
      validación de parseo y de la expresión del nodo Claude).
- [ ] [Claude] Patch de ingesta: agregar los 3 nodos de reporte + Error Workflow según
      [`ingesta-registro.md`](../../core/contracts/ingesta-registro.md) (todos con Continue On Fail).
- [ ] [Claude] Verificaciones del workflow: `pinData` vacío · categorías idénticas en prompt y
      parser · `node core/scripts/validate.mjs` en verde.
- [ ] [Mani] Crear/confirmar la pestaña del Google Sheet con los encabezados exactos del README
      del workflow.

## Parte D — Corrida de validación end-to-end

- [ ] [Ambos] **Execute Workflow** manual → verificar: filas en el Sheet · email resumen ·
      en Supabase: 1 run `ok` + ~25 outputs (`select * from v_outputs_recientes limit 30;`).
- [ ] [Ambos] Simular un fallo (p. ej. deshabilitar temporalmente una credencial) → verificar
      que queda un run con `estado = 'fallo'` y su error.
- [ ] [Mani] Anotar el costo real de la corrida → actualizar `cost_per_run` en el
      `workflow.yaml` del workflow.

## Parte E — Activar

- [ ] [Ambos] Validación explícita de timezone (las 3 preguntas del kit, aplicadas al cron de
      n8n: ¿a qué hora UTC corre? ¿próxima ejecución local y UTC? ¿la expresión se interpreta
      en qué TZ?).
- [ ] [Mani] Activar el workflow (cron lunes 8:00 AM).
- [ ] [Mani] Actualizar `status: active` en el manifest + en la tabla `workflows` · commit.

**Hecho cuando (== PLAN F2):** una corrida real del lunes aparece en Supabase con sus ~25
guiones, consultable por SQL · una falla simulada queda registrada como `fallo`.
