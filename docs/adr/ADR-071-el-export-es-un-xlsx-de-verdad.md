# ADR-071 — El export es un `.xlsx` de verdad, no un CSV disfrazado

- **Estado:** aceptada — 2026-08-20. **Enmienda [ADR-057](./ADR-057-el-sheet-historico-por-instancia-o-ninguno.md)**
  (que eligió CSV en UTF-16LE + TAB) y toca el export de [ADR-070](./ADR-070-la-marca-de-grabado-es-por-video.md).
  Sale de un reporte de Mani el mismo día que se entregó el segundo botón de descarga.

## Contexto

ADR-057 midió cuatro combinaciones contra el Excel de región Colombia —el de Majo y Jero, que son
quienes abren el archivo— y **solo una pasaba las dos pruebas**:

| qué se probó | columnas | acentos |
|---|---|---|
| BOM UTF-8 + coma | ❌ todo en la columna A | ✅ |
| BOM UTF-8 + `sep=,` | ✅ | ❌ *M√©tricas* |
| BOM UTF-8 + tab | ❌ todo en la columna A | ✅ |
| **UTF-16LE + tab** | ✅ | ✅ |

La decisión fue correcta para su pregunta y su costo quedó escrito el día uno:

> *"un parser que asuma coma y UTF-8 necesita `encoding='utf-16'` y `sep='\t'`. Hoy no hay ningún
> consumidor máquina; **si aparece, es el momento de discutir un `.xlsx` de verdad**."*

El 2026-08-20 apareció: Mani reportó que el archivo se veía con **una línea vacía entre cada fila**.

### El archivo no estaba roto, y eso es lo que decide el ADR

Antes de tocar nada se midió de dónde salía la línea vacía. **Las dos hipótesis de contenido son
falsas**, medidas sobre los 183 guiones aprobados:

- guiones con salto de línea adentro: **0 de 183**
- guiones con tab adentro: **0 de 183**

O sea que el escapado no tenía nada que arreglar. Lo que produce el síntoma es **el encoding leído
por el lector equivocado**, y se reprodujo con los mismos bytes:

```
como UTF-16LE (Excel región CO):     '"A"\t"B"'   '"1"\t"2"'
como UTF-8 / latin-1 (todo lo demás): 'ÿþ"\x00A\x00"…'   '\x00'   '"\x001\x00"…'   '\x00'
                                                          ^^^^^ ahí está la línea vacía
```

Cada carácter UTF-16LE es `X\0`, así que el `\0` que sigue al `\n` **es** la línea en blanco.

🔑 **La forma del error, que es lo portable: el síntoma no dependía del archivo sino de quién lo
abría.** Un mismo byte stream correcto se ve perfecto en un lector y roto en otro. Por eso no se
arregla escapando mejor, y por eso la pregunta correcta no era *"¿cómo hago un CSV que abra en
todos lados?"* — no existe — sino *"¿por qué seguimos entregando un formato que hay que adivinar?"*.

## Decisión

**Los dos botones bajan un `.xlsx` de verdad.** El CSV desaparece.

### 1. Por qué esto disuelve el problema en vez de moverlo

Un `.xlsx` es un ZIP con XML adentro, y **el XML declara su propio encoding**. No hay separador que
negociar ni charset que adivinar: las cuatro filas de la tabla de ADR-057 dejan de existir como
problema, no ganan una quinta opción por poco. Abre igual en Excel, Numbers, LibreOffice y Google
Sheets, en cualquier región.

### 2. Sin dependencia, y no por ahorrar

Un `.xlsx` mínimo son **cinco XML dentro de un ZIP sin comprimir**. Lo único que no es texto es el
CRC32 y los offsets del contenedor. Traer SheetJS o ExcelJS sería cientos de KB —más una superficie
de actualización— para escribir cinco archivos que no cambian nunca.

`ponytail:` el techo está declarado. Si algún día hace falta **leer** un xlsx, formato condicional,
varias hojas o estilos, la librería gana y `domain/xlsx.ts` se tira. Escribir una hoja plana no es
ese caso.

### 3. El archivo se arma en el cliente, igual que antes

`domain/xlsx.ts` es puro (solo `Uint8Array` y aritmética), así que corre en los dos lados. El server
manda **filas**, el cliente las vuelve bytes y hace el `Blob`. Es la misma forma que ya tenía el CSV
—el server mandaba texto, el cliente el `Blob`— movida un escalón, y mantiene la propiedad que
importa: lo que cruza la red son datos serializables, no un binario en base64.

### 4. Las 17 columnas no se mueven

Mismo orden, mismos nombres, `GRABADO EN` en la Q. Quien tenga una planilla armada sobre el export
la re-apunta al xlsx y sigue leyendo por posición.

### 5. Los números salen como números

Mejora concreta que el CSV no podía dar: `VIEWS`, `LIKES`, `SEGUIDORES`, `HEAT SCORE` y
`RELEVANCIA SCORE` son celdas numéricas. Antes llegaban entrecomilladas y Excel las trataba como
texto, así que no se podían ordenar ni sumar sin convertir la columna a mano.

## Alternativas descartadas

- **Seguir con CSV y arreglar el escapado.** No hay nada que arreglar: 0 de 183 guiones tienen
  saltos o tabs. Habría sido trabajo contra un síntoma cuya causa está en el lector.
- **CSV UTF-8 con BOM + `sep=`.** Es la fila 2 de la tabla y ADR-057 la midió: arregla las columnas
  y **rompe los acentos**, porque al leer la directiva Excel deja de mirar el BOM.
- **Dos descargas, CSV y xlsx.** Dos formatos que mantener y explicar, para que el equipo elija mal
  la mitad de las veces. Si el xlsx abre en todos lados, el CSV no agrega nada.
- **Generar el xlsx en el server y mandarlo en base64.** Infla 33% y obliga a decodificar en el
  cliente igual. Sin ventaja sobre mandar las filas.

## Consecuencias

- **`domain/csv.ts` y su test se borran**: quedaron sin un solo consumidor. La tabla de mediciones de
  ADR-057 sobrevive en este ADR, que es donde ahora explica algo.
- **Un archivo `.xlsx` roto no se ve mal: no abre.** Es un modo de falla binario, al revés del CSV.
  Por eso `domain/xlsx.test.ts` **lee el ZIP de verdad** con `node:zlib` en vez de comparar strings,
  y por eso `xml()` saca los caracteres de control: uno solo y Excel se niega a abrir el archivo
  entero. Los `script` vienen de transcripción automática, o sea de texto que nadie revisó.
- **Pesa más que el CSV comprimido y menos que el CSV en UTF-16**: medido con las 183 filas reales,
  **359 KB**. Se baja una vez.
- ✅ **Verificado end-to-end antes de deployar**: el archivo generado con los 183 guiones de prod
  abre con un lector real de Excel (`openpyxl`), 184 filas × 17 columnas, CRCs válidos, acentos y
  emoji intactos, y `VIEWS`/`HEAT SCORE` llegando como `int`/`float`.
