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

### 2.1 Las zonas de la superficie (arquitectura de información)

No hay 12 páginas planas como en Airtable. Hay **una zona por verbo**, y cada usuario entra en la suya:

| Zona | Para quién | Qué contiene | Reemplaza (páginas Airtable) |
|---|---|---|---|
| **Operar** | operador | Voz → Proyecto → N → ▶ Correr · estado de la corrida en vivo | *(no existe hoy: es el muro de B.2)* |
| **Curar** | operador | Feed de calificación · Referentes (+ los flojos) · Sugeridos · Descartes · Proyectos y Voces · Configuración | Feed · Referentes ×2 · Sugeridos · Descartes · Proyectos · Voces · Configuración Global |
| **Transcribir** | operador | Pegar enlaces sueltos → script literal; entran al dedup del motor | *(no existe hoy: pedido nuevo, ADR-031)* |
| **Entender** | **operador** + dev + sponsor | Precisión por proyecto · embudo y salud del motor · costos de la semana | Calidad · Salud del Sistema · Costos (las 3 rojas del [mapa](./mapa-campos.md) §5.1) |

> **Enmienda 2026-07-28 ([ADR-031](../adr/ADR-031-transcriptor-a-pedido.md)):** esto decía "tres
> zonas". Entró una cuarta, *Transcribir*. La regla que importaba no era el número sino que **una
> zona = un verbo del usuario**, y transcribir un video que trae el equipo no es ni operar la máquina
> ni curar su salida. El sponsor no la ve.

> **Enmienda 2026-08-05:** *Entender* decía **dev + sponsor**. Ahora la ve también el **operador**.
> De las tres exclusiones de esta tabla, era la única **sin motivo escrito** — venía de repartir una
> zona por verbo y quedó por inercia. Lo que gana el operador es feedback sobre su propio trabajo:
> **precisión de entrega** (de lo que calificó, qué fracción aprobó) y **separación del gate**. La
> salud por referente no entra en la cuenta: ya la tenía en *Curar*.
>
> ⚠️ **Y arrastra un supuesto con fecha.** El bloque de costos se gatea con `rol !== "sponsor"`
> ([ADR-052](../adr/ADR-052-el-sponsor-externo-no-ve-el-costo-del-proveedor.md)), así que el operador
> **ve lo que cuestan los proveedores**. Se aceptó porque **hoy todos los operadores son de adentro**,
> verificado contra las 7 membresías vivas. El día que una persona de una empresa cliente reciba
> `operador`, ese gate le publica el margen — y **falla hacia mostrar**, o sea que no se va a notar.

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
9. **La lista resume, el record se abre** ([ADR-039](../adr/ADR-039-la-lista-resume-el-record-se-abre.md),
   2026-08-01). Ninguna lista despliega formularios: muestra lo que uno viene a saber, y el detalle
   se abre tocando la fila. Crear es un botón arriba. La única excepción es el interruptor de
   prendido/apagado, que se edita desde la lista y guarda al toque. Es el §4 de esta lista llevado
   hasta el final: nació de que Referentes dibujaba `filas × proyectos` casillas, o sea una pantalla
   que **empeoraba con cada proyecto nuevo**.
10. **Un número que el equipo ve, un dueño**
    ([ADR-038](../adr/ADR-038-una-sola-perilla-de-cantidad.md), 2026-08-01). Es el §1 aplicado a la
    superficie: si tres perillas mueven lo mismo, dos sobran aunque las tres funcionen. Y **la
    pantalla no promete lo que la máquina no garantiza** — cuando un número es un techo y no un
    contrato, se muestra al lado lo que pasó de verdad, no un «hasta» que obliga a adivinar.

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
| `app.referentes` | `Referentes` | `plataforma` como enum · las 3 columnas de salud pasan a **vista** (las computa el archivado hoy; se derivan de `runs.metricas`) · el vínculo con proyectos es **N:M explícito** en `app.referentes_proyectos` ([ADR-032](../adr/ADR-032-referente-proyecto-es-n-a-n.md)) |
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

