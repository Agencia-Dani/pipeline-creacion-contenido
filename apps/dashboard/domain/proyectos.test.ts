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
  n: "15",
  ...extra,
});

// ── validarVoz ───────────────────────────────────────────────────────────────

test("una voz sin nombre no se guarda", () => {
  const r = validarVoz({ nombre: "   ", descripcion: "", criterios_relevancia: "", activo: true });
  assert.equal(r.ok, false);
});

// ADR-040: los criterios de la voz se SUMAN a los del proyecto en el gate, así que una voz sin
// criterios no falla — juzga con la mitad del contexto, en verde. Es la misma regla que el proyecto
// ya tenía; lo que cambió es que ahora vale para las dos puntas.
test("una voz sin criterios no se guarda: son la espina dorsal, no un adorno", () => {
  const r = validarVoz({ nombre: "Rosario", descripcion: "", criterios_relevancia: "", activo: true });
  assert.equal(r.ok, false);
  assert.match(r.ok === false ? r.error : "", /criterios/i);
});

test("criterios en blanco tampoco alcanzan: se comparan con trim", () => {
  const r = validarVoz({ nombre: "Rosario", descripcion: "", criterios_relevancia: "   \n  ", activo: true });
  assert.equal(r.ok, false);
});

test("la descripción de una voz SÍ sigue siendo opcional: el filtro no la lee", () => {
  const r = validarVoz({
    nombre: " Rosario ",
    descripcion: "  ",
    criterios_relevancia: "  habla de comunicación  ",
    activo: false,
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.ok && r.valor, {
    nombre: "Rosario",
    descripcion: null,
    criterios_relevancia: "habla de comunicación",
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

// El N dejó de tener default silencioso. Antes, vacío o 0 significaban "usá el global
// `Candidatos por corrida`", y ese tercer número escondido era justo lo que hacía imposible
// responder "¿cuántos videos trae este proyecto?" mirando el proyecto.
test("un proyecto sin N no se guarda: ya no hay default global al que caer", () => {
  for (const n of ["", "   ", null, undefined]) {
    const r = validarProyecto(formProyecto({ n }), VOCES);
    assert.equal(r.ok, false, `n=${JSON.stringify(n)}`);
    assert.match(r.ok === false ? r.error : "", /cuántos videos/i);
  }
});

test("N tiene que ser un entero de 1 para arriba (0 ya no significa «el global»)", () => {
  for (const n of ["0", 0, "-5", "3.5", "muchos"]) {
    assert.equal(validarProyecto(formProyecto({ n }), VOCES).ok, false, `n=${JSON.stringify(n)}`);
  }
  const r = validarProyecto(formProyecto({ n: "30" }), VOCES);
  assert.equal(r.ok && r.valor.n, 30);
  // Y llega como número desde un <input>, que siempre manda string.
  assert.equal(validarProyecto(formProyecto({ n: 40 }), VOCES).ok, true);
});

// ── La forma del contrato ────────────────────────────────────────────────────

const voz = (extra: Partial<VozGuardada> = {}): VozGuardada => ({
  id: "uuid-voz-1",
  nombre: "Rosario",
  descripcion: null,
  criterios_relevancia: "criterios de la voz",
  activo: true,
  ...extra,
});

const proyecto = (extra: Partial<ProyectoGuardado> = {}): ProyectoGuardado => ({
  id: "uuid-proy-1",
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

test("el id que viaja es el uuid de Postgres (paso 3 del expand/contract de D7)", () => {
  // Hasta el paso 2 era el record id de Airtable, porque el motor lo escribía como *link* con
  // `typecast` y un uuid ahí no fallaba: creaba un proyecto fantasma. Con las escrituras en
  // PostgREST (FKs de verdad) esa razón desapareció.
  assert.equal(aRegistrosDeVoces([voz()], "motor")[0].id, "uuid-voz-1");
  assert.equal(aRegistrosDeProyectos([proyecto()], "motor")[0].id, "uuid-proy-1");
});

test("voz_default viaja como array de un elemento con el uuid de la voz", () => {
  const [r] = aRegistrosDeProyectos([proyecto()], "motor");
  assert.deepEqual(r.fields.voz_default, ["uuid-voz-1"]);
});

test("?ambito=motor filtra lo apagado; ?ambito=completo lo trae todo", () => {
  const voces = [voz(), voz({ id: "uuid-voz-2", activo: false })];
  assert.equal(aRegistrosDeVoces(voces, "motor").length, 1);
  assert.equal(aRegistrosDeVoces(voces, "completo").length, 2);

  const proyectos = [proyecto(), proyecto({ id: "uuid-proy-2", activo: false })];
  assert.equal(aRegistrosDeProyectos(proyectos, "motor").length, 1);
  assert.equal(aRegistrosDeProyectos(proyectos, "completo").length, 2);
});

test("los criterios destilados salen de la fila, como todo lo demás (murió ADR-033)", () => {
  // Durante la coexistencia estos dos campos venían de Airtable, porque su único escritor
  // —`Destilar criterios` del archivado— vivía ahí. D7 movió ese escritor a PostgREST, así que
  // el campo y su autor volvieron al mismo lugar y la regla "un dueño por CAMPO" se cumplió sola.
  const [r] = aRegistrosDeProyectos(
    [proyecto({ criterios_aprendidos: "lo aprendido el domingo", advertencia_criterios: "falta lista negativa" })],
    "motor",
  );
  assert.equal(r.fields.criterios_aprendidos, "lo aprendido el domingo");
  assert.equal(r.fields.advertencia_criterios, "falta lista negativa");
});

test("sin destilar todavía, los campos viajan null y no undefined", () => {
  // `undefined` desaparece al serializar a JSON y el motor recibiría un objeto sin la clave.
  const [r] = aRegistrosDeProyectos([proyecto()], "motor");
  assert.equal(r.fields.criterios_aprendidos, null);
  assert.equal(r.fields.advertencia_criterios, null);
});

test("fields.uuid ya NO viaja: murió en el re-import de la Fase 4 (ADR-048 §5)", () => {
  // Era redundante desde el paso 3 del expand/contract —valía lo mismo que el `id`— y se quedaba
  // solo porque sacarlo costaba un re-import propio. El de la instancia ya se paga, así que se va
  // junto con los mapas `uuidDe` de los tres workflows. Es un assert de AUSENCIA a propósito: si
  // alguien lo revive, el motor vuelve a tener dos ids para la misma cosa.
  const [v] = aRegistrosDeVoces([voz()], "motor");
  assert.equal("uuid" in v.fields, false);

  const [p] = aRegistrosDeProyectos([proyecto()], "motor");
  assert.equal("uuid" in p.fields, false);
});

test("N viaja tal cual: la resolución contra el global la hace armarRunPlan", () => {
  const conN = aRegistrosDeProyectos([proyecto({ n: 30 })], "motor");
  assert.equal(conN[0].fields.N, 30);
  const sinN = aRegistrosDeProyectos([proyecto()], "motor");
  assert.equal(sinN[0].fields.N, null);
});

// ── Lecturas de la pantalla ──────────────────────────────────────────────────

test("un proyecto activo de voz apagada está pausado sin que nadie lo haya pausado", () => {
  assert.equal(pausadoPorSuVoz({ activo: true }, { activo: false }), true);
  assert.equal(pausadoPorSuVoz({ activo: true }, { activo: true }), false);
  assert.equal(pausadoPorSuVoz({ activo: false }, { activo: false }), false);
});
