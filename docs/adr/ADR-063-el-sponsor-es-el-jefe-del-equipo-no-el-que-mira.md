# ADR-063 — El sponsor es el jefe del equipo, no el que mira

- **Estado:** aceptada — 2026-08-07. **Enmienda [ADR-060](./ADR-060-el-equipo-se-administra-desde-el-cockpit.md)**
  (el sponsor pasa de mirar a operar, y gana un techo que no tenía) y **confirma
  [ADR-052](./ADR-052-el-sponsor-externo-no-ve-el-costo-del-proveedor.md)** (los costos siguen sin
  ser suyos). Sale de un grill con Mani. **No toca `core/`.**

> ⚠️ **Media ADR se escribió DESPUÉS de construir**, al revés de lo que pide ADR-060. Las zonas
> (§1) ya están en `main` (`041ad27`) cuando esto se escribe; §2 y §3 salieron del grill posterior
> y sí van antes del código. Se anota porque el orden importa y acá se rompió.

## Contexto

ADR-060 le dio al `sponsor` la pantalla de equipo y lo dejó en dos zonas: `entender` y `ajustes`.
La figura era *"el jefe que mira"*: ve resultados, administra accesos, no toca la herramienta.

**Ese modelo no sobrevivió al primer contacto con el uso real, y el dato lo dice sin ambigüedad:
medido el 2026-08-06, había CERO `sponsor` en las tres empresas.** La figura existía y nadie la
usaba.

El motivo, en palabras de Mani: *"operador no puede invitar a personas al team, solo sponsor y dev;
pero yo como dev no puedo estar todo el tiempo pendiente y los sponsors no pueden usar la
herramienta"*. O sea, cada empresa quedaba con un agujero estructural:

- el **operador** califica el feed pero no da accesos (ADR-060 lo dejó afuera a propósito);
- el **dev** es de la agencia y no puede estar de guardia para cada alta;
- el **sponsor** —el único que sí administra su propio equipo— **no podía usar la herramienta que
  administra**.

## Decisión

### 1. El sponsor opera

`zonasDe("sponsor")` pasa a ser las cinco zonas, iguales a las del `dev` y del `operador`. Hace todo
lo que hace un operador **y además** da y quita accesos. Su zona inicial cambia de `entender` a
`operar`, porque el primer elemento del array es a dónde cae al entrar.

Gana también las **8 perillas de `visibilidad: equipo`** en Ajustes (mínimos de likes y vistas,
propuestas por corrida, los 4 toggles de IG/TikTok, afinidad mínima): si opera, las necesita. Los
knobs avanzados —los que mueven plata y techos del motor— siguen siendo solo del `dev`.

**No hizo falta migración, y el motivo es una propiedad del diseño que conviene tener presente:**
RLS es por **membresía de empresa, no por rol** (`instancias_visibles()` deriva de
`clientes_visibles()`, y ninguna de las dos mira el rol). El sponsor **ya alcanzaba los datos en la
base**; lo único que lo frenaba eran las guardias de la app. Un cambio de rol que hubiera pedido SQL
habría sido señal de que el modelo estaba mal repartido.

### 2. Ve la Actividad. NO ve los Costos

Entender tiene dos bloques dev-only, y son cosas distintas:

| Bloque | Qué muestra | Decisión |
|---|---|---|
| **Actividad** (`app.eventos`) | quién de su equipo tocó qué y cuándo | ✅ **se abre.** Es literalmente el trabajo de un jefe de equipo, y la policy de `app.eventos` ya es por instancia: no cuesta migración |
| **Costos** (`v_costos_semana`) | consumo × `app.tarifas` = lo que la agencia le paga a los proveedores | ❌ **queda en `dev`** |

`veCostos` sigue devolviendo `true` solo para `dev`. **El sponsor es de la empresa cliente** —
ADR-060 §5 llama a Retia *"empresa cliente, no la agencia"* con esas palabras— y mostrarle lo que
cuesta el pipeline es mostrarle el lado del costo del margen. La `025` lo sostiene además en la base
(`app.tarifas` pregunta `app.ve_costos()`), así que **abrirlo no sería una línea: pediría migración**.
Que sea caro es deliberado.

### 3. Un sponsor solo toca operadores

**Eje nuevo.** Hasta hoy los gates preguntaban *qué rol podés otorgar* (`rolesQuePuedeOtorgar`).
Nadie preguntaba *a quién podés tocar*, y sin eso un sponsor podía degradar o echar a otro sponsor —
incluso al que le dio el acceso.

> Un `sponsor` puede cambiarle el rol y quitarle el acceso **solo a un `operador`**.
> Un `dev` puede tocar a cualquiera.

Así un sponsor **sube** operadores a sponsor, pero un sponsor ya nombrado es intocable para sus
pares: quien lo puso fue la agencia o un par, y solo la agencia lo saca.

Aplica igual a **cambiar el rol y a quitar el acceso**. Separarlos habría sido peor que no tenerlo:
si no podés degradarme pero sí echarme, el techo es decorativo.

🔑 **De yapa cierra un agujero que `domain/permisos.ts` documentaba como aceptado a sabiendas:**
*"que el último sponsor de una empresa se quite el acceso a sí mismo y la deje sin quién administre"*.
Un sponsor ya no puede tocar a un sponsor, y él es uno.

## Alternativas descartadas

**Dejar al sponsor como estaba y darle el alta al operador.** Mueve el problema: el que califica el
feed pasaría a repartir accesos, que es justo lo que ADR-060 decidió evitar. Y no resuelve que el
sponsor siga sin poder usar la herramienta.

**Abrirle los costos también.** Fue el pedido literal de Mani (*"que vea todo lo de Entender, como
un dev"*), y se acotó en el grill al mostrar qué hay exactamente en cada bloque: con la distinción
sobre la mesa, la decisión fue Actividad sí y Costos no. Sigue disponible, y cuesta una migración.

**Costos sin tarifas** (consumo sí, dólares no). Es el término medio honesto y el que más código
nuevo pedía: `v_costos_semana` ya viene multiplicada, así que habría que partir la vista para una
pantalla que nadie pidió.

**Un invariante que impida dejar una empresa sin sponsors.** No hace falta: es recuperable, porque
la agencia (`es_dueno`) alcanza todas las empresas. Sostener ese invariante en cada mutación cuesta
más que arreglarlo si pasa — y el techo de §3 ya lo vuelve casi imposible.

## Consecuencias

- **Un cambio de rol se lee en la sesión**: quien pase a sponsor tiene que **volver a entrar** para
  ver las zonas nuevas.
- **`rolesQuePuedeOtorgar` y el techo nuevo son dos preguntas distintas**, y las dos tienen que
  correr: *qué rol otorgo* y *a quién se lo aplico*. Un solo gate no cubre las dos.
- El texto del `<select>` en la pantalla de equipo decía *"Sponsor — solo mira resultados"* y quedó
  mintiendo; se corrigió con las zonas.
- **Retia queda con 2 sponsors** (Jero y Tom Green) sobre 2 devs y 4 operadores. Ninguno de los dos
  sponsors puede tocar al otro.
