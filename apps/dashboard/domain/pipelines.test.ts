import { test } from "node:test";
import assert from "node:assert/strict";
import {
  declaracionesDeAjustesValidas,
  declaracionesDeCurarValidas,
  declaracionesValidas,
  implementaAjuste,
  implementaPantalla,
  PANTALLAS_AJUSTES,
  PANTALLAS_CURAR,
  pantallasDeAjustes,
  pantallasDeCurar,
  pipelineConocido,
  pipelinesDeclarados,
  zonaInicialEn,
  zonasDePipeline,
  zonasVisibles,
} from "./pipelines.ts";
import { zonasDe, ZONAS } from "./roles.ts";

test("reels implementa las cinco zonas y LinkedIn solo las dos que puede dibujar", () => {
  assert.deepEqual(zonasDePipeline("short-form-content"), ZONAS);
  // `transcribir` nunca la tuvo: LinkedIn ya es texto, su etapa `enriquecer` es `n/a` (ADR-055 §3).
  // `operar` y `entender` salieron el 2026-08-08 (ADR-066) — ver el test de abajo, que es el que
  // guarda el porqué. `ajustes` sí: el equipo es de la EMPRESA, existe con o sin motor (ADR-060).
  assert.deepEqual(zonasDePipeline("linkedin"), ["curar", "ajustes"]);
  assert.equal(zonasDePipeline("linkedin").includes("transcribir"), false);
});

test("🔴 LinkedIn NO declara `operar`, y esto es lo que impide disparar el motor de reels", () => {
  // Las tres acciones de `operar/actions.ts` (correr · buscar · archivar) hacen POST a los webhooks
  // de los workflows de REELS con el `instance_id` del cockpit abierto. Su única guardia era
  // `exigirTenant("operar", …)`, que autoriza la ZONA — y LinkedIn la declaraba. Con dos cockpits
  // de LinkedIn en `active`, el ▶ estaba vivo apuntando a la máquina equivocada.
  //
  // ⚠️ Este test es la mitad barata de la defensa, no toda: sacar la zona cierra la puerta HOY, pero
  // la guardia que sobrevive al día que LinkedIn recupere `operar` con su motor propio vive en
  // `noEsSuMaquina()`, dentro de esas acciones. Si alguien vuelve a poner `operar` acá, este test se
  // pone rojo y ese comentario es lo que tiene que leer antes de borrarlo.
  assert.equal(zonasDePipeline("linkedin").includes("operar"), false);
  // Y `entender` por la razón hermana, menos grave y del mismo tipo: sus 5 vistas son de reels, así
  // que filtradas por un `instance_id` de LinkedIn devuelven ceros sin fallar. La familia de la `015`.
  assert.equal(zonasDePipeline("linkedin").includes("entender"), false);
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
  // …y aun así no la ve en LinkedIn, porque el pipeline no la tiene. Desde ADR-066 tampoco `operar`
  // ni `entender`: de las cinco zonas que el operador alcanza por rol, en LinkedIn caen TRES. Que
  // caiga más de la mitad es lo que prueba que el filtro es la intersección y no el rol solo.
  assert.deepEqual(zonasVisibles(zonasDe("operador"), "linkedin"), ["curar", "ajustes"]);
  // En reels no cae ninguna, porque ahí las dos condiciones se cumplen para las cinco.
  assert.deepEqual(zonasVisibles(zonasDe("operador"), "short-form-content"), [
    "operar",
    "curar",
    "transcribir",
    "entender",
    "ajustes",
  ]);
});

test("el sponsor ve lo mismo que el dev en los dos pipelines, y en LinkedIn los dos quedan en dos zonas", () => {
  // Desde el 2026-08-07 el sponsor opera. Lo que sigue recortando su nav no es el rol sino el
  // pipeline. Que la intersección de ADR-056 siga mandando es justo lo que este test cuida.
  assert.deepEqual(zonasVisibles(zonasDe("sponsor"), "short-form-content"), zonasVisibles(zonasDe("dev"), "short-form-content"));
  assert.deepEqual(zonasVisibles(zonasDe("sponsor"), "linkedin"), ["curar", "ajustes"]);
});

test("ni siquiera el dev ve `operar` en LinkedIn — el recorte es del pipeline, no del rol", () => {
  // Importa que sea el `dev` el que lo pruebe: es el rol que alcanza todo, así que si acá cae, cae
  // por el pipeline. Un dev tampoco puede disparar el motor de reels desde un cockpit de LinkedIn.
  assert.deepEqual(zonasVisibles(zonasDe("dev"), "linkedin"), ["curar", "ajustes"]);
});

