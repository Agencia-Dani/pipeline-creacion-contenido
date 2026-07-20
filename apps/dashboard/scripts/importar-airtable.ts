// Import idempotente Airtable → schema `app` (modo sombra, D3 del plan-cockpit).
// Espejo completo: upsertea por airtable_id (clave en Ajustes) y borra lo que ya no
// está en Airtable. Correrlo dos veces seguidas deja la base idéntica. Airtable
// sigue siendo el DUEÑO: esto solo copia; nada del pipeline lee estas tablas aún.
//
//   cd apps/dashboard && npm run sombra:import
//
// Necesita en .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE,
// AIRTABLE_PAT, AIRTABLE_BASE_ID (los mismos de D1, del gestor).

import { leerTablaAirtable, mapasDePadres, supabase, TABLAS } from "./comun.ts";

const db = supabase();
let fallo = false;

for (const tabla of TABLAS) {
  const registros = await leerTablaAirtable(tabla.airtable);
  const filas = registros.map(tabla.mapear);

  // FKs: el placeholder trae el record id del padre; acá se vuelve uuid.
  const mapas = tabla.fks.length ? await mapasDePadres(db) : null;
  for (const fila of filas) {
    for (const fk of tabla.fks) {
      const airtableId = fila[fk.placeholder] as string | null;
      delete fila[fk.placeholder];
      if (airtableId == null) {
        fila[fk.columna] = null;
        continue;
      }
      const uuid = mapas![fk.padre].aUuid.get(airtableId);
      if (!uuid) throw new Error(`${tabla.pg}: FK a ${fk.padre} desconocida (${airtableId}). ¿Corrió el import de ${fk.padre} antes?`);
      fila[fk.columna] = uuid;
    }
  }

  const { error } = await db.schema("app").from(tabla.pg)
    .upsert(filas, { onConflict: tabla.conflicto });
  if (error) {
    console.error(`✖ app.${tabla.pg}: upsert falló — ${error.message}`);
    fallo = true;
    continue;
  }

  // Espejo: lo que Airtable ya no tiene, acá tampoco (borra solo filas con
  // airtable_id: las nativas de la app, si algún día existen antes del flip, quedan).
  const claves = filas.map((f) => String(f[tabla.conflicto]));
  let borrar = db.schema("app").from(tabla.pg).delete({ count: "exact" }).not("airtable_id", "is", null);
  if (claves.length > 0) {
    borrar = borrar.not(tabla.conflicto, "in", `(${claves.map((c) => `"${c}"`).join(",")})`);
  }
  const { error: errorBorrado, count } = await borrar;
  if (errorBorrado) {
    console.error(`✖ app.${tabla.pg}: borrado espejo falló — ${errorBorrado.message}`);
    fallo = true;
    continue;
  }

  console.log(`✓ app.${tabla.pg}: ${filas.length} filas${count ? ` (${count} borradas)` : ""}`);
}

if (fallo) process.exit(1);
console.log("\nImport en sombra completo. Verificá con: npm run sombra:diff");
