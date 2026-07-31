import { z } from "zod";

// Lectura read-only de la config que TODAVÍA vive en Airtable. Solo server: el PAT jamás
// llega al browser. Este archivo se achica en cada corte de D5 (Ajustes ya salió: lo lee
// lib/ajustes.ts desde Postgres) y muere entero en D8. Quién compone qué lee la fachada
// vive en lib/config.ts, no acá.

const registroAirtable = z.object({
  id: z.string(),
  fields: z.record(z.string(), z.unknown()),
});
const respuestaAirtable = z.object({
  records: z.array(registroAirtable),
  offset: z.string().optional(),
});

export type RegistroAirtable = z.infer<typeof registroAirtable>;
type Registro = RegistroAirtable;

export async function leerTabla(tabla: string, filtro: string): Promise<Registro[]> {
  const base = process.env.AIRTABLE_BASE_ID;
  const pat = process.env.AIRTABLE_PAT;
  if (!base || !pat) throw new Error("Faltan AIRTABLE_BASE_ID / AIRTABLE_PAT (gestor).");

  const registros: Registro[] = [];
  let offset: string | undefined;
  do {
    const url = new URL(`https://api.airtable.com/v0/${base}/${encodeURIComponent(tabla)}`);
    if (filtro) url.searchParams.set("filterByFormula", filtro);
    if (offset) url.searchParams.set("offset", offset);
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${pat}` },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Airtable respondió ${res.status} leyendo ${tabla}.`);
    const pagina = respuestaAirtable.parse(await res.json());
    registros.push(...pagina.records);
    offset = pagina.offset;
  } while (offset);
  return registros;
}

// Las 3 lecturas de config que todavía salen de Airtable, con los MISMOS filtros que los
// nodos que reemplazaron: solo activos cuando el ámbito es el motor (contrato §Cómo lo usa
// el motor — un checkbox destildado ni siquiera viene).
export async function leerConfigAirtable(ambito: "motor" | "completo" = "motor") {
  const filtro = ambito === "motor" ? "{activo}" : "";
  const [voces, proyectos, referentes] = await Promise.all([
    leerTabla("Voces", filtro),
    leerTabla("Proyectos", filtro),
    leerTabla("Referentes", filtro),
  ]);
  return { voces, proyectos, referentes };
}
