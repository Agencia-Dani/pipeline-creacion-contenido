---
type: template
name: system-blueprint
description: Plantilla central para diseñar, planear y construir un sistema desde 0 con un AI building partner — sostenible y escalable.
---

# 🏗️ System Blueprint — `<<NOMBRE_DEL_SISTEMA>>`

> **Cómo usar este documento.** Es el contrato vivo entre vos y tu AI building partner. Se llena
> **de arriba hacia abajo** y se revisita en cada decisión grande. No es papeleo: cada sección existe
> para evitar un error caro y para que cualquier IA (o persona) que entre tenga TODO el contexto sin
> re-derivarlo. Reglas del juego:
>
> 1. **Llená de a poco, no todo de una.** Las secciones 1-4 antes de escribir una línea de código. El resto crece con el sistema.
> 2. **Lo que no sepas, escribilo como pregunta abierta** (sección 14), no lo inventes.
> 3. **Toda decisión estructural se registra con su *porqué*** (sección 8) — para no re-litigarla en 3 meses.
> 4. **Si una sección y la realidad se contradicen, gana la realidad: actualizá el doc.** Un blueprint desactualizado miente.
>
> **Pegale esto a tu AI partner al inicio de cada sesión de construcción** y pedile que trabaje *dentro*
> de estas restricciones, no alrededor de ellas.

---

## 🧭 Principios a tener en mente EN TODO MOMENTO

Estos no son fases — son lentes que aplicás a cada decisión, siempre. Si una decisión los viola, parás.

1. **Separá el núcleo estable de los bordes volátiles.** Lo que casi nunca cambia (el motor, el modelo de datos, las interfaces) va al centro y se protege; lo que cambia seguido (un cliente nuevo, un flujo nuevo, una fuente nueva) vive en los bordes como *configuración* o *plugins*, nunca tocando el núcleo. **Esta separación ES lo que hace al sistema escalable.**
2. **La unidad de crecimiento tiene que ser barata.** Preguntá siempre: *"¿qué cuesta agregar el flujo/cliente número N+1?"* Si la respuesta es "tocar código del núcleo", el diseño está mal. El objetivo es **clonar-y-configurar**, no programar de nuevo.
3. **Una sola fuente de verdad por cada cosa.** Config en un lado, estado en un lado. Datos duplicados = bugs garantizados y mantenimiento que no escala.
4. **Diseñá contra interfaces, no contra implementaciones.** Definí *qué* hace cada pieza y *qué* le entra/sale (el contrato); la implementación interna puede cambiar sin romper a los vecinos.
5. **Esqueleto que camina primero.** Construí una rebanada fina end-to-end que funcione (input real → output real) antes de engordar cualquier parte. Un sistema que hace el 10% completo > uno que tiene el 90% de una pieza y nada conectado.
6. **Reversibilidad y observabilidad desde el día 1.** Si no podés ver qué pasó (logs, métricas) y deshacerlo (rollback, idempotencia), no está listo para crecer. Lo barato de agregar hoy es carísimo de retrofittear.
7. **YAGNI, pero dejá las costuras.** No construyas la feature que *quizás* necesites. Sí dejá el *punto de extensión* (la interfaz, el hook) donde esa feature entraría. Abstracción prematura y rigidez prematura matan por igual.
8. **Las convenciones se hacen cumplir, no se esperan.** Un naming/estructura "acordado" pero no enforced (linter, template, validación) se erosiona. Automatizá lo que pueda romperse por descuido.
9. **Optimizá para el que mantiene, no para el que escribe.** El código/config se lee 10× más de lo que se escribe. Claridad > inteligencia. El "yo de dentro de 6 meses" es un usuario más.
10. **Sostenibilidad = el sistema sobrevive sin vos.** Si solo vos sabés cómo arrancarlo, arreglarlo o extenderlo, no es sostenible. Documentá los runbooks y los puntos de falla (sección 11).

---

## 1. Objetivo y problema (el *por qué*)

> Si no podés llenar esta sección con nitidez, **no empieces a construir.** Todo lo demás se deriva de acá.

- **Problema que resuelve (en 1-2 frases, sin jerga técnica):** `<<...>>`
- **¿A quién le duele hoy y cómo se las arregla sin el sistema?** `<<...>>`
- **Objetivo del sistema (qué cambia cuando exista):** `<<...>>`
- **Cómo se ve el éxito (métricas o señales concretas, no "que funcione bien"):** `<<...>>`
- **Qué NO es esto (anti-objetivos — lo que explícitamente queda afuera):** `<<...>>`
- **¿Por qué ahora? ¿Qué pasa si no se construye?** `<<...>>`

🤖 *Preguntas que tu AI partner debe hacerte acá:* ¿Cuál es el caso de uso más chico que ya entrega valor? ¿Estás resolviendo el problema real o un síntoma? ¿El éxito es medible?

