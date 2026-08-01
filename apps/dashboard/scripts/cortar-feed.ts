// Corte de D7: la carga de datos del feed, Airtable → Postgres, POR ÚLTIMA VEZ.
// Se corre UNA vez, entre la migración `013` y el re-import de los 3 workflows:
//
//   cd apps/dashboard && npm run cortar:feed          ← carga y verifica
//   cd apps/dashboard && npm run cortar:feed -- --dry ← solo verifica, no escribe
//
// Arrastra las 3 tablas que escribía n8n: `Candidatos`, `Descartes del gate` y
// `Referentes propuestos`. Después de esto, quien las escribe es el motor/el buscador por
// PostgREST (ADR-035) y Airtable no participa más.
//
// Es autocontenido a propósito: `scripts/comun.ts` y `domain/sombra.ts` se borran en este mismo
// cambio (con Postgres de dueño, un `sombra:import` posterior pisaría en silencio lo que el equipo
// calificó). O sea que este archivo es el último lugar del repo que sabe leer Airtable, y muere
// como registro reproducible del corte, igual que las migraciones.
//
// Necesita en .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE, AIRTABLE_PAT,
// AIRTABLE_BASE_ID.

import { createClient } from "@supabase/supabase-js";

type RegistroAirtable = { id: string; fields: Record<string, unknown> };

const seco = process.argv.includes("--dry");

function env(nombre: string): string {
  const valor = process.env[nombre];
  if (!valor) {
    console.error(`Falta la env var ${nombre} (gestor → .env.local; corré con node --env-file=.env.local).`);
    process.exit(1);
  }
  return valor;
}

