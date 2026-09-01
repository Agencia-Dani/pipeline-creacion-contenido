// Dominio puro: los guiones de una colección → un archivo `.docx` de verdad. Sin IO, sin dependencias.
//
// Existe por la Fase 5 del plan de colecciones, y **reusa el contenedor de ADR-071**: un `.docx` es
// el mismo ZIP store que un `.xlsx` con otro XML adentro. Por eso esto son ~100 líneas y no una
// librería: el contenedor ya estaba escrito y probado (`domain/zip.ts`).
//
// 🔑 **Por qué Word y no Excel.** Majo pidió *"bajar un documento con los guiones"* para dejar de
// copiar y pegar uno por uno. Un guion es prosa de 1000+ caracteres: en una celda de Excel se lee
// mal y en Word se lee como lo que es. Los dos export de Históricos siguen siendo `.xlsx` y no se
// tocan — ese archivo es una tabla y tiene otro consumidor (ADR-071).
//
// 🧱 **Sin `styles.xml`, a propósito.** El formato se aplica directo en cada corrida
// (`<w:b/>`, `<w:sz/>`) en vez de referenciar estilos con nombre. Un `w:pStyle` que apunta a un
// estilo que el paquete no define queda a merced de lo que el lector decida; el formato directo se
// ve igual en Word, en Google Docs y en Pages. Son dos archivos menos y una cosa menos que sincronizar.

import { escaparXml, zip } from "./zip.ts";

/** Un guion, tal como se baja. Lo arma quien lee la base; acá no se consulta nada. */
export type GuionParaDocumento = {
  titulo: string | null;
  referente: string | null;
  url: string;
  /** El texto que se baja. `null` cuando el sistema no tiene guion de ese video. */
  texto: string | null;
  /** Si `texto` es el guion limpio (ADR-074) o el crudo. Se dice en el documento. */
  limpio: boolean;
};

type Corrida = { texto: string; negrita?: boolean; italica?: boolean; tamano?: number };

/** Media-puntos, que es la unidad de `w:sz`. 24 = 12pt, el cuerpo. */
const CUERPO = 24;
const TITULO = 32;

function parrafo(corridas: readonly Corrida[], espacioAntes = 0): string {
  const props = espacioAntes > 0 ? `<w:pPr><w:spacing w:before="${espacioAntes}"/></w:pPr>` : "";
  const contenido = corridas
    .map((c) => {
      const rPr =
        `<w:rPr>` +
        (c.negrita ? "<w:b/>" : "") +
        (c.italica ? "<w:i/>" : "") +
        `<w:sz w:val="${c.tamano ?? CUERPO}"/>` +
        `</w:rPr>`;
      // `xml:space="preserve"` o Word come los espacios de los bordes.
      return `<w:r>${rPr}<w:t xml:space="preserve">${escaparXml(c.texto)}</w:t></w:r>`;
    })
    .join("");
  return `<w:p>${props}${contenido}</w:p>`;
}

/**
 * Los párrafos del documento de una colección.
 *
 * 🔑 **Cada guion dice si es el limpio o el crudo, y eso no es decoración.** Es ADR-074 llevado al
 * archivo: los dos artefactos conviven, y quien graba tiene que saber cuál está leyendo. Un
 * documento que no lo dice deja al equipo adivinando por el estilo del texto.
 *
 * Un video sin guion **entra igual**, diciendo que no lo tiene. Sacarlo del documento haría que la
 * cuenta no cierre contra lo que se ve en pantalla, y el equipo lo leería como un archivo incompleto.
 */
export function documentoDeGuiones(
  nombre: string,
  guiones: readonly GuionParaDocumento[],
): string[] {
  const parrafos = [
    parrafo([{ texto: nombre, negrita: true, tamano: TITULO }]),
    parrafo([
      {
        texto: `${guiones.length} ${guiones.length === 1 ? "video" : "videos"}`,
        italica: true,
      },
    ]),
  ];

  // 🔢 **Numerados, y con el número escrito en el texto** (pedido de Mani el 21/08, mirando el
  // primer archivo). No una lista de Word (`numPr`): eso pide `numbering.xml` con su definición de
  // niveles, o sea dos partes más en el paquete y una cosa más que un lector puede interpretar
  // distinto. Acá el número es parte del título, así que se ve igual en Word, en Docs y en Pages, y
  // sobrevive a copiar y pegar el documento en cualquier lado.
  guiones.forEach((g, i) => {
    parrafos.push(
      parrafo([{ texto: `${i + 1}. ${g.titulo ?? "Sin título"}`, negrita: true, tamano: 28 }], 360),
    );
    parrafos.push(
      parrafo([{ texto: [g.referente ?? "sin referente", g.url].join(" · "), italica: true }]),
    );

    if (g.texto === null) {
      parrafos.push(
        parrafo([
          {
            texto: "El sistema no tiene el guion de este video (se cargó a mano y nunca se transcribió).",
            italica: true,
          },
        ]),
      );
      return;
    }

    parrafos.push(
      parrafo([{ texto: g.limpio ? "Guion limpio" : "Guion original, sin limpiar", italica: true }]),
    );
    // Un párrafo por línea: en Word un salto de línea dentro de un `<w:t>` no existe, y meter todo
    // en uno solo devolvería el texto como un bloque corrido.
    for (const linea of g.texto.split("\n")) parrafos.push(parrafo([{ texto: linea }]));
  });

  return parrafos;
}

/** Párrafos → los bytes de un `.docx` con un solo documento. */
export function aDocx(parrafos: readonly string[]): Uint8Array<ArrayBuffer> {
  return zip([
    {
      nombre: "[Content_Types].xml",
      contenido:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
        `</Types>`,
    },
    {
      nombre: "_rels/.rels",
      contenido:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
        `</Relationships>`,
    },
    {
      nombre: "word/document.xml",
      contenido:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
        `<w:body>${parrafos.join("")}</w:body>` +
        `</w:document>`,
    },
  ]);
}

/** El MIME de un `.docx`. Vive acá para que no se escriba a mano en cada `Blob`. */
export const TIPO_DOCX =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
