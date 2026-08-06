# Runbook — dar de alta una empresa nueva

> **Para quién.** Alguien con acceso al SQL Editor de Supabase y al cockpit. **No hace falta ser el
> dev del motor**, y no se toca n8n ni una sola vez.
>
> **Cuánto tarda.** ~10 minutos de trabajo + el rato que el equipo tarde en cargar sus referentes.
>
> **El criterio de este doc** ([PLAN §F5](../../PLAN.md)): *si algún paso exige modificar el núcleo,
> el diseño no está listo — se corrige la guía o el contrato, no se parchea a mano.*
> ✅ **Esta guía lo pasa: ningún paso toca código, ni n8n, ni `core/schema/`.**

---

## Antes de empezar: qué estás dando de alta

Dos cosas distintas, y la diferencia importa porque **tienen granos distintos**:

| | Qué es | Ejemplo | Qué cuelga de ahí |
|---|---|---|---|
| **Empresa** (`clients`) | El tenant. Es el primer tramo de la URL | `retia` | Las **voces**, los **proyectos**, los **referentes** y las **personas** |
| **Cockpit** (`instances`) | Una empresa **×** un pipeline. Es el segundo tramo | `retia/reels` | Las **perillas**, los **candidatos**, los **descartes**, las **corridas** |

Una empresa puede tener varios cockpits (Retia tiene `reels` y `linkedin`) y **comparte sus voces y
referentes entre ellos**. Es el doble grano de
[plan-multi-tenant §2.B](../agents/plan-multi-tenant.md).

🔑 **Por qué esto no necesita a n8n.** El motor es **un** workflow parametrizado. El dispatcher le
pregunta a la fachada *"¿qué instancias están activas?"* y dispara una ejecución por cada una
([ADR-050](../adr/ADR-050-dispatcher-una-ejecucion-por-instancia.md),
[ADR-048](../adr/ADR-048-run-plan-v2-motor-por-instancia.md)). **Una fila con `estado = 'active'` ES
el alta operativa.** No hay workflow que duplicar ni cron que agregar.

---

## 1. Correr el SQL — la empresa y su cockpit

[`core/templates/cliente-nuevo.sql`](../../core/templates/cliente-nuevo.sql), en el **SQL Editor** de
Supabase. **Editá solo el `§0`** (son 4 datos) y corré todo junto.

```
cliente_id      → el slug. ES LA URL, así que minúscula y sin espacios: /nuevocliente/reels
cliente_nombre  → cómo se muestra
workflow_id     → 'short-form-content' (reels) o 'linkedin'
cockpit_slug    → 'reels' | 'linkedin'
cockpit_modelo  → de qué cockpit se copian las 18 perillas con sus textos
```

**Va en una transacción con guardas**: si el slug ya existe, si el workflow no existe, o si el
cockpit modelo es de otro pipeline, aborta y no queda nada a medias.

🛑 **Al final devuelve una fila de verificación. LEELA antes del `commit`.** Tiene que decir
`estado = draft` y **`ajustes = 18`**. Es la lección de la `019`
([§14.1](../agents/plan-multi-tenant.md)): *una migración no está aplicada porque haya corrido, sino
cuando se mide su efecto.* Si la fila no está, `rollback`.

> ✅ **El template está probado end-to-end contra prod el 2026-08-06**, en una transacción que se
> revirtió: dejó 1 empresa, 1 cockpit en `draft` y **18 perillas, las 18 con su descripción**.

### Por qué nace en `draft`

Porque el dispatcher **solo dispara las `active`**. Una empresa recién creada no tiene voces ni
referentes: si el cockpit naciera prendido, el lunes a las 08:00 le correría el motor, no encontraría
nada y **igual pagaría** las llamadas de la corrida. Prenderla es el **paso 5**, el último.

## 2. Dar de alta a las personas

**Desde el cockpit: `/<empresa>/<pipeline>/ajustes/equipo` → Invitar.** El formulario pide **tres**
cosas —**nombre, mail y rol**— y el nombre es obligatorio (mínimo 2 caracteres): sin él la Server
Action rechaza el alta.

