import { z } from "zod";
import { esVeredicto, ordenarDescartes, type DescarteFeed, type Veredicto } from "@/domain/feed";
import type { TenantContext } from "@/domain/tenant";
import { scoped } from "@/lib/supabase/scoped";

// Los descartes del gate (ADR-021): los top-K rechazos por score de cada corrida, o sea los
// near-miss. El equipo dice si la máquina hizo bien en matarlos, y los "era bueno" son los
// **falsos negativos** — la única medida de recall que tiene el sistema.
//
// 🚨 Por qué esta pantalla es la mitad más valiosa de D6: `veredicto` estuvo en 0 auditorías desde
// que la tabla existe. No era una decisión de diseño — Airtable no dejaba configurar el permiso de
// un campo sin records en la página (mapa-campos §5.1-1), así que el equipo nunca pudo marcarlo.
// Mientras esté en 0, `falsos_negativos` da 0 y "0 falsos negativos" se lee como *el gate está
// perfecto*: la conclusión opuesta a la verdad.
//
// ✅ Lo que cambió en D7 (ADR-036): **la tabla ya no se borra los domingos.** El barrido existía
// por la cuota de 1.000 records de Airtable, no por diseño; en Postgres no hay razón. Con eso la
// auditoría deja de ser una ventana de una semana —donde un descarte sin marcar era una auditoría
// perdida para siempre— y pasa a ser una cola honesta. `falsos_negativos` se computa como vista
// (`app.v_auditoria_descartes`) sobre esta tabla viva, no como un snapshot semanal.
// La pantalla igual va encadenada al final del feed: ahí el operador ya está calibrado.

const filaDescarte = z.object({
  id: z.string(),
  titulo: z.string(),
  script: z.string().nullable(),
  thumbnail_url: z.string().nullable(),
  referente: z.string().nullable(),
  url_referente: z.string().nullable(),
  relevancia_score: z.coerce.number().nullable(),
  relevancia_razon: z.string().nullable(),
  veredicto: z.string().nullable(),
  proyectos: z.object({ nombre: z.string() }).nullable(),
});

const COLUMNAS =
  "id, titulo, script, thumbnail_url, referente, url_referente, relevancia_score, " +
  "relevancia_razon, veredicto, proyectos(nombre)";

export async function leerDescartes(ctx: TenantContext): Promise<DescarteFeed[]> {
  const { data, error } = await (await scoped(ctx)).select("app.descartes", COLUMNAS);
  if (error) throw new Error(`Supabase respondió con error leyendo los descartes: ${error.message}`);

  return ordenarDescartes(
    z.array(filaDescarte).parse(data).map((r) => ({
      id: r.id,
      titulo: r.titulo,
      script: r.script,
      thumbnail: r.thumbnail_url,
      proyecto: r.proyectos?.nombre ?? "",
      referente: r.referente,
      urlReferente: r.url_referente,
      relevanciaScore: r.relevancia_score,
      relevanciaRazon: r.relevancia_razon,
      veredicto: esVeredicto(r.veredicto) ? r.veredicto : null,
    } satisfies DescarteFeed)),
  );
}

export async function marcarVeredicto(
  ctx: TenantContext,
  id: string,
  veredicto: Veredicto,
): Promise<void> {
  const { data, error } = await (await scoped(ctx))
    .update("app.descartes", { veredicto })
    .eq("id", id)
    .select("id");
  if (error) throw new Error(`Supabase respondió con error guardando el veredicto: ${error.message}`);
  if (!data || data.length === 0) throw new Error("Ese descarte ya no existe.");
}
