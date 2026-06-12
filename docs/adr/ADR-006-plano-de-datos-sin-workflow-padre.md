# ADR-006 — El pipeline central es plano de datos, no un "workflow padre"

- **Estado:** aceptada — 2026-06-11
- **Contexto:** la idea original era un workflow maestro (en n8n o Zapier) con un nodo de entrada
  que ruteara hacia cada workflow hijo y terminara en un output estandarizado. Había que decidir
  si el "centro" del sistema es un orquestador de ejecución o una capa de datos/contrato.
- **Decisión:** **no hay workflow padre.** Cada workflow corre en su motor con su propio trigger
  (cron, formulario, conversación) y reporta al registro central. El pipeline central vive en
  tres lugares: el **repo** (contrato y config), **Supabase** (registro) y los **motores** (la
  ejecución). Un **dispatcher** — formulario que lanza corridas bajo demanda con filtros y rutea
  al workflow correspondiente — existe como componente opcional dentro de n8n (C9), no como
  centro del sistema.
- **Alternativas descartadas:**
  - *Workflow maestro en n8n/Zapier:* (a) punto único de falla — si el padre se rompe, nada
    corre, violando el no-negociable de aislamiento ("si uno se rompe el otro sirve todavía");
    (b) no puede orquestar el bot de OpenClaw, que es conversacional y con humano en el loop;
    (c) acopla la cadencia de todos los workflows a un solo trigger.
- **Consecuencias:** (+) aislamiento de fallos real entre workflows y frente al registro;
  (+) cada workflow conserva el trigger que le es natural; (+) la unificación ocurre donde
  genera valor (datos consultables, contrato común), no donde genera riesgo; (−) no existe "un
  solo lugar donde se ve todo correr" en tiempo de ejecución — eso lo compensa el registro +
  dashboard, que es donde de verdad se mira.
