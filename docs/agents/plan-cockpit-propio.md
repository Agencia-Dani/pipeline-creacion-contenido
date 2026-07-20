# Plan del cockpit propio — componentes, stack y roadmap

> **Qué es este doc:** el plan de construcción de la superficie propia que reemplaza a Airtable
> ([ADR-025](../adr/ADR-025-cockpit-producto-propio.md)). Define **qué componentes tiene el sistema**,
> **con qué se construye cada uno** y **en qué orden**, con un "hecho cuando" verificable por fase.
> Es el hermano de [refactor-voces-proyectos.md](./refactor-voces-proyectos.md) para el producto: ese
> plan cierra (su componente B muere acá), este arranca.
>
> **El PRD no se reescribe.** El contrato de producto —objetivo, usuarios, FR1–FR10, NFR1–NFR8— es el
> de [refactor §0](./refactor-voces-proyectos.md), y sigue siendo el juez: si algo de acá no sirve a
> eso, no va.
>
> **Decisiones que lo gobiernan:** [ADR-025](../adr/ADR-025-cockpit-producto-propio.md) (producto
> propio) · [ADR-026](../adr/ADR-026-stack-del-cockpit-propio.md) (stack) ·
> [ADR-027](../adr/ADR-027-postgres-fuente-unica-de-config.md) (Postgres dueño, corte por dominio) ·
> [ADR-028](../adr/ADR-028-contrato-motor-run-plan.md) (contrato motor↔app).
>
> **Capacidad:** Mani solo, part-time, con Claude Code y agentes como fuerza de construcción. Las
> fases están escritas para eso: chicas, autocontenidas, con criterio de hecho ejecutable.

---

## 1. El norte

**Lo que se construye:** la superficie donde el equipo de redes elige **Voz → Proyecto → N → corre**,
ve el estado de la corrida, califica los candidatos que llegan, cura referentes y knobs, y donde Mani
y el jefe ven precisión y costos. Netflix, no panel de control de central nuclear.

**Lo que NO se construye — y esto es la mitad del plan:**

- **Los workflows no se tocan como producto.** El motor, el archivado y el descubrimiento siguen en
  n8n, con la misma lógica: scoring, gate, corte por proyecto, spillover, transcripción, destilación.
  Lo único que cambia es **de dónde leen la config y a dónde escriben los resultados** — dos cortes,
  no una reescritura. *"Tal cual" es la lógica, no los nodos:* los nodos de config **se reemplazan,
  no se duplican** — no hay rama Airtable conviviendo con rama Postgres dentro de un workflow (la
  coexistencia se resuelve del lado de la app, §6/D4).
- **No se reimplementa nada que Supabase ya haga:** auth, DB, RLS, backups.
- **No se construye un framework de workflows.** Se construye el cockpit de reels, con las costuras
  puestas para el N+1 (§6, fase D8), no la abstracción.

**Durante toda la migración, Airtable sigue vivo y operable.** Ninguna fase deja al equipo sin poder
trabajar; ninguna fase requiere una ventana de mantenimiento.

---

## 2. Componentes estructurales

```
                          NAVEGADOR (Majo · Jero · Mani · jefe)
                                        │  sesión Supabase Auth (cookie httpOnly)
        ╔═══════════════════════════════▼════════════════════════════════════╗
        ║  C1 · SUPERFICIE — Next.js App Router (apps/dashboard)             ║
        ║  rutas del operador · feed · config · analítico · design system    ║
        ╠════════════════════════════════════════════════════════════════════╣
        ║  C2 · BFF — Route Handlers + Server Actions                        ║
        ║  el ÚNICO que ve secretos (service_role · headers del motor)       ║
        ║    ├── C3 · DOMINIO (TS puro, sin IO, testeable con node:test)     ║
        ║    └── C6 · CONTRATO CON EL MOTOR                                  ║
        ║          GET /api/engine/run-plan  ← el motor pregunta qué correr  ║
        ║          POST → webhook n8n        ← "correr ahora" (señal desnuda)║
        ╚═══════════════╦═══════════════════════════════╦════════════════════╝
                        │ supabase-js (tipado)          │ header auth (gestor)
        ╔═══════════════▼═══════════════╗   ┌───────────▼────────────────────┐
        ║ C4 · DATOS — Supabase/Postgres║   │ MOTORES n8n (sin cambios de    │
        ║  schema `app`  → config       ║   │ lógica): motor · archivado ·   │
        ║  schema `public`→ runs/outputs║◄──┤ descubrimiento                 │
        ║  vistas        → analítico    ║   └────────────────────────────────┘
        ║ C5 · AUTH — Supabase Auth+RLS ║
        ╚═══════════════════════════════╝
```

