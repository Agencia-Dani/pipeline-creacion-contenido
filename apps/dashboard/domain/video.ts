// Dominio puro: lo que el sistema sabe de un video, venga de donde venga.
//
// Existe por [ADR-072](../../../docs/adr/ADR-072-el-video-es-la-unidad-una-llave-una-tarjeta.md).
//
// 🔑 **Por qué el cruce vive acá y no en una vista de Postgres.** Fue lo primero que se diseñó y se
// descartó. `outputs.external_id` significa dos cosas según el carril (uuid del candidato en
// `guion_reel`, id del video en `transcripcion_a_pedido`), así que una vista tendría que derivar la
// identidad de `metadata->>'url_referente'` con un regex de Postgres — una segunda implementación de
// lo que `domain/enlace.ts` ya hace. Este repo lo prohíbe por escrito en dos lugares: *"dos
// derivaciones de la misma identidad serían dos bugs mudos el día que una cambie"*
// (`domain/grabados.ts`) y *"dos implementaciones del mismo cruce serían dos verdades"*
// (`curar/historicos/actions.ts`). Es, además, la forma que ya usan las dos features análogas más
// recientes: ADR-067 cruza voces en memoria y ADR-070 arma el registro con `armarRegistro`.
//
// 📏 **Y por qué hace falta fusionar en vez de leer una tabla.** Medido contra prod el 2026-08-21:
// Transcribir tiene **0 de 130** videos con título o referente, los links cargados a mano **3 de
// 294**, y el histórico del Feed tiene los 172 pero **ninguno con miniatura**. Ninguna fuente sola
// alcanza para dibujar una tarjeta; hay que juntarlas.

import { claveDe, type Plataforma } from "./enlace.ts";

/** Un video, con todo lo que se pudo juntar de él. Lo que no se sabe es `null`, nunca inventado. */
export type Video = {
  /** `${plataforma}:${external_id}`, la de `claveDe`. */
  clave: string;
  plataforma: Plataforma;
  external_id: string;
  /** La URL canónica. Es lo único que siempre existe: sin ella no hay video que mostrar. */
  url: string;
  titulo: string | null;
  referente: string | null;
  thumbnail: string | null;
  views: number | null;
  likes: number | null;
  seguidores: number | null;
  idioma: string | null;
  heat: number | null;
};

/**
 * Lo que aporta UNA fuente sobre un video. Todo opcional menos la identidad.
 *
 * Los campos admiten `null` además de `undefined` y no es laxitud: las fuentes son filas de
 * Postgres, donde "no lo sé" **es** `null`. Un `Partial<Video>` a secas daría `string | undefined`
 * y obligaría a cada llamador a traducir sus nulls, que es una conversión de más por fuente y una
 * chance de más de equivocarse. `fusionar` los trata igual (`?? null`).
 */
export type ParteVideo = {
  [K in keyof Omit<Video, "clave" | "plataforma" | "external_id">]?: Video[K] | null;
} & {
  plataforma: Plataforma;
  external_id: string;
};

const CAMPOS = [
  "url", "titulo", "referente", "thumbnail",
  "views", "likes", "seguidores", "idioma", "heat",
] as const;

/**
 * ¿Este texto es un título de verdad, o una URL disfrazada?
 *
 * 🩸 **No es una precaución teórica: `outputs` guarda la url en `titulo` en 129 filas** (las de
 * `tipo = 'transcripcion_a_pedido'`, porque al pedir una transcripción lo único que se sabe del
 * video es su link). Ese disfraz fue lo que produjo el falso positivo de la medición del 21/08 — un
 * cruce contó 129 de 130 matches que en realidad eran filas matcheando **consigo mismas**.
 *
 * Un título que en realidad es una url miente dos veces: en la tarjeta, y en el próximo cruce que
 * alguien escriba encima. Se prefiere `null`, que la tarjeta ya sabe dibujar.
 */