---

## 2. Usuarios y stakeholders (el *para quién*)

| Tipo | Quién es | Qué necesita del sistema | Qué le importa (y qué NO le importa) |
|---|---|---|---|
| Usuario final | `<<...>>` | `<<...>>` | `<<...>>` |
| Operador / mantenedor | `<<...>>` | `<<...>>` | `<<...>>` |
| Dueño / negocio | `<<...>>` | `<<...>>` | `<<...>>` |

- **Interfaz principal con la que cada uno toca el sistema** (UI, chat, API, archivo, dashboard): `<<...>>`
- **Nivel técnico del que lo va a operar** (define cuánto "no-code" necesitás): `<<...>>`

---

## 3. No-negociables (los invariantes que nunca se doblan)

> La lista corta de cosas que, si se rompen, el sistema **falló** — sin importar qué tan elegante sea el resto.
> Tenelas a la vista en cada decisión. Máx ~5-7; si tenés 20, no son no-negociables.

- [ ] `<<ej: ningún dato de cliente se mezcla entre clientes>>`
- [ ] `<<ej: agregar un flujo nuevo no requiere tocar el núcleo>>`
- [ ] `<<ej: si un paso falla, no corrompe los datos ya buenos (idempotencia)>>`
- [ ] `<<ej: costo por corrida < $X>>`
- [ ] `<<...>>`

---

## 4. Requerimientos

### 4.1 Funcionales (QUÉ hace)
Listá capacidades observables, priorizadas. Formato: *"El sistema [hace X] para que [usuario] logre [Y]."*

| # | Capacidad | Prioridad (Must/Should/Could) | Notas |
|---|---|---|---|
| F1 | `<<...>>` | Must | `<<...>>` |
| F2 | `<<...>>` | Should | `<<...>>` |

### 4.2 No funcionales (QUÉ TAN BIEN lo hace) — *acá vive la sostenibilidad*

> Estos rara vez se piden explícito y son los que matan sistemas a los 6 meses. Poné número o criterio donde puedas.

- **Rendimiento / volumen:** cuántos items, cada cuánto, latencia aceptable. `<<...>>`
- **Confiabilidad:** qué pasa si un paso falla; reintentos; idempotencia; "¿qué NO puede perderse?". `<<...>>`
- **Escalabilidad:** ver sección 5 (es tan importante que tiene su propia sección).
- **Costo:** presupuesto por corrida / por mes; qué componente domina el costo. `<<...>>`
- **Seguridad / secretos:** dónde viven las API keys/credenciales; qué datos son sensibles; quién accede a qué. `<<...>>`
- **Observabilidad:** cómo sabés que corrió bien; qué se loguea; cómo te enterás de una falla *antes* que el cliente. `<<...>>`
- **Mantenibilidad:** qué tan fácil es para otro entender y cambiar; ¿hay tests/validación? `<<...>>`
- **Privacidad / compliance** (si aplica): `<<...>>`

---

## 5. Escalabilidad y crecimiento (el *cómo crece*)

> El corazón de "agregar más flujos al pipeline central". Diseñá esto explícito o el sistema se vuelve rígido sin que te des cuenta.

- **Ejes de crecimiento** (¿en qué dimensión escala?): más clientes · más flujos/tipos de contenido · más fuentes · más volumen · más usuarios. ¿Cuál es el principal? `<<...>>`
- **La "unidad de extensión":** ¿qué es exactamente "un flujo nuevo"? Definilo como una cosa concreta y clonable. `<<...>>`
- **Costo de agregar el flujo N+1** (objetivo): `<<ej: crear 1 config + 0 líneas en el núcleo>>`
- **Puntos de extensión (las costuras donde se enchufa lo nuevo):** `<<...>>`
- **Qué se comparte entre flujos vs. qué es propio de cada uno:** `<<...>>`
- **Límites conocidos** (¿hasta dónde escala antes de repensar la arquitectura?): `<<...>>`

🤖 *Test del AI partner:* "Describime, paso a paso, qué haría yo para agregar el flujo de contenido #5. Si en algún paso decís 'modificar el núcleo', el diseño no es escalable todavía."

---

## 6. Overview del sistema (el *qué es*, alto nivel)

> Una vista que alguien nuevo entiende en 60 segundos. Empezá con un diagrama de cajas y flechas (ASCII está perfecto).

```
<<DIAGRAMA: componentes (cajas) + flujo de datos (flechas) + bordes del sistema>>
```

