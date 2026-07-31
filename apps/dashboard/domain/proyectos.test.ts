import assert from "node:assert/strict";
import { test } from "node:test";
import {
  aRegistrosDeProyectos,
  aRegistrosDeVoces,
  pausadoPorSuVoz,
  validarProyecto,
  validarVoz,
  type ProyectoGuardado,
  type VozGuardada,
} from "./proyectos.ts";

const VOCES = new Set(["voz-1", "voz-2"]);

const formProyecto = (extra: Record<string, unknown> = {}) => ({
  nombre: "Storytelling",
  descripcion: "",
  criterios_relevancia: "SÍ: historias con giro. NO: tutoriales.",
  vozId: "voz-1",
  activo: true,
  n: "",
  ...extra,
});

// ── validarVoz ───────────────────────────────────────────────────────────────

test("una voz sin nombre no se guarda", () => {
  const r = validarVoz({ nombre: "   ", descripcion: "", criterios_relevancia: "", activo: true });
  assert.equal(r.ok, false);
});

test("los textos vacíos de una voz se guardan como null, no como cadena vacía", () => {
  const r = validarVoz({ nombre: " Rosario ", descripcion: "  ", criterios_relevancia: "", activo: false });
  assert.equal(r.ok, true);
  assert.deepEqual(r.ok && r.valor, {
    nombre: "Rosario",
    descripcion: null,
    criterios_relevancia: null,
    activo: false,
  });
});

// ── validarProyecto ──────────────────────────────────────────────────────────

test("un proyecto sin criterios no se guarda: es la trampa del form de Airtable", () => {
  const r = validarProyecto(formProyecto({ criterios_relevancia: "   " }), VOCES);
  assert.equal(r.ok, false);
  assert.match(r.ok === false ? r.error : "", /criterios/i);
});

test("un proyecto sin voz no se guarda: la regla es 1 proyecto = 1 voz", () => {
  assert.equal(validarProyecto(formProyecto({ vozId: null }), VOCES).ok, false);
  assert.equal(validarProyecto(formProyecto({ vozId: "" }), VOCES).ok, false);
});

test("una voz que no existe se rechaza, no se filtra en silencio", () => {
  const r = validarProyecto(formProyecto({ vozId: "voz-inventada" }), VOCES);
  assert.equal(r.ok, false);
});

test("N vacío y N=0 son el mismo dato: null, o sea el default global (ADR-024)", () => {
  for (const n of ["", "0", 0, null, undefined]) {
    const r = validarProyecto(formProyecto({ n }), VOCES);
    assert.equal(r.ok, true, `n=${JSON.stringify(n)}`);
    assert.equal(r.ok && r.valor.n, null, `n=${JSON.stringify(n)}`);
  }
});

test("N tiene que ser un entero no negativo", () => {
  for (const n of ["-5", "3.5", "muchos"]) {
    assert.equal(validarProyecto(formProyecto({ n }), VOCES).ok, false, `n=${n}`);
  }
  const r = validarProyecto(formProyecto({ n: "30" }), VOCES);
  assert.equal(r.ok && r.valor.n, 30);
});

// ── La forma del contrato ────────────────────────────────────────────────────

const voz = (extra: Partial<VozGuardada> = {}): VozGuardada => ({
  id: "uuid-voz-1",
  airtable_id: "recVOZ1",
  nombre: "Rosario",
  descripcion: null,
  criterios_relevancia: "criterios de la voz",
  activo: true,
  ...extra,
});

const proyecto = (extra: Partial<ProyectoGuardado> = {}): ProyectoGuardado => ({
  id: "uuid-proy-1",
  airtable_id: "recPROY1",
  nombre: "Storytelling",
  descripcion: null,
  criterios_relevancia: "criterios del proyecto",
  criterios_aprendidos: null,
  advertencia_criterios: null,
  voz_id: "uuid-voz-1",
  activo: true,
  n: null,
  ...extra,
});

const AIRTABLE_POR_VOZ = new Map([["uuid-voz-1", "recVOZ1" as string | null]]);
const SIN_DESTILAR = new Map<string, { criterios_aprendidos: string | null; advertencia_criterios: string | null }>();

