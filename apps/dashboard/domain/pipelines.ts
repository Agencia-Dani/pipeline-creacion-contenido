// Dominio puro (C3): qué zonas del cockpit implementa cada pipeline. Sin IO, sin React.
//
// Existe por ADR-056. Hasta que entró LinkedIn, `zonasDe(rol)` alcanzaba para decidir el nav:
// con un solo pipeline, las 4 zonas existen en todos los cockpits porque hay un solo cockpit.
// Con dos pipelines eso deja de ser cierto — `transcribir` es la zona de ADR-031 (pegar enlaces →
// script literal) y LinkedIn **ya es texto**: su etapa `enriquecer` es `n/a` (ADR-055 §3).
//
// ⚠️ **Se keyea por `workflow_id`, no por el slug de la URL.** Son iguales hoy en reels por
// casualidad histórica (`short-form-content` → slug `reels` los separó), y el slug es de la
// INSTANCIA: dos instancias del mismo pipeline pueden llamarse distinto, que es justo lo que la
// `016` habilitó. Keyear por slug haría que renombrar un cockpit le cambiara las zonas.

// Con extensión: es un import de VALOR (`ZONAS`), y los `.ts` de `domain/` corren directo en Node
// sin build. Los demás archivos de acá importan solo tipos, que se borran y no necesitan resolver.
import { ZONAS, type Zona } from "./roles.ts";

/** El `workflows.id` del registro central, que es también el `id` del manifest. */
export type Pipeline = string;

// Qué zonas tiene sentido dibujar en cada pipeline. La tabla es corta a propósito: sumar un
// pipeline es una línea acá, no tocar el layout ni las guardias.
//
// No se deriva de la existencia de las tablas (que sería automático y sin duplicación) porque eso
// pone una decisión de producto a merced de una migración: aplicar la `020` cambiaría el nav de
// todos los cockpits sin que nadie lo decida (ADR-056, alternativas descartadas).
// `ajustes` va en los DOS: el equipo es de la empresa, no del pipeline — existe con o sin motor
// (ADR-060 §1). Qué pantallas tiene adentro sí cambia por pipeline: ver `AJUSTES_POR_PIPELINE`.
const ZONAS_POR_PIPELINE: Record<Pipeline, readonly Zona[]> = {
  "short-form-content": ["operar", "curar", "transcribir", "entender", "ajustes"],
  // 🩸 **LinkedIn tenía cuatro y se quedó con dos el 2026-08-08 (ADR-066).** `transcribir` nunca la
  // tuvo (ya es texto, su etapa `enriquecer` es `n/a`, ADR-055 §3). Las otras dos salieron porque
  // **declararlas sin tener pantalla propia no era mostrar poco: era mostrar las de reels.**
  //
  //   · `entender` leía las 5 vistas de reels filtradas por su `instance_id` ⇒ ceros mudos, la
  //     familia de la `015` que este archivo entero existe para evitar.
  //   · `operar` era peor y por eso fue urgente: trae los TRES botones que disparan los workflows
  //     de reels (`correrAhora`/`buscarAhora`/`archivarAhora`), y ninguno miraba el pipeline. Con
  //     `30x/linkedin` y `estadox/linkedin` en `active`, el ▶ estaba vivo apuntando al motor
  //     equivocado. Medido antes de cerrarlo: cero `runs`, cero `outputs` — nadie llegó a apretarlo.
  //
  // Vuelven cuando tengan pantalla propia, que es cuando exista el motor de LinkedIn. **La guarda
  // de `operar/actions.ts` NO se saca ese día**: la zona no es la pregunta correcta (ver ahí).
  linkedin: ["curar", "ajustes"],
};

/**
 * Las zonas que implementa un pipeline.
 *
 * **Un pipeline que no está declarado no tiene ninguna zona**, y es el default seguro que pide
 * ADR-056: falla ruidoso y visible (un cockpit sin nav, que se nota en el primer vistazo) en vez
 * de dibujar cuatro links a pantallas que no existen.
 */
export function zonasDePipeline(pipeline: Pipeline): readonly Zona[] {
  return ZONAS_POR_PIPELINE[pipeline] ?? [];
}

/** Si el pipeline está declarado acá. Lo usan las guardias para no adivinar. */
export function pipelineConocido(pipeline: Pipeline): boolean {
  return pipeline in ZONAS_POR_PIPELINE;
}

