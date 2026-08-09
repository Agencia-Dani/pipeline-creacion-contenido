import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DIAS,
  esDia,
  esHora,
  estaActivaEnLinkedin,
  normalizarDias,
  normalizarFranjas,
  repartirVoces,
  validarPerfil,
  type FormPerfilVoz,
  type VozConPerfil,
} from "./linkedin-voz.ts";

const FORM: FormPerfilVoz = {
  nombre: "Andrés Bilbao",
  perfil: "Directo, sin corporativismo.",
  firma: "Andrés Bilbao · Fundador · Construyo cosas que escalan",
  espaciado: "1",
  separacionH: "6",
  franjas: ["08:00", "13:00"],
  dias: ["lunes", "martes"],
  lineasRojas: "",
};

// ─────────────────────────── Las horas ───────────────────────────

test("esHora acepta HH:MM en 24 h y rechaza lo que parece hora y no lo es", () => {
  assert.equal(esHora("08:00"), true);
  assert.equal(esHora("8:00"), true, "sin padding es válido: normalizarFranjas lo paddea");
  assert.equal(esHora("23:59"), true);
  assert.equal(esHora("00:00"), true);
  assert.equal(esHora("17:30"), true);

  assert.equal(esHora("24:00"), false, "no existe la hora 24");
  assert.equal(esHora("12:60"), false);
  assert.equal(esHora("12"), false);
  assert.equal(esHora("12:5"), false, "los minutos van a dos dígitos");
  assert.equal(esHora("mediodía"), false);
  assert.equal(esHora(""), false);
});

test("🩸 esHora no delega en Date, y este es el caso que lo justifica", () => {
  // `new Date("2026-01-01T25:00")` es Invalid Date, pero un parseo laxo de "25:00" en varias
  // implementaciones no lo es. Una hora del día no es un instante: es un par de números.
  assert.equal(esHora("25:00"), false);
  assert.equal(esHora("99:99"), false);
});

test("normalizarFranjas paddea, ordena y deduplica — las tres cosas importan", () => {
  // El caso entero: "8:00" y "08:00" son la MISMA hora del día y dos strings distintos. Sin padding
  // el Set no los une y la cola tendría dos franjas donde hay una.
  assert.deepEqual(normalizarFranjas(["13:00", "8:00", "08:00"]), ["08:00", "13:00"]);
  // El orden cronológico sale gratis del padding: con dos dígitos, ordenar texto ordena hora.
  assert.deepEqual(normalizarFranjas(["17:30", "08:00", "13:00"]), ["08:00", "13:00", "17:30"]);
  // Sin padding, "8:00" ordenaría DESPUÉS de "17:30" — que es el bug que esto evita.
  assert.deepEqual(normalizarFranjas(["17:30", "8:00"]), ["08:00", "17:30"]);
  assert.deepEqual(normalizarFranjas([" 08:00 "]), ["08:00"], "trim");
  assert.deepEqual(normalizarFranjas([]), []);
});

test("normalizarFranjas descarta lo inválido en silencio — validarPerfil es quien reporta", () => {
  assert.deepEqual(normalizarFranjas(["08:00", "25:00", "hola"]), ["08:00"]);
});

// ─────────────────────────── Los días ───────────────────────────

test("normalizarDias ordena por la semana, no alfabéticamente", () => {
  // Alfabético daría domingo, jueves, lunes… que es ruido. Los días tienen un orden y es este.
  assert.deepEqual(normalizarDias(["viernes", "lunes", "domingo"]), ["lunes", "viernes", "domingo"]);
  assert.deepEqual(normalizarDias(DIAS.slice().reverse()), [...DIAS]);
});

test("normalizarDias deduplica, baja a minúsculas y descarta lo que no es un día", () => {
  assert.deepEqual(normalizarDias(["Lunes", "lunes", " LUNES "]), ["lunes"]);
  assert.deepEqual(normalizarDias(["lunes", "feriado", ""]), ["lunes"]);
  assert.equal(esDia("miércoles"), false, "se guarda sin acento: la etiqueta bonita se dibuja aparte");
  assert.equal(esDia("miercoles"), true);
});

// ─────────────────────────── La validación ───────────────────────────

test("un formulario completo es válido", () => {
  assert.deepEqual(validarPerfil(FORM, { exigirNombre: true }), {});
  assert.deepEqual(validarPerfil(FORM, { exigirNombre: false }), {});
});

test("🔴 la firma es obligatoria, y es la regla R-2 — no hay 'la pongo después'", () => {
  // La columna es `not null` en la `020` por esto: una voz sin firma produce posts que violan la
  // regla de la casa en silencio, porque el validador determinista no tiene contra qué chequear.
  const errores = validarPerfil({ ...FORM, firma: "   " }, { exigirNombre: false });
  assert.ok(errores.firma, "una firma en blanco tiene que fallar");
  assert.equal(Object.keys(errores).length, 1, "y no arrastrar otros errores");
});

