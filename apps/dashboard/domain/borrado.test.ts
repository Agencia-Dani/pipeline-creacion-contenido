import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { motivoParaNoBorrar, type Dependencia } from "./borrado.ts";

const dep = (cuantos: number, singular: string, plural: string): Dependencia => ({
  cuantos,
  singular,
  plural,
});

describe("motivoParaNoBorrar", () => {
  it("sin dependencias vivas, deja borrar", () => {
    assert.equal(motivoParaNoBorrar("Trading Psychology", []), null);
  });

  it("con todas las dependencias en cero, deja borrar", () => {
    const motivo = motivoParaNoBorrar("Trading Psychology", [
      dep(0, "video en el feed", "videos en el feed"),
      dep(0, "descarte", "descartes"),
    ]);
    assert.equal(motivo, null);
  });

  it("nombra la dependencia que retiene y ofrece apagar", () => {
    const motivo = motivoParaNoBorrar("Comunicación en empresas", [
      dep(24, "video en el feed", "videos en el feed"),
      dep(0, "descarte", "descartes"),
    ]);
    assert.equal(
      motivo,
      "Comunicación en empresas tiene 24 videos en el feed. Borrar se llevaría esa historia; apagar hace lo mismo sin perderla.",
    );
  });

  it("enumera varias dependencias con «y», no con coma final", () => {
    const motivo = motivoParaNoBorrar("Comunicación de parejas", [
      dep(54, "video en el feed", "videos en el feed"),
      dep(6, "descarte", "descartes"),
    ]);
    assert.match(motivo ?? "", /tiene 54 videos en el feed y 6 descartes\./);
  });

  it("con tres o más, separa por coma y cierra con «y»", () => {
    const motivo = motivoParaNoBorrar("Voz X", [
      dep(2, "proyecto", "proyectos"),
      dep(78, "video en el feed", "videos en el feed"),
      dep(3, "descarte", "descartes"),
    ]);
    assert.match(motivo ?? "", /tiene 2 proyectos, 78 videos en el feed y 3 descartes\./);
  });

  // El singular importa: "1 videos en el feed" es exactamente el detalle que hace que una pantalla
  // se lea como generada por una máquina, y esta frase la lee el equipo de redes.
  it("usa el singular cuando hay uno solo", () => {
    const motivo = motivoParaNoBorrar("Storytelling", [dep(1, "video en el feed", "videos en el feed")]);
    assert.match(motivo ?? "", /tiene 1 video en el feed\./);
  });

  // La frase sirve para una voz y para un proyecto sin conjugar el pronombre: no dice "borrarlo"
  // ni "borrarla". Si alguien la reescribe con género, esto lo agarra.
  it("no asume el género del registro", () => {
    const motivo = motivoParaNoBorrar("Voz X", [dep(1, "proyecto", "proyectos")]) ?? "";
    assert.ok(!/borrarl[oa]/i.test(motivo), motivo);
  });
});