> 📌 **Nota del 2026-08-03.** Ese *"eslabón débil"* sigue siendo cierto como historia y fue lo que
> motivó este diseño, pero desde
> [ADR-053](../adr/ADR-053-el-repo-es-la-forma-el-live-es-el-estado.md) un cambio de `parameters` se
> aplica con `npm run n8n:push` y ya no cuesta un re-import. Lo que todavía lo cuesta es la
> **topología** — ver [plan-multi-tenant §14.2](./plan-multi-tenant.md), donde queda escrito por qué
> eso ahora es una decisión y no un límite de la API.

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

> **Corte 1/4 — Ajustes: HECHO (2026-07-31).** La pantalla es `/curar/ajustes` y la fuente de la
> fachada la decide **`apps/dashboard/lib/config.ts`**, que es la costura del corte: los 3 que
> faltan mueven una línea ahí más su pantalla. Tres cosas que este piloto dejó como
> **procedimiento** para los que siguen:
> 1. **El flip y la pantalla van en el mismo cambio.** Una pantalla editable mientras Airtable
>    sigue mandando son dos dueños para el mismo dato — justo lo que el principio §3.1 prohíbe.
> 2. **La tabla cortada SALE de `scripts/comun.ts`** (el catálogo de sombra) en ese mismo cambio.
>    Si no, el próximo `sombra:import` pisa con los valores viejos de Airtable lo que el equipo
>    editó en la app, en silencio, y el `sombra:diff` empieza a llamar error a lo correcto.
> 3. **El `id` del contrato es opaco** (nadie lo consume): `app.ajustes` no tiene record id de
>    Airtable y no hizo falta inventarle uno — viaja la clave. Ver `core/contracts/run-plan.md`.

> **Corte 2/4 — Referentes: HECHO (2026-07-31).** Pantallas `/curar/referentes` (el banco, con
> *A revisar* adentro en vez de en otra página) y `/curar/sugeridos`. Lo que este corte agregó al
> procedimiento, y que el piloto no podía anticipar:
> 1. **Antes de cortar un dominio, medí el dato vivo contra el schema que lo va a recibir.** Acá
>    `app.referentes` modelaba 1 proyecto por referente y la realidad son 2–4: el flip tal cual
>    tiraba 19 de 35 pares y dejaba *Storytelling* con cero fuentes. Lo arregla
>    [ADR-032](../adr/ADR-032-referente-proyecto-es-n-a-n.md) (tabla puente, migración `012`).
>    **Y el modo sombra no podía avisar:** su diff compara Airtable-ya-mapeado contra Postgres, así
>    que es ciego a lo que el mapeo tira. *Un diff que pasa por el mapper valida el transporte, no
>    el modelo.*
> 2. **El `id` dejó de ser opaco.** A diferencia de `ajustes`, `referentes[].id` **sí** lo consume
>    alguien: `Computar salud referentes` del archivado PATCHea Airtable con él. Por eso la fachada
>    sirve el `airtable_id` mientras Airtable siga recibiendo esa escritura (muere en D7).
> 3. **Si el corte rompe un loop que cierra n8n, el loop se mueve en el mismo cambio.** Aprobar un
>    sugerido sembraba el referente **en Airtable** (`POST Referentes (promoción)`), o sea nacía
>    invisible. La aprobación pasó a la app y marca la propuesta `promovido` **salteando
>    `aprobado`**, que es el estado que dispara el camino viejo: el nodo queda sin trabajo, sin
>    tocar n8n.
> 4. **La carga de datos de un corte es un script propio** (`scripts/cortar-referentes.ts`), no el
>    `sombra:import` — que en ese mismo cambio deja de ver la tabla. Corre una vez, imprime el A/B
>    (referentes por proyecto + registro por registro en los dos ámbitos) y es la evidencia que
>    ADR-027 §5 pide antes de flipear.
> **Corte 3/4 — Voces + Proyectos: HECHO (2026-07-31).** Pantalla `/curar/voces` (las voces con sus
> proyectos adentro: la voz es la espina dorsal y apagarla apaga sus proyectos, así que con dos
> pantallas la consecuencia del click quedaba en la otra). **`advertencia_criterios` ya se muestra**
> — es la primera superficie que lo hace desde que ADR-022 existe. Lo que este corte agregó al
> procedimiento:
> 1. **Antes de cortar un dominio, listá quién ESCRIBE cada uno de sus campos.** El corte 2/4 dejó
>    "medí el dato vivo contra el schema"; esta es la otra mitad. De los 8 campos de *Proyectos*,
>    **2 los escribe una máquina que no se mueve hasta D7** (`Destilar criterios` del archivado
>    PATCHea `criterios_aprendidos` + `advertencia_criterios` en Airtable, y el motor lee el primero
>    para el gate). Cortar la tabla entera mataba el loop en silencio. Lo resuelve
>    [ADR-033](../adr/ADR-033-dueno-por-campo-durante-la-coexistencia.md): **la unidad de propiedad
>    es el campo, no la tabla** — esos 2 se leen de Airtable, fail-open, hasta D7.
> 2. **La traducción de ids NO se cae en el corte 4/4: se cae en D7.** El contrato y el código lo
>    afirmaban y era falso. `Preparar batch Airtable` escribe `Candidatos.proyecto`/`.voz` como
>    links **con `typecast: true`** ⇒ un uuid no falla, *crea un proyecto fantasma*. De ahí que una
>    voz o un proyecto nacidos en la app acuñen su record id al crearse.
> 3. **Este corte no necesitó migración.** El schema `009` ya modelaba bien los dos dominios, y se
>    verificó contra el dato vivo antes de escribir código (los 6 proyectos con exactamente 1 voz y
>    los 6 con criterios ⇒ las dos constraints aguantan). Que el corte 2/4 haya necesitado un ADR y
>    una migración y este ninguno es el resultado de medir, no la suerte.