export function esTituloDeVerdad(titulo: string | null | undefined): titulo is string {
  if (!titulo) return false;
  const t = titulo.trim();
  return t.length > 0 && !/^https?:\/\//i.test(t);
}

/**
 * Junta las partes de varios videos en uno por clave.
 *
 * 🔑 **La precedencia es el ORDEN del arreglo, y gana campo a campo — no objeto a objeto.** Esas
 * son dos decisiones distintas y las dos importan:
 *
 *  · *El orden decide*, así que la política de precedencia vive en quien llama (`lib/videos.ts`) y
 *    no escondida acá. Cambiarla es reordenar una lista, no editar esta función.
 *  · *Campo a campo*, porque ninguna fuente está completa: el Feed tiene métricas y a veces no tiene
 *    miniatura (34 de 101), el histórico tiene título y referente y **nunca** miniatura (0 de 172),
 *    y `videos_meta` tiene miniatura. Si ganara el objeto entero, el primero que apareciera taparía
 *    con sus `null` lo que el siguiente sí sabía.
 *
 * El orden de salida es el de **primera aparición**, estable a propósito: una grilla que se
 * reacomoda sola mientras alguien la recorre es la lección que ya dejó el mazo del Feed.
 */
export function fusionar(partes: readonly ParteVideo[]): Video[] {
  const porClave = new Map<string, Video>();

  for (const parte of partes) {
    const clave = claveDe(parte);
    let video = porClave.get(clave);

    if (!video) {
      video = {
        clave,
        plataforma: parte.plataforma,
        external_id: parte.external_id,
        url: "",
        titulo: null, referente: null, thumbnail: null,
        views: null, likes: null, seguidores: null, idioma: null, heat: null,
      };
      porClave.set(clave, video);
    }

    for (const campo of CAMPOS) {
      // `null` y `undefined` son lo mismo acá: "esta fuente no sabe". La diferencia entre "no lo sé"
      // y "no lo tiene" no existe en ninguna de las fuentes, así que inventarla sería ruido.
      const valor = parte[campo] ?? null;
      if (valor === null) continue;
      if (campo === "url") {
        if (video.url === "") video.url = valor as string;
        continue;
      }
      if (campo === "titulo" && !esTituloDeVerdad(valor as string)) continue;
      if (video[campo] === null) (video as Record<string, unknown>)[campo] = valor;
    }
  }

  // Un video sin URL no se puede dibujar ni abrir. No debería pasar (las cuatro fuentes la traen o
  // la derivan), pero si pasa se cae de la lista en vez de pintar una tarjeta que no lleva a ningún
  // lado. Es la misma política que `armarRegistro` con las claves que no parsean: se dice, no se
  // disimula.
  return [...porClave.values()].filter((v) => v.url !== "");
}

/** Tope del nombre de archivo. El `titulo` es el caption recortado a 200 y eso es un nombre absurdo. */
const TOPE_NOMBRE = 60;

/**
 * Cómo se llama el archivo cuando alguien baja este video.
 *
 * 🔑 **`esTituloDeVerdad` decide, no `!== null`.** El título de un video puede ser su propia url
 * (el disfraz que ya costó un falso positivo de medición): bajar 20 archivos llamados
 * `https---www.instagram.com-p-...` sería peor que no ponerles nombre.
 *
 * El fallback es la identidad del video, que siempre existe y siempre es distinta — sin eso, veinte
 * videos sin título bajarían todos como `video.mp4` y el browser los numeraría `video (3).mp4`.
 * La sanitización del nombre la hace `/api/video`, que es quien escribe el `Content-Disposition`.
 */
export function nombreDeArchivo(video: Video): string {
  const partes = [
    video.referente?.trim() || null,
    esTituloDeVerdad(video.titulo) ? video.titulo.trim().slice(0, TOPE_NOMBRE) : null,
  ].filter((p): p is string => p !== null);

  return partes.length > 0 ? partes.join(" - ") : `${video.plataforma}-${video.external_id}`;
}
