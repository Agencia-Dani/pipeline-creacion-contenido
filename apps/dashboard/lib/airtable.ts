import { z } from "zod";

// Acceso a lo que TODAVÍA vive en Airtable. Solo server: el PAT jamás llega al browser. Este
// archivo se achica en cada corte de D5 (Ajustes, Referentes y ahora Voces/Proyectos ya salieron:
// los leen lib/ajustes.ts, lib/referentes.ts y lib/proyectos.ts desde Postgres) y muere entero en
// D8. Quién compone qué lee la fachada vive en lib/config.ts, no acá.
//
// Lo que queda son tres cosas que Airtable sigue siendo el lugar de, y las tres mueren en D7
// junto con las escrituras de n8n:
//  · `parchearRegistro` — `Referentes propuestos` la sigue ESCRIBIENDO el descubrimiento, así que
//    para cerrar el loop de ADR-020 desde la app hay que marcar la propuesta donde vive.
//  · `crearRegistro` — acuña el record id de un proyecto o una voz que nace en la app. Mientras el
//    motor escriba `Candidatos.proyecto` como link de Airtable, una fila sin record id no existe
//    para el resto del pipeline (ADR-033 §3).
//  · `leerCriteriosDestilados` — los 2 campos de `Proyectos` que escribe el archivado con Haiku.
//    Son de él, no del equipo: se leen de donde su único autor los deja (ADR-033).

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

/** El record id de la fila creada. Fail-closed: si Airtable no responde, no se crea nada. */
export async function crearRegistro(tabla: string, fields: Record<string, unknown>): Promise<string> {
  const { base, pat } = credenciales();
  const res = await fetch(`https://api.airtable.com/v0/${base}/${encodeURIComponent(tabla)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${pat}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields, typecast: true }),
  });
  if (!res.ok) throw new Error(`Airtable respondió ${res.status} creando en ${tabla}.`);
  const creado = registroAirtable.parse(await res.json());
  return creado.id;
}

export type Destilado = { criterios_aprendidos: string | null; advertencia_criterios: string | null };

/**
 * Lo que `Destilar criterios` del archivado escribe cada domingo con Haiku (ADR-022), por record
 * id de proyecto. **No es config del equipo: es salida de la máquina**, y su único escritor sigue
 * siendo el nodo de n8n hasta D7 — por eso se lee de Airtable aunque Proyectos ya sea de Postgres
 * (ADR-033: un dueño por dato, y estos dos datos tienen otro dueño).
 *
 * Fail-open a propósito: si Airtable no responde, la corrida sale con los criterios manuales en
 * vez de no salir. Lo aprendido mejora el gate; no es la condición para juzgar (NFR2 y el
 * principio §3.7 del plan — fail-closed en config, fail-open en entrega). El fail-closed del
 * contrato lo sostienen los campos que sí son config, que salen de Postgres.
 */
export async function leerCriteriosDestilados(): Promise<Map<string, Destilado>> {
  const texto = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
  try {
    const registros = await leerTabla("Proyectos", "");
    return new Map(
      registros.map((r) => [
        r.id,
        {
          criterios_aprendidos: texto(r.fields.criterios_aprendidos),
          advertencia_criterios: texto(r.fields.advertencia_criterios),
        },
      ]),
    );
  } catch (e) {
    console.error("[proyectos] no se pudieron leer los criterios destilados de Airtable:", e);
    return new Map();
  }
}
