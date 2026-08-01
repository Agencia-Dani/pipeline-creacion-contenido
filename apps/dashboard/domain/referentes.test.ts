import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  aRegistrosDelPlan,
  conArroba,
  cruzaVoces,
  esFlojo,
  esPlataforma,
  normalizarHandle,
  validarReferente,
  type DatosReferente,
  type ReferenteGuardado,
} from "./referentes.ts";

const PROYECTOS = new Set(["recA", "recB", "recC"]);

const entrada = (extra: Record<string, unknown> = {}) => ({
  handle: "@simonsinek",
  plataforma: "instagram",
  proyectoIds: ["recA"],
  activo: true,
  notas: null,
  ...extra,
});

// Valida y devuelve el dato, fallando el test si no pasó: evita repetir el estrechamiento
// del union en cada assert.
const valido = (extra: Record<string, unknown> = {}) => {
  const r = validarReferente(entrada(extra), PROYECTOS);
  assert.equal(r.ok, true, r.ok ? "" : r.error);
  return (r as { ok: true; valor: DatosReferente }).valor;
};

describe("normalizarHandle", () => {
  it("saca la arroba, los bordes y la mayúscula (el motor compara así)", () => {
    assert.equal(normalizarHandle("@SimonSinek"), "simonsinek");
    assert.equal(normalizarHandle("  @simonsinek "), "simonsinek");
    assert.equal(normalizarHandle("@@simonsinek"), "simonsinek");
  });

  it("no arregla el interior: un nombre con espacios queda como vino", () => {
    // Convertirlo a "simonsinek" sería inventar una cuenta que puede no existir; el error
    // aparecería recién cuando Apify no devuelva nada. Lo rechaza validarReferente.
    assert.equal(normalizarHandle("Simon Sinek"), "simon sinek");
  });

  it("lo que no deja nada usable es null, no cadena vacía", () => {
    // El motor hace `if (!handle) return;`: un referente sin handle queda activo, con
    // proyectos, y el motor lo ignora en silencio. Pasó en vivo (cierre 69).
    assert.equal(normalizarHandle("@"), null);
    assert.equal(normalizarHandle("   "), null);
    assert.equal(normalizarHandle(null), null);
    assert.equal(normalizarHandle(42), null);
  });

  it("conArroba devuelve la forma que el equipo escribe (y que Airtable guardaba)", () => {
    assert.equal(conArroba(normalizarHandle("  @SimonSinek ")!), "@simonsinek");
  });
});

describe("esPlataforma", () => {
  it("solo las dos que el motor sabe buscar", () => {
    assert.equal(esPlataforma("instagram"), true);
    assert.equal(esPlataforma("tiktok"), true);
    assert.equal(esPlataforma("Instagram"), false); // el enum de la migración es en minúscula
    assert.equal(esPlataforma("youtube"), false);
  });
});

describe("validarReferente", () => {
  it("normaliza el handle al guardar", () => {
    const r = validarReferente(entrada({ handle: " @SimonSinek " }), PROYECTOS);
    assert.equal(r.ok && r.valor.handle, "simonsinek");
  });

  it("una URL pegada en vez del handle se rechaza", () => {
    // El caso caro: el motor le pediría a Apify una cuenta inexistente — cero videos y
    // ningún error. Pasa cuando alguien copia del navegador en vez del perfil.
    const r = validarReferente(entrada({ handle: "instagram.com/simonsinek" }), PROYECTOS);
    assert.equal(r.ok, false);
    assert.equal(validarReferente(entrada({ handle: "Simon Sinek Oficial" }), PROYECTOS).ok, false);
  });

  it("acepta los handles reales del banco (puntos y guiones bajos)", () => {
    assert.equal(validarReferente(entrada({ handle: "@tori.trades" }), PROYECTOS).ok, true);
    assert.equal(validarReferente(entrada({ handle: "@joovier__" }), PROYECTOS).ok, true);
    assert.equal(validarReferente(entrada({ handle: "@_abtrades" }), PROYECTOS).ok, true);
  });

  it("el placeholder que dejó Airtable en la fila sin handle no pasa", () => {
    // `(sin handle)` es lo que el mapeo de sombra guardó por la fila real que está activa,
    // con 2 proyectos y sin cuenta (cierre 69). Al editarla, hay que poner una de verdad.
    assert.equal(validarReferente(entrada({ handle: "(sin handle)" }), PROYECTOS).ok, false);
  });

  it("sin proyecto no se guarda: nadie lo buscaría", () => {
    const r = validarReferente(entrada({ proyectoIds: [] }), PROYECTOS);
    assert.equal(r.ok, false);
  });

  it("un proyecto que no existe se rechaza, no se filtra en silencio", () => {
    const r = validarReferente(entrada({ proyectoIds: ["recA", "recFANTASMA"] }), PROYECTOS);
    assert.equal(r.ok, false);
  });

  it("acepta varios proyectos y deduplica (ADR-032: la relación es N:M)", () => {
    const r = validarReferente(entrada({ proyectoIds: ["recA", "recB", "recA"] }), PROYECTOS);
    assert.deepEqual(r.ok && r.valor.proyectoIds, ["recA", "recB"]);
  });

  it("notas vacías o en blanco son null, no ''", () => {
    assert.equal(valido({ notas: "   " }).notas, null);
    assert.equal(valido({ notas: " puesta a mano " }).notas, "puesta a mano");
  });

  it("activo solo es true si vino true (un checkbox ausente es false)", () => {
    assert.equal(valido({ activo: undefined }).activo, false);
    assert.equal(valido({ activo: "on" }).activo, false);
  });
});

