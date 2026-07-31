# Cockpit de contenido — `apps/dashboard`

La superficie propia que reemplaza a Airtable ([ADR-025](../../docs/adr/ADR-025-cockpit-producto-propio.md)/[026](../../docs/adr/ADR-026-stack-del-cockpit-propio.md)).
El plan por fases vive en [plan-cockpit-propio.md](../../docs/agents/plan-cockpit-propio.md); esto es solo cómo correr y operar la app.

**Stack:** Next.js (App Router) + TypeScript + Tailwind + shadcn/ui (copiado al repo) · Supabase
(Auth magic link + RLS) · Zod en los bordes · sin ORM (el schema vive en [`core/schema/`](../../core/schema/)).

## Mapa del código

- `app/` — rutas. `login/` + `auth/confirm/` (magic link), las 4 zonas en `(zonas)/`:
  `operar` · `curar` · `transcribir` · `entender` (plan-cockpit §2.1 + ADR-031), y
  `api/engine/run-plan/` — la fachada del motor (ADR-028, contrato en
  [core/contracts/run-plan.md](../../core/contracts/run-plan.md)): header compartido, fail-closed.
  De qué almacenamiento sale cada dominio lo decide `lib/config.ts` — la costura de los cortes de
  D5. Con el corte 3/4 los **cuatro** dominios del contrato salen de Postgres; lo único que sigue
  viniendo de Airtable son `criterios_aprendidos` y `advertencia_criterios`, que no son config del
  equipo sino salida del archivado y se leen de donde su escritor los deja hasta D7
  ([ADR-033](../../docs/adr/ADR-033-dueno-por-campo-durante-la-coexistencia.md)).
- `domain/` — reglas puras sin IO (C3): roles y zonas, la vista de corrida (qué corre, N
  resuelta, estado legible) y `enlace.ts` (de un pegote de texto a `external_id`). Se testea con
  `node:test`.
- `lib/` — clientes Supabase (server con anon key + `admin.ts` con service_role, solo BFF),
  `airtable.ts` (lo que todavía vive en Airtable; muere en D8), `ajustes.ts`, `referentes.ts` y
  `proyectos.ts` (los dominios ya cortados a Postgres), `sugeridos.ts` (la bandeja del descubrimiento),
  `runs.ts` (últimas corridas del motor), `transcripciones.ts` + `transcribir.ts` (el transcriptor:
  la cola y las llamadas a Supadata/Haiku), `eventos.ts` (auditoría, sumidero) y `auth.ts`
  (guardias `usuarioActual`/`exigirZona`).
- `components/ui/` — shadcn, código propio editable (C9).
- `scripts/` — el modo sombra de D3: `npm run sombra:import` (espejo idempotente Airtable → schema
  `app`) y `npm run sombra:diff` (compara los dos mundos; exit 1 si difieren). **Una tabla ya
  cortada sale del catálogo** (`comun.ts`) para que un import no pise lo que el equipo editó en la
  app. Más los scripts de corte, que corren **una sola vez** cada uno e imprimen el A/B que
  autoriza a publicar el flip (`-- --dry` para verificar sin escribir): `npm run cortar:referentes`
  (corte 2/4, va entre la migración `012` y el flip) y `npm run cortar:voces-proyectos` (corte 3/4,
  sin migración de por medio — el schema `009` ya modelaba bien los dos dominios).
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
   [`008_entender_tarifas_y_vistas.sql`](../../core/schema/008_entender_tarifas_y_vistas.sql),
   [`009_app_config_sombra.sql`](../../core/schema/009_app_config_sombra.sql) y
   [`010_transcripciones.sql`](../../core/schema/010_transcripciones.sql) y
   [`011_grants_app_service_role.sql`](../../core/schema/011_grants_app_service_role.sql) y
   [`012_referentes_proyectos.sql`](../../core/schema/012_referentes_proyectos.sql)** en el
   SQL Editor de Supabase (en ese orden), y agregar `app` a *Settings → API → Exposed schemas*
   (sin esto la app no lee roles ni las vistas analíticas).
   La 010 es la del transcriptor (ADR-031); la **012 es el corte 2/4** (ADR-032: el vínculo
   referente↔proyecto pasa a tabla puente) y va **antes** de `npm run cortar:referentes`.
   La **011 es obligatoria**: sin ella el BFF recibe
   `42501 permission denied for schema app` en TODO lo que lee de `app.*` — *Entender*,
   *Transcribir* y los scripts de sombra. El login no lo delata porque va por la anon key.
2. **Invitar a los usuarios:** *Authentication → Invite user* con cada mail, e insertar su fila en
   `app.usuarios` con su rol (snippet en el header de la migración). El login usa
   `shouldCreateUser: false`: un mail no invitado no crea cuenta.
   > ⚠️ **El email built-in de Supabase (free) tiene rate limit muy bajo** (unos pocos/hora) y no deja
   > editar templates sin custom SMTP. Para un login por mail confiable **conectá un SMTP propio
   > (Resend: gratis, sin IP/host)** en *Authentication → SMTP Settings*. Eso además habilita editar el
   > template "Magic Link" al flujo **token_hash** (`{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`),
   > que `auth/confirm` ya soporta y que evita el "el link ya no sirve" por cross-device o escaneo de
   > Gmail. Sin SMTP el login se traba en testing (cierre 64).
   > 🔑 **Resend exige un dominio verificado para mandar a mails arbitrarios** (cierre 65). Sin
   > verificar, Resend está en modo test: solo entrega al mail dueño de la cuenta, y a cualquier otro
   > lo rechaza con 403 → Supabase devuelve 500 (el `signInWithOtp` falla). Fix: *Resend → Domains →
   > Add Domain*, cargar SPF/DKIM en el DNS del dominio, y poner el Sender email en ese dominio
   > (`noreply@dominio`). Eso además saca al mail del spam (SPF/DKIM firmados). Con `onboarding@resend.dev`
   > solo se puede probar contra el mail de la cuenta.
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

**Hecho-cuando de D3:** `npm run sombra:diff` da cero diferencias 3 corridas seguidas (una con
ediciones del equipo de por medio), con las env de Airtable + `SUPABASE_SERVICE_ROLE` en `.env.local`.

**Hecho-cuando de cada corte de D5:** el equipo edita ese dominio solo en la app y su página de
Airtable queda congelada. Cada corte suma su propia evidencia previa, que tiene que terminar en
verde **antes** de publicar el flip: `npm run cortar:referentes` (mismos referentes por proyecto y
mismos registros que servía Airtable, en los dos ámbitos) y `npm run cortar:voces-proyectos`
(mismos registros y **mismos proyectos que van a correr**, que es el cruce activo×voz-activa que
decide qué trabaja de verdad).

⚠️ **En el corte 3/4, "congelar" es para personas, no para la máquina:** `Destilar criterios` del
archivado le sigue escribiendo `criterios_aprendidos` y `advertencia_criterios` a la tabla
`Proyectos` de Airtable hasta D7, y la app los lee de ahí (ADR-033). Bloquear la tabla rompe el
loop de ADR-022.

**Hecho-cuando de D4:** una corrida real del motor produce el mismo plan leyendo la fachada que
leyendo Airtable (verificado con `test-nodos.mjs` + replay), tras el swap de nodos y el re-import #1.
La mitad-app ya se puede probar sin n8n:
`curl -H "<RUN_PLAN_HEADER_NOMBRE>: <valor>" https://<app>/api/engine/run-plan?ambito=motor`.
