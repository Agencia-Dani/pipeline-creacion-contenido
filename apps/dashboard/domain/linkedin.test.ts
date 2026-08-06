import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  carrilDeFuente,
  esCarril,
  esFuente,
  esValido,
  FUENTES,
  mostrarConsulta,
  normalizarConsulta,
  ordenarBanco,
  validarReferente,
  type FormReferenteLinkedin,
} from "./linkedin.ts";

const form = (extra: Partial<FormReferenteLinkedin> = {}): FormReferenteLinkedin => ({
  fuente: "pinterest",
  consulta: "mindset",
  idioma: "en",
  proyectoId: "",
  notas: "",
  ...extra,
});

describe("el vocabulario de LinkedIn (020 §1)", () => {
  it("los guards rechazan lo que no está en el enum — son la validación del server action", () => {
    assert.ok(esFuente("pinterest"));
    assert.ok(!esFuente("instagram"), "instagram es del enum de REELS, no de este");
    assert.ok(!esFuente(null));
    assert.ok(esCarril("copiable"));
    assert.ok(!esCarril("aprobado"));
  });

  it("archivo es el ÚNICO carril personal; todo lo demás es copiable (ADR-055 §2)", () => {
    assert.equal(carrilDeFuente("archivo"), "personal");
    for (const f of FUENTES.filter((f) => f !== "archivo")) {
      assert.equal(carrilDeFuente(f), "copiable", `${f} debería ser copiable`);
    }
  });
});

describe("normalizarConsulta — lo que hace que el unique de la 020 signifique algo", () => {
  it("las tres formas del mismo filtro colapsan en una", () => {
    // Sin esto son 3 filas distintas para Postgres y la misma búsqueda para Pinterest, o sea el
    // duplicado que `unique (instance_id, fuente, consulta)` dice evitar, entrando igual.
    const esperado = "mindset";
    assert.equal(normalizarConsulta("Mindset"), esperado);
    assert.equal(normalizarConsulta("  mindset "), esperado);
    assert.equal(normalizarConsulta("MINDSET"), esperado);
  });

  it("colapsa los espacios internos que trae el copy/paste", () => {
    assert.equal(normalizarConsulta("AI  tools"), "ai tools");
    assert.equal(normalizarConsulta("AI\ttools"), "ai tools");
  });

  it("@alguien y alguien son la misma cuenta", () => {
    assert.equal(normalizarConsulta("@Alguien"), "alguien");
    assert.equal(normalizarConsulta("alguien"), "alguien");
    // Y el arroba pegado dos veces tampoco crea una tercera identidad.
    assert.equal(normalizarConsulta("@@alguien"), "alguien");
  });

  it("una consulta de solo espacios queda vacía, y eso lo caza la validación", () => {
    assert.equal(normalizarConsulta("   "), "");
    assert.equal(normalizarConsulta("@"), "");
  });

  it("es idempotente: normalizar lo normalizado no lo cambia", () => {
    // Importa porque el valor guardado se vuelve a normalizar al editar; si no fuera idempotente,
    // editar una fila sin tocarla la convertiría en otra.
    for (const s of ["Mindset", "@Alguien", "AI  tools", "  x  "]) {
      assert.equal(normalizarConsulta(normalizarConsulta(s)), normalizarConsulta(s));
    }
  });
});

describe("mostrarConsulta", () => {
  it("los handles se dibujan con arroba, los filtros no", () => {
    assert.equal(mostrarConsulta("linkedin", "alguien"), "@alguien");
    assert.equal(mostrarConsulta("pinterest", "mindset"), "mindset");
  });
});

describe("validarReferente", () => {
  it("un alta válida no devuelve errores", () => {
    assert.ok(esValido(validarReferente(form())));
  });

  it("una fuente que no existe se rechaza", () => {
    assert.equal(validarReferente(form({ fuente: "instagram" })).fuente, "Elegí de dónde sale.");
  });

  it("una consulta que se normaliza a vacío se rechaza — no basta con que traiga caracteres", () => {
    assert.ok(validarReferente(form({ consulta: "   " })).consulta);
    assert.ok(validarReferente(form({ consulta: "@" })).consulta);
  });

  it("el idioma acepta un código y rechaza una frase", () => {
    assert.ok(esValido(validarReferente(form({ idioma: "es" }))));
    assert.ok(esValido(validarReferente(form({ idioma: "" }))), "es opcional");
    assert.ok(validarReferente(form({ idioma: "inglés, y a veces también español" })).idioma);
  });

  it("corta las notas larguísimas", () => {
    assert.ok(validarReferente(form({ notas: "x".repeat(2001) })).notas);
  });
});

describe("ordenarBanco", () => {
  const ref = (fuente: string, consulta: string, activo: boolean) =>
    ({ fuente, consulta, activo }) as { fuente: "pinterest"; consulta: string; activo: boolean };

  it("agrupa por fuente en el orden del enum", () => {
    const orden = ordenarBanco([
      ref("web", "b", true),
      ref("pinterest", "a", true),
      ref("archivo", "c", true),
    ]).map((r) => r.fuente);
    assert.deepEqual(orden, ["pinterest", "web", "archivo"]);
  });

  it("🔑 lo APAGADO va primero dentro de su fuente: es lo que espera una decisión", () => {
    const orden = ordenarBanco([
      ref("pinterest", "prendida", true),
      ref("pinterest", "apagada", false),
    ]).map((r) => r.consulta);
    assert.deepEqual(orden, ["apagada", "prendida"]);
  });

  it("el orden es estable: no depende de cómo vino la lista", () => {
    const entrada = [
      ref("pinterest", "z", true),
      ref("pinterest", "a", true),
      ref("pinterest", "m", true),
    ];
    const primera = ordenarBanco(entrada).map((r) => r.consulta);
    const segunda = ordenarBanco([...entrada].reverse()).map((r) => r.consulta);
    assert.deepEqual(primera, ["a", "m", "z"]);
    assert.deepEqual(primera, segunda);
  });

  it("no muta la lista que recibe", () => {
    const entrada = [ref("web", "b", true), ref("pinterest", "a", true)];
    const copia = entrada.map((r) => r.consulta);
    ordenarBanco(entrada);
    assert.deepEqual(entrada.map((r) => r.consulta), copia);
  });
});
