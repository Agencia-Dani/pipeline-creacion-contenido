// Dominio puro (C3): el perfil de una voz en el pipeline de LinkedIn. Sin IO — lo que pega contra
// Postgres vive en `lib/voces-linkedin.ts`.
//
// 🔑 **Esta es LA unidad de configuración de la máquina de LinkedIn**, y no es la empresa. Lo decidió
// ADR 002 del repo de diseño (`../maquina-linkedin/`) y lo importa ADR-067: dentro de una misma
// marca, dos cuentas ya escriben distinto —una de a una línea, la otra no; una rinde los fines de
// semana, la otra no publica— así que un config por empresa se rompe el primer día.
//
// Los límites replican los `check` de la `020` §3 **a propósito**: un check de Postgres no se puede
// importar desde TypeScript, y esto es lo que la pantalla dibuja y el server action valida. Si
// divergen, el insert falla ruidoso (23514), que es el modo de falla correcto. Lo que sigue son los
// que la base NO tiene y la app sí necesita — formato de las horas, vocabulario de los días, dedup
// de los dos arrays — porque `text[]` acepta cualquier cosa y el motor que los va a leer no.

/**
 * Los días buenos son **empíricos y por cuenta**, no hay fórmula (ADR-055 §4, R-4 de contexto).
 *
 * Sin acentos ni mayúsculas: es lo que se guarda. La etiqueta bonita se dibuja aparte, por la misma
 * razón que `normalizarConsulta` guarda sin arroba — dos formas del mismo día son un duplicado con
 * otra cara, y acá el duplicado lo tiene que leer una máquina que va a comparar strings.
 */
export const DIAS = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"] as const;
export type Dia = (typeof DIAS)[number];

export const esDia = (v: unknown): v is Dia =>
  typeof v === "string" && (DIAS as readonly string[]).includes(v);

export const ETIQUETA_DIA: Record<Dia, string> = {
  lunes: "Lunes",
  martes: "Martes",
  miercoles: "Miércoles",
  jueves: "Jueves",
  viernes: "Viernes",
  sabado: "Sábado",
  domingo: "Domingo",
};

// Los tres de la `020` §3. `ESPACIADO_*` y `SEPARACION_MIN` son el check literal; `SEPARACION_MAX`
// no existe en la base y se agrega acá: más de una semana entre dos posts no es una separación
// mínima, es *no publicar*, y el único modo de escribirlo era un typo (48 → 480).
export const ESPACIADO_MIN = 1;
export const ESPACIADO_MAX = 3;
export const SEPARACION_MIN = 1;
export const SEPARACION_MAX = 168;

/** Lo que la `020` §3 guarda por (instancia, voz). `dias` nullable = "no lo definimos todavía". */
export type PerfilVozLinkedin = {
  vozId: string;
  perfil: string | null;
  firma: string;
  espaciado: number;
  separacionH: number;
  franjas: string[];
  dias: Dia[] | null;
  lineasRojas: string | null;
};

/**
 * Una voz de la empresa, con su perfil de LinkedIn si lo tiene.
 *
 * 🔑 **`perfil: null` es el estado normal, no un error.** `app.voces` es de grano EMPRESA y la
 * comparten los dos pipelines; `app.voces_linkedin` es de grano INSTANCIA. Que exista la fila del
 * perfil **es** lo que significa "esta voz está configurada para LinkedIn" — ver `estaActivaEnLinkedin`.
 */
export type VozConPerfil = {
  id: string;
  nombre: string;
  perfil: PerfilVozLinkedin | null;
};

/**
 * 🔴 **Lo que decide si una voz corre en LinkedIn es la existencia de su perfil, NO `voces.activo`.**
 *
 * Es la regla que ADR-067 pone en rojo y la razón por la que esta función existe en vez de leerse
 * un booleano. `app.voces.activo` significa hoy, de facto, *"corre en reels"*: lo consume
 * `leerConfigOperar` para armar el plan del motor. Si la pantalla de LinkedIn lo leyera, escondería
 * voces perfectamente válidas; si lo escribiera, **apagaría proyectos de reels en producción, sin
 * un solo error**. Los dos pipelines necesitan su propio interruptor y este es el de LinkedIn.
 */
export const estaActivaEnLinkedin = (voz: VozConPerfil): boolean => voz.perfil !== null;

// ─────────────────────────── Normalización de los dos arrays ───────────────────────────

/**
 * `HH:MM` en 24 h. Acepta `8:00` y lo normaliza a `08:00` en `normalizarFranjas`.
 *
 * No usa `Date`: `new Date("25:00")` es `Invalid Date` pero `new Date("2026-01-01T8:00")` parsea, y
 * la diferencia entre los dos es el tipo de cosa que se descubre en producción. Una hora del día no
 * es un instante, es un par de números — y compararla como string ordenada solo funciona si está
 * paddeada, que es la otra mitad de por qué esto existe.
 */
