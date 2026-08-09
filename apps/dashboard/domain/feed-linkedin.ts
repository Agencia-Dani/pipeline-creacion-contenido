// Dominio puro (C3): el material que la máquina de LinkedIn trae, para curar. Sin IO.
//
// 🔑 **Este archivo es deliberadamente FINO, y eso es la decisión.** El vocabulario de la curación
// —`🔥 👍 👎`, la derivación calificación→estado de ADR-034, los dos veredictos de un descarte— **no
// se replica acá: se importa de `domain/feed.ts`**. La `020` §4 usa el mismo `check` que la tabla de
// reels a propósito, y el motivo está escrito ahí: *el equipo de redes no aprende dos idiomas*. Si
// el vocabulario se duplicara, el día que cambie uno la pantalla de un pipeline diría 👍 y la del
// otro seguiría diciendo otra cosa.
//
// Lo que sí es propio de LinkedIn son **las formas**: una pieza de LinkedIn no tiene `plataforma`,
// ni duración, ni script transcripto — tiene `carril` (personal o copiable, ADR-055 §2), texto que
// ya nació texto, y una imagen para rebrandear.

import { estadoDe, type Calificacion, type Estado, type Veredicto } from "./feed.ts";
import type { Carril, Fuente } from "./linkedin.ts";

export { estadoDe };
export type { Calificacion, Estado, Veredicto };

/**
 * Un candidato **en el listado**: los escalares y el título, nunca el `texto` completo.
 *
 * La línea se traza donde ya se pagó en reels: el payload del feed pasó de ~405 KB a ~16 KB al
 * dejar de mandar los campos gordos a una lista que no los dibuja. Acá el gordo es `texto`, y se
 * pide al abrir la pieza, no al listar. **Esto no es optimización prematura: es la misma lección,
 * aplicada antes de que muerda.**
 */
export type CandidatoLinkedin = {
  id: string;
  externalId: string;
  carril: Carril;
  fuente: Fuente;
  titulo: string;
  idioma: string | null;
  url: string | null;
  autor: string | null;
  imagenUrl: string | null;
  reacciones: number | null;
  comentarios: number | null;
  heatScore: number | null;
  relevanciaScore: number | null;
  proyectoId: string | null;
  vozId: string | null;
  calificacion: Calificacion | null;
  estado: Estado;
};

export type DescarteLinkedin = {
  id: string;
  carril: Carril;
  fuente: Fuente;
  titulo: string;
  url: string | null;
  autor: string | null;
  relevanciaScore: number | null;
  relevanciaRazon: string | null;
  veredicto: Veredicto | null;
};

/**
 * El orden del mazo: **lo sin calificar primero**, después por señal.
 *
 * Mismo razonamiento que el banco de referentes: la lista existe para provocar una decisión, y lo
 * que espera decisión va arriba. Dentro de cada grupo manda la señal que haya —`heatScore` si el
 * motor la calculó, si no `relevanciaScore`— y el empate lo rompe el `id`, que es estable.
 *
 * 🩸 **El desempate no es un detalle:** es la lección del corte 3/4 y la que volvió a morder con las
 * tandas. Un orden que depende de cómo vino la lista se reacomoda solo mientras alguien la recorre,
 * y una fila puede saltar de lugar entre dos clicks — o desaparecer de la ventana.
 */
export function ordenarMazo(candidatos: readonly CandidatoLinkedin[]): CandidatoLinkedin[] {
  const señal = (c: CandidatoLinkedin) => c.heatScore ?? c.relevanciaScore ?? -1;
  return [...candidatos].sort(
    (a, b) =>
      Number(a.calificacion !== null) - Number(b.calificacion !== null) ||
      señal(b) - señal(a) ||
      a.id.localeCompare(b.id),
  );
}

/**
 * Los descartes: **los sin veredicto primero**, después por cuán cerca estuvieron.
 *
 * Un descarte con veredicto ya cumplió su función (corregir los criterios); el que falta es el que
 * todavía puede enseñar algo. Y entre los pendientes, primero los de score más alto: son los que
 * el filtro mató por menos, o sea donde es más probable que se haya equivocado.
 */
export function ordenarDescartesLinkedin(
  descartes: readonly DescarteLinkedin[],
): DescarteLinkedin[] {
  return [...descartes].sort(
    (a, b) =>
      Number(a.veredicto !== null) - Number(b.veredicto !== null) ||
      (b.relevanciaScore ?? -1) - (a.relevanciaScore ?? -1) ||
      a.id.localeCompare(b.id),
  );
}

/** Cuántos esperan una decisión. Es el número del chip, y el único que importa mirar. */
export const sinCalificar = (candidatos: readonly CandidatoLinkedin[]): number =>
  candidatos.filter((c) => c.calificacion === null).length;

export const sinVeredicto = (descartes: readonly DescarteLinkedin[]): number =>
  descartes.filter((d) => d.veredicto === null).length;
