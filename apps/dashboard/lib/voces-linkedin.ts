import { z } from "zod";
import {
  esDia,
  normalizarDias,
  normalizarFranjas,
  type Dia,
  type PerfilVozLinkedin,
  type VozConPerfil,
} from "@/domain/linkedin-voz";
import type { TenantContext } from "@/domain/tenant";
import { crearVoz, leerVoces } from "@/lib/proyectos";
import { scoped } from "@/lib/supabase/scoped";

// El perfil por voz del pipeline de LinkedIn (`020` §3, ADR-055 §4, ADR-067).
//
// 🔑 **Este archivo cruza dos granos, y esa es toda su razón de ser.** `app.voces` es de grano
// EMPRESA y la comparten los dos pipelines; `app.voces_linkedin` es de grano INSTANCIA y tiene PK
// compuesta `(instance_id, voz_id)`. O sea: el roster de voces es de la empresa, y **cómo habla esa
// voz en LinkedIn es del cockpit**. Las dos las scopea `scoped()` por ejes distintos y ninguna
// necesita un `.eq()` a mano.
//
// 🔴 **La regla que este archivo NO viola nunca: no se escribe `app.voces.activo`.** Ese flag
// significa hoy, de facto, *"corre en reels"* — lo consume `leerConfigOperar` para armar el plan del
// motor. Un `update` desde acá apagaría proyectos de reels **en producción y sin un solo error**.
// Lo único que esta pantalla escribe en `app.voces` es un alta (ver `crearVozParaLinkedin`), y las
// altas no tocan nada existente.

const filaPerfil = z.object({
  voz_id: z.string(),
  perfil: z.string().nullable(),
  firma: z.string(),
  espaciado: z.number(),
  separacion_h: z.number(),
  franjas: z.array(z.string()),
  dias: z.array(z.string()).nullable(),
  lineas_rojas: z.string().nullable(),
});

const COLUMNAS = "voz_id, perfil, firma, espaciado, separacion_h, franjas, dias, lineas_rojas";

/** Lo que se escribe al configurar una voz para LinkedIn. */
export type DatosPerfilVoz = {
  perfil: string | null;
  firma: string;
  espaciado: number;
  separacionH: number;
  franjas: string[];
  dias: string[];
  lineasRojas: string | null;
};

/**
 * Las voces de la empresa, cada una con su perfil de LinkedIn si lo tiene.
 *
 * Se cruza **en memoria** y no con un join de PostgREST porque las dos tablas viven en granos
 * distintos: pedir el embed obligaría a que una de las dos se lea sin su filtro. Son dos lecturas
 * chicas (el roster de una empresa son unidades, no miles) y cada una entra por `scoped()` con el
 * eje que le toca — que es lo que hace que la Capa 2 las evalúe de verdad.
 *
 * ⚠️ Una voz **sin** fila de perfil es el caso normal, no un error: significa "todavía no está
 * configurada para LinkedIn". Al 2026-08-08, `30x` y `estadox` tienen CERO voces en total, así que
 * el caso de lista vacía es el que se ve primero.
 */
export async function leerVocesConPerfil(ctx: TenantContext): Promise<VozConPerfil[]> {
  const [voces, perfiles] = await Promise.all([leerVoces(ctx), leerPerfiles(ctx)]);
  const porVoz = new Map(perfiles.map((p) => [p.vozId, p]));
  return voces.map((v) => ({
    id: v.id,
    nombre: v.nombre,
    perfil: porVoz.get(v.id) ?? null,
  }));
}

async function leerPerfiles(ctx: TenantContext): Promise<PerfilVozLinkedin[]> {
  const { data, error } = await (await scoped(ctx)).select("app.voces_linkedin", COLUMNAS);
  if (error) {
    throw new Error(`Supabase respondió con error leyendo los perfiles de LinkedIn: ${error.message}`);
  }
  return z.array(filaPerfil).parse(data ?? []).map((p) => ({
    vozId: p.voz_id,
    perfil: p.perfil,
    firma: p.firma,
    espaciado: p.espaciado,
    separacionH: p.separacion_h,
    franjas: p.franjas,
    // Si la base trajera un día fuera del vocabulario sería alguien escribiendo por fuera de la app:
    // se filtra en vez de romper el render entero por una fila, igual que la `fuente` del banco.
    dias: p.dias === null ? null : p.dias.filter(esDia),
    lineasRojas: p.lineas_rojas,
  } satisfies PerfilVozLinkedin));
}

/**
 * Alta o edición del perfil, en una sola operación.
 *
 * Es `upsert` y no un `insert`/`update` según exista, porque **la pregunta "¿ya tiene perfil?" y la
 * escritura serían dos viajes** y entre uno y otro cabe otra persona guardando: el `insert` perdedor
 * moriría con `23505` sobre una fila que el usuario acaba de ver vacía. El `onConflict` nombra la PK
 * compuesta de la `020` §3 — y tiene que incluir `instance_id`, porque PostgREST exige que el
 * arbiter coincida con un unique existente y si no tira `42P10` (la advertencia de `scoped.ts`).
 *
 * Los dos arrays se normalizan **acá** y no en la pantalla, por lo mismo que `normalizarConsulta`:
 * si la normalización viviera solo en el cliente, cualquier otro camino de escritura metería
 * `"8:00"` y `"08:00"` como dos franjas distintas — la misma hora del día, dos filas para la cola.
 */