/**
 * La intersección de ADR-056: **lo que ve alguien es lo que su rol alcanza Y lo que el pipeline
 * tiene**. Las dos condiciones son necesarias y ninguna alcanza sola.
 *
 * El orden lo pone el rol, no el pipeline: `zonasDeRol` viene ordenada por prioridad (su primer
 * elemento es la zona inicial), y respetarlo es lo que hace que `zonaInicialEn` no tenga que
 * volver a decidir nada.
 */
export function zonasVisibles(
  zonasDeRol: readonly Zona[],
  pipeline: Pipeline,
): readonly Zona[] {
  const delPipeline = zonasDePipeline(pipeline);
  return zonasDeRol.filter((z) => delPipeline.includes(z));
}

/**
 * A dónde cae alguien al entrar a ESTE cockpit: la primera zona que su rol alcanza y el pipeline
 * implementa.
 *
 * Devuelve `null` cuando la intersección es vacía — un `sponsor` en un pipeline que no tuviera
 * `entender`, por ejemplo. No es un caso imposible y no se puede resolver acá inventando una zona:
 * quien llama tiene que decidir a dónde manda a esa persona (hoy, a la raíz).
 */
export function zonaInicialEn(
  zonasDeRol: readonly Zona[],
  pipeline: Pipeline,
): Zona | null {
  return zonasVisibles(zonasDeRol, pipeline)[0] ?? null;
}

/** Los pipelines declarados. Para tests y para pantallas que necesiten enumerarlos. */
export function pipelinesDeclarados(): readonly Pipeline[] {
  return Object.keys(ZONAS_POR_PIPELINE);
}

// ─────────────────────────── Un nivel más abajo: las pantallas de `curar` ───────────────────────
//
// 🩸 **ADR-056 resolvió el nav POR ZONA y nadie miró un nivel más abajo.** El agujero se vio el
// 2026-08-06, con la primera pantalla de LinkedIn: `curar` existe en los dos pipelines, así que la
// guardia de zona la dejaba pasar entera — y adentro había **siete** links a pantallas de reels.
// Seis de ellas leen `app.candidatos`/`app.descartes`/`app.ajustes`… filtradas por el `instance_id`
// de LinkedIn, o sea que devuelven vacío **sin fallar**. En un pipeline recién nacido eso se lee
// como *"todavía no cargamos datos"* y no como *"esta pantalla no es de este pipeline"*: la familia
// de la `015` otra vez.
//
// 🔑 **Y por qué esta lista es UNA y no dos.** El primer arreglo puso las tarjetas por pipeline en
// la página y dejó la guardia sin escribir — o sea la UI escondiendo y el servidor no impidiendo,
// que es al revés de la regla de la casa, y además dos expresiones de la misma verdad (las tarjetas
// que se dibujan y el conjunto de rutas que de verdad existe) libres de divergir. Acá se declara
// una vez: el índice **deriva** sus tarjetas de esto, y la guardia del servidor pregunta a esto.
// Agregar una pantalla es una línea acá.

// `ajustes` salió de acá el 2026-08-06: los knobs se mudaron a su propia zona (ADR-060 §1). `curar`
// es *trabajar sobre el material*, y configurar el motor no es eso — era la única pantalla de curar
// que no miraba una pieza de contenido.
export const PANTALLAS_CURAR = [
  "feed",
  "descartes",
  "historicos",
  "voces",
  "referentes",
  "sugeridos",
] as const;

export type PantallaCurar = (typeof PANTALLAS_CURAR)[number];

const CURAR_POR_PIPELINE: Record<Pipeline, readonly PantallaCurar[]> = {
  "short-form-content": PANTALLAS_CURAR,
  // Hoy LinkedIn tiene UNA. No es una limitación temporal disfrazada de diseño: es que hay una
  // pantalla construida. Las demás entran cuando existan, no antes (ADR-055 §3 deja además fuera a
  // `historicos` en su forma actual — el histórico de LinkedIn es `outputs`, pero su pantalla lee
  // columnas de video).
  linkedin: ["referentes"],
};

