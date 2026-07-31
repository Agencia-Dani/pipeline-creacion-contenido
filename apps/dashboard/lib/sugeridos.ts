import { leerTabla, parchearRegistro } from "@/lib/airtable";

// La bandeja del descubrimiento (ADR-020). Vive TODAVÍA en Airtable porque quien la escribe es
// el workflow de descubrimiento, y las escrituras de n8n cortan recién en D7.
//
// 🔑 La decisión que cierra el loop sin tocar n8n: cuando el equipo aprueba desde la app, la
// propuesta pasa directo a `promovido` — nunca a `aprobado`. `Preparar promoción` del
// descubrimiento filtra exactamente por `aprobado` para sembrar el referente en la tabla
// `Referentes` de Airtable, que desde este corte ya no la lee nadie; saltear ese estado es lo
// que evita que un referente aprobado nazca invisible. El nodo queda sin trabajo que hacer y
// muere en D7 junto con el resto.
//
// ⚠️ Corolario para el equipo: aprobar desde la página de Airtable (si alguien la abre) SÍ
// dispara el camino viejo y siembra en el lugar equivocado. Por eso el paso manual del corte
// es dejar esa página en solo-lectura.

export const TABLA = "Referentes propuestos";

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
  proyectosAirtable: string[];
};

const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
const numero = (v: unknown): number | null => (typeof v === "number" ? v : null);

/** Solo las pendientes: la bandeja muestra lo que hay que decidir, no el archivo. */
export async function leerPendientes(): Promise<Sugerido[]> {
  const registros = await leerTabla(TABLA, "{estado} = 'propuesto'");
  return registros
    .map((r) => ({
      id: r.id,
      handle: texto(r.fields.handle) ?? "",
      plataforma: texto(r.fields.plataforma) ?? "instagram",
      url: texto(r.fields.url),
      afinidad: numero(r.fields.afinidad),
      razon: texto(r.fields.razon),
      bio: texto(r.fields.bio),
      seguidores: numero(r.fields.seguidores),
      semillas: texto(r.fields.semillas),
      proyectosAirtable: Array.isArray(r.fields.proyecto)
        ? r.fields.proyecto.filter((p): p is string => typeof p === "string")
        : [],
    }))
    .sort((a, b) => (b.afinidad ?? 0) - (a.afinidad ?? 0));
}

export async function marcarResuelto(id: string, estado: "promovido" | "descartado"): Promise<void> {
  await parchearRegistro(TABLA, id, { estado });
}

/** La nota con la que nace un referente promovido: la misma que escribía `Preparar promoción`. */
export function notaDePromocion(sugerido: { afinidad: number | null; razon: string | null }, hoy: Date): string {
  const fecha = hoy.toISOString().slice(0, 10);
  const afinidad = sugerido.afinidad != null ? ` (afinidad ${sugerido.afinidad})` : "";
  const razon = sugerido.razon ? `: ${sugerido.razon.slice(0, 300)}` : "";
  return `Promovido por descubrimiento ${fecha}${afinidad}${razon}`;
}