| # | Componente | Responsabilidad (una frase) | Vive en |
|---|---|---|---|
| **C1** | **Superficie** | Las pantallas: 3 zonas (operar · curar · entender) con una sola ruta primaria y cero jerga técnica | `apps/dashboard/app/` |
| **C2** | **BFF / capa de aplicación** | Traducir intención de usuario en escrituras y llamadas; **único portador de secretos** | `apps/dashboard/app/api/` + Server Actions |
| **C3** | **Dominio** | Las reglas que no son ni UI ni SQL: N por proyecto y su default, voz activa gobierna sus proyectos, criterios obligatorios, estados de corrida | `apps/dashboard/src/domain/` (TS puro) |
| **C4** | **Datos** | Un dueño por dato: config en `app`, histórico en `public`, analítico en **vistas** | `core/schema/` (SQL versionado) |
| **C5** | **Identidad y permisos** | Quién entra y qué puede tocar — **en el servidor**, no en la UI | Supabase Auth + RLS + `app.usuarios` |
| **C6** | **Contrato con los motores** | Cómo el motor pregunta qué correr y cómo reporta lo que produjo | [ADR-028](../adr/ADR-028-contrato-motor-run-plan.md) + `core/contracts/` |
| **C7** | **Observabilidad y auditoría** | Saber qué pasó y quién lo hizo: `app.eventos` + logs de Vercel + estado de corrida legible | `app.eventos` + Vercel |
| **C8** | **Entrega** | Preview por rama, producción en `main`, migraciones SQL versionadas y aplicadas a mano | Vercel + `core/schema/` |
| **C9** | **Design system** | Tokens, componentes y los patrones no-code (read-only visible, helper text, estados vacíos) | `apps/dashboard/src/components/ui/` |

### 2.1 Las tres zonas de la superficie (arquitectura de información)

No hay 12 páginas planas como en Airtable. Hay **tres zonas**, y cada usuario entra en la suya:

| Zona | Para quién | Qué contiene | Reemplaza (páginas Airtable) |
|---|---|---|---|
| **Operar** | operador | Voz → Proyecto → N → ▶ Correr · estado de la corrida en vivo | *(no existe hoy: es el muro de B.2)* |
| **Curar** | operador | Feed de calificación · Referentes (+ los flojos) · Sugeridos · Descartes · Proyectos y Voces · Configuración | Feed · Referentes ×2 · Sugeridos · Descartes · Proyectos · Voces · Configuración Global |
| **Entender** | dev + sponsor | Precisión por proyecto · embudo y salud del motor · costos de la semana | Calidad · Salud del Sistema · Costos (las 3 rojas del [mapa](./mapa-campos.md) §5.1) |

Los **105 helper texts** ya escritos en [mapa-campos §6.3](./mapa-campos.md) se reusan tal cual: el
trabajo de redacción del cockpit no se tira, se porta.

---

## 3. Principios que gobiernan las decisiones diarias

Los invariantes del sistema ([PLAN §2.5](../../PLAN.md)) siguen mandando. Estos son los específicos
de esta superficie — cuando haya duda en una decisión chica, se resuelve con esta lista:

1. **Un dueño por dato.** Si un valor se puede editar en dos lados, uno de los dos está mal (ADR-027).
2. **La autoridad está en el servidor.** La UI *esconde*; RLS *impide*. Ningún permiso vive solo en
   un `if` de React. Corolario: lo que la máquina escribe se muestra **read-only**, siempre — el
   hallazgo §5.1-4 del mapa (4 páginas dejando editar campos de la máquina) no se repite.
3. **Lo que no se puede deshacer, se pregunta.** Correr cuesta créditos; borrar un referente pierde
   historia. Confirmación explícita, y `app.eventos` guarda quién.
