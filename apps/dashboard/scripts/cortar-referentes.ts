// Corte 2/4 de D5: la carga de datos de Referentes, Airtable → Postgres (ADR-027 §5, ADR-032).
// Se corre UNA vez, entre la migración `012` y el flip de lib/config.ts:
//
//   cd apps/dashboard && npm run cortar:referentes          ← carga y verifica
//   cd apps/dashboard && npm run cortar:referentes -- --dry ← solo verifica, no escribe
//
// Por qué no lo hace `sombra:import`: esa tabla sale del catálogo de sombra en este mismo
// cambio (procedimiento del corte 1/4 — con Postgres de dueño, un import posterior pisaría en
// silencio lo que el equipo edite en la app). O sea la carga y el corte pasan a la vez, y esto
// es la carga. Después de correrlo, este script no vuelve a usarse: queda como el registro
// reproducible del corte, igual que las migraciones SQL.
//
// Qué hace, en orden:
//   1. lee `Referentes` de Airtable (sin las filas fantasma que genera la grilla)
//   2. upsertea `app.referentes` por `airtable_id` y borra lo que Airtable ya no tiene
//   3. RECONSTRUYE `app.referentes_proyectos` con los pares reales (N:M, ADR-032)
//   4. imprime el A/B pares-por-proyecto Airtable ↔ Postgres — la evidencia del corte: si esta
//      tabla no da idéntica, el flip apaga proyectos (es exactamente lo que pasó en el modelo
//      viejo: *Storytelling* quedaba en 0 de 5).
//   5. compara REGISTRO POR REGISTRO lo que la fachada va a servir contra lo que Airtable
//      servía, en los dos ámbitos. Usa `aRegistrosDelPlan` (la misma función que la app), así
//      que compara mundos y no dos escrituras de la misma idea.
//
// Necesita en .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE, AIRTABLE_PAT,
// AIRTABLE_BASE_ID (los mismos del gestor que usa el modo sombra).

import { aRegistrosDelPlan } from "../domain/referentes.ts";
import { mapearReferente, proyectosDeReferente } from "../domain/sombra.ts";
import { leerTablaAirtable, mapasDePadres, supabase } from "./comun.ts";

const seco = process.argv.includes("--dry");
const db = supabase();

const registros = await leerTablaAirtable("Referentes");
const mapas = await mapasDePadres(db);

// Airtable, tal cual: los pares reales que el motor recorre hoy.
const paresAirtable = new Map<string, string[]>(); // airtable_id del referente → airtable_ids de proyectos
for (const r of registros) paresAirtable.set(r.id, proyectosDeReferente(r));

const totalPares = [...paresAirtable.values()].reduce((a, p) => a + p.length, 0);
console.log(`Airtable: ${registros.length} referentes · ${totalPares} pares (referente, proyecto)`);

if (!seco) {
  const filas = registros.map(mapearReferente);
  const { error } = await db.schema("app").from("referentes").upsert(filas, { onConflict: "airtable_id" });
  if (error) throw new Error(`upsert de app.referentes: ${error.message}`);

  // Espejo: lo que Airtable ya no tiene, acá tampoco. Solo toca filas CON airtable_id — las que
  // nazcan en la app (alta a mano o aprobación de un sugerido) no tienen y no se borran.
  const claves = filas.map((f) => String(f.airtable_id));
  let borrar = db.schema("app").from("referentes").delete({ count: "exact" }).not("airtable_id", "is", null);
  if (claves.length > 0) borrar = borrar.not("airtable_id", "in", `(${claves.map((c) => `"${c}"`).join(",")})`);
  const { error: errorBorrado, count } = await borrar;
  if (errorBorrado) throw new Error(`borrado espejo de app.referentes: ${errorBorrado.message}`);
  console.log(`✓ app.referentes: ${filas.length} filas${count ? ` (${count} borradas)` : ""}`);
}

// uuid ↔ airtable_id de los referentes ya cargados (los necesita la puente).
const { data: enPg, error: errorLectura } = await db
  .schema("app")
  .from("referentes")
  .select("id, airtable_id, handle");
if (errorLectura) throw new Error(`leyendo app.referentes: ${errorLectura.message}`);
const uuidPorAirtable = new Map((enPg ?? []).filter((f) => f.airtable_id).map((f) => [f.airtable_id!, f.id]));

// La puente, reconstruida entera: es un espejo de un vínculo, no un acumulado. Borrar y
// reinsertar solo las filas de referentes que vienen de Airtable deja intactos los pares de
// los referentes nacidos en la app.
const paresNuevos: { referente_id: string; proyecto_id: string }[] = [];
for (const [airtableRef, proyectos] of paresAirtable) {
  const refUuid = uuidPorAirtable.get(airtableRef);
  if (!refUuid) throw new Error(`El referente ${airtableRef} no quedó en Postgres: ¿corriste sin --dry?`);
  for (const airtableProy of proyectos) {
    const proyUuid = mapas.proyectos.aUuid.get(airtableProy);
    if (!proyUuid) throw new Error(`Proyecto ${airtableProy} sin fila en app.proyectos. Corré npm run sombra:import primero.`);
    paresNuevos.push({ referente_id: refUuid, proyecto_id: proyUuid });
  }
}