test("el nombre solo se exige al crear — al editar la voz ya existe", () => {
  const alEditar = validarPerfil({ ...FORM, nombre: "" }, { exigirNombre: false });
  assert.deepEqual(alEditar, {}, "editar no toca el nombre");
  const alCrear = validarPerfil({ ...FORM, nombre: "" }, { exigirNombre: true });
  assert.ok(alCrear.nombre);
});

test("espaciado y separación respetan los checks de la `020`, y el entero también", () => {
  for (const malo of ["0", "4", "-1", "2.5", "", "dos"]) {
    assert.ok(
      validarPerfil({ ...FORM, espaciado: malo }, { exigirNombre: false }).espaciado,
      `espaciado ${JSON.stringify(malo)} tiene que fallar`,
    );
  }
  for (const bueno of ["1", "2", "3"]) {
    assert.equal(validarPerfil({ ...FORM, espaciado: bueno }, { exigirNombre: false }).espaciado, undefined);
  }
  // `separacion_h > 0` es el check de la base; el techo de 168 lo agrega el dominio, porque más de
  // una semana entre dos posts no es una separación mínima, es no publicar (y se escribe con un typo).
  assert.ok(validarPerfil({ ...FORM, separacionH: "0" }, { exigirNombre: false }).separacionH);
  assert.equal(validarPerfil({ ...FORM, separacionH: "168" }, { exigirNombre: false }).separacionH, undefined);
  assert.ok(validarPerfil({ ...FORM, separacionH: "480" }, { exigirNombre: false }).separacionH);
});

test("una voz sin franjas no se puede programar nunca, así que se rechaza", () => {
  // La base lo permite: `text[] not null` acepta el array vacío. Por eso el chequeo vive acá.
  assert.ok(validarPerfil({ ...FORM, franjas: [] }, { exigirNombre: false }).franjas);
  assert.ok(validarPerfil({ ...FORM, franjas: ["  "] }, { exigirNombre: false }).franjas);
  const mala = validarPerfil({ ...FORM, franjas: ["08:00", "25:00"] }, { exigirNombre: false });
  assert.ok(mala.franjas?.includes("25:00"), "el mensaje nombra cuál está mal");
});

test("los días SÍ pueden ir vacíos — 'todavía no sabemos cuáles' es un estado legítimo", () => {
  // Por eso la columna es nullable. Lo que no se acepta es un día inventado.
  assert.deepEqual(validarPerfil({ ...FORM, dias: [] }, { exigirNombre: false }), {});
  assert.ok(validarPerfil({ ...FORM, dias: ["feriado"] }, { exigirNombre: false }).dias);
});

// ─────────────────────────── La lista ───────────────────────────

const voz = (id: string, nombre: string, configurada: boolean): VozConPerfil => ({
  id,
  nombre,
  perfil: configurada
    ? {
        vozId: id,
        perfil: null,
        firma: "x",
        espaciado: 2,
        separacionH: 4,
        franjas: ["08:00"],
        dias: null,
        lineasRojas: null,
      }
    : null,
});

test("🔑 lo que activa una voz en LinkedIn es su perfil, NUNCA voces.activo", () => {
  // La regla en rojo de ADR-067. `voces.activo` significa de facto "corre en reels" y lo consume
  // `leerConfigOperar`: leerlo acá escondería voces válidas, escribirlo apagaría proyectos de reels
  // en producción sin un solo error. El interruptor de LinkedIn es la existencia de la fila.
  assert.equal(estaActivaEnLinkedin(voz("1", "A", true)), true);
  assert.equal(estaActivaEnLinkedin(voz("2", "B", false)), false);
});

test("repartirVoces pone las configuradas arriba, y cada bloque alfabético", () => {
  const voces = [
    voz("1", "Zoe", true),
    voz("2", "Ana", false),
    voz("3", "Bruno", true),
    voz("4", "Carla", false),
  ];
  const { configuradas, sinConfigurar } = repartirVoces(voces);
  assert.deepEqual(configuradas.map((v) => v.nombre), ["Bruno", "Zoe"]);
  assert.deepEqual(sinConfigurar.map((v) => v.nombre), ["Ana", "Carla"]);
});

test("repartirVoces aguanta el estado real de hoy: una empresa sin ninguna voz", () => {
  // 30X y EstadoX tienen CERO filas en `app.voces` (medido el 08/08) y son las dos empresas cuyo
  // cockpit de LinkedIn está activo. La pantalla tiene que abrir bien en ese caso, no romperse.
  assert.deepEqual(repartirVoces([]), { configuradas: [], sinConfigurar: [] });
});

test("repartirVoces no pierde ni duplica voces", () => {
  const voces = [voz("1", "A", true), voz("2", "B", false), voz("3", "C", true)];
  const { configuradas, sinConfigurar } = repartirVoces(voces);
  assert.equal(configuradas.length + sinConfigurar.length, voces.length);
});
