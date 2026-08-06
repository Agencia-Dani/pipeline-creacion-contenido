# Verificaciones de ojo humano — lo que ningún agente puede cerrar

> **Qué es.** La lista de lo que falta mirar **con los ojos**, escrita para ejecutarla sin releer
> nada más. No la corre un agente: cada item necesita una sesión con login por magic link, o una
> persona que use el sistema y diga si sirve.
>
> **Quién.** Mani, Majo, Jero y Alejo. Cada item dice quién y cuánto tarda.
>
> **De dónde sale.** Es la tarea **B5** de
> [plan-multi-tenant §15.B](./agents/plan-multi-tenant.md). Junta los arrastres del handoff con las
> corridas de fuego del [ROADMAP §3](../ROADMAP.md) que nunca se cerraron.
>
> **Lo que NO va acá:** nada que se pueda medir con una query o un `curl`. Eso se mide y se escribe
> con su número, no se le pide a una persona.

---

## 0. Antes de mirar nada: cómo se lee un número

Las pantallas cargan contra la base con **la sesión del usuario**, no con `service_role` — la Capa 2
(RLS) está viva en producción desde el 2026-08-05
([ADR-058](./adr/ADR-058-el-flip-de-la-capa-2.md)). Eso hace que un número sea evidencia:

| Lo que ves | Qué significa |
|---|---|
| **El número esperado** | ✅ Las dos capas andan |
| **Cero, con la pantalla cargando limpia** | 🩸 **El fallo silencioso.** Una policy que no matchea. Es la familia del bug de la `015`, y es el peligroso: se lee igual que *"todavía no cargamos datos"* |
| **`42501` en pantalla** | El fallo *ruidoso*: falta un `grant`. Se arregla con SQL, **sin revertir el deploy** |
| **Un número mayor al esperado** | 🩸 El filtro de Capa 1 se rompió: estás viendo datos de otra empresa |

🩸 **Por eso están los números: *"se ve bien"* no distingue el caso 1 del caso 2.**

### ⚠️ Y por eso los números tienen que ser los correctos

La tabla de números que traía el handoff tenía **5 filas de 9 equivocadas**, y todas equivocadas
hacia el mismo lado: pedían el `count(*)` crudo de la tabla cuando la pantalla filtra. Alguien que
las hubiera usado habría reportado un fallo de RLS que no existe. Corregidas contra el código y la
base el **2026-08-06**:

| Pantalla | Decía | **Es** | Por qué |
|---|---|---|---|
| `/operar` | 41 corridas | **5 tarjetas** | `ultimasCorridasMotor` tiene `limite = 5` **y** filtra `params->>workflow = 'motor'`. De las 41 corridas totales, 28 son del motor |
| `/curar/historicos` | 88 | **31** | La pantalla y el CSV filtran `.eq("estado","aprobado")`. Los 88 `outputs` son 31 aprobados **+ 57 descartados** |
| `/curar/sugeridos` | 8 | **6** | Filtra `.eq("estado","propuesto")`. De los 8, 2 ya están `promovido` |
| `/curar/voces` | 3 voces | **4 voces** | La pantalla **no** filtra por `activo`: muestra las 3 activas + Alejo, pausada |
| `/curar/ajustes` | 18 knobs | **18 para un `dev` · 8 para un `operador`** | `ajustesVisibles` deja al operador solo los de `visibilidad = 'equipo'`. Son 10 de dev + 8 de equipo |

### Los números buenos, medidos el 2026-08-06 (cockpit `/retia/reels`)

| Pantalla | Tiene que mostrar |
|---|---|
| **`/entender`** | ⚠️ **Empezá por acá si estás verificando RLS**: son las **12 vistas `security_invoker`**, la zona de más riesgo |
| `/operar` | **5** tarjetas de corrida, la más nueva del **2026-08-03** |
| `/curar/feed` | **25** tarjetas y los chips diciendo **165** *(pagina de a 25 desde el cierre 98)* |
| `/curar/voces` | **4** voces (3 activas + 1 pausada) · **6** proyectos (5 activos) |
| `/curar/referentes` | **16**, todos de Instagram |
| `/curar/ajustes` | **18** si sos `dev` · **8** si sos `operador` |
| `/curar/descartes` | **38** |
| `/curar/sugeridos` | **6** |
| `/curar/historicos` | **31** |
| `/transcribir` | **2**, las dos en `listo` |