🔑 **La empresa no se elige en el formulario: sale del cockpit abierto.** Es lo que mata el modo de
falla mudo que nombraba [ADR-051](../adr/ADR-051-el-acceso-es-membresia-explicita.md) — una membresía
con la empresa equivocada metía a alguien en el cockpit de otro cliente **sin un solo error**. Acá no
hay dónde equivocarse.

⚠️ **Y el corolario que sí se puede leer mal: la membresía es por EMPRESA, no por pipeline.** Invitar
desde `/retia/reels/ajustes/equipo` da acceso a **todos** los cockpits de Retia, LinkedIn incluido. No
hay forma de dar acceso a un pipeline y no a otro — y eso es ADR-051, no un olvido.

**Roles:** `operador` (opera, califica, transcribe, y ve Entender **sin costos**) · `sponsor`
(**Entender + Ajustes**, sin costos, **y es el único rol del cliente que puede administrar su propio
equipo**) · `dev` (todo, **incluidos los costos de proveedor**).

🩸 **`sponsor` NO es "solo Entender", y esa línea vieja escondía la decisión más importante del paso:**
desde ADR-060 la zona `ajustes` la ven los tres roles y lo que se gatea son sus pantallas —
`ajustes/equipo` la administran **`dev` y `sponsor`** (`domain/permisos.ts`). **El `sponsor` es el rol
que se le da al jefe del cliente** si querés que se dé de alta a su gente solo.

⚠️ **`dev` no se le da a nadie de la empresa cliente:** ese rol ve lo que cuestan los proveedores, o
sea el margen de la agencia. **Y no depende de tu disciplina:** `rolesQuePuedeOtorgar` solo ofrece
`dev` a quien tenga `es_dueno`, así que un `sponsor` del cliente **no puede** otorgarlo ni forzando el
POST. Nadie otorga un rol que no tiene, y eso lo decide la Server Action, no el `<select>`.

