// Corte 3/4 de D5: la carga de datos de Voces y Proyectos, Airtable → Postgres (ADR-027 §5).
// Se corre UNA vez, justo antes del flip de lib/config.ts:
//
//   cd apps/dashboard && npm run cortar:voces-proyectos          ← sincroniza y verifica
//   cd apps/dashboard && npm run cortar:voces-proyectos -- --dry ← solo verifica, no escribe
//
// A diferencia del corte 2/4 no hay migración nueva: el schema `009` ya modela estos dos
// dominios bien (medido contra el dato vivo antes de escribir una línea — los 6 proyectos
// tienen exactamente 1 voz y los 6 tienen criterios, o sea las dos constraints aguantan). El
// espejo de D3 ya los tenía cargados; esto lo re-sincroniza para que el A/B mida el estado real
// del momento del flip y no el de la última corrida del import.
//
// Por qué no lo hace `sombra:import`: las dos tablas salen del catálogo de sombra en este mismo
// cambio (procedimiento del corte 1/4 — con Postgres de dueño, un import posterior pisaría en
// silencio lo que el equipo edite en la app).
//
// Qué verifica, que es lo que importa:
//   1. que las dos constraints que Airtable no podía hacer cumplir se cumplen en el dato vivo
//   2. que la fachada va a servir REGISTRO POR REGISTRO lo mismo que servía leyendo Airtable,
//      en los dos ámbitos, usando `aRegistrosDe*` — las mismas funciones que usa la app, así
//      que compara mundos y no dos escrituras de la misma idea.
//
// Necesita en .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE, AIRTABLE_PAT,
// AIRTABLE_BASE_ID (los mismos del gestor que usa el modo sombra).

import { aRegistrosDeProyectos, aRegistrosDeVoces } from "../domain/proyectos.ts";
import { mapearProyecto, mapearVoz } from "../domain/sombra.ts";
import { leerTablaAirtable, supabase } from "./comun.ts";

const seco = process.argv.includes("--dry");
const db = supabase();

const vocesAirtable = await leerTablaAirtable("Voces");
const proyectosAirtable = await leerTablaAirtable("Proyectos");
console.log(`Airtable: ${vocesAirtable.length} voces · ${proyectosAirtable.length} proyectos`);

// ── 1. Sincronizar (los `mapear*` fallan loud si una constraint no se cumple) ──

if (!seco) {
  const filasVoz = vocesAirtable.map(mapearVoz);
  const { error } = await db.schema("app").from("voces").upsert(filasVoz, { onConflict: "airtable_id" });
  if (error) throw new Error(`upsert de app.voces: ${error.message}`);
  console.log(`✓ app.voces: ${filasVoz.length} filas`);

  // uuid de cada voz, para resolver la FK de los proyectos.
  const { data: vocesPg, error: errorVoces } = await db.schema("app").from("voces").select("id, airtable_id");
  if (errorVoces) throw new Error(`leyendo app.voces: ${errorVoces.message}`);
  const uuidPorVoz = new Map((vocesPg ?? []).filter((v) => v.airtable_id).map((v) => [v.airtable_id!, v.id]));

  const filasProyecto: Record<string, unknown>[] = proyectosAirtable.map((r) => {
    const { _voz, ...fila } = mapearProyecto(r);
    const vozUuid = uuidPorVoz.get(String(_voz));
    if (!vozUuid) throw new Error(`El proyecto "${fila.nombre}" apunta a la voz ${_voz}, que no quedó en Postgres.`);
    return { ...fila, voz_id: vozUuid };
  });
  const { error: errorProy } = await db
    .schema("app")
    .from("proyectos")
    .upsert(filasProyecto, { onConflict: "airtable_id" });
  if (errorProy) throw new Error(`upsert de app.proyectos: ${errorProy.message}`);
  console.log(`✓ app.proyectos: ${filasProyecto.length} filas`);

  // Espejo: lo que Airtable ya no tiene, acá tampoco. Solo toca filas CON airtable_id — las que
  // nazcan en la app no tienen y no se borran. Los proyectos primero: son los hijos.
  for (const [tabla, claves] of [
    ["proyectos", filasProyecto.map((f) => String(f.airtable_id))],
    ["voces", filasVoz.map((f) => String(f.airtable_id))],
  ] as const) {
    let borrar = db.schema("app").from(tabla).delete({ count: "exact" }).not("airtable_id", "is", null);
    if (claves.length > 0) borrar = borrar.not("airtable_id", "in", `(${claves.map((c) => `"${c}"`).join(",")})`);
    const { error: errorBorrado, count } = await borrar;
    if (errorBorrado) throw new Error(`borrado espejo de app.${tabla}: ${errorBorrado.message}`);
    if (count) console.log(`  (${count} filas borradas de app.${tabla})`);
  }
}

// ── 2. A/B de la fachada: lo que va a servir ↔ lo que Airtable servía ─────────

const { data: vocesPg, error: e1 } = await db
  .schema("app")
  .from("voces")
  .select("id, airtable_id, nombre, descripcion, criterios_relevancia, activo");
if (e1) throw new Error(`leyendo app.voces: ${e1.message}`);