test("el id que viaja es el record id de Airtable: el motor lo usa como link al escribir", () => {
  assert.equal(aRegistrosDeVoces([voz()], "motor")[0].id, "recVOZ1");
  assert.equal(aRegistrosDeProyectos([proyecto()], AIRTABLE_POR_VOZ, SIN_DESTILAR, "motor")[0].id, "recPROY1");
});

test("una fila nacida en la app viaja con su uuid (no tiene otro id que dar)", () => {
  const nueva = voz({ id: "uuid-nueva", airtable_id: null });
  assert.equal(aRegistrosDeVoces([nueva], "motor")[0].id, "uuid-nueva");
});

test("voz_default viaja como array de un elemento con el record id de la voz", () => {
  const [r] = aRegistrosDeProyectos([proyecto()], AIRTABLE_POR_VOZ, SIN_DESTILAR, "motor");
  assert.deepEqual(r.fields.voz_default, ["recVOZ1"]);
});

test("?ambito=motor filtra lo apagado; ?ambito=completo lo trae todo", () => {
  const voces = [voz(), voz({ id: "uuid-voz-2", airtable_id: "recVOZ2", activo: false })];
  assert.equal(aRegistrosDeVoces(voces, "motor").length, 1);
  assert.equal(aRegistrosDeVoces(voces, "completo").length, 2);

  const proyectos = [proyecto(), proyecto({ id: "uuid-proy-2", airtable_id: "recPROY2", activo: false })];
  assert.equal(aRegistrosDeProyectos(proyectos, AIRTABLE_POR_VOZ, SIN_DESTILAR, "motor").length, 1);
  assert.equal(aRegistrosDeProyectos(proyectos, AIRTABLE_POR_VOZ, SIN_DESTILAR, "completo").length, 2);
});

test("los criterios destilados entran desde donde los escribe el archivado, no desde Postgres", () => {
  // La columna de Postgres tiene un valor viejo (el del último import de sombra) y Airtable el
  // que el archivado escribió el domingo. Gana Airtable: es su dueño hasta D7 (ADR-033).
  const destilados = new Map([
    ["recPROY1", { criterios_aprendidos: "lo aprendido el domingo", advertencia_criterios: "falta lista negativa" }],
  ]);
  const [r] = aRegistrosDeProyectos(
    [proyecto({ criterios_aprendidos: "valor viejo de la sombra" })],
    AIRTABLE_POR_VOZ,
    destilados,
    "motor",
  );
  assert.equal(r.fields.criterios_aprendidos, "lo aprendido el domingo");
  assert.equal(r.fields.advertencia_criterios, "falta lista negativa");
});

test("sin destilado (o proyecto nuevo sin fila en Airtable) los campos viajan null, no undefined", () => {
  const [r] = aRegistrosDeProyectos(
    [proyecto({ airtable_id: null, criterios_aprendidos: "valor viejo" })],
    AIRTABLE_POR_VOZ,
    SIN_DESTILAR,
    "motor",
  );
  assert.equal(r.fields.criterios_aprendidos, null);
});

test("N viaja tal cual: la resolución contra el global la hace armarRunPlan", () => {
  const conN = aRegistrosDeProyectos([proyecto({ n: 30 })], AIRTABLE_POR_VOZ, SIN_DESTILAR, "motor");
  assert.equal(conN[0].fields.N, 30);
  const sinN = aRegistrosDeProyectos([proyecto()], AIRTABLE_POR_VOZ, SIN_DESTILAR, "motor");
  assert.equal(sinN[0].fields.N, null);
});

// ── Lecturas de la pantalla ──────────────────────────────────────────────────

test("un proyecto activo de voz apagada está pausado sin que nadie lo haya pausado", () => {
  assert.equal(pausadoPorSuVoz({ activo: true }, { activo: false }), true);
  assert.equal(pausadoPorSuVoz({ activo: true }, { activo: true }), false);
  assert.equal(pausadoPorSuVoz({ activo: false }, { activo: false }), false);
});
