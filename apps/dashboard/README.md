# Cockpit de contenido — `apps/dashboard`

La superficie propia que reemplaza a Airtable ([ADR-025](../../docs/adr/ADR-025-cockpit-producto-propio.md)/[026](../../docs/adr/ADR-026-stack-del-cockpit-propio.md)).
El plan por fases vive en [plan-cockpit-propio.md](../../docs/agents/plan-cockpit-propio.md); esto es solo cómo correr y operar la app.

**Stack:** Next.js (App Router) + TypeScript + Tailwind + shadcn/ui (copiado al repo) · Supabase
(Auth magic link + RLS) · Zod en los bordes · sin ORM (el schema vive en [`core/schema/`](../../core/schema/)).

## Mapa del código

- `app/` — rutas. `login/` + `auth/confirm/` (magic link), las 3 zonas en `(zonas)/`:
  `operar` · `curar` · `entender` (plan-cockpit §2.1), y `api/engine/run-plan/` — la fachada del
  motor (ADR-028, contrato en [core/contracts/run-plan.md](../../core/contracts/run-plan.md)):
  header compartido, fail-closed, hoy lee Airtable por dentro.
- `domain/` — reglas puras sin IO (C3): roles y zonas, y la vista de corrida (qué corre, N
  resuelta, estado legible). Se testea con `node:test`.
- `lib/` — clientes Supabase (server con anon key + `admin.ts` con service_role, solo BFF),
  `airtable.ts` (lectura read-only de la config mientras viva en Airtable; muere en D5),
  `runs.ts` (últimas corridas del motor) y `auth.ts` (guardias `usuarioActual`/`exigirZona`).
- `components/ui/` — shadcn, código propio editable (C9).
- `scripts/` — el modo sombra de D3: `npm run sombra:import` (espejo idempotente Airtable → schema
  `app`) y `npm run sombra:diff` (compara los dos mundos; exit 1 si difieren). Airtable sigue siendo
  el dueño hasta que el diff dé cero 3 corridas seguidas (plan-cockpit §6/D3).
- `proxy.ts` — refresh de sesión + redirect a login (en Next 16 middleware se llama proxy).

La autoridad de permisos está en el servidor: cada página exige su zona con `exigirZona`, y los
datos los protege RLS. El nav solo *esconde*.

## Correr local

```bash
npm install
cp .env.example .env.local   # valores reales: en el gestor de contraseñas
npm run dev
```

Scripts: `npm run typecheck` · `npm test` (dominio) · `npm run build`.

## Setup una sola vez (manual, de Mani)

1. **Migraciones [`007_app_usuarios.sql`](../../core/schema/007_app_usuarios.sql),
   [`008_entender_tarifas_y_vistas.sql`](../../core/schema/008_entender_tarifas_y_vistas.sql) y
   [`009_app_config_sombra.sql`](../../core/schema/009_app_config_sombra.sql)** en el SQL Editor de
   Supabase (en ese orden), y agregar `app` a *Settings → API → Exposed schemas* (sin esto la app
   no lee roles ni las vistas analíticas).
2. **Invitar a los 5 usuarios:** *Authentication → Invite user* con cada mail, e insertar su fila en
   `app.usuarios` con su rol (snippet en el header de la migración). El login usa
   `shouldCreateUser: false`: un mail no invitado no crea cuenta.
3. **Vercel:** proyecto nuevo apuntando a este repo con *Root Directory* = `apps/dashboard`, y las
   env vars de `.env.example` (del gestor). Producción en `main`, preview por rama (ADR-026).
   En Supabase, *Authentication → URL Configuration*: agregar la URL de Vercel a *Redirect URLs*.
4. **Env vars de D1/D4** (también del gestor, solo server-side): `SUPABASE_SERVICE_ROLE` ·
   `AIRTABLE_PAT` + `AIRTABLE_BASE_ID` · `MOTOR_WEBHOOK_URL` + los 2 del header (el par exacto de
   la credencial `Webhook Motor Header` de n8n — si difiere en algo, el botón da 403) · los 2
   `RUN_PLAN_HEADER_*` (el par que n8n mandará a la fachada; generar nuevo, no reusar el del
   webhook).

**Hecho-cuando de D0:** Majo entra desde su mail, ve su nombre y su rol `operador`, navega Operar y
Curar, y `/entender` la devuelve a su zona.

**Hecho-cuando de D1:** Jero dispara una corrida real desde *Operar* sin abrir n8n y ve cuándo
terminó y qué entregó (plan-cockpit §6).

**Hecho-cuando de D2:** el embudo completo de la semana se ve en una pantalla y el jefe encuentra
el costo de la semana solo (zona *Entender*, con la migración 008 aplicada).