**Hecho cuando:** el equipo edita config solo en la app; en Airtable esas tablas quedan congeladas.

### D6 — El espacio de trabajo: Feed de calificación
Pantalla de calificación (🔥/👍/👎 + estado + notas), Descartes con `veredicto` **por fin editable**,
y la vista de 🔥 Seleccionados. Es la pantalla que el equipo más usa y la que decide si la migración
se siente bien.

> **D6 NO es un corte de D5.** Airtable sigue siendo el **dueño** de `Candidatos` y
> `Descartes del gate` hasta D7: la app lee esas tablas por PAT y escribe ahí mismo los campos del
> equipo. Lo que cambia es la superficie, no la propiedad — por eso las dos tablas **siguen** en el
> catálogo de sombra (`scripts/comun.ts`) y el `sombra:diff` las sigue espejando, al revés de lo que
> mandaba el procedimiento del corte 1/4. Consecuencia buena: cero cambios en n8n, y los 7 nodos del
> archivado que leen esas tablas ni se enteran.

> **Diseño acordado (grilling 2026-07-31).** La medición que lo gobierna: una corrida entrega
> **145 candidatos** en 4 proyectos (53/38/31/23) con ~1145 caracteres de script cada uno; el equipo
> **sí** califica (79 calificados del 01 al 26 de julio, 30% de precisión de entrega), pero los
> **descartes tienen 0 auditorías desde que existe la tabla**.
>
> 1. **Un gesto por candidato** — 🔥/👍/👎, el Estado se deriva ([ADR-034](../adr/ADR-034-calificar-es-un-solo-acto.md)).
> 2. **Mazo de tarjetas compactas que se abren.** Cerrada muestra lo mínimo para decidir (thumbnail,
>    título, proyecto, referente, heat) **con los tres botones ahí mismo**; abierta muestra todo
>    (script completo, razón y score del gate, métricas, notas). Abrir es opcional: los fáciles se
>    despachan de un click y el script se lee solo cuando hace falta.
> 3. **Agrupado por proyecto, heat descendente adentro.** Los criterios de relevancia son por
>    proyecto: mezclarlos obliga a rotar de criterio cada tarjeta y vuelve inconsistente el juicio.
>    Además deja repartir el trabajo entre Majo y Jero sin pisarse.
> 4. **La tarjeta calificada se queda marcada y atenuada en su lugar**, hasta recargar o cambiar de
>    filtro. Volver a clickear otro emoji la re-califica: eso *es* el deshacer, sin toast ni undo.
> 5. **Filtro sobre el mismo mazo** (sin calificar · 🔥 · aprobados · todos): la vista de
>    🔥 Seleccionados no es una pantalla, es un filtro. Se vacía el domingo con el barrido, que está
>    bien porque responde "¿qué producimos esta semana?".
> 6. **Históricos, aparte y sobre Supabase:** todos los aprobados de todas las semanas leídos de
>    `outputs` (no de Airtable), de a **25 con "cargar más"**. Sobrevive al barrido del domingo y
>    **no muere en D7** porque ya lee la fuente definitiva.
> 7. **Descartes en `/curar/descartes`, encadenado al final del feed.** Al terminar la cola, la app
>    ofrece auditar los ~20 descartes. Una página suelta a la que hay que acordarse de entrar es
>    exactamente lo que lleva 0 de 20 desde que la tabla existe, y el archivado los borra cada
>    domingo: un descarte sin auditar es una auditoría perdida para siempre.
>
> ⚠️ **Restricción técnica que condiciona el mazo:** las URLs de `thumbnail` son attachments de
> Airtable y **vencen a las ~2 h** (`v5.airtableusercontent.com`, con el expiry en el path). Nunca se
> cachean: se re-piden en cada carga (`leerTabla` ya usa `cache: "no-store"`). Si la página se
> cachea o las URLs pasan por el optimizador de imágenes, las tarjetas quedan rotas.
**Por qué `veredicto` editable no es cosmético:** es el **único** campo de *Descartes* que lee una
máquina — el archivado cuenta los "era bueno" para `falsos_negativos`. Con el campo bloqueado ese
contador da **siempre 0**, y "0 falsos negativos" se lee como *el gate está perfecto*, que es la
conclusión opuesta a la verdad: el loop de auditoría de ADR-021 no está incompleto, está **muerto**.
Si la app lo vuelve a dejar de solo-lectura, hereda el mismo agujero.
**Hecho cuando:** una semana entera de calificación pasa por la app sin que nadie abra Airtable.

