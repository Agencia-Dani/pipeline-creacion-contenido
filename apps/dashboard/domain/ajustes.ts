// Dominio puro (C3): las reglas de los knobs del equipo, para D5 (corte de config).
//
// Por qué existe: la migración `009` valida la CLAVE (check contra los 18 knobs) pero no
// el VALOR, y Airtable tampoco validaba nada. Hoy alguien puede escribir "Peso de
// relevancia = 5" (es una proporción 0–1) y nadie se entera hasta que el motor ordena
// raro. Este módulo es la regla que faltaba, del lado del servidor.
//
// Lo que deliberadamente NO valida: `cap_resultados_referente`. Sigue siendo dev-only en el
// `Config` del workflow (ADR-016); duplicarlo acá sería dos dueños para el mismo dato. El motor
// lo aplica con Math.min y el tope va escrito en la `descripcion` del knob — informa, no manda.
//
// 🔀 `cap_top_n` SÍ está acá desde ADR-042, y la línea entre los dos es: un tope que **protege** a
// otro knob se queda en el `Config`; un tope que **es presupuesto** va a la pantalla. `cap_top_n`
// decide cuántos videos se transcriben, o sea cuánto sale la corrida: era la única perilla de
// cantidad que costaba plata y la única que no se podía tocar sin re-importar.

export type TipoAjuste = "proporcion" | "entero" | "entero_positivo" | "toggle";

export type Knob = {
  /** Qué workflow lo consume. El equipo no lo ve; sirve para agrupar la pantalla. */
  consume: "motor" | "descubrimiento";
  tipo: TipoAjuste;
};

// Las claves son EXACTAMENTE las del check de `009` y las de los AJUSTE_MAP de los dos
// workflows. Una clave nueva se agrega en los tres lados o no existe.
export const CATALOGO: Record<string, Knob> = {
  "Peso de vistas": { consume: "motor", tipo: "proporcion" },
  "Peso de likes": { consume: "motor", tipo: "proporcion" },
  "Peso de interacción": { consume: "motor", tipo: "proporcion" },
  "Peso de relevancia": { consume: "motor", tipo: "proporcion" },
  "Bonus idioma extranjero": { consume: "motor", tipo: "proporcion" },
  "Relevancia mínima": { consume: "motor", tipo: "proporcion" },
  "Seguidores para marcar viral": { consume: "motor", tipo: "entero" },
  "Mínimo de vistas": { consume: "motor", tipo: "entero" },
  "Mínimo de likes": { consume: "motor", tipo: "entero" },
  // `entero` y no `entero_positivo`: el motor trata el 0 como "sin techo" (`if (CAP > 0)`), y
  // prohibirlo mataría esa salida sin querer.
  "Videos a transcribir por corrida": { consume: "motor", tipo: "entero" },
  "Días de recencia": { consume: "motor", tipo: "entero_positivo" },
  "Resultados por cuenta de referente": { consume: "motor", tipo: "entero_positivo" },
  "Buscar por referentes en Instagram": { consume: "motor", tipo: "toggle" },
  "Buscar por referentes en TikTok": { consume: "motor", tipo: "toggle" },
  "Propuestas por corrida": { consume: "descubrimiento", tipo: "entero_positivo" },
  "Afinidad mínima de propuesta": { consume: "descubrimiento", tipo: "proporcion" },
  "Descubrir en Instagram": { consume: "descubrimiento", tipo: "toggle" },
  "Descubrir en TikTok": { consume: "descubrimiento", tipo: "toggle" },
};

export type Validacion = { ok: true; valor: number } | { ok: false; error: string };

const entero = (v: number) => Number.isInteger(v);

/**
 * Valida un valor contra su knob. Los mensajes son para el equipo de redes, no para un
 * dev: dicen qué se esperaba, no qué constraint falló.
 */
export function validarAjuste(clave: string, valor: unknown): Validacion {
  const knob = CATALOGO[clave];
  if (!knob) return { ok: false, error: `"${clave}" no es un ajuste conocido.` };

  // Un input de HTML siempre llega como string; el borde lo normaliza acá, una vez.
  const n = typeof valor === "number" ? valor : Number(String(valor ?? "").trim());
  if (!Number.isFinite(n)) return { ok: false, error: "Tiene que ser un número." };

  switch (knob.tipo) {
    case "proporcion":
      return n >= 0 && n <= 1
        ? { ok: true, valor: n }
        : { ok: false, error: "Va de 0 a 1 (por ejemplo 0.4). Un 40 acá no es 40%." };
    case "toggle":
      return n === 0 || n === 1
        ? { ok: true, valor: n }
        : { ok: false, error: "Solo 1 (sí) o 0 (no)." };
    case "entero":
      return entero(n) && n >= 0
        ? { ok: true, valor: n }
        : { ok: false, error: "Tiene que ser un número entero de 0 para arriba." };
    case "entero_positivo":
      return entero(n) && n >= 1
        ? { ok: true, valor: n }
        : { ok: false, error: "Tiene que ser un número entero de 1 para arriba." };
  }
}

/**
 * Los knobs que un rol puede EDITAR. `visibilidad` viaja en la fila (la decide quien
 * cura la config, no el código), así que se pasa desde afuera. El dev ve todo; el
 * operador solo los de equipo. Regla del plan §3.2: la UI esconde, el servidor impide —
 * esto es el lado del servidor, y la pantalla se limita a reflejarlo.
 */
export function ajustesVisibles<T extends { clave: string; visibilidad: string }>(
  filas: T[],
  rol: "operador" | "dev" | "sponsor",
): T[] {
  if (rol === "dev") return filas.filter((f) => f.clave in CATALOGO);
  // El `sponsor` ve lo mismo que el `operador` desde el 2026-08-07: ahora opera, así que necesita
  // las 8 perillas de `visibilidad: equipo` que el trabajo diario usa (mínimos de likes/vistas,
  // propuestas por corrida, los 4 toggles de IG/TikTok, afinidad mínima). Lo que sigue siendo solo
  // de `dev` son los knobs avanzados — los que mueven plata y techos del motor. Ver `domain/roles.ts`.
  return filas.filter((f) => f.clave in CATALOGO && f.visibilidad === "equipo");
}