if (!seco) {
  const deAirtable = [...uuidPorAirtable.values()];
  const { error: errorBorrado } = await db
    .schema("app")
    .from("referentes_proyectos")
    .delete()
    .in("referente_id", deAirtable);
  if (errorBorrado) {
    throw new Error(
      `limpiando app.referentes_proyectos: ${errorBorrado.message}\n  ¿Aplicaste core/schema/012_referentes_proyectos.sql en el SQL Editor?`,
    );
  }

  const { error: errorInsert } = await db.schema("app").from("referentes_proyectos").insert(paresNuevos);
  if (errorInsert) throw new Error(`insertando pares: ${errorInsert.message}`);
  console.log(`✓ app.referentes_proyectos: ${paresNuevos.length} pares`);
}

// ── La verificación: pares por proyecto, de los dos lados ────────────────────

const { data: proyectos, error: errorProy } = await db
  .schema("app")
  .from("proyectos")
  .select("id, airtable_id, nombre, activo");
if (errorProy) throw new Error(`leyendo app.proyectos: ${errorProy.message}`);

const { data: puente, error: errorPuente } = await db
  .schema("app")
  .from("referentes_proyectos")
  .select("proyecto_id");
if (errorPuente) throw new Error(`leyendo app.referentes_proyectos: ${errorPuente.message}\n  ¿Aplicaste core/schema/012_referentes_proyectos.sql en el SQL Editor?`);

const cuentaPg = new Map<string, number>();
for (const p of puente ?? []) cuentaPg.set(p.proyecto_id, (cuentaPg.get(p.proyecto_id) ?? 0) + 1);

const cuentaAirtable = new Map<string, number>();
for (const proyectos of paresAirtable.values()) {
  for (const p of proyectos) cuentaAirtable.set(p, (cuentaAirtable.get(p) ?? 0) + 1);
}

console.log("\nReferentes por proyecto (la prueba de que el corte no apaga a nadie):");
let hayDiff = false;
for (const proy of proyectos ?? []) {
  const enAirtable = cuentaAirtable.get(proy.airtable_id ?? "") ?? 0;
  const enPostgres = cuentaPg.get(proy.id) ?? 0;
  const igual = enAirtable === enPostgres;
  if (!igual) hayDiff = true;
  const marca = igual ? "✓" : "✖";
  const estado = proy.activo ? "" : " (inactivo)";
  console.log(`  ${marca} ${proy.nombre}${estado}: Airtable ${enAirtable} · Postgres ${enPostgres}`);
}

if (hayDiff) {
  console.log("\n✖ Los conteos no coinciden: NO flipees. Corré sin --dry y volvé a verificar.");
  process.exit(1);
}
console.log(`✓ Idénticos en los ${proyectos?.length ?? 0} proyectos.`);

// ── A/B de la fachada: lo que va a servir ↔ lo que Airtable servía ───────────

const { data: bancoPg, error: errorBanco } = await db
  .schema("app")
  .from("referentes")
  .select("id, airtable_id, handle, plataforma, activo, notas");
if (errorBanco) throw new Error(`leyendo app.referentes: ${errorBanco.message}`);

const { data: puenteCompleta, error: errorPuente2 } = await db
  .schema("app")
  .from("referentes_proyectos")
  .select("referente_id, proyecto_id");
if (errorPuente2) throw new Error(`leyendo app.referentes_proyectos: ${errorPuente2.message}`);

const proyectosDe = new Map<string, string[]>();
for (const p of puenteCompleta ?? []) {
  proyectosDe.set(p.referente_id, [...(proyectosDe.get(p.referente_id) ?? []), p.proyecto_id]);
}
const airtablePorProyecto = new Map((proyectos ?? []).map((p) => [p.id, p.airtable_id]));
const banco = (bancoPg ?? []).map((r) => ({ ...r, proyectoIds: proyectosDe.get(r.id) ?? [] }));

// Cómo se ve un registro para comparar: los conjuntos ordenados, porque ni Airtable ni
// Postgres prometen orden y el motor tampoco lo usa.
const huella = (r: { id: string; fields: Record<string, unknown> }) =>
  JSON.stringify({
    id: r.id,
    handle: r.fields.handle,
    plataforma: r.fields.plataforma,
    activo: r.fields.activo === true,
    proyecto: [...((r.fields.proyecto as string[]) ?? [])].sort(),
  });

for (const ambito of ["motor", "completo"] as const) {
  const dePostgres = aRegistrosDelPlan(banco, airtablePorProyecto, ambito).map(huella).sort();
  const deAirtable = registros
    .filter((r) => ambito === "completo" || r.fields.activo === true)
    .map((r) => huella({ id: r.id, fields: r.fields }))
    .sort();

  if (JSON.stringify(dePostgres) === JSON.stringify(deAirtable)) {
    console.log(`✓ fachada ?ambito=${ambito}: ${dePostgres.length} referentes idénticos a Airtable`);
    continue;
  }
  hayDiff = true;
  console.log(`✖ fachada ?ambito=${ambito}: la fachada NO devolvería lo mismo`);
  for (const r of deAirtable.filter((x) => !dePostgres.includes(x))) console.log(`   solo en Airtable: ${r}`);
  for (const r of dePostgres.filter((x) => !deAirtable.includes(x))) console.log(`   solo en Postgres: ${r}`);
}

if (hayDiff) {
  console.log("\n✖ Hay diferencias: NO flipees.");
  process.exit(1);
}
console.log("\n✓ El corte puede publicarse.");
