// Dominio puro (C3): el registro de qué guiones ya se grabaron. Sin IO, sin React.
//
// ─────────────────────────── DE QUÉ SE TRATA (ADR-070) ───────────────────────────
// El equipo tiene 183 guiones en su histórico y la pregunta que no podía contestar es *"¿cuáles ya
// usamos?"*. La marca vive en `app.grabados`, con clave `(plataforma, external_id)` — o sea **por
// video**, no por el carril que lo trajo.
//
// Este archivo hace las tres cosas que no son IO:
//   1. derivar la clave de video de una URL (`claveDeUrl`), que es lo que permite marcar un guion
//      del Feed — `outputs` no tiene columna con esa clave, pero su `metadata.url_referente` sí;
//   2. juntar los guiones con las marcas y **sacar a la luz las huérfanas**, que son los links que
//      el equipo grabó por fuera de la herramienta y no tienen fila en ninguna otra tabla;
//   3. el filtro de la pantalla.

// Relativo y con extensión, como el resto de `domain/`: los tests corren los `.ts` directo en Node
// (`node --test`), que no resuelve el alias `@/`.
import { claveDe, parsearEnlaces } from "./enlace.ts";

/**
 * La clave de video de una URL suelta, o `null` si no es un link de video reconocible.
 *
 * 🔑 **Es la función que destraba ADR-070.** `outputs.external_id` está sobrecargado (uuid del
 * candidato en un carril, id del video en el otro), así que no sirve como clave — eso lo midió bien
 * ADR-069 §3. Pero `metadata.url_referente` está poblado en **300 de 300** filas, y de ahí
 * `parsearEnlaces` deriva la dupla en **300/300**, sin una sola llamada de red.
 *
 * Se apoya en `parsearEnlaces` y no en un regex propio a propósito: es la misma derivación que ya
 * usa el pegote y que ADR-031 verificó contra la base viva (381/381 IG · 27/27 TikTok). Dos
 * derivaciones de la misma identidad serían dos bugs mudos el día que una cambie.
 *
 * `validos.length !== 1` cubre los dos bordes de una sola vez: cero (no era un link de video) y más
 * de uno (el campo traía basura pegada). En los dos casos la fila no se puede cruzar por video, y
 * eso se dice con `null` en vez de adivinar cuál de los dos era.
 */
export function claveDeUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const { validos } = parsearEnlaces(url);
  return validos.length === 1 ? claveDe(validos[0]) : null;
}

/** Una marca leída de `app.grabados`. `clave` es la de `claveDe`. */
export type MarcaGrabado = {
  clave: string;
  url: string;
  grabadoEn: string;
};

/** Lo mínimo que el registro necesita de un guion del histórico. */
export type GuionDelRegistro = {
  id: string;
  urlReferente: string | null;
  calificadoEn: string | null;
};

/**
 * Una fila del registro. Son dos formas distintas y **no se disimulan como una**:
 *  · `guion` — una fila del histórico, con o sin marca.
 *  · `huerfana` — una marca de un video que no tiene guion en el sistema (se cargó a mano). No
 *    tiene título, ni proyecto, ni script; dibujarla como un guion vacío sería decir que hay un
 *    texto que no existe.
 */
export type FilaRegistro<G extends GuionDelRegistro> =
  | { tipo: "guion"; guion: G; clave: string | null; grabadoEn: string | null }
  | { tipo: "huerfana"; marca: MarcaGrabado };

/** Cuándo pasó lo último que le pasó a esta fila. Es con lo que se ordena la lista. */
export function fechaDeFila<G extends GuionDelRegistro>(f: FilaRegistro<G>): string {
  return f.tipo === "huerfana" ? f.marca.grabadoEn : (f.guion.calificadoEn ?? "");
}

export function estaGrabada<G extends GuionDelRegistro>(f: FilaRegistro<G>): boolean {
  return f.tipo === "huerfana" || f.grabadoEn !== null;
}

/**
 * Cruza los guiones con las marcas y devuelve **una sola lista**.
 *
 * 🔑 **Las huérfanas son lo que obliga a que esto exista.** Si toda marca correspondiera a un guion,
 * bastaría con pegarle un campo a cada fila del histórico. Pero un link cargado a mano no tiene
 * guion —esa es toda su gracia: el equipo lo grabó por fuera— así que si no se agrega acá,
 * **desaparece de la pantalla en la que se acaba de cargar** y el equipo no tiene forma de ver lo
 * que registró.
 *
 * 🩸 **Ordena por la fecha que cada fila tiene**, no por una sola columna: un guion se ordena por
 * cuándo se calificó y una huérfana por cuándo se marcó, porque es el único momento que existe en
 * ella. Meterlas todas al final con fecha vacía las escondería justo después de cargarlas.
 *
 * Un guion cuya URL no se puede interpretar entra igual, con `clave: null` — se ve, se lee y se
 * descarga; lo único que no se puede es marcarlo. Dejarlo afuera de la lista sería perder una fila
 * del histórico por un problema de parseo.
 */
export function armarRegistro<G extends GuionDelRegistro>(
  guiones: readonly G[],
  marcas: ReadonlyMap<string, MarcaGrabado>,
): FilaRegistro<G>[] {
  const usadas = new Set<string>();

  const filas: FilaRegistro<G>[] = guiones.map((guion) => {
    const clave = claveDeUrl(guion.urlReferente);
    const marca = clave === null ? undefined : marcas.get(clave);
    if (marca) usadas.add(clave as string);
    return { tipo: "guion" as const, guion, clave, grabadoEn: marca?.grabadoEn ?? null };
  });

  for (const [clave, marca] of marcas) {
    if (!usadas.has(clave)) filas.push({ tipo: "huerfana", marca });
  }

  return filas.sort((a, b) => fechaDeFila(b).localeCompare(fechaDeFila(a)));
}

// ── El filtro de la pantalla ────────────────────────────────────────────────
//
// Espejo de `FILTROS` en `domain/feed.ts`, y por la misma razón: el chip que está prendido es un
// valor del dominio, no un string suelto en el componente.

export const FILTROS_REGISTRO = ["sin-grabar", "grabados", "todos"] as const;
export type FiltroRegistro = (typeof FILTROS_REGISTRO)[number];

export function esFiltroRegistro(v: unknown): v is FiltroRegistro {
  return typeof v === "string" && (FILTROS_REGISTRO as readonly string[]).includes(v);
}

export function filtrarRegistro<G extends GuionDelRegistro>(
  filas: readonly FilaRegistro<G>[],
  filtro: FiltroRegistro,
): FilaRegistro<G>[] {
  if (filtro === "todos") return [...filas];
  const quiero = filtro === "grabados";
  return filas.filter((f) => estaGrabada(f) === quiero);
}

export type CuentasRegistro = { "sin-grabar": number; grabados: number; todos: number };

export function contarRegistro<G extends GuionDelRegistro>(
  filas: readonly FilaRegistro<G>[],
): CuentasRegistro {
  const grabados = filas.filter(estaGrabada).length;
  return { "sin-grabar": filas.length - grabados, grabados, todos: filas.length };
}