4. **Claridad sobre completitud.** Cada pantalla muestra lo mínimo para decidir. Los knobs avanzados
   viven detrás del rol dev, no de un acordeón.
5. **El servidor calcula, el cliente muestra.** Nada de agregar números en el browser: lo analítico
   sale de vistas SQL. Una métrica se define **una vez**, en SQL.
6. **Estado legible, siempre.** Pendiente / corriendo / lista / falló, con hora y con qué pasó. El
   equipo nunca tiene que preguntarle a un dev si algo corrió.
7. **Fail-closed en config, fail-open en entrega.** Sin config no se corre (ADR-028); un servicio
   externo caído no vacía la entrega (NFR2).
8. **Cada fase entrega valor sola.** Nada de "esto sirve cuando termine la fase 5".

---

## 4. Modelo de datos objetivo

**`public` (existe, no se toca):** `clients · workflows · instances · runs · outputs ·
processed_items` + las vistas de selección e histórico (`core/schema/001–006`).

**`app` (nuevo, migración `007`+):** la config que hoy vive en Airtable, con las reglas que Airtable
no podía hacer cumplir:

| Tabla | Viene de | Lo que gana al migrar |
|---|---|---|
| `app.voces` | `Voces` | — |
| `app.proyectos` | `Proyectos` | `voz_id` **FK not null** (la regla "1 proyecto = 1 voz" deja de ser convención) · `criterios_relevancia` **not null** (cierra la trampa del form, §5.1-6) |
| `app.referentes` | `Referentes` | `plataforma` como enum · las 3 columnas de salud pasan a **vista** (las computa el archivado hoy; se derivan de `runs.metricas`) |
| `app.ajustes` | `Ajustes` | `clave` con check contra el mapa conocido · `visibilidad` (equipo/dev) explícita |
| `app.candidatos` | `Candidatos` | sin cuota de 1.000 records: dejan de borrarse por presión de espacio · FK a `outputs` |
| `app.descartes` | `Descartes del gate` | `veredicto` editable de verdad (hoy bloqueado por una limitación de Airtable, §5.1-1) |
| `app.referentes_propuestos` | `Referentes propuestos` | — |
| `app.usuarios` | *(nuevo)* | rol: `operador` / `dev` / `sponsor` |
| `app.eventos` | *(nuevo)* | auditoría: quién disparó, quién calificó, quién apagó una voz |

**Lo que muere sin reemplazo:** `Métricas Proyectos` y `Métricas Global`. Eran una proyección que
existía **solo** porque Airtable no podía consultar Supabase. La app lee la fuente por vistas
(`v_metricas_calidad`, `v_embudo_semana`, `v_costos_semana`), y las tarifas dejan de estar baked en
fórmulas de Airtable para vivir en una tabla de tarifas versionada.

---

## 5. Tech stack — qué se construye, qué se toma hecho

| Capa | Elección | ¿De cero o tomado? |
|---|---|---|
| Framework | **Next.js (App Router) + TypeScript** | tomado |
| Estilos y componentes | **Tailwind + shadcn/ui** | tomado, pero **copiado al repo**: es código propio editable, no una dependencia |
| Gráficos | **Recharts** (o SVG a mano donde alcance) | tomado — colores y forma según el skill `dataviz`, un solo sistema visual |
| Datos | **`supabase-js`** + tipos generados (`supabase gen types`) | tomado |
| Schema | **SQL versionado en `core/schema/`**, aplicado a mano en el SQL Editor | de cero — misma convención que hoy, **sin ORM** |
| Auth | **Supabase Auth (magic link)** + RLS | tomado |
| Validación de bordes | **Zod** en todo input de usuario y en el payload del endpoint del motor | tomado |
| Dominio y reglas | `src/domain/` en TS puro | **de cero** — es el valor propio |
| Tests | `node:test` para el dominio (como `test-nodos.mjs`) + `tsc` como typecheck | de cero, mínimo |
| Deploy | **Vercel** (preview por rama, prod en `main`) | tomado |
| Cron y ejecución | **n8n, como hoy** | sin cambio |