export function esHora(v: string): boolean {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
  if (!m) return false;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h >= 0 && h <= 23 && min >= 0 && min <= 59;
}

/**
 * Paddea, ordena y deduplica. `["8:00","13:00","08:00"]` → `["08:00","13:00"]`.
 *
 * Las tres cosas por el mismo motivo que `normalizarConsulta`: sin esto, `"8:00"` y `"08:00"` son
 * dos franjas distintas para el array y **la misma hora del día** para quien programe la cola. El
 * orden es cronológico y sale gratis del padding — con `HH:MM` a dos dígitos, ordenar como texto
 * ordena como hora.
 *
 * Las inválidas se descartan en silencio **acá**: quien valida es `validarPerfil`, que corre antes y
 * las reporta por campo. Esta función se usa en la escritura, donde ya pasaron el filtro.
 */
export function normalizarFranjas(franjas: readonly string[]): string[] {
  const limpias = franjas
    .map((f) => f.trim())
    .filter((f) => esHora(f))
    .map((f) => {
      const [h, m] = f.split(":");
      return `${h.padStart(2, "0")}:${m}`;
    });
  return [...new Set(limpias)].sort();
}

/**
 * Deduplica y ordena por la semana, no alfabéticamente.
 *
 * Alfabético daría `domingo, jueves, lunes…`, que es ruido: los días de la semana tienen un orden y
 * es el que la persona espera leer. Sale de `DIAS`, que ya está en ese orden.
 */
export function normalizarDias(dias: readonly string[]): Dia[] {
  const validos = dias.map((d) => d.trim().toLowerCase()).filter(esDia);
  return [...new Set(validos)].sort((a, b) => DIAS.indexOf(a) - DIAS.indexOf(b));
}

// ─────────────────────────── Validación ───────────────────────────

export type FormPerfilVoz = {
  /** Solo se usa en el alta, cuando además hay que crear la fila de `app.voces`. */
  nombre: string;
  perfil: string;
  firma: string;
  espaciado: string;
  separacionH: string;
  franjas: string[];
  dias: string[];
  lineasRojas: string;
};

/**
 * Valida el alta/edición y devuelve los errores por campo. Vacío = válido.
 *
 * Igual que `validarReferente`: vive en el dominio porque la pantalla lo corre **antes** de mandar y
 * el action lo corre **de nuevo** al recibir. Una sola función, porque dos copias divergen y la que
 * se relaja siempre es la del server, que es la única que importa.
 *
 * `exigirNombre` distingue los dos usos: al **crear** hay que dar de alta también la voz en
 * `app.voces` (30X y EstadoX no tienen cockpit de reels, así que esta pantalla es el único lugar
 * desde donde puede nacer una voz suya — ADR-067 §3); al **editar** el nombre ya existe y no se toca
 * desde acá.
 */
export function validarPerfil(
  form: FormPerfilVoz,
  { exigirNombre }: { exigirNombre: boolean },
): Partial<Record<keyof FormPerfilVoz, string>> {
  const errores: Partial<Record<keyof FormPerfilVoz, string>> = {};

  if (exigirNombre) {
    const nombre = form.nombre.trim();
    if (nombre === "") errores.nombre = "Escribí de quién es la voz.";
    else if (nombre.length > 120) errores.nombre = "Es muy largo (máximo 120 caracteres).";
  }

  // 🔴 R-2, y es la razón por la que `firma` es `not null` en la `020`: una voz sin firma produce
  // posts que violan la regla de la casa **en silencio**, porque el validador determinista de la
  // etapa de generación no tendría contra qué chequear. No existe "guardar el perfil y la firma
  // después".
  const firma = form.firma.trim();
  if (firma === "") {
    errores.firma = "La firma es obligatoria: nombre · cargo · frase de propósito. Va al cierre de todo post.";
  } else if (firma.length > 500) {
    errores.firma = "La firma es muy larga (máximo 500 caracteres).";
  }

  const espaciado = Number(form.espaciado);
  if (!Number.isInteger(espaciado) || espaciado < ESPACIADO_MIN || espaciado > ESPACIADO_MAX) {
    errores.espaciado = `Tiene que ser un número entero entre ${ESPACIADO_MIN} y ${ESPACIADO_MAX}.`;
  }

  const separacion = Number(form.separacionH);
  if (!Number.isInteger(separacion) || separacion < SEPARACION_MIN || separacion > SEPARACION_MAX) {
    errores.separacionH = `Tiene que ser un número entero entre ${SEPARACION_MIN} y ${SEPARACION_MAX} horas.`;
  }

  // Una voz sin ninguna franja **no se puede programar nunca**: la cola no tendría a qué hora
  // ponerla. La base lo permite (`text[] not null` acepta el array vacío) y por eso se chequea acá.
  const franjas = form.franjas.map((f) => f.trim()).filter((f) => f !== "");
  if (franjas.length === 0) {
    errores.franjas = "Poné al menos una franja horaria (ej: 08:00).";
  } else {
    const mala = franjas.find((f) => !esHora(f));
    if (mala) errores.franjas = `"${mala}" no es una hora válida. Usá HH:MM en 24 h (ej: 17:30).`;
  }

  // Los días SÍ pueden ir vacíos: "todavía no sabemos cuáles" es un estado legítimo y la columna es
  // nullable justamente por eso. Lo que no puede es traer un día inventado.
  const diaMalo = form.dias.map((d) => d.trim().toLowerCase()).find((d) => d !== "" && !esDia(d));
  if (diaMalo) errores.dias = `"${diaMalo}" no es un día de la semana.`;

  if (form.perfil.length > 10000) {
    errores.perfil = "El perfil de voz es muy largo (máximo 10000 caracteres).";
  }
  if (form.lineasRojas.length > 2000) {
    errores.lineasRojas = "Es muy largo (máximo 2000 caracteres).";
  }

  return errores;
}

