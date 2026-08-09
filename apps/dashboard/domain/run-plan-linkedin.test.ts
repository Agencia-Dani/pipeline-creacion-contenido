import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { aRegistrosDeBancoLinkedin, type ReferenteLinkedin } from "./linkedin.ts";
import { aRegistrosDeVocesLinkedin, type VozConPerfil } from "./linkedin-voz.ts";
import { PIPELINE_LINKEDIN, PIPELINE_REELS, pipelineConocido } from "./pipelines.ts";
import { armarRunPlan, armarRunPlanLinkedin } from "./run-plan.ts";

// El plan de corrida del pipeline de LinkedIn (ADR-068). El de reels tiene su propio archivo:
// acá va solo lo que ese no puede cubrir, que es casi todo, porque son otras tablas.

const ahora = new Date("2026-08-09T08:00:00Z");

const perfil = {
  perfil: "Habla corto, sin adjetivos.",
  firma: "Andrés · CEO · construimos en público",
  espaciado: 2,
  separacionH: 4,
  franjas: ["08:00", "13:00"],
  dias: null,
  lineasRojas: null,
};

const conPerfil: VozConPerfil = { id: "v1", nombre: "Andrés", perfil: { vozId: "v1", ...perfil } };
const sinPerfil: VozConPerfil = { id: "v2", nombre: "Daniel", perfil: null };

const ref = (id: string, extra: Partial<ReferenteLinkedin>): ReferenteLinkedin => ({
  id,
  fuente: "pinterest",
  consulta: "mindset",
  idioma: "en",
  proyectoId: null,
  activo: true,
  notas: null,
  ...extra,
});

describe("las voces del plan de LinkedIn", () => {
  // 🔴 LA prueba de este archivo. Lo que activa una voz en LinkedIn es que EXISTA SU PERFIL, nunca
  // `voces.activo` (ADR-067) — ese flag significa de facto "corre en reels", y la pantalla de
  // LinkedIn crea las voces con `activo: false` a propósito para no meterlas en el plan del motor
  // de reels. Un plan que filtrara por él le daría al motor CERO voces en las tres marcas, en verde
  // y sin un solo error.
  //
  // Que `VozConPerfil` ni siquiera tenga un campo `activo` es la mitad estructural de la garantía:
  // el filtro equivocado no compila. Esto cubre la otra mitad, que es que el filtro correcto esté.
  it("motor trae solo las que tienen perfil; completo las trae todas", () => {
    const voces = [conPerfil, sinPerfil];
    assert.deepEqual(
      aRegistrosDeVocesLinkedin(voces, "motor").map((v) => v.id),
      ["v1"],
    );
    assert.deepEqual(
      aRegistrosDeVocesLinkedin(voces, "completo").map((v) => v.id),
      ["v1", "v2"],
    );
  });

  it("la voz configurada viaja con su firma y su espaciado, y el id es el de app.voces", () => {
    const [reg] = aRegistrosDeVocesLinkedin([conPerfil], "motor");
    assert.equal(reg.id, "v1");
    assert.equal(reg.fields.nombre, "Andrés");
    assert.equal(reg.fields.configurada, true);
    assert.equal(reg.fields.firma, "Andrés · CEO · construimos en público");
    assert.equal(reg.fields.espaciado, 2);
    assert.equal(reg.fields.separacion_h, 4);
    assert.deepEqual(reg.fields.franjas, ["08:00", "13:00"]);
  });

  // La forma no cambia entre una voz configurada y una que no: un registro al que le faltan claves
  // según el caso obliga a quien lo lee a chequear cada una, y ese es el `undefined` que termina
  // impreso dentro de un prompt.
  it("una voz sin perfil trae las MISMAS claves, en null, y configurada: false", () => {
    const [conf, sin] = aRegistrosDeVocesLinkedin([conPerfil, sinPerfil], "completo");
    assert.deepEqual(Object.keys(sin.fields).sort(), Object.keys(conf.fields).sort());
    assert.equal(sin.fields.configurada, false);
    assert.equal(sin.fields.firma, null);
    assert.equal(sin.fields.espaciado, null);
    assert.deepEqual(sin.fields.franjas, []);
  });
});