### D7 — Corte de escritura *(re-import #2)* — ✅ **EN PRODUCCIÓN (2026-08-01)**
> 🔁 **Y con el cockpit ya live salió la primera revisión de UI/UX** (commit `dce25a3`): 10
> observaciones de uso real, de las que 3 eran bugs (miniaturas bloqueadas por CORP, el botón del
> buscador sin renderizar, las barras del embudo comparando videos con evaluaciones). Dejó los
> principios **§3.9 y §3.10** de arriba y los ADRs 037/038/039. Detalle en el
> [handoff, cierre 78](./handoff.md).

Los **3 workflows** dejan de tocar Airtable, y la app también: se borró `lib/airtable.ts` entero.
El contrato de escritura se cerró con **[ADR-035](../adr/ADR-035-contrato-de-escritura-por-postgrest.md)**
— *n8n lee su config por la fachada, escribe sus resultados por PostgREST* — y no con "ADR-029" como
decía este plan (ese número ya se había usado para dedup blindado). El archivado adelgaza de 35
nodos a 20.
**Hecho cuando:** una corrida completa (motor → archivado) no toca Airtable en ningún nodo.

> **El alcance real fue más grande que este párrafo, y a propósito.** Decía "motor + archivado",
> pero dejar el descubrimiento afuera creaba un **tercer re-import** que el plan dice que no existe
> (§6: solo D4 y D7). Entró, y fue el **piloto**: 1 nodo cambió de destino y 4 se borraron.
>
> **Los 6 hallazgos del grilling, porque 3 eran pérdidas silenciosas** — de las que no fallan, salen
> verdes y dejan un número en cero:
> 1. **`app.candidatos` no tenía `external_id`.** El motor lo escribía en Airtable como 3ª línea del
>    dedup (ADR-029) y el schema `009` no le dio columna: el import de sombra lo venía tirando hace
>    semanas. Ahora va **con `unique`**, así que la defensa pasó de procedural a estructural — es la
>    alternativa que ADR-029 dejó diferida. `Leer feed vivo` **no se borró**: el constraint atrapa el
>    duplicado *después* de pagar la transcripción, el nodo lo mata *antes*.
> 2. **Airtable re-hosteaba las miniaturas y nadie lo había notado.** Ahora se guarda la URL cruda
>    del CDN, firmada y con expiry. La tarjeta cae a un placeholder cuando vence, y **la primera
>    corrida post-D7 mide cuánto viven** (nadie lo sabe: nunca se guardó la original). Si no aguantan
>    la semana, entra Supabase Storage.
> 3. 🔴 **D7 mataba `falsos_negativos` por segunda vez.** `v_embudo_semana` no lo tiene y no puede:
>    ese número sale de contar descartes auditados, no de `runs.metricas`. Lo arregla
>    [ADR-036](../adr/ADR-036-los-descartes-no-se-barren.md): los descartes **dejan de barrerse** y
>    el contador pasa a ser una vista viva. Efecto lateral bueno: un descarte sin auditar dejó de ser
>    *"una auditoría perdida para siempre"*.
> 4. 🔴 **`fecha_calificacion` no tenía autor.** En Airtable era un `lastModified` que se calculaba
>    solo; en Postgres quedaba NULL, y de ella cuelga `outputs.calificado_en` → `v_metricas_calidad`,
>    que filtra `calificado_en is not null`. La pantalla *Calidad* habría dado **cero filas** y la
>    **precisión de entrega** —la métrica norte de ADR-021— habría desaparecido sin que nada fallara.
> 5. 🟠 **El embudo del descubrimiento se quedaba sin reemplazo** (`v_embudo_semana` filtra
>    `workflow = 'motor'`). Los costos sí estaban cubiertos; el embudo no.
> 6. 🔴 **`Referentes propuestos` es N:M**, medido contra el dato vivo: las 8 propuestas tenían
>    **2 proyectos cada una**, y el schema les daba un `proyecto_id` simple ⇒ el corte tiraba 8 de 16
>    pares. Es el bug del corte 2/4 otra vez, completo. Enmienda de ADR-032 + tabla puente.
>    **Que cayera en el piloto es exactamente por qué el piloto va primero.**
>
> **La regla de método que deja este corte**, y que completa la trilogía: el 2/4 dejó *"medí el dato
> vivo contra el schema que lo va a recibir"*, el 3/4 dejó *"listá quién ESCRIBE cada campo"*, y D7
> agrega **"listá qué campos NO los escribía nadie, porque Airtable los calculaba solo"**. Los
> `createdTime`, `lastModified` y las columnas-fórmula no tienen autor: al migrar se vuelven NULL en
> silencio y se llevan puesto lo que dependía de ellos.