// ─────────────────────────── La forma del contrato (ADR-068) ───────────────────────────

/**
 * Las voces → los registros `{id, fields}` del plan de corrida de LinkedIn.
 *
 * 🔴 **El filtro de `motor` es `estaActivaEnLinkedin`, o sea la EXISTENCIA DEL PERFIL, y jamás
 * `voces.activo`.** Es la regla de ADR-067 aplicada al único consumidor que todavía no existía
 * cuando se escribió, y acá se paga cara en las dos direcciones: filtrar por `activo` le daría al
 * motor **cero voces** en las tres marcas (la pantalla de LinkedIn las crea con `activo: false` a
 * propósito, para no meterlas en el plan de reels), y sería cero **sin un solo error** — una corrida
 * verde que no produce nada.
 *
 * En `completo` viajan todas, con los campos del perfil en `null` y `configurada: false`. La forma
 * se mantiene idéntica a propósito: un registro al que le faltan claves según el caso obliga a quien
 * lo lee a chequear cada una, y ese es el `undefined` que se cuela en un template de prompt.
 *
 * `id` es el uuid de `app.voces` — el mismo que ya usa el plan de reels, porque la voz es de la
 * EMPRESA y es la misma fila en los dos pipelines. Lo que cambia es lo que se dice de ella.
 */
export function aRegistrosDeVocesLinkedin(
  voces: readonly VozConPerfil[],
  ambito: "motor" | "completo",
): { id: string; fields: Record<string, unknown> }[] {
  return voces
    .filter((v) => ambito === "completo" || estaActivaEnLinkedin(v))
    .map((v) => ({
      id: v.id,
      fields: {
        nombre: v.nombre,
        configurada: estaActivaEnLinkedin(v),
        perfil: v.perfil?.perfil ?? null,
        firma: v.perfil?.firma ?? null,
        espaciado: v.perfil?.espaciado ?? null,
        separacion_h: v.perfil?.separacionH ?? null,
        franjas: v.perfil?.franjas ?? [],
        dias: v.perfil?.dias ?? null,
        lineas_rojas: v.perfil?.lineasRojas ?? null,
      },
    }));
}

// ─────────────────────────── Cómo se dibuja la lista ───────────────────────────

/**
 * Parte las voces de la empresa en las dos que la pantalla dibuja por separado.
 *
 * **Configuradas arriba, sin configurar abajo** — y esto es al revés de `ordenarBanco`, a propósito.
 * Ahí lo apagado va primero porque prender es la acción que la lista existe para provocar. Acá el
 * trabajo pendiente no es una fila que espera un click: es escribirle a alguien un perfil de voz
 * entero, que no se hace en la pantalla. Lo que se consulta a diario es lo que ya está configurado.
 *
 * Cada bloque va alfabético para que el orden sea estable — la lección del corte 3/4: un orden que
 * depende de cómo vino la lista se reacomoda solo mientras alguien la recorre.
 */
export function repartirVoces(voces: readonly VozConPerfil[]): {
  configuradas: VozConPerfil[];
  sinConfigurar: VozConPerfil[];
} {
  const porNombre = (a: VozConPerfil, b: VozConPerfil) => a.nombre.localeCompare(b.nombre, "es");
  return {
    configuradas: voces.filter(estaActivaEnLinkedin).sort(porNombre),
    sinConfigurar: voces.filter((v) => !estaActivaEnLinkedin(v)).sort(porNombre),
  };
}