describe("esFlojo", () => {
  const salud = (tasa: number | null, evaluados: number | null) => ({
    tasa_gate: tasa,
    tasa_aprobacion: null,
    videos_evaluados: evaluados,
  });

  it("con poca muestra no se juzga, por baja que sea la tasa", () => {
    assert.equal(esFlojo(salud(0.01, 3), 0.2, 10), false);
  });

  it("con muestra suficiente y tasa baja, es floja", () => {
    assert.equal(esFlojo(salud(0.05, 26), 0.2, 10), true);
  });

  it("una cuenta sin historia no es floja (es desconocida)", () => {
    assert.equal(esFlojo(salud(null, null), 0.2, 10), false);
  });

  it("justo en el umbral NO es floja (el umbral es el piso de lo aceptable)", () => {
    assert.equal(esFlojo(salud(0.2, 40), 0.2, 10), false);
  });
});

describe("aRegistrosDelPlan", () => {
  const guardado = (extra: Partial<ReferenteGuardado> = {}): ReferenteGuardado => ({
    id: "uuid-ref",
    handle: "@simonsinek",
    plataforma: "instagram",
    activo: true,
    notas: null,
    proyectoIds: ["uuid-proy-a"],
    ...extra,
  });

  it("los proyectos viajan como uuid, el mismo idioma que proyectos[].id (D7 paso 3)", () => {
    // Las dos puntas del cruce tenían que flipear JUNTAS: el motor busca
    // `referentes[].fields.proyecto` dentro de `projects[...]`, indexado por `proyectos[].id`. Si
    // solo una hubiera pasado a uuid, ningún referente habría encontrado su proyecto y la corrida
    // habría salido `ok` sin buscar nada.
    const [r] = aRegistrosDelPlan([guardado({ proyectoIds: ["uuid-proy-a", "uuid-proy-b"] })], "motor");
    assert.deepEqual(r.fields.proyecto, ["uuid-proy-a", "uuid-proy-b"]);
  });

  it("los N proyectos viajan enteros: es la regresión que motivó ADR-032", () => {
    const [r] = aRegistrosDelPlan([guardado({ proyectoIds: ["uuid-proy-a", "uuid-proy-b"] })], "completo");
    assert.equal((r.fields.proyecto as string[]).length, 2);
  });

  it("el id es el uuid: su único consumidor (Computar salud referentes) murió en D7", () => {
    const [r] = aRegistrosDelPlan([guardado()], "motor");
    assert.equal(r.id, "uuid-ref");
  });

  it("ambito=motor filtra los apagados; completo los trae (contrato §Los dos ámbitos)", () => {
    const banco = [guardado(), guardado({ id: "otro", activo: false })];
    assert.equal(aRegistrosDelPlan(banco, "motor").length, 1);
    assert.equal(aRegistrosDelPlan(banco, "completo").length, 2);
  });
});

describe("cruzaVoces", () => {
  const vozPorProyecto = new Map([
    ["recA", "voz1"],
    ["recB", "voz1"],
    ["recC", "voz2"],
  ]);

  it("dos proyectos de la misma voz no cruzan", () => {
    assert.equal(cruzaVoces(["recA", "recB"], vozPorProyecto), false);
  });

  it("proyectos de voces distintas cruzan (4 referentes reales lo hacen hoy)", () => {
    assert.equal(cruzaVoces(["recA", "recC"], vozPorProyecto), true);
  });

  it("un proyecto sin voz conocida no inventa un cruce", () => {
    assert.equal(cruzaVoces(["recA", "recHUERFANO"], vozPorProyecto), false);
  });
});
