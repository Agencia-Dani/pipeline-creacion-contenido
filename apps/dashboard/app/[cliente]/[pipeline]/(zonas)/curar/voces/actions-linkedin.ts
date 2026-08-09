"use server";

import { comoRuta, rutaDe, type CockpitEnRuta } from "@/domain/rutas";
import { revalidatePath } from "next/cache";
// `esValido` se reusa del otro módulo de LinkedIn en vez de duplicarse: es genérico ("¿la validación
// no encontró nada?") y ya estaba exportado ahí.
import { esValido } from "@/domain/linkedin";
import { validarPerfil, type FormPerfilVoz } from "@/domain/linkedin-voz";
import { exigirCockpitDePipeline } from "@/lib/auth";
import { registrarEvento } from "@/lib/eventos";
import {
  borrarPerfilLinkedin,
  crearVozParaLinkedin,
  guardarPerfilLinkedin,
  leerVocesConPerfil,
  type DatosPerfilVoz,
} from "@/lib/voces-linkedin";

export type Resultado = { ok: boolean; mensaje: string };

/**
 * 🔒 Misma guardia que la de `curar/referentes`, por la misma razón y desde el mismo lugar: la zona
 * `curar` existe en los dos pipelines, así que `exigirTenant` sola dejaría que un cockpit de reels
 * escribiera filas en `app.voces_linkedin` atribuidas a su instancia — válidas para la base e
 * invisibles para siempre. El porqué largo está en `exigirCockpitDePipeline` (`lib/auth.ts`).
 */
const exigirCockpitLinkedin = (enRuta: CockpitEnRuta) =>
  exigirCockpitDePipeline("curar", "linkedin", enRuta.cliente, enRuta.pipeline);

/**
 * Valida en el servidor con **la misma función del dominio** que corrió la pantalla.
 *
 * No es paranoia duplicada: la pantalla valida para no hacer viajar un formulario que ya sabemos
 * malo, y esto valida porque un POST a mano no tiene por qué respetar lo que el formulario ofrecía.
 * Una sola función para las dos, porque dos copias divergen y la que se relaja siempre es la del
 * servidor — la única que importa.
 */
function aDatos(form: FormPerfilVoz, exigirNombre: boolean):
  | { ok: true; datos: DatosPerfilVoz }
  | { ok: false; mensaje: string } {
  const errores = validarPerfil(form, { exigirNombre });
  if (!esValido(errores)) {
    return { ok: false, mensaje: Object.values(errores)[0] ?? "Revisá los datos." };
  }

  const perfil = form.perfil.trim();
  const lineasRojas = form.lineasRojas.trim();
  return {
    ok: true,
    datos: {
      perfil: perfil === "" ? null : perfil,
      firma: form.firma.trim(),
      espaciado: Number(form.espaciado),
      separacionH: Number(form.separacionH),
      // Sin normalizar acá a propósito: lo hace `guardarPerfilLinkedin`, que es el borde de
      // escritura. Si se normalizara en dos lugares, el día que uno cambie el otro queda viejo.
      franjas: form.franjas,
      dias: form.dias,
      lineasRojas: lineasRojas === "" ? null : lineasRojas,
    },
  };
}

/**
 * Configura para LinkedIn una voz **que ya existe** en la empresa.
 *
 * El `vozId` se comprueba contra las voces reales y no contra el formulario: un id inventado sería
 * un `23503` de la FK, que es el modo de falla correcto pero un mensaje feo. Comprobarlo antes deja
 * decir *"esa voz ya no existe, recargá"*, que es lo que de verdad pasó si alguien la borró mientras
 * la pantalla estaba abierta.
 */
export async function guardarPerfilVozLinkedin(
  enRuta: CockpitEnRuta,
  vozId: string,
  form: FormPerfilVoz,
): Promise<Resultado> {
  const sesion = await exigirCockpitLinkedin(enRuta);
  if (!sesion.ok) return sesion;
  const { usuario, ctx, cockpit } = sesion;

  const datos = aDatos(form, false);
  if (!datos.ok) return datos;

  const voces = await leerVocesConPerfil(ctx);
  const voz = voces.find((v) => v.id === vozId);
  if (!voz) return { ok: false, mensaje: "Esa voz ya no existe. Recargá la página." };
  const eraNueva = voz.perfil === null;

  try {
    await guardarPerfilLinkedin(ctx, vozId, datos.datos);
    // El evento distingue alta de edición porque el `upsert` no: los dos casos escriben igual, y
    // saber cuál fue es lo que hace legible el log el día que alguien pregunte desde cuándo una voz
    // está configurada.
    await registrarEvento(ctx, usuario.id, eraNueva ? "voces_linkedin.configurar" : "voces_linkedin.editar", {
      voz_id: vozId,
      nombre: voz.nombre,
    });
  } catch (e) {
    console.error("[voces-linkedin] falló guardar el perfil:", e);
    return { ok: false, mensaje: e instanceof Error ? e.message : "No se pudo guardar." };
  }

  revalidatePath(rutaDe(comoRuta(cockpit), "curar/voces"));
  return {
    ok: true,
    mensaje: eraNueva ? `${voz.nombre} ya está configurada para LinkedIn.` : "Guardado.",
  };
}