> 🔑 **Un dueño (`es_dueno`) NO bypassa RLS**, y es lo que hace que estas pruebas valgan: `es_dueno`
> es un predicado *adentro* de `app.clientes_visibles()`, no un `BYPASSRLS`. Solo el `service_role`
> bypassa, y ese ya no lee las pantallas.
>
> ⚠️ **Ventana de incógnito siempre.** Si no, el magic link cae sobre la sesión que ya tenías.

---

## 1. 🔴 El clic al **Descargar CSV** de `/curar/historicos`

**Quién:** Mani · **2 minutos** · *Es el arrastre abierto más viejo (cierre 94).*

Su parte frágil está verificada contra las filas reales de prod con un parser RFC 4180
independiente. Lo que nadie hizo es **el clic**.

1. Entrar a `/retia/reels/curar/historicos`.
2. Apretar **Descargar CSV** y abrir el archivo (Excel o Numbers).

**Tiene que traer:** **15 columnas** · **31 filas** de datos + el encabezado · los **acentos
derechos** (si ves `MÃ©tricas`, el BOM/encoding se rompió).
**Si el archivo baja vacío o con 0 filas:** no es el CSV, es la lectura — mirá primero si la pantalla
misma muestra las 31.

## 2. 🟡 Recorrer el **feed paginado**

**Quién:** Majo, Jero o Alejo · **5 minutos** · *Nuevo del cierre 98; se despacha en el mismo login
que el #1.*

En `/retia/reels/curar/feed`, mirar **cuatro** cosas:

1. **Cargar más** trae 25 nuevas, **sin repetir ninguna y sin saltear ninguna**.
2. Los **chips dicen el total real** (**165**), no 25.
3. **Abrir una tarjeta trae el guion** (los 3 textos largos salieron del listado para que pese 16 KB
   en vez de 405 KB — se cargan al abrir).
4. 🔑 **El caso que el keyset existe para cubrir: calificar una tarjeta y DESPUÉS cargar más.**
   No se tiene que saltear ni repetir nada. Con `offset` esto se rompía; con keyset no.

## 3. 🟡 Que el tab **Entender** aparezca en el nav de un **operador**

**Quién:** Jero o Alejo · **10 segundos, en su próximo login.**

La lógica tiene tests; falta el ojo. *No se probó desde una sesión de agente a propósito: habría
requerido generar un magic link de la cuenta de otra persona.*

## 4. 🔴 Que un **operador** NO vea los costos de proveedor *(Carril 0)*

**Quién:** Mani, y **después** de que el gate de `entender/page.tsx` pase a `rol === "dev"` ·
**1 minuto.**

Con gente de Retia adentro, eso es el margen de la agencia, y el gate **falla hacia MOSTRAR**.

- Con cuenta **`operador`** en `/retia/reels/entender`: **no** aparece la tarjeta de costos.
- Con cuenta **`dev`**: sí aparece.

**Es la única de esta lista que bloquea dar de alta a alguien de Retia.**

## 5. ⬜ **V4 — el re-rank** *(ROADMAP §3)*

**Quién:** Majo o Jero · **2 minutos.**

El enunciado del ROADMAP era *"la vista 🔥 Seleccionados"*, que era de Airtable y murió con él. Lo
pedido —punto 5 del norte— sigue igual y hoy lo sirve el Feed:

En `/curar/feed`, filtrar por **aprobados**: tienen que salir **solo aprobados**, ordenados
**caliente → frío** por `heat_score`.

## 6. ⬜ **V2 — literalidad** *(ROADMAP §3)*

**Quién:** Majo o Jero (son quienes saben si un guion sirve) · **10 minutos.**

Es la única verificación de la lista que mide **calidad**, no funcionamiento. Muestrear **2 o 3**
candidatos del feed:

- **Uno en español:** el script tiene que ser **la transcripción tal cual**. Si está "mejorado",
  reescrito o resumido, el gate de ADR-009 se rompió.
- **Uno en otro idioma:** traducción **literal**, sin embellecer.
- **En los dos:** el link abre el video original y **coincide** con el guion.

