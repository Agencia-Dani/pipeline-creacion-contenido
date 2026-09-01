# Cockpit — la app que usa el equipo de redes

Next.js sobre Supabase, desplegado en Vercel. Reemplazó a Airtable en D7 (ADR-026). El **qué** y el
**por qué** viven en [plan-cockpit-propio.md](../../docs/agents/plan-cockpit-propio.md) y en los
ADRs; acá está lo mínimo para moverse por el código sin leerlos.

## Mapa de módulos y la regla de dependencia

```
app/  →  lib/  →  domain/
```

**La flecha no se cruza nunca, y está verificado:** `domain/` no importa **nada** de `lib/`, de
`app/`, ni de `next`, `react` o `@supabase`. Por eso sus tests corren en Node pelado, sin mocks y
sin levantar nada.

| Carpeta | Qué vive acá | Cómo saber si algo va acá |
|---|---|---|
| **`domain/`** | Reglas del producto, **puras**. Sin IO, sin React. | ¿Se puede testear pasándole datos y mirando lo que devuelve? Va acá. |
| **`domain/formatos/`** | Serialización genérica: `.docx`, `.xlsx`, `zip`. | ¿Sería **idéntico** en cualquier otra app? Va acá, no en `domain/`. |
| **`lib/`** | El IO: una función por lectura o escritura que una pantalla necesita. | ¿Toca Supabase, Apify, Anthropic o `process.env`? Va acá. |
| **`lib/supabase/`** | Los tres clientes (`server`, `scoped`, `admin`) y el guard de truncado. | — |
| **`app/`** | Rutas, server actions y UI. | — |
| **`components/`** | UI sin dominio, reusable. `ui/` es shadcn. | ¿Se entiende sin saber qué es un candidato? Va acá. |

**La convención de nombres:** `domain/X.ts` son las reglas de X y `lib/X.ts` es su IO. Los pares
existen a propósito (`ajustes`, `colecciones`, `entender`, `grabados`, `proyectos`, `referentes`,
`tenant`, `buscador`): si estás por escribir lógica dentro de un `lib/`, probablemente va en su
gemelo de `domain/`, donde se puede testear.

## Los dos ejes de la ruta

`app/[cliente]/[pipeline]/(zonas)/…` — **`[cliente]`** es la empresa (Retia, EstadoX) y
**`[pipeline]`** es el producto (`reels`, `linkedin`). No son lo mismo y el costo de cada uno es
muy distinto: sumar una empresa es SQL y clics ([runbook](../../docs/runbooks/agregar-cliente.md));
sumar un pipeline es un dominio nuevo ([runbook](../../docs/runbooks/agregar-workflow.md), que dice
con números por qué). El aislamiento entre empresas lo garantiza **RLS**, no el código: `scoped()`
pone el eje, la base decide.

## Correrlo y verificarlo

```bash
npm run dev        # local
npm run typecheck  # tsc --noEmit
npm test           # dominio, node:test sobre los .ts directo
npm run build      # obligatorio si tocaste rutas o auth
```

Los tests son **solo de `domain/`**, y es una decisión con un costo conocido: `lib/`, `app/` y
`components/` no tienen ninguno, y ahí es donde vivieron los tres bugs de producción que el repo
documenta (una lectura truncada, una env var que no llegó al deploy, un bucle de render). Si tocás
`lib/`, la red no existe: probalo a mano.

## Dos trampas que ya costaron caro

1. **Una env var que no está en `.env.example` no llega al deploy.** `ARCHIVADO_WEBHOOK_URL` faltaba
   ahí, así que nunca se cargó en Vercel y el botón de archivar estuvo roto desde que nació.
2. **PostgREST corta en 1.000 filas**, sin error y sin aviso. Toda lectura de "traé todo" pasa por
   `abortarSiTruncado` (`lib/supabase/tope.ts`). Si agregás una, usalo: truncar es indistinguible de
   "no había más".