/** Las pantallas de `curar` que este pipeline implementa. Un pipeline no declarado no tiene ninguna. */
export function pantallasDeCurar(pipeline: Pipeline): readonly PantallaCurar[] {
  return CURAR_POR_PIPELINE[pipeline] ?? [];
}

/**
 * ¿Este pipeline implementa esta pantalla de `curar`? Es la pregunta que hace la guardia del
 * servidor, y la que faltaba: `exigirTenant` autoriza la ZONA, y `curar` la tienen los dos.
 */
export function implementaPantalla(pipeline: Pipeline, pantalla: PantallaCurar): boolean {
  return pantallasDeCurar(pipeline).includes(pantalla);
}

// ─────────────────────────── Y las de `ajustes`, con el mismo molde ─────────────────────────────
//
// 🔑 **La duplicación de forma con `PANTALLAS_CURAR` es a propósito.** Generalizar las dos tablas en
// una sola («pantallas por zona por pipeline») es la abstracción obvia y no se hace todavía: son dos
// casos, y el tercero decide si el patrón es real o si son dos cosas que se parecen. Lo que sí se
// copia es la LECCIÓN — declarar por pipeline lo que existe— porque esa ya se pagó una vez.

export const PANTALLAS_AJUSTES = ["motor", "equipo"] as const;

export type PantallaAjustes = (typeof PANTALLAS_AJUSTES)[number];

// **LinkedIn no declara `motor`, y es el mismo fallo mudo de siempre visto venir:** `app.ajustes`
// no tiene filas para su instancia, así que la pantalla cargaría limpia mostrando cero perillas —
// que en un pipeline recién nacido se lee como *"todavía no lo configuramos"* y no como *"esto no
// es de acá"*. La familia de la `015`. `equipo` sí, porque el equipo es de la empresa.
const AJUSTES_POR_PIPELINE: Record<Pipeline, readonly PantallaAjustes[]> = {
  "short-form-content": PANTALLAS_AJUSTES,
  linkedin: ["equipo"],
};

/** Las pantallas de `ajustes` que este pipeline implementa. Un pipeline no declarado no tiene ninguna. */
export function pantallasDeAjustes(pipeline: Pipeline): readonly PantallaAjustes[] {
  return AJUSTES_POR_PIPELINE[pipeline] ?? [];
}

/** La pregunta que hace la guardia del servidor, hermana de `implementaPantalla`. */
export function implementaAjuste(pipeline: Pipeline, pantalla: PantallaAjustes): boolean {
  return pantallasDeAjustes(pipeline).includes(pantalla);
}

/**
 * Que ninguna declaración de pantallas invente una que no existe, y que ningún pipeline con la zona
 * `curar` se quede sin pantallas.
 *
 * Lo segundo importa tanto como lo primero: un pipeline que declara `curar` en sus zonas y no
 * declara ninguna pantalla acá dibuja una zona vacía — que es el mismo fallo mudo, movido de lugar.
 */
export function declaracionesDeCurarValidas(): boolean {
  return pipelinesDeclarados().every((p) => {
    const pantallas = pantallasDeCurar(p);
    const tieneCurar = zonasDePipeline(p).includes("curar");
    return (
      pantallas.every((s) => PANTALLAS_CURAR.includes(s)) && (tieneCurar ? pantallas.length > 0 : true)
    );
  });
}

/** La misma guardia para `ajustes`: una zona declarada sin pantallas es una zona vacía. */
export function declaracionesDeAjustesValidas(): boolean {
  return pipelinesDeclarados().every((p) => {
    const pantallas = pantallasDeAjustes(p);
    const tieneAjustes = zonasDePipeline(p).includes("ajustes");
    return (
      pantallas.every((s) => PANTALLAS_AJUSTES.includes(s)) &&
      (tieneAjustes ? pantallas.length > 0 : true)
    );
  });
}

/**
 * Que ninguna declaración invente una zona que no existe.
 *
 * Un typo en la tabla de arriba (`"transcibir"`) no lo atrapa TypeScript si algún día la tabla se
 * arma desde datos, y su síntoma sería una zona que simplemente no aparece — mudo. Esto lo hace
 * ruidoso, y el test lo corre.
 */
export function declaracionesValidas(): boolean {
  return pipelinesDeclarados().every((p) =>
    zonasDePipeline(p).every((z) => ZONAS.includes(z)),
  );
}
