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

test("el id que viaja es el record id de Airtable: el motor lo usa como link al escribir", () => {
  assert.equal(aRegistrosDeVoces([voz()], "motor")[0].id, "recVOZ1");
  assert.equal(aRegistrosDeProyectos([proyecto()], AIRTABLE_POR_VOZ, "motor")[0].id, "recPROY1");
});

test("una fila nacida en la app viaja con su uuid (no tiene otro id que dar)", () => {
  const nueva = voz({ id: "uuid-nueva", airtable_id: null });
  assert.equal(aRegistrosDeVoces([nueva], "motor")[0].id, "uuid-nueva");
});

test("voz_default viaja como array de un elemento con el record id de la voz", () => {
  const [r] = aRegistrosDeProyectos([proyecto()], AIRTABLE_POR_VOZ, "motor");
  assert.deepEqual(r.fields.voz_default, ["recVOZ1"]);
});

test("?ambito=motor filtra lo apagado; ?ambito=completo lo trae todo", () => {
  const voces = [voz(), voz({ id: "uuid-voz-2", airtable_id: "recVOZ2", activo: false })];
  assert.equal(aRegistrosDeVoces(voces, "motor").length, 1);
  assert.equal(aRegistrosDeVoces(voces, "completo").length, 2);

  const proyectos = [proyecto(), proyecto({ id: "uuid-proy-2", airtable_id: "recPROY2", activo: false })];
  assert.equal(aRegistrosDeProyectos(proyectos, AIRTABLE_POR_VOZ, "motor").length, 1);
  assert.equal(aRegistrosDeProyectos(proyectos, AIRTABLE_POR_VOZ, "completo").length, 2);
});

test("los criterios destilados salen de la fila, como todo lo demás (murió ADR-033)", () => {
  // Durante la coexistencia estos dos campos venían de Airtable, porque su único escritor
  // —`Destilar criterios` del archivado— vivía ahí. D7 movió ese escritor a PostgREST, así que
  // el campo y su autor volvieron al mismo lugar y la regla "un dueño por CAMPO" se cumplió sola.
  const [r] = aRegistrosDeProyectos(
    [proyecto({ criterios_aprendidos: "lo aprendido el domingo", advertencia_criterios: "falta lista negativa" })],
    AIRTABLE_POR_VOZ,
    "motor",
  );
  assert.equal(r.fields.criterios_aprendidos, "lo aprendido el domingo");
  assert.equal(r.fields.advertencia_criterios, "falta lista negativa");
});

test("sin destilar todavía, los campos viajan null y no undefined", () => {
  // `undefined` desaparece al serializar a JSON y el motor recibiría un objeto sin la clave.
  const [r] = aRegistrosDeProyectos([proyecto()], AIRTABLE_POR_VOZ, "motor");
  assert.equal(r.fields.criterios_aprendidos, null);
  assert.equal(r.fields.advertencia_criterios, null);
});

test("el uuid viaja al lado del record id: es lo que hace seguro el orden del corte (D7 paso 1)", () => {
  // Sin este campo, el orden deploy↔re-import importaría — y equivocarlo no falla: el motor viejo
  // recibiendo un uuid escribe un link con `typecast` y Airtable inventa un proyecto fantasma.
  const [v] = aRegistrosDeVoces([voz()], "motor");
  assert.equal(v.id, "recVOZ1");
  assert.equal(v.fields.uuid, "uuid-voz-1");

  const [p] = aRegistrosDeProyectos([proyecto()], AIRTABLE_POR_VOZ, "motor");
  assert.equal(p.id, "recPROY1");
  assert.equal(p.fields.uuid, "uuid-proy-1");
});

test("N viaja tal cual: la resolución contra el global la hace armarRunPlan", () => {
  const conN = aRegistrosDeProyectos([proyecto({ n: 30 })], AIRTABLE_POR_VOZ, "motor");
  assert.equal(conN[0].fields.N, 30);
  const sinN = aRegistrosDeProyectos([proyecto()], AIRTABLE_POR_VOZ, "motor");
  assert.equal(sinN[0].fields.N, null);
});

// ── Lecturas de la pantalla ──────────────────────────────────────────────────

test("un proyecto activo de voz apagada está pausado sin que nadie lo haya pausado", () => {
  assert.equal(pausadoPorSuVoz({ activo: true }, { activo: false }), true);
  assert.equal(pausadoPorSuVoz({ activo: true }, { activo: true }), false);
  assert.equal(pausadoPorSuVoz({ activo: false }, { activo: false }), false);
});