const db = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function leerAirtable(tabla: string): Promise<RegistroAirtable[]> {
  const registros: RegistroAirtable[] = [];
  let offset: string | undefined;
  do {
    const url = new URL(`https://api.airtable.com/v0/${env("AIRTABLE_BASE_ID")}/${encodeURIComponent(tabla)}`);
    if (offset) url.searchParams.set("offset", offset);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${env("AIRTABLE_PAT")}` } });
    if (!res.ok) throw new Error(`Airtable respondió ${res.status} leyendo ${tabla}.`);
    const pagina = (await res.json()) as { records: RegistroAirtable[]; offset?: string };
    // Las filas fantasma son las que genera la grilla de Airtable al hacer scroll: sin un solo
    // campo cargado. Arrastrarlas dejaría basura con `titulo = '(sin título)'` en el feed.
    registros.push(...pagina.records.filter((r) => Object.keys(r.fields).length > 0));
    offset = pagina.offset;
  } while (offset);
  return registros;
}

const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
const numero = (v: unknown): number | null => (typeof v === "number" ? v : null);
const links = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const link = (v: unknown): string | null => links(v)[0] ?? null;

// uuid ↔ record id de las tablas padre, para resolver las FK.
async function mapaDePadre(tabla: "voces" | "proyectos"): Promise<Map<string, string>> {
  const { data, error } = await db.schema("app").from(tabla).select("id, airtable_id");
  if (error) throw new Error(`Leyendo app.${tabla}: ${error.message}`);
  return new Map((data ?? []).filter((f) => f.airtable_id).map((f) => [f.airtable_id as string, f.id as string]));
}

const [voces, proyectos] = await Promise.all([mapaDePadre("voces"), mapaDePadre("proyectos")]);

// ── 1. Candidatos ────────────────────────────────────────────────────────────
const candidatos = await leerAirtable("Candidatos");

// ⚠️ `thumbnail_url` se arrastra VACÍO a propósito. En Airtable son adjuntos re-hosteados cuya URL
// vence a las ~2 h: copiarla guardaría un link muerto que la tarjeta intentaría cargar igual. Con
// null la tarjeta muestra su placeholder, que es honesto. La próxima corrida escribe las URLs
// frescas del CDN (y ahí se mide cuánto viven de verdad — es el hallazgo 2 de D7).
const filasCandidatos = candidatos.map((r) => ({
  airtable_id: r.id,
  titulo: texto(r.fields.titulo) ?? "(sin título)",
  script: texto(r.fields.script),
  idioma: texto(r.fields.idioma),
  thumbnail_url: null,
  proyecto_id: proyectos.get(link(r.fields.proyecto) ?? "") ?? null,
  voz_id: voces.get(link(r.fields.voz) ?? "") ?? null,
  referente: texto(r.fields.referente),
  url_referente: texto(r.fields.url_referente),
  views: numero(r.fields.views),
  likes: numero(r.fields.likes),
  seguidores: numero(r.fields.seguidores),
  engagement: numero(r.fields.engagement),
  heat_score: numero(r.fields.heat_score),
  relevancia_score: numero(r.fields.relevancia_score),
  relevancia_razon: texto(r.fields.relevancia_razon),
  viral_por_tamano: r.fields.viral_por_tamano === true,
  calificacion: texto(r.fields.calificacion),
  estado: texto(r.fields.estado) ?? "nuevo",
  fecha_calificacion: texto(r.fields.fecha_calificacion),
  notas_equipo: texto(r.fields.notas_equipo),
  // El que el schema 009 se había olvidado: es la 3ª línea de defensa del dedup (ADR-029).
  external_id: texto(r.fields.external_id),
}));

const sinExternalId = filasCandidatos.filter((f) => !f.external_id).length;
const sinProyecto = filasCandidatos.filter((f) => !f.proyecto_id).length;
console.log(
  `Candidatos: ${filasCandidatos.length}` +
    ` · sin external_id: ${sinExternalId}` +
    ` · sin proyecto resoluble: ${sinProyecto}` +
    ` · calificados: ${filasCandidatos.filter((f) => f.estado !== "nuevo").length}`,
);

// ── 2. Descartes ─────────────────────────────────────────────────────────────
const descartes = await leerAirtable("Descartes del gate");
const filasDescartes = descartes.map((r) => ({
  airtable_id: r.id,
  titulo: texto(r.fields.titulo) ?? "(sin título)",
  script: texto(r.fields.script),
  referente: texto(r.fields.referente),
  url_referente: texto(r.fields.url_referente),
  proyecto_id: proyectos.get(link(r.fields.proyecto) ?? "") ?? null,
  relevancia_score: numero(r.fields.relevancia_score),
  relevancia_razon: texto(r.fields.relevancia_razon),
  thumbnail_url: null,
  veredicto: texto(r.fields.veredicto),
}));
console.log(
  `Descartes: ${filasDescartes.length}` +
    ` · ya auditados: ${filasDescartes.filter((f) => f.veredicto).length}` +
    ` (de acá en más NO se barren: ADR-036)`,
);

// ── 3. Referentes propuestos (N:M — enmienda de ADR-032) ─────────────────────
const propuestos = await leerAirtable("Referentes propuestos");
const filasPropuestos = propuestos.map((r) => ({
  airtable_id: r.id,
  handle: texto(r.fields.handle) ?? "",
  plataforma: texto(r.fields.plataforma) ?? "instagram",
  afinidad: numero(r.fields.afinidad),
  razon: texto(r.fields.razon),
  seguidores: numero(r.fields.seguidores),
  bio: texto(r.fields.bio),
  url: texto(r.fields.url),
  semillas: texto(r.fields.semillas),
  estado: texto(r.fields.estado) ?? "propuesto",
}));

// La evidencia del hallazgo 6: si esto no se arrastra como N:M, cada propuesta pierde la mitad
// de sus proyectos (medido antes del corte: las 8 vivas tenían 2 cada una).
const paresPorPropuesta = new Map(propuestos.map((r) => [r.id, links(r.fields.proyecto)]));
const totalPares = [...paresPorPropuesta.values()].reduce((a, p) => a + p.length, 0);
console.log(
  `Propuestas: ${filasPropuestos.length} · ${totalPares} pares (propuesta, proyecto)` +
    ` · con más de 1 proyecto: ${[...paresPorPropuesta.values()].filter((p) => p.length > 1).length}`,
);

// ── 4. Escritura ─────────────────────────────────────────────────────────────
if (seco) {
  console.log("\n--dry: no se escribió nada.");
  process.exit(0);
}

async function cargar(tabla: string, filas: Record<string, unknown>[]) {
  if (filas.length === 0) return;
  const { error } = await db.schema("app").from(tabla).upsert(filas, { onConflict: "airtable_id" });
  if (error) throw new Error(`upsert de app.${tabla}: ${error.message}`);
  console.log(`✓ app.${tabla}: ${filas.length} filas`);
}

await cargar("candidatos", filasCandidatos);
await cargar("descartes", filasDescartes);
await cargar("referentes_propuestos", filasPropuestos);

// La puente se reconstruye entera desde los pares reales de Airtable.
const { data: enPg, error: errorLectura } = await db
  .schema("app")
  .from("referentes_propuestos")
  .select("id, airtable_id")
  .not("airtable_id", "is", null);
if (errorLectura) throw new Error(`Leyendo app.referentes_propuestos: ${errorLectura.message}`);

const uuidPorAirtable = new Map((enPg ?? []).map((f) => [f.airtable_id as string, f.id as string]));
const puente: { propuesto_id: string; proyecto_id: string }[] = [];
for (const [airtableId, proyectosDeLaPropuesta] of paresPorPropuesta) {
  const propuestoId = uuidPorAirtable.get(airtableId);
  if (!propuestoId) continue;
  for (const p of proyectosDeLaPropuesta) {
    const proyectoId = proyectos.get(p);
    if (proyectoId) puente.push({ propuesto_id: propuestoId, proyecto_id: proyectoId });
  }
}

const { error: errorPuente } = await db
  .schema("app")
  .from("referentes_propuestos_proyectos")
  .upsert(puente, { onConflict: "propuesto_id,proyecto_id" });
if (errorPuente) throw new Error(`upsert de la puente: ${errorPuente.message}`);
console.log(`✓ app.referentes_propuestos_proyectos: ${puente.length} pares`);

if (puente.length !== totalPares) {
  console.warn(
    `\n⚠️ Se esperaban ${totalPares} pares y entraron ${puente.length}.` +
      ` La diferencia son propuestas que apuntan a un proyecto que no existe en Postgres.`,
  );
}

console.log("\nListo. Ahora sí: re-importar los 3 workflows.");
