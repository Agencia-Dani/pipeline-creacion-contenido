// IO común del modo sombra (D3): lectura completa de Airtable + cliente Postgres +
// el catálogo de tablas. Las reglas de mapeo/diff viven en domain/sombra.ts (puras).
// Se corre con: node --env-file=.env.local scripts/<script>.ts  (imports relativos
// a propósito: fuera de Next no existe el alias @/).

import { createClient } from "@supabase/supabase-js";
import {
  mapearAjuste,
  mapearCandidato,
  mapearDescarte,
  mapearPropuesto,
  mapearProyecto,
  mapearReferente,
  mapearVoz,
  type Fila,
  type RegistroAirtable,
} from "../domain/sombra.ts";

export function env(nombre: string): string {
  const valor = process.env[nombre];
  if (!valor) {
    console.error(`Falta la env var ${nombre} (gestor → .env.local; corré con node --env-file=.env.local).`);
    process.exit(1);
  }
  return valor;
}

export const supabase = () =>
  createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

export async function leerTablaAirtable(tabla: string): Promise<RegistroAirtable[]> {
  const registros: RegistroAirtable[] = [];
  let offset: string | undefined;
  do {
    const url = new URL(
      `https://api.airtable.com/v0/${env("AIRTABLE_BASE_ID")}/${encodeURIComponent(tabla)}`,
    );
    if (offset) url.searchParams.set("offset", offset);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${env("AIRTABLE_PAT")}` } });
    if (!res.ok) throw new Error(`Airtable respondió ${res.status} leyendo ${tabla}.`);
    const pagina = (await res.json()) as { records: RegistroAirtable[]; offset?: string };
    registros.push(...pagina.records);
    offset = pagina.offset;
  } while (offset);
  return registros;
}

// El catálogo, en orden de import (padres primero). `fks` dice qué placeholder del
// mapeo se resuelve contra qué tabla padre; el diff los traduce en sentido inverso.
export type TablaSombra = {
  airtable: string;
  pg: string;
  mapear: (r: RegistroAirtable) => Fila;
  conflicto: string;
  fks: { placeholder: "_voz" | "_proyecto"; columna: string; padre: "voces" | "proyectos" }[];
};

export const TABLAS: TablaSombra[] = [
  { airtable: "Voces", pg: "voces", mapear: mapearVoz, conflicto: "airtable_id", fks: [] },
  {
    airtable: "Proyectos", pg: "proyectos", mapear: mapearProyecto, conflicto: "airtable_id",
    fks: [{ placeholder: "_voz", columna: "voz_id", padre: "voces" }],
  },
  {
    airtable: "Referentes", pg: "referentes", mapear: mapearReferente, conflicto: "airtable_id",
    fks: [{ placeholder: "_proyecto", columna: "proyecto_id", padre: "proyectos" }],
  },
  { airtable: "Ajustes", pg: "ajustes", mapear: mapearAjuste, conflicto: "clave", fks: [] },
  {
    airtable: "Candidatos", pg: "candidatos", mapear: mapearCandidato, conflicto: "airtable_id",
    fks: [
      { placeholder: "_proyecto", columna: "proyecto_id", padre: "proyectos" },
      { placeholder: "_voz", columna: "voz_id", padre: "voces" },
    ],
  },
  {
    airtable: "Descartes del gate", pg: "descartes", mapear: mapearDescarte, conflicto: "airtable_id",
    fks: [{ placeholder: "_proyecto", columna: "proyecto_id", padre: "proyectos" }],
  },
  {
    airtable: "Referentes propuestos", pg: "referentes_propuestos", mapear: mapearPropuesto,
    conflicto: "airtable_id",
    fks: [{ placeholder: "_proyecto", columna: "proyecto_id", padre: "proyectos" }],
  },
];

// uuid de Postgres ↔ record id de Airtable de las tablas padre (para FKs).
export async function mapasDePadres(db: ReturnType<typeof supabase>) {
  const mapas = {
    voces: { aUuid: new Map<string, string>(), aAirtable: new Map<string, string>() },
    proyectos: { aUuid: new Map<string, string>(), aAirtable: new Map<string, string>() },
  };
  for (const padre of ["voces", "proyectos"] as const) {
    const { data, error } = await db.schema("app").from(padre).select("id, airtable_id");
    if (error) throw new Error(`Leyendo app.${padre}: ${error.message}`);
    for (const fila of data ?? []) {
      if (!fila.airtable_id) continue;
      mapas[padre].aUuid.set(fila.airtable_id, fila.id);
      mapas[padre].aAirtable.set(fila.id, fila.airtable_id);
    }
  }
  return mapas;
}
