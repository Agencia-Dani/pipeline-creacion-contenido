import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

// La bandeja del descubrimiento (ADR-020). Desde D7 vive en Postgres: la escribe el buscador de
// cuentas por PostgREST (ADR-035) y la resuelve la app.
//
// 🔑 Por qué el estado terminal es `promovido` y no `aprobado`: mientras el banco vivía en Airtable,
// marcar `aprobado` disparaba `Preparar promoción` → `POST Referentes (promoción)`, que sembraba la
// cuenta en una tabla que ya no leía nadie. Saltear ese estado fue lo que dejó cerrar el loop desde
// la app sin re-importar n8n (corte 2/4). **En D7 esa cadena de 4 nodos se borró**, así que la
// trampa ya no existe — pero el vocabulario se queda: `promovido` significa "está en el banco", que
// es más preciso que "alguien dijo que sí".
//
// ⚠️ Una propuesta tiene N proyectos, no uno (enmienda de ADR-032, medida en D7: las 8 vivas tenían
// 2 cada una). Hereda los proyectos del referente-semilla que la trajo, y los referentes son N:M
// desde ADR-032 — modelarla 1:1 contradecía a su propia fuente.

const filaPropuesta = z.object({
  id: z.string(),
  handle: z.string(),
  plataforma: z.string().nullable(),
  url: z.string().nullable(),
  afinidad: z.coerce.number().nullable(),
  razon: z.string().nullable(),
  bio: z.string().nullable(),
  seguidores: z.coerce.number().nullable(),
  semillas: z.string().nullable(),
  referentes_propuestos_proyectos: z.array(z.object({ proyecto_id: z.string() })),
});

export type Sugerido = {
  id: string;
  handle: string;
  plataforma: string;
  url: string | null;
  afinidad: number | null;
  razon: string | null;
  bio: string | null;
  seguidores: number | null;
  semillas: string | null;
  /** uuids de `app.proyectos`: la pantalla ya no traduce record ids (murió con D7). */
  proyectoIds: string[];
};

const COLUMNAS =
  "id, handle, plataforma, url, afinidad, razon, bio, seguidores, semillas, " +
  "referentes_propuestos_proyectos(proyecto_id)";

/** Solo las pendientes: la bandeja muestra lo que hay que decidir, no el archivo. */
export async function leerPendientes(): Promise<Sugerido[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("app")
    .from("referentes_propuestos")
    .select(COLUMNAS)
    .eq("estado", "propuesto");
  if (error) throw new Error(`Supabase respondió con error leyendo las propuestas: ${error.message}`);

  return z.array(filaPropuesta).parse(data)
    .map((r) => ({
      id: r.id,
      handle: r.handle,
      plataforma: r.plataforma ?? "instagram",
      url: r.url,
      afinidad: r.afinidad,
      razon: r.razon,
      bio: r.bio,
      seguidores: r.seguidores,
      semillas: r.semillas,
      proyectoIds: r.referentes_propuestos_proyectos.map((p) => p.proyecto_id),
    } satisfies Sugerido))
    .sort((a, b) => (b.afinidad ?? 0) - (a.afinidad ?? 0));
}

export async function marcarResuelto(id: string, estado: "promovido" | "descartado"): Promise<void> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("app")
    .from("referentes_propuestos")
    .update({ estado })
    .eq("id", id)
    .select("id");
  if (error) throw new Error(`Supabase respondió con error cerrando la propuesta: ${error.message}`);
  if (!data || data.length === 0) throw new Error("Esa propuesta ya no existe.");
}

/** La nota con la que nace un referente promovido: la misma que escribía `Preparar promoción`. */
export function notaDePromocion(sugerido: { afinidad: number | null; razon: string | null }, hoy: Date): string {
  const fecha = hoy.toISOString().slice(0, 10);
  const afinidad = sugerido.afinidad != null ? ` (afinidad ${sugerido.afinidad})` : "";
  const razon = sugerido.razon ? `: ${sugerido.razon.slice(0, 300)}` : "";
  return `Promovido por descubrimiento ${fecha}${afinidad}${razon}`;
}
