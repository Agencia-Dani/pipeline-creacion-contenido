"use server";

import { aCsv } from "@/domain/csv";
import { comoRuta, type CockpitEnRuta } from "@/domain/rutas";
import { exigirTenant } from "@/lib/auth";
import { leerAprobados, leerTodosLosAprobados, type Historico } from "@/lib/historicos";

// Una página más del histórico. Solo lectura: acá no se edita nada — lo aprobado ya se archivó
// y su verdad vive en `outputs` (ADR-014).

// 🩸 **Por qué estas acciones reciben `enRuta`** (2026-08-06). Una server action no recibe los
// `params` de la ruta, así que llamaban `exigirTenant(zona)` a secas y el cockpit se resolvía por
// el default de `resolverContexto`: *el primero que alcance*. Con una sola instancia activa eso
// acertaba siempre; desde que entraron las 3 de LinkedIn (03/08) el primero pasó a ser
// `30x/linkedin`, y para todo `es_dueno` cada acción escribía en el tenant equivocado, sin error.
// El cockpit viaja desde el cliente (`usarCockpit()`, que lo lee de la URL) y **no es un permiso**:
// `exigirTenant` lo valida contra las instancias visibles. El porqué largo está en `lib/auth.ts`.

export async function cargarMas(
  enRuta: CockpitEnRuta,
  pagina: number,
): Promise<{ ok: true; filas: Historico[]; hayMas: boolean } | { ok: false; mensaje: string }> {
  const { ctx } = await exigirTenant("curar", enRuta.cliente, enRuta.pipeline);

  if (!Number.isInteger(pagina) || pagina < 0 || pagina > 500) {
    return { ok: false, mensaje: "Página inválida." };
  }

  try {
    const { filas, hayMas } = await leerAprobados(ctx, pagina);
    return { ok: true, filas, hayMas };
  } catch (e) {
    console.error(`[historicos] falló cargar la página ${pagina}:`, e);
    return { ok: false, mensaje: "No se pudo cargar más. Probá de nuevo." };
  }
}

// Las 15 columnas del Google Sheet Histórico, en su orden, y no es coincidencia: este CSV **es**
// el reemplazo del Sheet (ADR-057), así que quien tenga una planilla armada encima del export
// viejo la puede seguir usando. Salen de `Preparar filas Sheet` del archivado.
//
// `ESTADO` va aunque acá siempre valga `aprobado`: la columna existía en el Sheet, y una columna
// que desaparece rompe la planilla de quien la esté leyendo por posición.
//
// **`ORIGEN` se agrega AL FINAL, y eso no es estética** (ADR-062): las 15 de arriba conservan su
// posición exacta, así que una planilla armada sobre el export viejo —que lee por posición— sigue
// funcionando. Meterla en el medio habría corrido 12 columnas de lugar sin que nadie se entere
// hasta que los números de otro se movieran solos.
const COLUMNAS = [
  "FECHA CALIFICACION", "PROYECTO", "VOZ", "TITULO", "URL ORIGINAL", "SCRIPT", "IDIOMA",
  "VIEWS", "LIKES", "SEGUIDORES", "HEAT SCORE", "CALIFICACION", "ESTADO",
  "RELEVANCIA SCORE", "RELEVANCIA RAZON", "ORIGEN",
] as const;

/**
 * El histórico entero como CSV. Lo que reemplaza al Google Sheet (ADR-057).
 *
 * Devuelve el texto y el cliente lo baja como archivo: no hace falta una route ni un endpoint
 * nuevo, y así el export pasa por **la misma guardia de tenant** que la pantalla, sin una segunda
 * copia de esa lógica que se pueda atrasar.
 */
export async function exportarCsv(enRuta: CockpitEnRuta): Promise<
  { ok: true; csv: string; nombre: string; filas: number; truncado: boolean } | { ok: false; mensaje: string }
> {
  const { ctx, cockpit } = await exigirTenant("curar", enRuta.cliente, enRuta.pipeline);

  try {
    const { filas, truncado } = await leerTodosLosAprobados(ctx);

    const csv = aCsv(
      COLUMNAS,
      filas.map((h) => [
        h.calificadoEn, h.proyecto, h.voz, h.titulo, h.urlReferente, h.script, h.idioma,
        h.views, h.likes, h.seguidores, h.heat, h.calificacion, "aprobado",
        h.relevanciaScore, h.relevanciaRazon, h.origen,
      ]),
    );

    // El nombre lleva empresa, pipeline y fecha: con varios cockpits, dos descargas del mismo día
    // terminarían siendo `historicos.csv` y `historicos (1).csv` en la carpeta de alguien.
    const hoy = new Date().toISOString().slice(0, 10);
    const { cliente, pipeline } = comoRuta(cockpit);
    return {
      ok: true,
      csv,
      nombre: `historico-${cliente}-${pipeline}-${hoy}.csv`,
      filas: filas.length,
      truncado,
    };
  } catch (e) {
    console.error("[historicos] falló el export a CSV:", e);
    return { ok: false, mensaje: "No se pudo generar el archivo. Probá de nuevo." };
  }
}
