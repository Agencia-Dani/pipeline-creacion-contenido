import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { aDocx, documentoDeGuiones, type GuionParaDocumento, TIPO_DOCX } from "./docx.ts";
import { leerZip } from "./zip.test-util.ts";

// Los tests del `.docx` (Fase 5 de colecciones).
//
// 🔑 **Mismo criterio que los del `.xlsx`: el modo de falla es binario.** Word abre el archivo o no
// lo abre; no hay "se ve un poco mal". Por eso estos leen el ZIP de verdad en vez de mirar strings.
// Lo que ningún test cierra es que Word acepte el XML de adentro: eso es abrirlo con los ojos.

const doc = (bytes: Uint8Array) => leerZip(bytes).get("word/document.xml") ?? "";

const guion = (over: Partial<GuionParaDocumento> = {}): GuionParaDocumento => ({
  titulo: "Cómo pedir feedback",
  referente: "@jefferson_fisher",
  url: "https://www.instagram.com/p/ABC/",
  texto: "Primera línea.\nSegunda línea.",
  limpio: true,
  ...over,
});

describe("aDocx", () => {
  test("arma un ZIP con las tres partes que Word exige", () => {
    const archivos = leerZip(aDocx(documentoDeGuiones("Semana 1", [guion()])));
    assert.deepEqual(
      [...archivos.keys()].sort(),
      ["[Content_Types].xml", "_rels/.rels", "word/document.xml"],
    );
  });

  test("el MIME es el de un .docx y no el de un .xlsx", () => {
    assert.match(TIPO_DOCX, /wordprocessingml\.document$/);
  });

  test("escapa el XML: un título con & o < no rompe el documento", () => {
    const xml = doc(aDocx(documentoDeGuiones("Ideas & <notas>", [])));
    assert.ok(xml.includes("Ideas &amp; &lt;notas&gt;"));
    assert.ok(!xml.includes("<notas>"), "el < crudo dejaría el XML mal formado");
  });

  // 🩸 Los guiones vienen de transcripción automática, o sea de texto que nadie revisó. Un solo byte
  // de control vuelve el paquete ilegible: el lector no lo muestra mal, se niega a abrirlo.
  test("saca los caracteres de control que XML 1.0 prohíbe", () => {
    const xml = doc(aDocx(documentoDeGuiones("C", [guion({ texto: "hola\u0007mundo" })])));
    assert.ok(xml.includes("holamundo"));
    assert.ok(!xml.includes("\u0007"));
  });
});

describe("documentoDeGuiones", () => {
  test("cada salto de línea es un párrafo: en Word no existe el salto dentro de un <w:t>", () => {
    const xml = doc(aDocx(documentoDeGuiones("C", [guion()])));
    assert.ok(xml.includes("Primera línea."));
    assert.ok(xml.includes("Segunda línea."));
    assert.ok(!xml.includes("Primera línea.\nSegunda"), "quedaron en el mismo párrafo");
  });

  // ADR-074 llevado al archivo: los dos artefactos conviven, así que el documento tiene que decir
  // cuál de los dos está leyendo quien graba.
  test("dice si el guion es el limpio o el crudo", () => {
    assert.ok(doc(aDocx(documentoDeGuiones("C", [guion()]))).includes("Guion limpio"));
    assert.ok(
      doc(aDocx(documentoDeGuiones("C", [guion({ limpio: false })]))).includes(
        "Guion original, sin limpiar",
      ),
    );
  });

  // Sacarlo del documento haría que la cuenta no cierre contra lo que se ve en pantalla, y el
  // equipo lo leería como un archivo incompleto.
  test("un video sin guion entra igual, diciendo que no lo tiene", () => {
    const xml = doc(aDocx(documentoDeGuiones("C", [guion({ texto: null })])));
    assert.ok(xml.includes("no tiene el guion de este video"));
    assert.ok(xml.includes("https://www.instagram.com/p/ABC/"), "la url sigue estando");
  });

  test("sin título dice que no lo tiene, nunca la url disfrazada (ADR-072)", () => {
    const xml = doc(aDocx(documentoDeGuiones("C", [guion({ titulo: null, referente: null })])));
    assert.ok(xml.includes("Sin título"));
    assert.ok(xml.includes("sin referente"));
  });

  test("una colección vacía sigue siendo un documento válido", () => {
    const xml = doc(aDocx(documentoDeGuiones("Vacía", [])));
    assert.ok(xml.includes("0 videos"));
    assert.ok(xml.includes("</w:body>"));
  });
});