describe("el banco del plan de LinkedIn", () => {
  it("motor trae solo los prendidos; completo trae también los apagados", () => {
    const banco = [ref("r1", { activo: true }), ref("r2", { activo: false, consulta: "ai" })];
    assert.deepEqual(aRegistrosDeBancoLinkedin(banco, "motor").map((r) => r.id), ["r1"]);
    assert.deepEqual(aRegistrosDeBancoLinkedin(banco, "completo").map((r) => r.id), ["r1", "r2"]);
  });

  // `carril` viaja resuelto porque es lo que decide qué umbral se le aplica a la pieza (ADR-055 §2),
  // y esa regla no puede quedar duplicada en un code node: el día que una fuente cambie de carril,
  // el JSON del workflow no se entera y el umbral se aplica al revés, en verde.
  it("el carril viene derivado de la fuente: archivo es personal, el resto copiable", () => {
    const banco = [ref("r1", { fuente: "pinterest" }), ref("r2", { fuente: "archivo", consulta: "podcast" })];
    assert.deepEqual(
      aRegistrosDeBancoLinkedin(banco, "motor").map((r) => [r.fields.fuente, r.fields.carril]),
      [["pinterest", "copiable"], ["archivo", "personal"]],
    );
  });

  // En reels `referentes[].fields.proyecto` es un array porque un referente alimenta N proyectos
  // (ADR-032) y porque venía de un campo *link* de Airtable. Acá la `020` §2 declara un
  // `proyecto_id` nullable simple, y el contrato nuevo no arrastra la forma de una base muerta.
  it("proyecto_id es un string o null, NO un array de un elemento", () => {
    const [con, sin] = aRegistrosDeBancoLinkedin(
      [ref("r1", { proyectoId: "p1" }), ref("r2", { proyectoId: null, consulta: "otra" })],
      "motor",
    );
    assert.equal(con.fields.proyecto_id, "p1");
    assert.equal(sin.fields.proyecto_id, null);
  });
});

describe("armarRunPlanLinkedin", () => {
  it("no trae proyectos ni ajustes, y dice de qué pipeline es", () => {
    const plan = armarRunPlanLinkedin(
      { voces: aRegistrosDeVocesLinkedin([conPerfil], "motor"), referentes: [] },
      ahora,
    );
    // El literal y no la constante, por lo mismo que en run-plan.test.ts: comparar contra la
    // constante que produce el valor es tautológico, y esto es lo que el motor va a afirmar.
    assert.equal(plan.pipeline, "linkedin");
    assert.equal(plan.version, 2);
    assert.equal(plan.generado_en, "2026-08-09T08:00:00.000Z");
    assert.deepEqual(Object.keys(plan).sort(), ["generado_en", "pipeline", "referentes", "version", "voces"]);
  });

  // Los dos planes tienen que ser distinguibles desde adentro: es el único chequeo que el motor
  // puede hacer contra el fallo que ADR-068 cierra, que no produce un error sino un plan ajeno.
  it("el plan de reels se declara short-form-content, y son distintos", () => {
    const reels = armarRunPlan(
      { voces: [], proyectos: [], referentes: [], ajustes: [] },
      ahora,
    );
    assert.equal(reels.pipeline, "short-form-content");
    assert.notEqual(reels.pipeline, PIPELINE_LINKEDIN);
  });

  // Los ids que la fachada compara contra `instances.workflow_id` tienen que ser pipelines que el
  // resto del sistema reconozca: si alguien renombra uno en `ZONAS_POR_PIPELINE` y no acá, la
  // fachada devuelve 400 para un cockpit que se dibuja perfecto.
  it("los dos ids son pipelines declarados", () => {
    assert.equal(pipelineConocido(PIPELINE_REELS), true);
    assert.equal(pipelineConocido(PIPELINE_LINKEDIN), true);
  });
});
