# ADR-026 — Stack y forma del cockpit propio: Next.js + Supabase, en este repo

- **Estado:** aceptada — 2026-07-19 (decisión de Mani, arquitecto). Implementa la dirección de
  [ADR-025](./ADR-025-cockpit-producto-propio.md), que decidió *que* se construye un producto propio
  pero no *con qué*.
- **Contexto:** ADR-025 dejó abierto el stack. Las restricciones reales: **un solo dev part-time**
  (Mani) apoyado en agentes · **Supabase ya en producción** como fuente de verdad (ADR-002) · el
  disparo del motor es un **POST con header de auth** que no puede viajar en el browser
  ([ADR-023](./ADR-023-disparo-on-demand-boton-airtable.md)) · 5 usuarios con 3 roles (operador /
  dev / sponsor) · el equipo de redes es no-code y la superficie debe ser imposible de romper
  (NFR1, invariante ROADMAP §1).
- **Decisión:**
  1. **Next.js (App Router) + TypeScript + Tailwind + shadcn/ui**, deployado en **Vercel**
     (preview por rama, producción en `main`). Un solo artefacto: la UI y el backend viven en el
     mismo proyecto — los Route Handlers son el **BFF** y el único lugar que conoce secretos
     (`service_role`, header del webhook). El browser nunca ve una credencial del motor.
  2. **Supabase Auth** (magic link) para identidad, y **RLS de Postgres** para permisos. El rol
     viaja hasta la policy: "imposible de romper" pasa a ser una garantía del servidor, no una
     convención de la UI. Sin vendor nuevo, sin costo nuevo.
  3. **Sin ORM.** El schema sigue siendo SQL versionado en [`core/schema/`](../../core/schema/) —
     la convención que ya existe y que el motor comparte. Acceso por `supabase-js` con tipos
     generados del schema (`supabase gen types`). Lo analítico se resuelve en **vistas SQL**, no en
     el front.
  4. **El código vive en este repo**, como `apps/dashboard/`. Schema, contratos, ADRs y los
     `workflow.json` ya están acá: un cambio de modelo de datos se ve en un commit, no en dos repos.
  5. **shadcn/ui se copia al repo** (es código propio, no una dependencia): se puede editar sin
     pelearse con la librería, que es lo que se necesita para una superficie con reglas raras.
- **Alternativas descartadas:**
  - *Vite SPA + API propia (Hono/Fastify) en un contenedor:* dos deploys y un runtime más que
    operar, para un caso sin jobs largos ni websockets. Se re-evalúa si algún día el dashboard
    necesita procesos long-running.
  - *Next.js self-hosted junto a n8n:* evita el vendor, pero pone el build y el runtime en la
    espalda del único dev. Vercel free cubre este volumen y da preview deploys, que es el feedback
    loop que un dev-con-agentes más necesita.
  - *Clerk para auth:* mejor DX de UI, pero es un vendor más y el rol hay que puentearlo a Postgres
    igual para que RLS lo entienda. Con 5 usuarios no paga.
  - *Sin auth (perímetro Vercel Access):* mata los 3 roles y la trazabilidad de quién calificó qué.
  - *No-code de terceros (Lovable):* ya descartada en ADR-025 — cambia un lock-in por otro.
- **Consecuencias:**
  - (+) Un solo repo, un solo deploy, un solo modelo de datos. El secreto del webhook queda del
    lado del servidor, que era exactamente lo que Airtable free no podía dar (el muro de B.2).
  - (+) El repo gana feedback loops que hoy no tiene: **typecheck** (`tsc`) y tests de dominio.
  - (−) `core/` deja de ser el único código: el repo pasa de docs+JSON a tener build y CI. La
    regla "`core/` solo cambia con ADR" **sigue igual**; `apps/dashboard/` es zona normal.
  - (−) Acoplamiento a Vercel. Es reversible (Next.js corre en cualquier Node), pero la costura no
    se mantiene a propósito: si hay que mudarse, se paga entonces.
- **Toca:** `apps/dashboard/` (nuevo) · `CLAUDE.md` (feedback loops: typecheck y tests nuevos) ·
  PLAN §2.3 (estructura del repo) y §6 (deja de ser verdad que "UI web custom" está diferida).
  El plan de construcción vive en [plan-cockpit-propio.md](../agents/plan-cockpit-propio.md).
