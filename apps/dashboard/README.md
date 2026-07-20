# Cockpit de contenido — `apps/dashboard`

La superficie propia que reemplaza a Airtable ([ADR-025](../../docs/adr/ADR-025-cockpit-producto-propio.md)/[026](../../docs/adr/ADR-026-stack-del-cockpit-propio.md)).
El plan por fases vive en [plan-cockpit-propio.md](../../docs/agents/plan-cockpit-propio.md); esto es solo cómo correr y operar la app.

**Stack:** Next.js (App Router) + TypeScript + Tailwind + shadcn/ui (copiado al repo) · Supabase
(Auth magic link + RLS) · Zod en los bordes · sin ORM (el schema vive en [`core/schema/`](../../core/schema/)).

## Mapa del código

- `app/` — rutas. `login/` + `auth/confirm/` (magic link), y las 3 zonas en `(zonas)/`:
  `operar` · `curar` · `entender` (plan-cockpit §2.1).
- `domain/` — reglas puras sin IO (C3): hoy roles y zonas. Se testea con `node:test`.
- `lib/` — clientes Supabase (server) y `auth.ts` (guardias `usuarioActual`/`exigirZona`).
- `components/ui/` — shadcn, código propio editable (C9).
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

1. **Migración [`007_app_usuarios.sql`](../../core/schema/007_app_usuarios.sql)** en el SQL Editor
   de Supabase, y agregar `app` a *Settings → API → Exposed schemas* (sin esto la app no lee roles).
2. **Invitar a los 5 usuarios:** *Authentication → Invite user* con cada mail, e insertar su fila en
   `app.usuarios` con su rol (snippet en el header de la migración). El login usa
   `shouldCreateUser: false`: un mail no invitado no crea cuenta.
3. **Vercel:** proyecto nuevo apuntando a este repo con *Root Directory* = `apps/dashboard`, y las 2
   env vars de `.env.example` (del gestor). Producción en `main`, preview por rama (ADR-026).
   En Supabase, *Authentication → URL Configuration*: agregar la URL de Vercel a *Redirect URLs*.

**Hecho-cuando de D0:** Majo entra desde su mail, ve su nombre y su rol `operador`, navega Operar y
Curar, y `/entender` la devuelve a su zona.
