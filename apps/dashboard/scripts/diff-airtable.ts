// Diff Airtable ↔ Postgres del modo sombra (D3): compara lo que Airtable tiene HOY
// (mapeado con las mismas reglas del import) contra lo que hay en el schema `app`.
// El "hecho cuando" de D3: cero diferencias en 3 corridas seguidas, incluyendo una
// con ediciones del equipo de por medio. Exit 0 = espejo perfecto; exit 1 = hay diff.
//
//   cd apps/dashboard && npm run sombra:diff

import { diffTabla, sinDiferencias, type Fila } from "../domain/sombra.ts";
import { leerTablaAirtable, mapasDePadres, supabase, TABLAS } from "./comun.ts";

const db = supabase();
const mapas = await mapasDePadres(db);
let hayDiff = false;

for (const tabla of TABLAS) {
  const registros = await leerTablaAirtable(tabla.airtable);
  const esperado = new Map<string, Fila>();
  for (const r of registros) {
    const fila = tabla.mapear(r);
    esperado.set(String(fila[tabla.conflicto]), fila);
  }

  const { data, error } = await db.schema("app").from(tabla.pg).select("*");
  if (error) {
    console.error(`✖ app.${tabla.pg}: no se pudo leer — ${error.message}`);
    hayDiff = true;
    continue;
  }
  const actual = new Map<string, Fila>();
  for (const filaPg of (data ?? []) as Fila[]) {
    // Traducción inversa de FKs: uuid → record id, para comparar en el idioma del mapeo.
    for (const fk of tabla.fks) {
      const uuid = filaPg[fk.columna] as string | null;
      filaPg[fk.placeholder] = uuid == null ? null : (mapas[fk.padre].aAirtable.get(uuid) ?? uuid);
    }
    actual.set(String(filaPg[tabla.conflicto]), filaPg);
  }

  const d = diffTabla(esperado, actual);
  if (sinDiferencias(d)) {
    console.log(`✓ app.${tabla.pg}: espejo perfecto (${esperado.size} filas)`);
    continue;
  }
  hayDiff = true;
  console.log(`✖ app.${tabla.pg}:`);
  for (const id of d.faltan) console.log(`   falta en Postgres: ${id}`);
  for (const id of d.sobran) console.log(`   sobra en Postgres: ${id}`);
  for (const c of d.distintos) {
    console.log(`   ${c.airtableId} · ${c.campo}: Airtable=${JSON.stringify(c.esperado)} ≠ Postgres=${JSON.stringify(c.actual)}`);
  }
}

if (hayDiff) {
  console.log("\nHay diferencias: corré npm run sombra:import y volvé a diffear.");
  process.exit(1);
}
console.log("\nEspejo perfecto en las 7 tablas. (El hecho-cuando de D3 pide 3 seguidas así.)");