const { data: proyectosPg, error: e2 } = await db
  .schema("app")
  .from("proyectos")
  .select("id, airtable_id, nombre, descripcion, criterios_relevancia, criterios_aprendidos, advertencia_criterios, voz_id, activo, n");
if (e2) throw new Error(`leyendo app.proyectos: ${e2.message}`);

// Los 2 campos que escribe el archivado siguen viniendo de Airtable (ADR-033), así que el A/B
// los toma de ahí para los dos lados: comparar Postgres contra Airtable en un campo cuyo dueño
// es Airtable mediría el retraso del último import, no el corte.
const destilados = new Map(
  proyectosAirtable.map((r) => [
    r.id,
    {
      criterios_aprendidos: (r.fields.criterios_aprendidos as string | undefined)?.trim() || null,
      advertencia_criterios: (r.fields.advertencia_criterios as string | undefined)?.trim() || null,
    },
  ]),
);

const airtablePorVoz = new Map((vocesPg ?? []).map((v) => [v.id, v.airtable_id]));

// Cómo se ve un registro para comparar. Airtable OMITE los campos vacíos (un checkbox
// destildado no viene, un número sin cargar tampoco) y Postgres los devuelve `null`: normalizar
// las dos formas a una es lo que hace que la comparación mida el dato y no el transporte.
const texto = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
const huellaVoz = (r: { id: string; fields: Record<string, unknown> }) =>
  JSON.stringify({
    id: r.id,
    nombre: texto(r.fields.nombre),
    descripcion: texto(r.fields.descripcion),
    criterios_relevancia: texto(r.fields.criterios_relevancia),
    activo: r.fields.activo === true,
  });
const huellaProyecto = (r: { id: string; fields: Record<string, unknown> }) =>
  JSON.stringify({
    id: r.id,
    nombre: texto(r.fields.nombre),
    descripcion: texto(r.fields.descripcion),
    criterios_relevancia: texto(r.fields.criterios_relevancia),
    criterios_aprendidos: texto(r.fields.criterios_aprendidos),
    advertencia_criterios: texto(r.fields.advertencia_criterios),
    voz_default: r.fields.voz_default,
    activo: r.fields.activo === true,
    // El motor hace `Number(f.N) > 0 ? ... : global`, así que vacío, 0 y null son el MISMO dato.
    N: Number(r.fields.N) > 0 ? Number(r.fields.N) : null,
  });

let hayDiff = false;

for (const ambito of ["motor", "completo"] as const) {
  const activo = (r: { fields: Record<string, unknown> }) => r.fields.activo === true;

  const vocesFachada = aRegistrosDeVoces(vocesPg ?? [], ambito).map(huellaVoz).sort();
  const vocesViejo = vocesAirtable
    .filter((r) => ambito === "completo" || activo(r))
    .map((r) => huellaVoz({ id: r.id, fields: r.fields }))
    .sort();

  const proyFachada = aRegistrosDeProyectos(proyectosPg ?? [], airtablePorVoz, destilados, ambito)
    .map(huellaProyecto)
    .sort();
  const proyViejo = proyectosAirtable
    .filter((r) => ambito === "completo" || activo(r))
    .map((r) => huellaProyecto({ id: r.id, fields: r.fields }))
    .sort();

  for (const [que, fachada, viejo] of [
    ["voces", vocesFachada, vocesViejo],
    ["proyectos", proyFachada, proyViejo],
  ] as const) {
    if (JSON.stringify(fachada) === JSON.stringify(viejo)) {
      console.log(`✓ fachada ?ambito=${ambito} · ${que}: ${fachada.length} registros idénticos a Airtable`);
      continue;
    }
    hayDiff = true;
    console.log(`✖ fachada ?ambito=${ambito} · ${que}: NO devolvería lo mismo`);
    for (const r of viejo.filter((x) => !fachada.includes(x))) console.log(`   solo en Airtable: ${r}`);
    for (const r of fachada.filter((x) => !viejo.includes(x))) console.log(`   solo en Postgres: ${r}`);
  }
}

// ── 3. El gate cruzado, que es lo que decide qué corre de verdad ──────────────
// `armarRunPlan` saltea el proyecto cuya voz no vino activa. Si esa cuenta cambiara, el corte
// apagaría trabajo sin un solo error — la lección del corte 2/4 (*Storytelling* en cero).

const vocesActivasAirtable = new Set(vocesAirtable.filter((v) => v.fields.activo === true).map((v) => v.id));
const correnAirtable = proyectosAirtable.filter(
  (p) => p.fields.activo === true && vocesActivasAirtable.has((p.fields.voz_default as string[])?.[0] ?? ""),
).length;

const vocesActivasPg = new Set((vocesPg ?? []).filter((v) => v.activo).map((v) => v.id));
const correnPg = (proyectosPg ?? []).filter((p) => p.activo && vocesActivasPg.has(p.voz_id)).length;

console.log(`\nProyectos que van a correr: Airtable ${correnAirtable} · Postgres ${correnPg}`);
if (correnAirtable !== correnPg) {
  hayDiff = true;
  console.log("✖ El corte cambiaría qué corre.");
}

if (hayDiff) {
  console.log("\n✖ Hay diferencias: NO flipees.");
  process.exit(1);
}
console.log("\n✓ El corte puede publicarse.");
