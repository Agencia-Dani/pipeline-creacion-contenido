import { test } from "node:test";
import assert from "node:assert/strict";
import {
  declaracionesValidas,
  pipelineConocido,
  pipelinesDeclarados,
  zonaInicialEn,
  zonasDePipeline,
  zonasVisibles,
} from "./pipelines.ts";
import { zonasDe, ZONAS } from "./roles.ts";

test("reels implementa las cuatro zonas y LinkedIn todas menos transcribir", () => {
  assert.deepEqual(zonasDePipeline("short-form-content"), ZONAS);
  // La razón no es que falte construirla: LinkedIn ya es texto, así que su etapa `enriquecer` es
  // `n/a` (ADR-055 §3) y la zona de ADR-031 no tiene qué hacer.
  assert.deepEqual(zonasDePipeline("linkedin"), ["operar", "curar", "entender"]);
  assert.equal(zonasDePipeline("linkedin").includes("transcribir"), false);
});

test("un pipeline que nadie declaró no tiene NINGUNA zona — el default seguro de ADR-056", () => {
  // Falla ruidoso (un cockpit sin nav se ve de una) en vez de dibujar cuatro links a pantallas que
  // no existen contra tablas que tampoco.
  assert.deepEqual(zonasDePipeline("substack"), []);
  assert.equal(pipelineConocido("substack"), false);
  assert.equal(pipelineConocido("linkedin"), true);
});

test("🔒 la intersección exige las DOS condiciones: el rol alcanza y el pipeline implementa", () => {
  // El operador alcanza transcribir por rol…
  assert.equal(zonasDe("operador").includes("transcribir"), true);
  // …y aun así no la ve en LinkedIn, porque el pipeline no la tiene. `entender` sí sobrevive: la
  // alcanza por rol (desde el 05/08) y LinkedIn la implementa. Que de las cuatro zonas del operador
  // caiga exactamente una es lo que prueba que el filtro es la intersección y no el rol solo.
  assert.deepEqual(zonasVisibles(zonasDe("operador"), "linkedin"), [
    "operar",
    "curar",
    "entender",
  ]);
  // En reels no cae ninguna, porque ahí las dos condiciones se cumplen para las cuatro.
  assert.deepEqual(zonasVisibles(zonasDe("operador"), "short-form-content"), [
    "operar",
    "curar",
    "transcribir",
    "entender",
  ]);
});

test("el sponsor ve entender en los dos pipelines, y nada más", () => {
  assert.deepEqual(zonasVisibles(zonasDe("sponsor"), "short-form-content"), ["entender"]);
  assert.deepEqual(zonasVisibles(zonasDe("sponsor"), "linkedin"), ["entender"]);
});

test("el dev pierde transcribir en LinkedIn y conserva el resto", () => {
  assert.deepEqual(zonasVisibles(zonasDe("dev"), "linkedin"), [
    "operar",
    "curar",
    "entender",
  ]);
});

test("el orden lo pone el rol, no el pipeline — es lo que hace que la zona inicial no se re-decida", () => {
  // `zonasDe` viene ordenada por prioridad y la intersección la respeta; si se filtrara al revés,
  // el sponsor podría caer en `operar` por venir antes en la lista del pipeline.
  assert.equal(zonaInicialEn(zonasDe("operador"), "linkedin"), "operar");
  assert.equal(zonaInicialEn(zonasDe("sponsor"), "linkedin"), "entender");
  assert.equal(zonaInicialEn(zonasDe("dev"), "short-form-content"), "operar");
});

test("sin intersección la zona inicial es null, y quien llama decide — no se inventa una zona", () => {
  assert.equal(zonaInicialEn(zonasDe("operador"), "substack"), null);
  assert.equal(zonaInicialEn([], "linkedin"), null);
});

test("ninguna declaración inventa una zona que no existe", () => {
  // Un typo (`transcibir`) no lo atraparía nada y su síntoma sería una zona que no aparece: mudo.
  assert.equal(declaracionesValidas(), true);
  assert.ok(pipelinesDeclarados().includes("linkedin"));
});