**Lo que deliberadamente NO entra** (y por qué, para no re-litigarlo): ORM (el SQL versionado ya es
la convención y el motor lo comparte) · state manager global (Server Components + `revalidate`
alcanzan) · librería de tablas (las vistas son chicas y curadas) · Storybook · Docker · tests E2E
en las primeras fases (el preview deploy + una pasada a mano cubren más por menos) · monorepo con
Turborepo (una sola app; `apps/dashboard/` es una carpeta, no un workspace, hasta que haya dos).

**Los 3 secretos y dónde viven:** `SUPABASE_SERVICE_ROLE` (solo en Vercel, server-side) · header del
webhook del motor (Vercel + n8n) · header de `/api/engine/run-plan` (Vercel + n8n). **Ninguno en git**,
todos en el gestor. El browser no ve ninguno.

---

## 6. Roadmap

Cada fase es entregable sola y deja el sistema funcionando. **Las dos únicas fases que obligan a
re-importar workflows son D4 y D7** — y eso es a propósito: el re-import es el eslabón débil
histórico del sistema, así que la fachada de ADR-028 lo concentra en dos momentos en vez de uno por
dominio.

### D0 — Fundación *(el andamio, sin dominio todavía)*
Scaffolding de `apps/dashboard/` · Tailwind + shadcn · Supabase Auth con magic link · `app.usuarios`
+ RLS con los 3 roles · layout con las 3 zonas vacías · deploy a Vercel · `tsc` y `node:test` como
feedback loops nuevos en `CLAUDE.md`.
**Hecho cuando:** Majo entra desde su mail, ve su nombre y su rol, y no puede abrir una ruta de dev.

### D1 — La rebanada fina: ▶ Correr ahora *(el muro de B.2, derribado)*
Sin migrar un solo dato. Pantalla *Operar* que lista voces y proyectos (leídos de Airtable, read-only)
y un botón que hace **POST al webhook** desde el BFF con el header. Estado de la corrida leyendo
`runs` (`en_curso` / `ok` / `fallo`, con duración y qué entregó).
**Hecho cuando:** Jero dispara una corrida real sin abrir n8n y ve cuándo terminó — la capacidad que
mató a Airtable, viva en la primera semana.

### D2 — Entender *(las 3 páginas rojas, bien hechas)*
Vistas SQL (`v_metricas_calidad`, `v_embudo_semana`, `v_costos_semana`) + tabla de tarifas + las 3
pantallas analíticas, read-only, sobre Supabase. Cero riesgo: no escribe nada.
**Hecho cuando:** el embudo completo de la semana se ve en una pantalla (hoy no está en ninguna
página, §5.1-3) y el jefe encuentra el costo de la semana solo.

### D3 — Capa de datos y modo sombra *(sin corte)*
Migración `007`: schema `app` con las 9 tablas · script de import **idempotente** desde Airtable ·
script de **diff** Airtable ↔ Postgres. Airtable sigue siendo el dueño; Postgres corre en sombra.
**Hecho cuando:** el diff da cero diferencias en 3 corridas seguidas, incluyendo una con ediciones
del equipo de por medio.

### D4 — La fachada se interpone *(re-import #1: lectura)*
`GET /api/engine/run-plan` en la app, **leyendo todavía Airtable por dentro**. Los 3 workflows
cambian sus nodos de lectura de config por 1 HTTP Request. El motor deja de conocer el schema para
siempre; los dominios siguientes migran **sin volver a tocar n8n**.
**Hecho cuando:** una corrida real produce el mismo plan que producía leyendo Airtable —verificado
con `test-nodos.mjs` y replay contra la corrida anterior— y `runs` muestra el mismo embudo.

### D5 — Corte de la config, dominio por dominio *(sin tocar n8n)*
Por dentro de la fachada, cada dominio se mueve a Postgres y su pantalla de edición reemplaza a la
de Airtable. Orden por riesgo creciente: **Ajustes** (chico y aislado, el piloto del procedimiento) →
**Referentes** (+ la vista de flojos y los Sugeridos) → **Voces + Proyectos** (juntos, van por FK).
Cada corte: pantalla lista → diff en cero → flip → esa página de Airtable pasa a histórica.
**Hecho cuando:** el equipo edita config solo en la app; en Airtable esas tablas quedan congeladas.