test("el orden lo pone el rol, no el pipeline — es lo que hace que la zona inicial no se re-decida", () => {
  // `zonasDe` viene ordenada por prioridad y la intersección la respeta. El caso que lo prueba es
  // `substack`, cuyo array de pipeline empieza por una zona que el rol tiene más abajo: si se
  // filtrara al revés, la inicial saldría del pipeline y no del rol.
  // En LinkedIn la inicial pasó a ser `curar` (antes `operar`) como efecto de ADR-066: la primera
  // zona que el rol alcanza Y el pipeline implementa. Nadie tuvo que re-decidirlo — sale del orden.
  assert.equal(zonaInicialEn(zonasDe("operador"), "linkedin"), "curar");
  assert.equal(zonaInicialEn(zonasDe("sponsor"), "linkedin"), "curar");
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

// ─────────────────────── Las pantallas de `curar`, un nivel más abajo ───────────────────────

test("🩸 compartir la ZONA no es compartir las pantallas: es el agujero del 06/08", () => {
  // Los dos pipelines tienen `curar`, así que la guardia de zona (ADR-056) los deja pasar a los dos.
  assert.ok(zonasDePipeline("short-form-content").includes("curar"));
  assert.ok(zonasDePipeline("linkedin").includes("curar"));
  // Y adentro NO implementan lo mismo. Sin esta segunda pregunta, un cockpit de LinkedIn entraba a
  // /curar/feed y leía `app.candidatos` —la tabla de REELS— filtrada por su instance_id: cero filas,
  // sin error, indistinguible de "todavía no cargamos datos".
  assert.deepEqual(pantallasDeCurar("short-form-content"), PANTALLAS_CURAR);
  assert.deepEqual(pantallasDeCurar("linkedin"), ["referentes"]);
});

test("la guardia del servidor contesta por pantalla, no por zona", () => {
  assert.equal(implementaPantalla("linkedin", "referentes"), true);
  for (const p of PANTALLAS_CURAR.filter((p) => p !== "referentes")) {
    assert.equal(implementaPantalla("linkedin", p), false, `linkedin no implementa ${p}`);
  }
  for (const p of PANTALLAS_CURAR) {
    assert.equal(implementaPantalla("short-form-content", p), true);
  }
});

test("un pipeline no declarado no tiene NINGUNA pantalla — mismo default seguro", () => {
  assert.deepEqual(pantallasDeCurar("substack"), []);
  assert.equal(implementaPantalla("substack", "feed"), false);
});

test("referentes es la única pantalla compartida hoy, y por eso su página ramifica", () => {
  // Si alguna vez fueran dos, el `page.tsx` de cada una tiene que ramificar igual. Este test es el
  // que avisa: su lista es la que hay que mirar cuando alguien suma una pantalla a LinkedIn.
  const compartidas = PANTALLAS_CURAR.filter(
    (p) => implementaPantalla("linkedin", p) && implementaPantalla("short-form-content", p),
  );
  assert.deepEqual(compartidas, ["referentes"]);
});

test("ninguna declaración de pantallas inventa una, ni deja una zona `curar` vacía", () => {
  // Lo segundo importa tanto como lo primero: declarar la zona `curar` y ninguna pantalla dibuja
  // una zona vacía, que es el mismo fallo mudo movido de lugar.
  assert.equal(declaracionesDeCurarValidas(), true);
});

// ─────────────────────── Y las de `ajustes`, la 5ª zona (ADR-060) ───────────────────────

test("⚙️ LinkedIn tiene la zona ajustes pero NO la pantalla de motor", () => {
  // La misma lección que arriba, aplicada ANTES de que muerda: los dos pipelines tienen la zona
  // (el equipo es de la empresa), y adentro no implementan lo mismo. `app.ajustes` no tiene filas
  // para la instancia de LinkedIn, así que `motor` habría cargado limpia con cero perillas — que en
  // un pipeline recién nacido se lee como "todavía no lo configuramos". La familia de la `015`.
  assert.ok(zonasDePipeline("linkedin").includes("ajustes"));
  assert.deepEqual(pantallasDeAjustes("linkedin"), ["equipo"]);
  assert.deepEqual(pantallasDeAjustes("short-form-content"), PANTALLAS_AJUSTES);
  assert.equal(implementaAjuste("linkedin", "motor"), false);
  assert.equal(implementaAjuste("linkedin", "equipo"), true);
});

test("un pipeline no declarado tampoco tiene pantallas de ajustes", () => {
  assert.deepEqual(pantallasDeAjustes("substack"), []);
  assert.equal(implementaAjuste("substack", "equipo"), false);
});

test("ningún pipeline declara la zona ajustes sin pantallas adentro", () => {
  // Una zona declarada y vacía es el mismo fallo mudo movido de lugar: nav que lleva a la nada.
  assert.equal(declaracionesDeAjustesValidas(), true);
});

test("⚙️ equipo existe en TODOS los pipelines, y eso es la decisión", () => {
  // El equipo es de la EMPRESA, no del pipeline (ADR-060 §1). Si algún día un pipeline no lo
  // declarara, alguien tendría dos cockpits de la misma empresa y equipo en uno solo.
  for (const p of pipelinesDeclarados()) {
    assert.equal(implementaAjuste(p, "equipo"), true, `${p} tiene que tener equipo`);
  }
});