📬 **Si la persona YA tiene cuenta, no le llega ningún mail.** `darDeAlta` detecta el mail existente,
le suma la membresía nueva y la pantalla lo dice (*"ya tenía cuenta: se le dio acceso a esta empresa,
sin mail nuevo"*). Al agregar una empresa esto es el caso **normal**, no el borde: la gente que ya
trabaja en otra empresa del sistema entra directo, y esperar un mail que no va a llegar es la forma
más fácil de creer que el alta falló.

> 🚧 **LO VERIFICADO Y LO QUE FALTA (2026-08-06).** Todo lo de arriba está contrastado contra el código
> de A5 en `main` (`lib/equipo.ts`, `ajustes/equipo/actions.ts`, `domain/permisos.ts`) y contra prod.
> **Lo que NADIE hizo todavía es el alta real por la pantalla**: eso pide una sesión con magic link y
> es de [`docs/verificaciones-humanas.md`](../verificaciones-humanas.md). Hasta ese clic, lo único sin
> confirmar de este paso es **que el mail de invitación llegue**.
>
> 🩸 **Y una cosa que este runbook daba por sentada y prod desmiente: hoy ninguna empresa cliente puede
> darse de alta a sí misma.** Medido el 06/08 sobre `app.usuarios_clientes`: **cero `sponsor` en las
> tres empresas**, y los únicos 2 que administran equipo son los devs de la agencia (los dos
> `es_dueno`, en `retia`). `30x` y `estadox` tienen **una sola persona cada una, `operador`** — un
> `operador` que entre a `/…/ajustes/equipo` a mano sale rebotado al índice de Ajustes.
> **Consecuencia práctica: este paso lo hace la agencia**, entrando a cualquier cockpit por
> `es_dueno` (que `rolEn` resuelve como `dev`). Si querés que el cliente se administre solo, el alta
> tiene que incluir **un `sponsor`**, y hoy eso es una decisión que nadie tomó.

## 3. Cargar la config, desde el cockpit

Lo hace el equipo de la empresa, **sin SQL**. En `/<empresa>/<pipeline>/curar`:

| Pantalla | Qué cargar | Mínimo para que el motor entregue algo |
|---|---|---|
| **Voces** | Al menos 1 voz, **activa**, con sus criterios de relevancia | **1 voz activa** |
| **Proyectos** | Al menos 1 proyecto **activo**, colgado de una voz activa, con criterios y su `N` | **1 proyecto activo** |
| **Referentes** | Las cuentas a seguir. **Incluí referentes en EN/PT/IT/FR**: el heat-score los bonifica y son la mitad del valor del sistema | **1 referente** |
| **Ajustes** | Ya vienen las 18, copiadas del modelo. Tocalas solo si esta empresa necesita otra cosa | *(nada)* |

⚠️ **El gate es *proyecto activo de una voz activa*.** Un proyecto prendido colgado de una voz apagada
**no corre**, y la pantalla Operar lo avisa. Es el error más común al configurar una empresa nueva.

## 4. Verificar que el sistema la ve — antes de prenderla

Tres chequeos, **en este orden**. Reemplazá `<INSTANCE_ID>` por el uuid que devolvió el paso 1.

```bash
set -a && source .env && set +a

# 1. ¿La fachada le arma un plan de corrida?  → 200 con las voces y proyectos que cargaste
curl -s -H "$RUN_PLAN_HEADER_NOMBRE: $RUN_PLAN_HEADER_VALOR" \
  "$DASHBOARD_URL/api/engine/run-plan?instancia=<INSTANCE_ID>" | head -c 400

# 2. ¿El dispatcher la va a levantar?  → todavía NO tiene que aparecer (está en draft)
curl -s -H "$RUN_PLAN_HEADER_NOMBRE: $RUN_PLAN_HEADER_VALOR" \
  "$DASHBOARD_URL/api/engine/instancias?workflow=short-form-content"
```

3. **Entrar al cockpit** en `<DASHBOARD_URL>/<empresa>/<pipeline>` con una cuenta de la empresa nueva
   (ventana de incógnito) y recorrer las 4 zonas. **Tienen que mostrar lo que cargaste y NADA de otra
   empresa.** Si una pantalla carga limpia y muestra **0** donde vos cargaste datos, no es que falten
   datos: es una policy que no matchea — ver
   [`docs/verificaciones-humanas.md` §0](../verificaciones-humanas.md).

## 5. Prender el cockpit

```sql
update instances set estado = 'active' where id = '<INSTANCE_ID>';
```

Volvé a correr el chequeo 2 del paso anterior: **ahora sí tiene que aparecer**. Desde ese momento el
cron la levanta sola (motor lunes 08:00, archivado domingo 18:00, `America/Bogota`).

⚠️ **Prender el cockpit es autorizar gasto.** La próxima corrida va a llamar a Apify, Supadata y
Anthropic para esta empresa.

---

## Lo que este runbook NO resuelve, y hay que saberlo

- **El cupo de los proveedores es compartido.** El **costo** se atribuye por instancia
  (`runs.metricas` × `app.tarifas`); el **cupo no**. Una empresa le puede quemar la cuota de Apify o
  Supadata a otra y nada avisa. Está anotado en [§14.5](../agents/plan-multi-tenant.md), sin techo por
  instancia todavía.
- **`concurrencia_transcribir` y los presupuestos son del pod de n8n, no de la empresa.** Viven en el
  nodo `Config` del motor, fuera del `AJUSTE_MAP`. Tres empresas corriendo en paralelo triplican las
  llamadas en vuelo a Supadata.
- **El dedup es por instancia a propósito.** Si otra empresa ya transcribió un video, esta lo paga de
  nuevo. El unique global murió en la `017` porque le vaciaba el supply a la segunda empresa.

## Si algo sale mal

| Síntoma | Qué es |
|---|---|
| El SQL aborta con `raise exception` | Una guarda del `§1`. El mensaje dice cuál. No quedó nada escrito |
| `ajustes = 0` en la verificación | El `cockpit_modelo` no era del mismo `workflow_id`. `rollback` y corregí el `§0` |
| El cockpit carga pero muestra **0** en todo | Una policy que no matchea. **No** es falta de datos |
| `42501` en pantalla | Falta un `grant`. Se arregla con SQL, sin revertir el deploy |
| El motor no corre para la empresa nueva | Casi siempre: sigue en `draft`, o no hay **proyecto activo de voz activa** |
