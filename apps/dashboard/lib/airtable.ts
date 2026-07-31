import { z } from "zod";

// Acceso a lo que TODAVÍA vive en Airtable. Solo server: el PAT jamás llega al browser. Este
// archivo se achica en cada corte de D5 (Ajustes y Referentes ya salieron: los leen
// lib/ajustes.ts y lib/referentes.ts desde Postgres) y muere entero en D8. Quién compone qué
// lee la fachada vive en lib/config.ts, no acá.
//
// Es casi todo lectura salvo `parchearRegistro`, que existe por una sola razón: `Referentes
// propuestos` la sigue ESCRIBIENDO el descubrimiento en n8n (su corte es D7), así que para
// cerrar el loop de ADR-020 desde la app hay que poder marcar una propuesta como resuelta
// donde vive. Muere en D7 con el resto de las escrituras.

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
  const { base, pat } = credenciales();
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

function credenciales(): { base: string; pat: string } {
  const base = process.env.AIRTABLE_BASE_ID;
  const pat = process.env.AIRTABLE_PAT;
  if (!base || !pat) throw new Error("Faltan AIRTABLE_BASE_ID / AIRTABLE_PAT (gestor).");
  return { base, pat };
}

export async function parchearRegistro(
  tabla: string,
  id: string,
  fields: Record<string, unknown>,
): Promise<void> {
  const { base, pat } = credenciales();
  const res = await fetch(`https://api.airtable.com/v0/${base}/${encodeURIComponent(tabla)}/${id}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${pat}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(`Airtable respondió ${res.status} actualizando ${tabla}/${id}.`);
}

// Las 2 lecturas de config que todavía salen de Airtable, con los MISMOS filtros que los
// nodos que reemplazaron: solo activos cuando el ámbito es el motor (contrato §Cómo lo usa
// el motor — un checkbox destildado ni siquiera viene).
// (`Referentes` salió acá en el corte 2/4: lo sirve lib/referentes.ts desde Postgres.)
export async function leerConfigAirtable(ambito: "motor" | "completo" = "motor") {
  const filtro = ambito === "motor" ? "{activo}" : "";
  const [voces, proyectos] = await Promise.all([
    leerTabla("Voces", filtro),
    leerTabla("Proyectos", filtro),
  ]);
  return { voces, proyectos };
}
