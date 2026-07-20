// Dominio puro (C3): el modo sombra de D3. Mapea registros de Airtable a filas del
// schema `app` (migración 009) y compara esperado↔actual para el diff. Sin IO: los
// scripts (apps/dashboard/scripts/) leen y escriben; acá solo viven las reglas.
//
// Convención de FKs: el mapeo no conoce los uuid de Postgres, así que deja el record
// id de Airtable en claves `_voz` / `_proyecto`; el script las resuelve contra la
// tabla padre ya importada y las reemplaza por `voz_id` / `proyecto_id`.

export type RegistroAirtable = {
  id: string;
  createdTime?: string;
  fields: Record<string, unknown>;
};

export type Fila = Record<string, unknown>;

const texto = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v : null;
const numero = (v: unknown): number | null => (typeof v === "number" ? v : null);
// Airtable omite los checkbox destildados del payload: ausente = false.
const booleano = (v: unknown): boolean => v === true;
const link = (v: unknown): string | null =>
  Array.isArray(v) && typeof v[0] === "string" ? v[0] : null;
const adjuntoUrl = (v: unknown): string | null => {
  if (!Array.isArray(v)) return null;
  const primero = v[0] as { url?: unknown } | undefined;
  return typeof primero?.url === "string" ? primero.url : null;
};

export function mapearVoz(r: RegistroAirtable): Fila {
  return {
    airtable_id: r.id,
    nombre: texto(r.fields.nombre) ?? "(sin nombre)",
    descripcion: texto(r.fields.descripcion),
    criterios_relevancia: texto(r.fields.criterios_relevancia),
    activo: booleano(r.fields.activo),
  };
}

// Las dos reglas que la migración hace cumplir se validan acá con nombre y apellido,
// para que el import falle con un mensaje útil y no con un error de constraint.
export function mapearProyecto(r: RegistroAirtable): Fila {
  const voz = link(r.fields.voz_default);
  const criterios = texto(r.fields.criterios_relevancia);
  const nombre = texto(r.fields.nombre) ?? "(sin nombre)";
  if (!voz) {
    throw new Error(`Proyecto "${nombre}" sin voz linkeada: la regla es 1 proyecto = 1 voz. Linkeá su voz_default en Airtable antes de importar.`);
  }
  if (!criterios) {
    throw new Error(`Proyecto "${nombre}" sin criterios_relevancia: escribilos en Airtable antes de importar (la trampa del form, mapa-campos §5.1-6).`);
  }
  return {
    airtable_id: r.id,
    nombre,
    descripcion: texto(r.fields.descripcion),
    criterios_relevancia: criterios,
    criterios_aprendidos: texto(r.fields.criterios_aprendidos),
    advertencia_criterios: texto(r.fields.advertencia_criterios),
    _voz: voz,
    activo: booleano(r.fields.activo),
    n: numero(r.fields.N),
  };
}

export function mapearReferente(r: RegistroAirtable): Fila {
  return {
    airtable_id: r.id,
    handle: texto(r.fields.handle) ?? "(sin handle)",
    plataforma: texto(r.fields.plataforma),
    _proyecto: link(r.fields.proyecto),
    activo: booleano(r.fields.activo),
    notas: texto(r.fields.notas),
  };
}

export function mapearAjuste(r: RegistroAirtable): Fila {
  return {
    airtable_id: r.id,
    clave: texto(r.fields.clave) ?? "(sin clave)",
    valor: numero(r.fields.valor),
    descripcion: texto(r.fields.descripcion),
    visibilidad: booleano(r.fields["Mostrar al equipo"]) ? "equipo" : "dev",
  };
}

