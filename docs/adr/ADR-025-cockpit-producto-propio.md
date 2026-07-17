# ADR-025 — El cockpit migra a un producto propio; Airtable queda como superficie interina

- **Estado:** aceptada — 2026-07-17 (decisión de Mani; cierra **A.5**, la decisión gated de
  [refactor-voces-proyectos §3](../agents/refactor-voces-proyectos.md)). Mani la propone al equipo
  como información de dirección y avanza por su cuenta; no hay gate de aprobación.
  **Enmienda el invariante transversal de ROADMAP §1** ("Airtable es el punto de entrada único").
- **Contexto:** la auditoría del refactor (A.2/A.3, [mapa-campos](../agents/mapa-campos.md)) dejó la
  evidencia en dos mitades: el eje **operativo** cabe en Airtable (sus problemas son de curaduría),
  pero el **analítico** está estructuralmente roto en la superficie (las 3 páginas de
  Métricas/Salud/Costos son las 3 con hallazgos 🔴, y todo ese dato ya vive en Supabase, la fuente de
  verdad — NFR5). El empujón final fue el **muro de B.2**: el plan free de Airtable **bloquea la acción
  "Run a script"**, la única forma nativa de hacer el POST con header de auth que exige el botón de
  disparo de [ADR-023](./ADR-023-disparo-on-demand-boton-airtable.md) (enmienda auth). O sea: la pieza
  central del flujo del operador (Netflix: Voz→Proyecto→N→**correr**) no se puede construir en el plan
  actual sin degradar la seguridad del webhook (colisión ADR-023 ↔ NFR4).
- **Decisión:**
  1. **La superficie del equipo migra a un producto propio** — frontend + backend + DB + auth,
     construido desde cero, conectado a Supabase (fuente de verdad) y al webhook del motor
     (header auth de ADR-023). Cubre **toda** la superficie (operativo + analítico), no solo el eje
     analítico que §3 dejaba en revisión.
  2. **Airtable queda como cockpit interino** hasta que el producto opere: se cura **lo mínimo para
     operar hoy** (los fixes de B.6) sin sobre-invertir en lo que el producto va a reemplazar.
  3. **Disparo interino = Execute manual en n8n** (dev o equipo entrenado). **B.2 (botón + automation
     en Airtable) se retira del plan** — queda documentado en el contrato como referencia histórica
     por si algún día se quisiera en un plan pago.
  4. Los contratos del motor **no cambian**: el producto propio consume lo mismo que Airtable
     consumía (lee/escribe la config, dispara el webhook, lee Supabase). El motor no se entera del
     cambio de superficie.
- **Alternativas descartadas:**
  - *Plan pago de Airtable:* desbloquea "Run a script" (botón de ADR-023) pero no arregla el eje
    analítico (páginas de interface limitadas, fórmulas baked, permisos por página a mano) y suma
    costo recurrente a una herramienta que igual se estaba peleando con el flujo del operador.
  - *Partir la superficie (operativo en Airtable + analítico web propio):* era el matiz del plan §3;
    descartada por Mani — dos superficies que mantener y sincronizar, y el operativo seguía sin botón
    en el plan free.
  - *No-code de terceros (Lovable, etc.):* cambia un lock-in por otro. Se prefiere stack propio con
    control total (escalabilidad y multi-cliente F5 en el horizonte).
- **Consecuencias:**
  - (+) El flujo del operador se diseña exacto (Voz→Proyecto→N→correr, estado de corrida legible),
    el disparo es un POST limpio con header, y Métricas/Costos leen Supabase directo (dashboards
    ricos, read-only, sin duplicar dato).
  - (−) Infra nueva: build, deploy, auth del equipo, mantenimiento — sobre un equipo de 2 devs
    (NFR8). Mitigación: Airtable sigue vivo y operable durante toda la construcción; el switch es
    por superficie, no big-bang.
  - (−) El invariante "no-code e imposible de romper" pasa a depender de que el producto propio sea
    igual de simple para Majo/Jero. El PRD del refactor (§0) es el contrato de esa simplicidad.
  - El curado de Airtable (B.6) se hace **una vez y al mínimo**: lo que el equipo necesita para
    operar mientras tanto.
- **Toca:** ROADMAP §1 (enmienda del invariante transversal), plan del refactor (§3 cerrada, B.2
  retirado, A.5 ✅). `core/` no se toca todavía: los cambios de schema/contrato del producto propio
  irán en sus propios ADRs cuando se diseñe (E.3/B.3 esperan ese diseño).
