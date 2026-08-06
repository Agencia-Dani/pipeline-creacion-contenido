# Cockpit de contenido — `apps/dashboard`

La superficie propia que reemplaza a Airtable ([ADR-025](../../docs/adr/ADR-025-cockpit-producto-propio.md)/[026](../../docs/adr/ADR-026-stack-del-cockpit-propio.md)).
El plan por fases vive en [plan-cockpit-propio.md](../../docs/agents/plan-cockpit-propio.md); esto es solo cómo correr y operar la app.

**Stack:** Next.js (App Router) + TypeScript + Tailwind + shadcn/ui (copiado al repo) · Supabase
(Auth magic link + RLS) · Zod en los bordes · sin ORM (el schema vive en [`core/schema/`](../../core/schema/)).

## Mapa del código

- `app/` — rutas. `login/` + `auth/confirm/` (magic link), las 4 zonas en
  **`[cliente]/[pipeline]/(zonas)/`**: `operar` · `curar` · `transcribir` · `entender`
  (plan-cockpit §2.1 + ADR-031), y `api/engine/run-plan/` — la fachada del motor (ADR-028, contrato en
  [core/contracts/run-plan.md](../../core/contracts/run-plan.md)): header compartido, fail-closed.
  De qué almacenamiento sale cada dominio lo decide `lib/config.ts` — la costura de los cortes de
  D5. **Desde D7 los cuatro dominios del contrato salen de Postgres y Airtable no participa**;
  `criterios_aprendidos`/`advertencia_criterios` también, porque D7 movió su escritor a PostgREST y
  ADR-033 (un dueño por campo durante la coexistencia) se cumplió entera.
  ⚠️ `visibilidad` de los ajustes es un campo **de la UI, no del contrato**: la fachada sigue
  sirviendo los 18 knobs aunque el equipo solo vea algunos
  ([ADR-038](../../docs/adr/ADR-038-una-sola-perilla-de-cantidad.md)).
- `domain/` — reglas puras sin IO (C3): roles y zonas, la vista de corrida (qué corre, N
  resuelta, estado legible), `enlace.ts` (de un pegote de texto a `external_id`) y `borrado.ts`
  (**qué se puede borrar**: un registro sale solo si nunca produjo nada —
  [ADR-045](../../docs/adr/ADR-045-se-borra-solo-lo-que-nunca-produjo-nada.md) — y esta función
  arma *la frase*; la FK sigue siendo *la garantía*) y **`tenant.ts`** (**de quién es cada cosa**:
  la visibilidad por el árbol de `clients.parent_id`, con tope de profundidad porque un ciclo
  colgaría el request — [ADR-046](../../docs/adr/ADR-046-el-cockpit-es-multi-tenant.md)).
  Se testea con `node:test`.