export function mapearCandidato(r: RegistroAirtable): Fila {
  return {
    airtable_id: r.id,
    titulo: texto(r.fields.titulo) ?? "(sin título)",
    script: texto(r.fields.script),
    idioma: texto(r.fields.idioma),
    thumbnail_url: adjuntoUrl(r.fields.thumbnail),
    _proyecto: link(r.fields.proyecto),
    _voz: link(r.fields.voz),
    referente: texto(r.fields.referente),
    url_referente: texto(r.fields.url_referente),
    views: numero(r.fields.views),
    likes: numero(r.fields.likes),
    seguidores: numero(r.fields.seguidores),
    engagement: numero(r.fields.engagement),
    heat_score: numero(r.fields.heat_score),
    relevancia_score: numero(r.fields.relevancia_score),
    relevancia_razon: texto(r.fields.relevancia_razon),
    viral_por_tamano: booleano(r.fields.viral_por_tamano),
    calificacion: texto(r.fields.calificacion),
    estado: texto(r.fields.estado) ?? "nuevo",
    fecha_calificacion: texto(r.fields.fecha_calificacion),
    notas_equipo: texto(r.fields.notas_equipo),
    creado_en: texto(r.fields.fecha) ?? r.createdTime ?? null,
  };
}

export function mapearDescarte(r: RegistroAirtable): Fila {
  return {
    airtable_id: r.id,
    titulo: texto(r.fields.titulo) ?? "(sin título)",
    script: texto(r.fields.script),
    referente: texto(r.fields.referente),
    url_referente: texto(r.fields.url_referente),
    _proyecto: link(r.fields.proyecto),
    relevancia_score: numero(r.fields.relevancia_score),
    relevancia_razon: texto(r.fields.relevancia_razon),
    thumbnail_url: adjuntoUrl(r.fields.thumbnail),
    veredicto: texto(r.fields.veredicto),
    creado_en: r.createdTime ?? null,
  };
}

export function mapearPropuesto(r: RegistroAirtable): Fila {
  return {
    airtable_id: r.id,
    handle: texto(r.fields.handle) ?? "(sin handle)",
    plataforma: texto(r.fields.plataforma),
    _proyecto: link(r.fields.proyecto),
    afinidad: numero(r.fields.afinidad),
    razon: texto(r.fields.razon),
    seguidores: numero(r.fields.seguidores),
    bio: texto(r.fields.bio),
    url: texto(r.fields.url),
    semillas: texto(r.fields.semillas),
    estado: texto(r.fields.estado) ?? "propuesto",
    creado_en: r.createdTime ?? null,
  };
}

// ── Diff esperado (Airtable mapeado) ↔ actual (Postgres) ──────────────────────

export type DiffCampo = { airtableId: string; campo: string; esperado: unknown; actual: unknown };
export type DiffTabla = { faltan: string[]; sobran: string[]; distintos: DiffCampo[] };

const ES_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

// Normaliza para comparar entre mundos: '' y undefined son null; timestamps por
// instante (Airtable manda Z, Postgres devuelve +00:00); numérico por valor
// (PostgREST puede devolver numeric como string).
export function normalizar(v: unknown): unknown {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v === "string") {
    const s = v.trim();
    if (s === "") return null;
    if (ES_TIMESTAMP.test(s)) {
      const t = Date.parse(s);
      if (!Number.isNaN(t)) return t;
    }
    if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
    return s;
  }
  return v;
}

export function diffTabla(esperado: Map<string, Fila>, actual: Map<string, Fila>): DiffTabla {
  const faltan: string[] = [];
  const sobran: string[] = [];
  const distintos: DiffCampo[] = [];

  for (const [id, filaEsperada] of esperado) {
    const filaActual = actual.get(id);
    if (!filaActual) {
      faltan.push(id);
      continue;
    }
    for (const campo of Object.keys(filaEsperada)) {
      if (campo === "airtable_id") continue;
      const e = normalizar(filaEsperada[campo]);
      const a = normalizar(filaActual[campo]);
      if (e !== a) distintos.push({ airtableId: id, campo, esperado: e, actual: a });
    }
  }
  for (const id of actual.keys()) {
    if (!esperado.has(id)) sobran.push(id);
  }
  return { faltan, sobran, distintos };
}

export const sinDiferencias = (d: DiffTabla): boolean =>
  d.faltan.length === 0 && d.sobran.length === 0 && d.distintos.length === 0;