## 7. ⬜ **V5 — corrida incremental + dedup** *(ROADMAP §3)*

**Quién:** Mani · **⚠️ gasta créditos: es una corrida real.**

El dedup ya quedó verificado en vivo; lo que falta es la corrida incremental completa. Correr con
`dias_recencia = 1` y mirar que **no reaparezca nada ya procesado**.

⚠️ **No la corras antes de firmar el gate de la `023`** (tarea B1). El modo de falla está medido: si
`processed_items` deja de escribirse, PostgREST rechaza el insert entero con `PGRST204`, el
`onError: continue` se traga el 400 y **el motor cierra en verde sin memoria de dedup** — que es
exactamente lo que esta prueba cree estar midiendo.

## 8. 🛑 **V6 — resiliencia: hay que rediseñarla antes de correrla**

**Quién:** decisión de Mani, no ejecución.

**El enunciado del ROADMAP envejeció con D7 y hoy no prueba lo que dice.** Pedía *"romper la
credencial de Supabase → el workflow IGUAL escribe a Airtable"*, apoyado en el **invariante #1** de
[PLAN §2.5](../PLAN.md): *"el registro es sumidero de datos, jamás dependencia de ejecución"*.

🩸 **Airtable ya no existe, y la entrega también es Supabase.** Romper esa credencial ya no separa
entrega de registro: **las tumba a las dos**. La prueba, tal cual está escrita, no puede pasar.

**El invariante sigue vivo; lo que cambió es cómo se ejercita.** Su forma honesta hoy es: *si fallan
los writes del **registro** (`runs` / `outputs` / `processed_items`), ¿los candidatos igual llegan a
`app.candidatos`?* Son nodos distintos con `onError: continue`, así que la respuesta debería ser sí —
pero **no se puede provocar rompiendo una credencial compartida**. Habría que apuntar solo esos nodos
a una URL inválida, o aceptar que este invariante ya no es verificable de un golpe y partirlo.

✅ **La mitad que sí se puede dar por buena, y ya está medida:** un fallo real deja el `run` en
`fallo`. **12 de las 41 corridas** están así, y el error handler de
[ADR-054](./adr/ADR-054-cada-run-lleva-su-execution-id.md) las marca por `params.execution_id`.

**→ Decidir qué se rompe antes de correr V6.** Escrito acá para que no se ejecute la versión vieja y
se declare verde algo que no probó nada.

## 9. ⬜ **D3 — la demo de 10 minutos con Majo y Jero** *(ROADMAP §3)*

**Quién:** Mani + Majo + Jero · **10 minutos.**

Calificar · ver el re-rank · bajar el histórico. **El sistema solo sirve si lo usan**, y este es el
único item de la lista que mide eso. Es también la última condición del *"MVP declarado cuando"* del
ROADMAP §4: *el equipo de redes usa el sistema un día completo sin ayuda de un dev.*

## 10. 🔬 **La prueba de §14.6 — RLS de LinkedIn con filas**

**Quién:** quien tenga la cuenta con membresía en **30X y EstadoX**.

Es la tarea **B3** y está escrita paso a paso, con los dos `instance_id`, el SQL de siembra y la
matriz de interpretación (**1 y 1** anda · **2 y 2** Capa 1 rota · **0 y 0** policy que no matchea ·
**`42501`** falta un grant), en el bloque `🔬 #6` del
[handoff](./agents/handoff.md). **No se duplica acá:** un hecho, un dueño.

⚠️ **No sirve con una cuenta `es_dueno`**: `app.clientes_visibles()` le devuelve todas las empresas,
así que su resultado es indistinguible del de RLS apagado. Por diseño.

---

## Registro — lo que ya se cerró, para no repetirlo

| # | Qué | Cuándo |
|---|---|---|
| Recorrer las 4 zonas con una cuenta **dueña** | Las 4 cargan con datos, `Entender` incluida — que era el riesgo concentrado del flip | ✅ 2026-08-05 |
| Cuenta **no dueña**: 3 de 4 voces sin filtro de tenant | La mitad que prueba que RLS filtra de verdad | ✅ 2026-08-05 |
| Que una cuenta `operador` entre y vea nombre + rol | El hecho-cuando de D0 | ✅ 2026-08-04, después de la `019` |