export async function guardarPerfilLinkedin(
  ctx: TenantContext,
  vozId: string,
  datos: DatosPerfilVoz,
): Promise<void> {
  const dias = normalizarDias(datos.dias);
  const { error } = await (await scoped(ctx)).upsert(
    "app.voces_linkedin",
    [
      {
        voz_id: vozId,
        perfil: datos.perfil,
        firma: datos.firma,
        espaciado: datos.espaciado,
        separacion_h: datos.separacionH,
        franjas: normalizarFranjas(datos.franjas),
        // `null` y `[]` significan cosas distintas y la columna es nullable justo por eso: null es
        // "no lo definimos", array vacío sería "ningún día", que no es un estado que nadie quiera.
        dias: dias.length > 0 ? dias : null,
        lineas_rojas: datos.lineasRojas,
        actualizado_en: new Date().toISOString(),
      },
    ],
    { onConflict: "instance_id,voz_id" },
  );
  if (error) throw errorDeEscritura(error);
}

/**
 * Saca la voz de LinkedIn: borra su perfil y la voz vuelve a "sin configurar".
 *
 * **No borra la voz de `app.voces`** — es de la empresa y puede estar corriendo en reels. Es la
 * asimetría deliberada de este archivo: acá se crea hacia arriba (una voz nueva) pero se borra solo
 * hacia abajo (su perfil).
 */
export async function borrarPerfilLinkedin(ctx: TenantContext, vozId: string): Promise<void> {
  const { data, error } = await (await scoped(ctx))
    .borrar("app.voces_linkedin")
    .eq("voz_id", vozId)
    .select("voz_id");
  if (error) throw errorDeEscritura(error);
  if (!data || data.length === 0) throw new Error("Esa voz ya no está configurada para LinkedIn.");
}

/**
 * Da de alta una voz de la EMPRESA desde el cockpit de LinkedIn.
 *
 * 🩸 **Existe porque 30X y EstadoX no tienen cockpit de reels** (medido: sus únicas instancias son
 * las de LinkedIn), así que esta pantalla es el único lugar del sistema desde donde puede nacer una
 * voz suya. Sin esto, "listo para empezar a configurar" era falso justo en las dos empresas cuyo
 * cockpit está activo, y el alta habría que pedirla por SQL.
 *
 * Reusa `crearVoz` en vez de escribir su propio insert, y le fija dos valores que **no** salen del
 * formulario:
 *
 *   · **`activo: false`, y esto es una guarda, no un default.** `app.voces` la comparten los dos
 *     pipelines: en Retia —la única empresa con los dos cockpits— una voz nacida activa entraría al
 *     plan del motor de **reels** sin que nadie lo pidiera. Que el interruptor de LinkedIn sea la
 *     existencia del perfil (ADR-067) es justamente lo que permite dejar este en `false` para
 *     siempre desde acá.
 *   · **`criterios_relevancia` explícito.** Es `not null` desde la `014` y es un concepto de reels
 *     (el gate de relevancia de ADR-040). Poner `''` sería el fallo mudo que ADR-040 describe —una
 *     voz que juzga con la mitad del contexto, en verde y sin avisar—, así que se escribe una frase
 *     que dice qué pasó. Inofensiva de todos modos: esos criterios solo se consultan cuando corren
 *     los proyectos de la voz en reels, y esta nace sin proyectos y apagada.
 */
export async function crearVozParaLinkedin(ctx: TenantContext, nombre: string): Promise<string> {
  return crearVoz(ctx, {
    nombre: nombre.trim(),
    descripcion: null,
    criterios_relevancia:
      "(Creada desde el cockpit de LinkedIn: no tiene criterios de relevancia de reels. Si alguna vez corre en reels, escribilos acá.)",
    activo: false,
  });
}

/**
 * Traduce los errores de Postgres que este formulario puede provocar de verdad.
 *
 * El `23514` es el error **esperable**: son los dos checks de la `020` §3 (`espaciado between 1 and
 * 3`, `separacion_h > 0`). No debería llegar nunca porque `validarPerfil` corre antes en los dos
 * lados, y si llega significa que el dominio y la base divergieron — el mensaje lo dice así para
 * que quien lo vea sepa que es un bug y no un dato mal escrito.
 */
function errorDeEscritura(error: { code?: string; message: string }): Error {
  if (error.code === "23503") {
    return new Error("Esa voz ya no existe. Recargá la página.");
  }
  if (error.code === "23514") {
    return new Error(
      "La base rechazó un valor (espaciado 1–3, separación mayor que 0). Si lo ves, es un bug: avisale a un dev.",
    );
  }
  return new Error(`Supabase respondió con error guardando el perfil de voz: ${error.message}`);
}

/** Reexport para que la pantalla no tenga que importar del dominio y del lib por separado. */
export type { Dia, PerfilVozLinkedin, VozConPerfil };