### D7.5 — matar el archivado *(sin re-import, después de la corrida verde)*
Con todo en Postgres el archivado dejó de ser un movedor de datos: archivar y barrer son una
sentencia SQL cada uno. Lo que queda es la llamada a Haiku de `Destilar criterios` y el Sheet.
El paso siguiente es que **la app escriba `outputs` en el mismo acto de calificar** — enmienda
ADR-014, pide `run_id` en `app.candidatos`, y por eso D7 *no* lo agregó especulativamente.
No entró en D7 por "una corrida, una variable": cambiar quién escribe el histórico al mismo tiempo
que se re-importan 3 workflows significa no saber cuál de los dos lo rompió.

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

- [x] **Contrato de escritura del motor (D7).** RESUELTO en
      **[ADR-035](../adr/ADR-035-contrato-de-escritura-por-postgrest.md)**: PostgREST directo, no
      endpoint de la app. La simetría con ADR-028 era falsa — n8n ya escribía `runs`/`outputs`
      directo desde el día 1, y meter la app en el camino de la **entrega** la vuelve una dependencia
      justo donde el sistema es fail-open a propósito. *(Este plan decía "se cierra con ADR-029";
      ese número terminó usándose para dedup blindado.)*
- [x] **Qué queda del archivado.** RESUELTO: se reduce a archivar a `outputs`, escribir el Sheet,
      destilar criterios (ADR-022) y barrer candidatos. De 35 nodos a 20. Las Métricas y la salud de
      referentes se borraron (ya eran vistas desde D2 y el corte 2/4). **El siguiente paso —matarlo
      del todo— es D7.5**, y no entró en D7 por "una corrida, una variable".
- [x] **Estado de corrida: polling vs. Supabase Realtime.** RESUELTO en D1 (cierre 59): polling cada
      5 s **solo** mientras hay una corrida `en_curso` (`operar/auto-refresh.tsx`). Realtime queda
      como optimización futura si molesta.
- [ ] **Cuándo entra `client_id`** en el schema `app` (multi-cliente, ADR-003). Hoy hay un cliente.
- [ ] **El Sheet Histórico** (ADR-014): ¿sobrevive como export, o la app lo reemplaza?
- [ ] **Techo de presupuesto** de la superficie nueva: Vercel free alcanza hoy; validar con el jefe
      junto al presupuesto pendiente de [PLAN §3.2](../../PLAN.md).
