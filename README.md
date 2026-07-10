# Pipeline de Creación de Contenido — Empezá Acá

> El hogar único de todos los workflows de creación de contenido de la agencia.
> Este documento orienta la reestructuración: explica **qué estamos construyendo y por qué**,
> antes de entrar en cómo. Si vas a tocar este repo (o a planear su arquitectura), leé esto primero.

---

## La idea en una frase

Un **sistema central** donde viven todos los flujos de creación de contenido — hoy dos, mañana
los que hagan falta — montados sobre la misma base, para que sumar un flujo nuevo o un cliente nuevo
sea **clonar y configurar, no construir de cero.**

Cuatro cosas que tienen que ser verdad siempre, en este orden:

1. **Funcional** — produce contenido real, de punta a punta. Si no entrega, lo demás no importa.
2. **Fácil para el cliente** — el que lo usa no necesita entender la máquina por dentro.
3. **Escalable** — agregar el flujo o el cliente número N+1 es barato.
4. **Sostenible** — sobrevive sin que una sola persona lo sostenga en la cabeza.

---

## Qué problema resuelve

Hoy cada flujo de contenido vive como un proyecto suelto, con su propia forma, su propia
documentación y su propia manera de configurarse. Eso funciona para uno o dos, pero no escala:
cada flujo nuevo es empezar de nuevo, y cada cliente nuevo es repetir trabajo manual.

Este repo existe para que **todos los flujos compartan una misma estructura** — una sola puerta de
entrada, una sola forma de definir "un flujo", una sola forma de configurar un cliente. Así el
sistema crece sumando piezas iguales por fuera, sin tocar el centro.

---

## Cómo está organizado

```
content-pipeline/
├── README.md          ← este archivo (la orientación)
└── Workflows/         ← un subfolder por flujo de contenido
    ├── workflow-short-form-content/
    ├── workflow-descubrimiento-referentes/
    └── workflow-substack/
```

La unidad es el **workflow**: una carpeta autocontenida dentro de `Workflows/` con todo lo
necesario para entenderlo, configurarlo y correrlo. El objetivo de la reestructuración es que
**todos los workflows se vean iguales por fuera** — misma forma de describir qué hace, qué necesita,
qué produce — aunque por dentro sean máquinas distintas.

---

## Los dos workflows con los que arranca

Arrancamos con dos casos **a propósito muy distintos** — son la prueba de fuego de que la base
común aguanta cualquier flujo futuro:

| Workflow | Qué hace | Forma |
|---|---|---|
| **reels-detector** | Detecta Reels/TikToks virales de los temas del cliente, los transcribe y genera guiones en su voz | Una máquina que corre sola (n8n, cron semanal) |
| **substack-newsletter** | Configura un bot que produce un newsletter editorial: research, scoring, escritura | Un kit que guía a un bot, con una persona en el loop (OpenClaw) |

Uno es *"importás un archivo y corre solo"*. El otro es *"seguís un procedimiento que configura un
bot"*. **No tienen la misma forma — y está bien.** Que la misma estructura describa a los dos es
exactamente lo que hace que la base sea sólida: si aguanta estos dos extremos, aguanta lo que venga.

---

## Los principios que guían la reestructuración

No son reglas técnicas — son las decisiones de fondo que mantienen el sistema sano a medida que crece:

- **El centro se protege, los bordes cambian.** Lo que casi nunca cambia (la base, la estructura)
  vive en el centro; lo que cambia seguido (un cliente, un flujo, una fuente) vive en los bordes como
  configuración. Esta separación **es** lo que hace al sistema escalable.
- **Clonar y configurar, no reprogramar.** Agregar un flujo o un cliente nuevo debería ser llenar
  una config, no escribir lógica nueva. Si para sumar el flujo N+1 hay que tocar el centro, el diseño
  todavía no está bien.
- **Una sola fuente de verdad por cada cosa.** La config de un cliente vive en un solo lado; los
  resultados en un solo lado. Datos duplicados = bugs y mantenimiento que no escala.
- **Cada flujo se describe contra un contrato, no contra cómo está hecho por dentro.** Lo que importa
  hacia afuera es *qué hace, qué necesita y qué produce* — la máquina interna puede cambiar sin romper
  al resto.
- **Optimizado para el que mantiene.** Esto se lee muchas más veces de las que se escribe. Claridad
  antes que inteligencia.

> El detalle operativo de estos principios (los no-negociables confirmados) vive en
> [PLAN.md §2.5](./PLAN.md); el porqué de cada decisión estructural, en `docs/adr/`.

---

## Estado actual y qué sigue

**Dónde estamos (2026-06-12):** diseño aprobado, decisiones formalizadas (9 ADRs), y el MVP del
workflow de reels con **visto bueno del jefe** — es la prioridad y se ejecuta entre 3 devs según
el [ROADMAP](./ROADMAP.md). El pipeline general (Substack, capa del jefe, templatización) sigue
después, por fases ([PLAN.md §5](./PLAN.md)).

> **Importante:** la estandarización y el refactor se hacen **planeados y por partes**, no de un
> golpe. Un esqueleto que camina antes que una pieza perfecta y desconectada.

---

## Mapa de documentos (qué leer para qué)

El repo se mantiene a propósito con **pocos documentos, cada uno con un dueño claro**:

| Documento | Qué responde | Cuándo leerlo |
|---|---|---|
| **[README.md](./README.md)** (este) | ¿Qué es esto y por qué existe? | Al entrar al repo |
| **[handoff.md](./docs/agents/handoff.md)** | ¿En qué va el trabajo y qué task tomo? Tablero vivo + log de avance entre devs | **Antes de cada sesión de trabajo** |
| **[ROADMAP.md](./ROADMAP.md)** | ¿Qué pidió el jefe (el norte) y cómo se ejecuta cada task? Milestones + checklist del MVP de reels | El manual del MVP |
| **[PLAN.md](./PLAN.md)** | ¿Cómo está diseñado el sistema? Arquitectura, invariantes (§2.5), decisiones, costos, fases post-MVP | Antes de tocar `core/` o decidir algo estructural |
| **[docs/adr/](./docs/adr/README.md)** | ¿Por qué se decidió así? Una decisión por archivo, con alternativas descartadas | Antes de revertir o re-discutir una decisión |
| **[docs/one-pager-reels-mvp.md](./docs/one-pager-reels-mvp.md)** | ¿Qué estamos tratando de conseguir? La visión aprobada del MVP en una página, no técnica | Para no perder el norte / hablar con el jefe |
| **[core/contracts/](./core/contracts/)** | Las especificaciones exactas: manifest de workflow, ingesta al registro, cockpit de Airtable, schemas de datos | Al implementar |
| **[docs/transcripciones/](./docs/transcripciones/)** | Las fuentes crudas de las decisiones de producto | Para verificar qué se dijo de verdad |
| `Workflows/<wf>/README.md` | Cómo funciona ese workflow por dentro | Al trabajar en ese workflow |

Reglas para que siga siendo liviano: **un hecho, un dueño** (nada se documenta dos veces — se
linkea) · lo histórico vive en git, no en archivos `*-old` · un doc nuevo solo si ningún dueño
existente le queda natural.