- **Componentes principales y la responsabilidad de cada uno (una frase c/u):** `<<...>>`
- **Flujo de datos de punta a punta** (input → ... → output): `<<...>>`
- **Bordes del sistema** (qué es interno vs. qué es un servicio externo del que dependés): `<<...>>`
- **El "núcleo estable" vs. los "bordes volátiles"** (sección 6 hace concreto el principio #1): `<<...>>`

---

## 7. Datos y estado (la *fuente de verdad*)

- **Fuente de verdad de la configuración** (dónde vive lo que parametriza cada flujo/cliente): `<<...>>`
- **Fuente de verdad del estado/resultados** (dónde vive lo que el sistema produce): `<<...>>`
- **Modelo de datos** (entidades principales y cómo se relacionan): `<<...>>`
- **Ciclo de vida de un dato** (nace → se transforma → se archiva/borra): `<<...>>`
- **Regla de oro:** ningún dato tiene dos dueños. Si parece que sí, rediseñá.

---

## 8. Decisiones estructurales (ADRs — el *por qué de cómo*)

> Registrá CADA decisión arquitectónica que costaría caro revertir. Formato corto, sin ceremonia.
> El valor está en el **porqué** y en las **alternativas descartadas** — eso es lo que tu yo futuro (y tu AI partner) no puede reconstruir solo.

### ADR-001 — `<<título de la decisión>>`
- **Contexto:** `<<qué problema/restricción forzó la decisión>>`
- **Decisión:** `<<qué elegiste>>`
- **Alternativas descartadas y por qué:** `<<...>>`
- **Consecuencias** (lo bueno y lo que ahora cuesta más): `<<...>>`
- **Estado:** propuesta / aceptada / revertida (con fecha)

*(Copiá el bloque por cada decisión: stack, motor, store, modelo de datos, límites de servicio, etc.)*

---

## 9. Convenciones y estándares (lo que se *hace cumplir*)

> Decididas una vez, aplicadas siempre. Si no se pueden automatizar (linter/template/validación), al menos escribilas acá explícitas.

- **Naming** (archivos, variables, recursos, flujos): `<<...>>`
- **Estructura del repo / proyecto:** `<<...>>`
- **Cómo se define un flujo/cliente nuevo** (el template concreto): `<<...>>`
- **Manejo de config vs. secretos** (qué va en código, qué en credenciales): `<<...>>`
- **Estilo de código / commits / PRs:** `<<...>>`
- **Qué está prohibido** (anti-patrones que ya sabés que querés evitar): `<<...>>`

---

## 10. Plan de construcción (el *en qué orden*)

> Esqueleto que camina primero (principio #5). Hitos chicos y demostrables, no un big-bang.

- **F0 — Esqueleto que camina:** la rebanada más fina end-to-end que ya produce un output real. `<<...>>`
- **F1 — `<<...>>`** (entregable demostrable): `<<...>>`
- **F2 — `<<...>>`**: `<<...>>`
- **...**
- **Definición de "MVP"** (la línea mínima para que sea útil de verdad): `<<...>>`
- **Qué se difiere a propósito** (y por qué no se pierde nada difiriéndolo): `<<...>>`
- **Criterio de "hecho" por hito** (cómo sabés que una fase está terminada, no "casi"): `<<...>>`

---

## 11. Mantenimiento y operación (el *cómo sobrevive*)

> Sin esto, sostenible es una ilusión. Llenalo aunque el sistema sea chico.

- **Quién lo opera y con qué nivel técnico:** `<<...>>`
- **Cómo se arranca / detiene / redepliega** (runbook básico): `<<...>>`
- **Modos de falla conocidos y qué hacer en cada uno:** `<<...>>`
- **Cómo te enterás de una falla** (alertas, monitoreo, revisión): `<<...>>`
- **Tareas recurrentes de mantenimiento** (rotar keys, limpiar datos, revisar costos): `<<...>>`
- **Qué documentación necesita existir para que otro lo tome:** `<<...>>`

---

## 12. Riesgos y supuestos

| Riesgo / Supuesto | Impacto si sale mal | Cómo lo mitigás / validás |
|---|---|---|
| `<<...>>` | `<<...>>` | `<<...>>` |

- **Dependencias externas críticas** (servicios de terceros de los que depende todo): `<<...>>`
- **Qué estás asumiendo que todavía no verificaste:** `<<...>>`

---

## 13. Glosario

Términos propios del dominio para que vos y la IA hablen el mismo idioma. `<<...>>`

---

## 14. Decisiones abiertas / pendientes

> Lo que todavía no sabés. Tenerlo explícito evita que se construya sobre un supuesto silencioso.

- [ ] `<<pregunta sin responder>>` — *bloquea:* `<<qué no podés decidir hasta resolverla>>`
- [ ] `<<...>>`

---

> **Checklist de salud del blueprint** (revisalo cada tanto):
> ☐ ¿Las secciones 1-3 siguen siendo verdad? ☐ ¿Cada decisión estructural tiene su porqué registrado?
> ☐ ¿Sigue siendo barato agregar el flujo N+1? ☐ ¿El doc refleja lo que el sistema *realmente* hace hoy?
> ☐ ¿Un recién llegado podría operarlo solo con esto?
