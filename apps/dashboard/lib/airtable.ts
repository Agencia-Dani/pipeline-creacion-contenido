import { z } from "zod";
import type { Proyecto, Voz } from "@/domain/corrida";

// Lectura read-only de la config que TODAVÍA vive en Airtable (D1: sin migrar un
// solo dato, plan-cockpit §6). Solo server: el PAT jamás llega al browser.
// Este archivo muere en D5, cuando la config viva en Postgres.

const registroAirtable = z.object({
  id: z.string(),
  fields: z.record(z.string(), z.unknown()),
});
const respuestaAirtable = z.object({
  records: z.array(registroAirtable),
  offset: z.string().optional(),
});

type Registro = z.infer<typeof registroAirtable>;

async function leerTabla(tabla: string, filtro: string): Promise<Registro[]> {
  const base = process.env.AIRTABLE_BASE_ID;
  const pat = process.env.AIRTABLE_PAT;
  if (!base || !pat) throw new Error("Faltan AIRTABLE_BASE_ID / AIRTABLE_PAT (gestor).");

  const registros: Registro[] = [];
  let offset: string | undefined;
  do {
    const url = new URL(`https://api.airtable.com/v0/${base}/${encodeURIComponent(tabla)}`);
    url.searchParams.set("filterByFormula", filtro);
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

const texto = (v: unknown): string => (typeof v === "string" ? v : "");

// Mismos filtros server-side que usa el motor (`filterByFormula={activo}`,
// contrato §Cómo lo usa el motor): un checkbox destildado ni siquiera viene.
export async function leerConfigOperar(): Promise<{
  voces: Voz[];
  proyectos: Proyecto[];
  defaultN: number;
}> {
  const [vocesRaw, proyectosRaw, ajusteRaw] = await Promise.all([
    leerTabla("Voces", "{activo}"),
    leerTabla("Proyectos", "{activo}"),
    leerTabla("Ajustes", "{clave}='Candidatos por corrida'"),
  ]);

  const voces = vocesRaw.map((r) => ({ id: r.id, nombre: texto(r.fields.nombre) }));

  const proyectos = proyectosRaw.map((r) => {
    const n = r.fields.N;
    const vozLink = r.fields.voz_default;
    return {
      id: r.id,
      nombre: texto(r.fields.nombre),
      n: typeof n === "number" ? n : null,
      // El motor lee voz_default[0]; si hay más de una, la segunda se ignora (contrato §2).
      vozId:
        Array.isArray(vozLink) && typeof vozLink[0] === "string" ? vozLink[0] : null,
    };
  });

  // Fail-open como el motor (ADR-011): sin fila o valor vacío → default del AJUSTE_MAP.
  const valor = ajusteRaw[0]?.fields.valor;
  const defaultN = typeof valor === "number" && valor > 0 ? valor : 100;

  return { voces, proyectos, defaultN };
}