### D6 — El espacio de trabajo: Feed de calificación
Pantalla de calificación (🔥/👍/👎 + estado + notas), Descartes con `veredicto` **por fin editable**,
y la vista de 🔥 Seleccionados. Es la pantalla que el equipo más usa y la que decide si la migración
se siente bien.
**Hecho cuando:** una semana entera de calificación pasa por la app sin que nadie abra Airtable.

### D7 — Corte de escritura *(re-import #2)*
El motor deja de escribir Candidatos y Descartes en Airtable, y el archivado deja de escribir
Métricas y salud de referentes. Contrato de escritura a definir (**ADR-029**, se escribe al diseñar
esta fase: endpoint de la app vs. insert directo). El archivado adelgaza: barre, destila criterios y
poco más.
**Hecho cuando:** una corrida completa (motor → archivado) no toca Airtable en ningún nodo.

### D8 — Apagado y sostenibilidad
Export final de Airtable al repo · base a read-only · `setup-airtable.mjs` deprecado ·
`airtable-cockpit.md` congelado y reemplazado por `core/contracts/cockpit-datos.md` · costuras del
N+1 (`workflow_id` en rutas y modelo) · runbook de operación y backups.
**Hecho cuando:** Airtable se puede cancelar sin que nada se rompa, y la prueba de salud de
[PLAN §F6](../../PLAN.md) pasa entera.

### Orden y por qué
D1 y D2 dan valor sin tocar un dato: mientras se aprende el stack, el riesgo es cero. D3 y D4 son la
inversión estructural (los cortes reversibles y el desacople del motor). D5–D7 son el trabajo
repetitivo y ya de-riesgado. **Si el plan se detiene después de D2, el sistema quedó mejor que hoy y
Airtable intacto** — eso es lo que hace que valga la pena empezar.

---

## 7. Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| La app se cae ⇒ el motor no corre (ADR-028) | Se pierde una corrida semanal | Fail-closed a propósito (no gasta créditos) · el endpoint es una query sin dependencias · Vercel + Supabase caídos a la vez es el mismo riesgo que hoy con Airtable |
| Divergencia de datos durante la coexistencia | Silenciosa y cara | Un solo dueño por tabla en todo momento (ADR-027) + diff obligatorio antes de cada flip (D3) |
| El equipo rechaza la superficie nueva | La migración muere a mitad | D6 se valida con Jero y Majo con la pantalla en la mano, como pidió el PRD; hasta D6 Airtable sigue operable |
| Bus factor: un dev part-time | Todo se frena | Fases autocontenidas · ADRs con el porqué · `handoff.md` al día · el stack más documentado posible a propósito |
| Supabase free se queda corto (500 MB, pausa) | Registro inaccesible | Ya monitoreado (PLAN §4); el plan B ($25 Pro) sigue siendo el mismo |
| Scope creep: "ya que estamos, reescribamos el motor" | La migración no termina nunca | §1 lo prohíbe explícitamente; el motor cambia dos nodos, dos veces |

---

## 8. Decisiones abiertas (del arquitecto, no se asumen acá)

- [ ] **Contrato de escritura del motor (D7)** — endpoint de la app vs. insert directo a Postgres
      desde n8n. Se cierra con **ADR-029** al diseñar D7.
- [ ] **Qué queda del archivado** cuando las Métricas son vistas: ¿sigue computando algo, o se
      reduce a barrer Candidatos y destilar criterios (ADR-022)?
- [x] **Estado de corrida: polling vs. Supabase Realtime.** RESUELTO en D1 (cierre 59): polling cada
      5 s **solo** mientras hay una corrida `en_curso` (`operar/auto-refresh.tsx`). Realtime queda
      como optimización futura si molesta.
- [ ] **Cuándo entra `client_id`** en el schema `app` (multi-cliente, ADR-003). Hoy hay un cliente.
- [ ] **El Sheet Histórico** (ADR-014): ¿sobrevive como export, o la app lo reemplaza?
- [ ] **Techo de presupuesto** de la superficie nueva: Vercel free alcanza hoy; validar con el jefe
      junto al presupuesto pendiente de [PLAN §3.2](../../PLAN.md).