/**
 * Da de alta una voz nueva de la empresa **y** la configura para LinkedIn, en un solo gesto.
 *
 * 🩸 Existe porque 30X y EstadoX no tienen cockpit de reels, así que esta es la única pantalla del
 * sistema desde donde puede nacer una voz suya (ADR-067 §3). La voz nace **apagada para reels**
 * (`activo: false`, lo fija `crearVozParaLinkedin`), así que en Retia —la única empresa con los dos
 * cockpits— no entra al plan del motor de reels sin que nadie lo haya pedido.
 *
 * ⚠️ **Los dos pasos no son atómicos**, y la elección está tomada: si el perfil falla después de que
 * la voz se creó, queda una voz sin perfil — que es un estado **legítimo y visible** ("sin
 * configurar", el bloque de abajo de la pantalla), no basura. Envolverlo en una transacción pedía
 * una función de Postgres para algo cuyo peor caso es que alguien vuelva a apretar Guardar.
 */
export async function crearVozLinkedin(
  enRuta: CockpitEnRuta,
  form: FormPerfilVoz,
): Promise<Resultado> {
  const sesion = await exigirCockpitLinkedin(enRuta);
  if (!sesion.ok) return sesion;
  const { usuario, ctx, cockpit } = sesion;

  const datos = aDatos(form, true);
  if (!datos.ok) return datos;

  const nombre = form.nombre.trim();
  const voces = await leerVocesConPerfil(ctx);
  // El nombre no es unique en la base (dos personas pueden llamarse igual y es problema de nadie),
  // pero dos voces con el mismo nombre en la misma empresa son indistinguibles en TODA pantalla —
  // incluida la de reels. Se rechaza acá, que es donde se puede explicar.
  if (voces.some((v) => v.nombre.trim().toLowerCase() === nombre.toLowerCase())) {
    return { ok: false, mensaje: `Ya hay una voz llamada "${nombre}" en esta empresa.` };
  }

  let vozId: string;
  try {
    vozId = await crearVozParaLinkedin(ctx, nombre);
  } catch (e) {
    console.error("[voces-linkedin] falló crear la voz:", e);
    return { ok: false, mensaje: e instanceof Error ? e.message : "No se pudo crear la voz." };
  }

  try {
    await guardarPerfilLinkedin(ctx, vozId, datos.datos);
    await registrarEvento(ctx, usuario.id, "voces_linkedin.crear", { voz_id: vozId, nombre });
  } catch (e) {
    console.error("[voces-linkedin] la voz se creó pero el perfil falló:", e);
    return {
      ok: false,
      // Explícito sobre el estado a medias, porque la pantalla va a mostrar la voz igual: mentir
      // acá haría que la siguiente recarga se lea como un bug.
      mensaje: `Se creó "${nombre}" pero no se pudo guardar su perfil. Aparece abajo, en sin configurar: entrá y guardalo.`,
    };
  }

  revalidatePath(rutaDe(comoRuta(cockpit), "curar/voces"));
  return { ok: true, mensaje: `${nombre} ya está configurada para LinkedIn.` };
}

/**
 * Saca la voz de LinkedIn. **No borra la voz de la empresa** — es de `app.voces` y puede estar
 * corriendo en reels; lo único que se borra es su perfil.
 */
export async function quitarDeLinkedin(enRuta: CockpitEnRuta, vozId: string): Promise<Resultado> {
  const sesion = await exigirCockpitLinkedin(enRuta);
  if (!sesion.ok) return sesion;
  const { usuario, ctx, cockpit } = sesion;

  try {
    await borrarPerfilLinkedin(ctx, vozId);
    await registrarEvento(ctx, usuario.id, "voces_linkedin.quitar", { voz_id: vozId });
  } catch (e) {
    console.error("[voces-linkedin] falló quitar el perfil:", e);
    return { ok: false, mensaje: e instanceof Error ? e.message : "No se pudo quitar." };
  }

  revalidatePath(rutaDe(comoRuta(cockpit), "curar/voces"));
  return {
    ok: true,
    mensaje: "Sacada de LinkedIn. La voz sigue existiendo en la empresa, sin configurar.",
  };
}