- `lib/` — clientes Supabase (server con anon key + `admin.ts` con service_role, solo BFF),
  `ajustes.ts`, `referentes.ts` y `proyectos.ts` (los dominios de config, todos en Postgres desde
  D7 — `airtable.ts` murió con el corte), `sugeridos.ts` (la bandeja del descubrimiento),
  `runs.ts` (últimas corridas del motor), `transcripciones.ts` + `transcribir.ts` (el transcriptor:
  la cola y las llamadas a Supadata/Haiku), `eventos.ts` (auditoría, sumidero) y `auth.ts`
  (guardias `usuarioActual`/`exigirZona`/**`exigirTenant`**).
  **`supabase/scoped.ts` es la pieza a entender antes de tocar cualquier otro archivo de `lib/`**
  ([ADR-047](../../docs/adr/ADR-047-aislamiento-en-dos-capas.md), Capa 1): envuelve el acceso a
  Supabase de forma que **no se pueda construir una query sin `TenantContext`**, y el mapa
  tabla→grano vive ahí y solo ahí — *una tabla nueva sin entrada no compila*. `tenant.ts` es el
  único archivo que lee `clients`/`instances` sin scopear, y tiene que serlo: scopear la tabla con
  la que se resuelve el scope sería circular.
- `components/ui/` — shadcn, código propio editable (C9). Lo propio del cockpit:
  **`modal.tsx`** (el `<dialog>` nativo del estándar de
  [ADR-039](../../docs/adr/ADR-039-la-lista-resume-el-record-se-abre.md) — uno por lista, no uno por
  fila), **`copiar.tsx`** (copiar el guion al portapapeles) y **`select.tsx`** (el `<select>` nativo
  con la caja del `<Input>`; existía copiado a mano en 4 pantallas con 2 alturas distintas).
  `components/boton-buscar.tsx` y **`components/borrar.tsx`** están afuera de `ui/` porque no son
  primitivas: el primero lo renderizan dos zonas (Operar y Curar → Sugeridos); el segundo es el
  control de borrado de las tres pantallas de config (voz, proyecto, cuenta), que **confirma en el
  lugar** —el botón se reemplaza por la pregunta— y devuelve el resultado al pie del formulario en
  vez de mostrarlo él, para no tener dos frases del servidor compitiendo en la misma barra.
- `app/api/miniatura/` — el proxy de miniaturas
  ([ADR-037](../../docs/adr/ADR-037-miniaturas-por-proxy-propio.md)). **Sin esto el feed no muestra
  ni una imagen:** el CDN de Instagram manda `cross-origin-resource-policy: same-origin` y el
  browser bloquea el `<img>` cross-origin siempre. Sirve desde nuestro origen y copia a Storage en
  la primera vista. Lo protege `proxy.ts` — si alguien agrega `/api/miniatura` a `esRutaPublica`,
  pasa a ser un endpoint anónimo.
- `scripts/` — **ya no existe.** Su último habitante era `cortar:feed`, el corte de D7 (arrastraba
  `Candidatos`, `Descartes del gate` y `Referentes propuestos` de Airtable a Postgres por última
  vez), y murió con la [`022`](../../core/schema/022_poda_balde_2.sql): leía las columnas
  `airtable_id` que esa migración dropea (ADR-059). Antes se habían borrado, en D7, el modo sombra
  de D3 y los cortes 2/4 y 3/4 — con Postgres de dueño, un import posterior pisaría en silencio lo
  que el equipo calificó. **Todos están en git si hiciera falta mirarlos**, que es exactamente
  donde tiene que vivir un script de migración una vez que migró.
- `proxy.ts` — refresh de sesión + redirect a login (en Next 16 middleware se llama proxy).
  **No cambió con el multi-tenant y no tiene que cambiar:** sigue siendo el chequeo optimista de
  sesión, y la autoridad sigue en cada página.

### Las URLs llevan el tenant adelante

`/30x/reels/curar/feed`, `/estadox/linkedin/operar`. **En la URL y no en una cookie** a propósito
(plan-multi-tenant §6): los links se pueden compartir entre compañeros, el caché de Next keyea
correcto por tenant, y el tenant no se puede perder al navegar — una cookie de tenant es un bug de
caché esperando.

Las reglas que sostienen eso, y que conviene respetar al agregar una pantalla:
- **Ningún `href` ni `revalidatePath` se escribe a mano.** Se arman con `domain/rutas.ts`
  (`rutaDe` / `rutaZona` / `comoRuta`), que es puro y está testeado. Con el prefijo variable, cada
  string escrito a mano es una chance de mandar a alguien —o de revalidar— el cockpit equivocado.
- **Los segmentos crudos de la URL solo sirven para RESOLVER.** Todo lo que se renderiza se arma con
  el cockpit ya validado que devuelve `exigirTenant`. Si no, la pantalla puede mostrar los datos de
  un cockpit y los links de otro.
- **Los componentes cliente leen el cockpit de la URL** con `usarCockpit()` (colocado en
  `(zonas)/`), en vez de recibirlo por props tres niveles abajo solo para armar un `href`.
- **Fuera del tenant:** `/`, `/login`, `/auth/*`, `/sin-rol` y `/api/*`. La raíz no es una pantalla:
  resuelve el cockpit del usuario y su zona inicial, y es la salida de emergencia a la que caen
  todos los `redirect("/")` de las guardias.

La autoridad de permisos está en el servidor: cada página exige su zona con `exigirZona`, y los
datos los protege RLS. El nav solo *esconde*.

Desde el refactor multi-tenant son **dos preguntas ortogonales, y hay que pasar las dos**: el rol
dice QUÉ zona ve alguien, el tenant dice DE QUIÉN son los datos que ve. Las páginas que leen datos
usan **`exigirTenant`** (que compone con `exigirZona`, no la reemplaza) y bajan el `TenantContext`
hasta `lib/`. Las que solo deciden qué mostrar —el índice de *Curar*, el nav— siguen con
`exigirZona`, y está bien: pedirles tenant sería ruido.
⚠️ **La Capa 2 (RLS sobre `app.*`) todavía no existe**: hoy el aislamiento es el de `scoped.ts`.
El disparador de cuándo entra está escrito en
[ADR-047](../../docs/adr/ADR-047-aislamiento-en-dos-capas.md) — antes de que un segundo cliente real
tenga usuarios en producción.

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
   referente↔proyecto pasa a tabla puente) y la **013 es D7** (ADR-035/036: `external_id` con
   `unique`, la puente de propuestas, las 2 vistas nuevas), que iba **antes** del corte de D7
   (`cortar:feed`, ya borrado). La **011 es obligatoria**: sin ella el BFF recibe
   `42501 permission denied for schema app` en TODO lo que lee de `app.*`. El login no lo delata
   porque va por la anon key.

   > 🚨 **La [`016_multi_tenant.sql`](../../core/schema/016_multi_tenant.sql) va ANTES de deployar
   > este código, no después.** El BFF pasó a pedir `client_id`/`instance_id` y a nombrar los
   > uniques nuevos en los `onConflict` de `lib/transcripciones.ts`; contra una base sin la `016`,
   > eso es columna inexistente y `42P10`. Es la misma trampa que la `014` (que también tenía que ir
   > antes de su código, por el `not null` de los criterios de la voz).
   > La [`017`](../../core/schema/017_multi_tenant_cierre.sql) es **otra corrida y va mucho después**:
   > recién tras el re-import de la Fase 4. Su cabecera explica por qué.
2. **Bucket `miniaturas` en Supabase Storage** (público), para
   [ADR-037](../../docs/adr/ADR-037-miniaturas-por-proxy-propio.md). Ya creado el 2026-08-01; queda
   escrito para el próximo entorno. Sin él, `/api/miniatura` sigue sirviendo la imagen (baja del CDN
   en cada pedido) pero no la cachea, así que se pierde cuando la URL firmada vence a los ~5 días:

   ```bash
   set -a && source .env && set +a
   curl -X POST "$SUPABASE_URL/storage/v1/bucket" \
     -H "apikey: $SUPABASE_SERVICE_ROLE" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE" \
     -H "Content-Type: application/json" \
     -d '{"id":"miniaturas","name":"miniaturas","public":true,"file_size_limit":5242880,"allowed_mime_types":["image/jpeg","image/png","image/webp"]}'
   ```

3. **Invitar a los usuarios:** *Authentication → Invite user* con cada mail, e insertar su fila en
   `app.usuarios` con su rol (snippet en el header de la migración). El login usa
   `shouldCreateUser: false`: un mail no invitado no crea cuenta.
   > Desde la `016` ese `insert` también lleva **`client_id`** — a qué empresa pertenece. Un usuario
   > sin cliente cae en `/sin-rol`, igual que uno sin rol: las dos son la misma alta a medias.
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
4. **Vercel:** proyecto nuevo apuntando a este repo con *Root Directory* = `apps/dashboard`, y las
   env vars de `.env.example` (del gestor). Producción en `main`, preview por rama (ADR-026).
   En Supabase, *Authentication → URL Configuration*: agregar la URL de Vercel a *Redirect URLs*.
5. **Env vars** (del gestor, solo server-side): `SUPABASE_SERVICE_ROLE` · `MOTOR_WEBHOOK_URL` +
   los 2 del header (el par exacto de la credencial `Webhook Motor Header` de n8n — si difiere en
   algo, el botón da 403) · los 2 `RUN_PLAN_HEADER_*` (el par que n8n manda a la fachada) · los 3
   `DESCUBRIMIENTO_WEBHOOK_*` (el botón «Buscar cuentas nuevas»). **Son tres pares de header
   distintos a propósito: no se reusan.**
   ⚠️ `AIRTABLE_PAT` y `AIRTABLE_BASE_ID` **salen en D7**, en cuanto la corrida verde cierre el
   paso 3 del expand/contract. Hasta entonces siguen en Vercel sin que nadie los use.

**Hecho-cuando de D0:** Majo entra desde su mail, ve su nombre y su rol `operador`, navega Operar y
Curar, y `/entender` la devuelve a su zona.

**Hecho-cuando de D1:** Jero dispara una corrida real desde *Operar* sin abrir n8n y ve cuándo
terminó y qué entregó (plan-cockpit §6).

**Hecho-cuando de D2:** el embudo completo de la semana se ve en una pantalla y el jefe encuentra
el costo de la semana solo (zona *Entender*, con la migración 008 aplicada).

**Hecho-cuando de D3:** *(cumplido; el modo sombra se borró en D7 — su trabajo terminó cuando la
última tabla se cortó.)*

**Hecho-cuando de cada corte de D5:** el equipo edita ese dominio solo en la app y su página de
Airtable queda congelada. Cada corte suma su propia evidencia previa, que tiene que terminar en
verde **antes** de publicar el flip. El último fue el corte de D7 (`cortar:feed`): 145 candidatos con
**0 sin `external_id` y 0 sin proyecto resoluble**, y las propuestas con **más de 1 proyecto cada
una** — si esa última línea diera 0, el corte estaría tirando la mitad de la atribución.

⚠️ **En el corte 3/4, "congelar" es para personas, no para la máquina:** `Destilar criterios` del
archivado le sigue escribiendo `criterios_aprendidos` y `advertencia_criterios` a la tabla
`Proyectos` de Airtable hasta D7, y la app los lee de ahí (ADR-033). Bloquear la tabla rompe el
loop de ADR-022.

**Hecho-cuando de D4:** una corrida real del motor produce el mismo plan leyendo la fachada que
leyendo Airtable (verificado con `test-nodos.mjs` + replay), tras el swap de nodos y el re-import #1.
La mitad-app ya se puede probar sin n8n:
`curl -H "<RUN_PLAN_HEADER_NOMBRE>: <valor>" https://<app>/api/engine/run-plan?ambito=motor`.
