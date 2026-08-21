"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Copiar } from "@/components/ui/copiar";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { AgregarAColeccion } from "@/components/video/agregar-a-coleccion";
import { GrillaVideos, GrupoPlegable } from "@/components/video/grupos";
import { BarraSeleccion, BotonSeleccionar, usarSeleccion } from "@/components/video/seleccion";
import { TarjetaVideo } from "@/components/video/tarjeta";
import { agrupar, SIN_PROYECTO } from "@/domain/feed";
import { fusionar, type ParteVideo, type Video } from "@/domain/video";
import { aXlsx, TIPO_XLSX } from "@/domain/xlsx";
import { parsearEnlaces } from "@/domain/enlace";
import {
  armarRegistro,
  fechaDeFila,
  contarRegistro,
  contarRevision,
  filtrarRegistro,
  FILTROS_REGISTRO,
  loQueFaltaMarcar,
  revisarContraRegistro,
  type EstadoRevision,
  type FilaRegistro,
  type FiltroRegistro,
  type LinkRevisado,
  type MarcaGrabado,
} from "@/domain/grabados";
import { fecha } from "@/lib/fechas";
import type { Historico } from "@/lib/historicos";
import { miles } from "@/lib/utils";
import { usarCockpit } from "../../usar-cockpit";
import {
  exportar,
  marcarGrabado,
  marcarMuchosComoGrabados,
  verGuion,
  vistosPorElMotor,
} from "./actions";

// El histórico, que desde ADR-070 dejó de ser un archivo de solo lectura y pasa a ser **el tablero**:
// qué guiones tenemos y cuáles ya usamos.
//
// 🔑 **Una sola pantalla y no dos.** El universo del registro son los mismos 183 guiones que el
// histórico ya mostraba, más los links que el equipo cargue a mano. Una pantalla aparte habría
// listado casi lo mismo y obligado al equipo a aprender cuál mirar — que es exactamente lo que el
// pedido original decía que no quería.
//
// 🖼️ **Y desde ADR-072 tiene miniatura, con una salvedad.** El thumbnail nunca se archivó (el
// `metadata` de `outputs` tiene 19 claves y ninguna es la foto), así que la única fuente es
// `app.videos_meta`: lo que se le compró a Apify al agrupar un video en una colección. Un guion
// que nadie agrupó se sigue viendo sin foto, y la tarjeta ya sabe dibujar eso sin mentir.

const fechaDe = (iso: string | null) => (iso ? fecha(iso, true) : "—");

const ETIQUETA_FILTRO: Record<FiltroRegistro, string> = {
  "sin-grabar": "Sin grabar",
  grabados: "Grabados",
  todos: "Todos",
};

const ETIQUETA_ORIGEN: Record<Historico["origen"], string> = {
  feed: "Del Feed",
  transcribir: "De Transcribir",
};

// Cada estado manda a una acción distinta, así que se nombra por lo que el equipo tiene que hacer
// con él, no por dónde está guardado.
const ETIQUETA_REVISION: Record<EstadoRevision, string> = {
  grabado: "✓ Ya lo grabaron",
  "con-guion": "Está acá, sin grabar",
  "visto-por-el-motor": "Lo vio el motor, sin guion",
  nuevo: "No está en la herramienta",
};

export function Lista({
  guiones,
  marcasIniciales,
  metas,
  truncado,
}: {
  guiones: Historico[];
  marcasIniciales: MarcaGrabado[];
  /**
   * Lo comprado a Apify (`app.videos_meta`). Es lo único que aporta **miniatura**, y para una
   * huérfana —un link cargado a mano— también el título y el referente, que no tiene de ningún
   * otro lado.
   */
  metas: ParteVideo[];
  truncado: boolean;
}) {
  const cockpit = usarCockpit();
  // 🩸 **Las marcas viven en el cliente y son la fuente de verdad de lo que se ve** — mismo patrón
  // que `grabado` en `fila.tsx` de Transcribir, y por el mismo bug del 18/08: `revalidatePath`
  // re-renderiza server components, pero estas tarjetas se filtran y se cuentan en el cliente. Sin
  // estado local, marcar escribiría bien en la base y la pantalla no acusaría recibo — que se lee
  // igual que un botón roto, y el operador vuelve a apretarlo (acá eso es DESMARCAR sin querer).
  const [marcas, setMarcas] = useState(() => new Map(marcasIniciales.map((m) => [m.clave, m])));
  const [filtro, setFiltro] = useState<FiltroRegistro>("todos");
  /** Qué proyectos están cerrados. Vacío = todos abiertos, que es la pantalla de hoy. */
  const [plegados, setPlegados] = useState<ReadonlySet<string>>(new Set());
  const [abiertoId, setAbiertoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const seleccion = usarSeleccion();
  const [bajando, startBajar] = useTransition();

  const registro = useMemo(() => armarRegistro(guiones, marcas), [guiones, marcas]);
  const cuentas = useMemo(() => contarRegistro(registro), [registro]);
  const visibles = useMemo(() => filtrarRegistro(registro, filtro), [registro, filtro]);

  /**
   * Lo que se sabe de cada video, por clave.
   *
   * Se arma con `fusionar` (ADR-072) y no a mano: el orden del arreglo **es** la precedencia, y es
   * el mismo que usa `lib/videos.ts` — primero lo comprado, después el archivo. Fusionar campo a
   * campo importa acá más que en ningún lado: `outputs` tiene título y referente y **nunca**
   * miniatura, `videos_meta` tiene miniatura. Y `fusionar` es quien descarta las urls disfrazadas
   * de título (las 129 filas de `transcripcion_a_pedido`), que es justo lo que esta pantalla
   * dibujaba como si fuera un nombre.
   */
  const videos = useMemo(() => {
    const partes: ParteVideo[] = [...metas];
    for (const f of registro) {
      const url = f.tipo === "huerfana" ? f.marca.url : f.guion.urlReferente;
      const { validos } = parsearEnlaces(url ?? "");
      if (validos.length !== 1) continue;
      const id = { plataforma: validos[0].plataforma, external_id: validos[0].external_id };
      partes.push(
        f.tipo === "huerfana"
          ? { ...id, url: validos[0].url }
          : {
              ...id,
              url: validos[0].url,
              titulo: f.guion.titulo,
              referente: f.guion.referente,
              views: f.guion.views,
              likes: f.guion.likes,
              seguidores: f.guion.seguidores,
              idioma: f.guion.idioma,
              heat: f.guion.heat,
            },
      );
    }
    return new Map(fusionar(partes).map((v) => [v.clave, v]));
  }, [metas, registro]);

  /**
   * Las filas visibles, agrupadas por proyecto.
   *
   * 🔑 **`agrupar()` se reusa tal cual** (`domain/feed.ts`), y lo que se le pide es el criterio:
   * grupos por nombre y `(sin proyecto)` último, *"un dato roto, no una categoría"*.
   *
   * 🩸 **Pero el orden de adentro se restaura por fecha, y eso no es capricho.** `agrupar` ordena
   * por heat descendente, que es lo correcto en el Feed y ruido acá: medido contra prod el
   * 2026-08-21, de las 301 filas de `outputs` **las 172 del Feed traen heat y proyecto y las 129 de
   * Transcribir no traen ninguno de los dos**. O sea que en `(sin proyecto)` —donde caen esas 129 y
   * las ~291 huérfanas— el heat es `null` en todas y el desempate termina siendo el uuid, que es un
   * orden sin significado. El histórico se lee por lo último que pasó, que es como venía ordenado.
   */
  const grupos = useMemo(() => {
    const items = visibles.map((fila) => ({
      id: fila.tipo === "huerfana" ? fila.marca.clave : fila.guion.id,
      proyecto: (fila.tipo === "huerfana" ? null : fila.guion.proyecto) ?? "",
      heat: null,
      fila,
    }));
    return agrupar(items).map((g) => ({
      ...g,
      candidatos: [...g.candidatos].sort((a, b) =>
        fechaDeFila(b.fila).localeCompare(fechaDeFila(a.fila)),
      ),
    }));
  }, [visibles]);

  /**
   * `id de fila → url del video`, para el modo selección.
   *
   * Se arma acá y no en la tarjeta porque la barra de abajo no tiene las filas a la vista: recibe
   * las claves marcadas y nada más. Sale de `visibles` —lo que el filtro está mostrando— así que una
   * clave marcada siempre tiene su url mientras la tarjeta esté en pantalla.
   */
  const urlPorId = useMemo(() => {
    const m = new Map<string, string>();
    for (const fila of visibles) {
      const id = fila.tipo === "huerfana" ? fila.marca.clave : fila.guion.id;
      const url = fila.tipo === "huerfana" ? fila.marca.url : fila.guion.urlReferente;
      if (url) m.set(id, url);
    }
    return m;
  }, [visibles]);

  /** Optimista: se pinta ya y se revierte si el server dice que no. */
  function alternar(fila: Extract<FilaRegistro<Historico>, { tipo: "guion" }>) {
    if (fila.clave === null) return;
    const quiero = fila.grabadoEn === null;
    const enlace = enlaceDe(fila);
    if (!enlace) return;

    const antes = marcas;
    setMarcas((m) => {
      const copia = new Map(m);
      if (quiero)
        copia.set(enlace.clave, {
          clave: enlace.clave,
          url: enlace.url,
          grabadoEn: new Date().toISOString(),
        });
      else copia.delete(enlace.clave);
      return copia;
    });
    setError(null);

    void marcarGrabado(cockpit, enlace.enlace, quiero).then((r) => {
      if (!r.ok) {
        setMarcas(antes);
        setError(r.mensaje);
      }
    });
  }

  function bajar(soloGrabados: boolean) {
    setError(null);
    setAviso(null);
    startBajar(async () => {
      const r = await exportar(cockpit, soloGrabados);
      if (!r.ok) {
        setError(r.mensaje);
        return;
      }
      // 📦 El archivo se arma ACÁ (ADR-071): el server manda filas y `aXlsx` las vuelve un `.xlsx`
      // de verdad. Sin encoding que adivinar ni separador que negociar — que es exactamente lo que
      // rompía al CSV, cuyos bytes UTF-16LE se veían con una línea vacía entre filas en cualquier
      // lector que no fuera el Excel de región CO.
      const url = URL.createObjectURL(
        new Blob([aXlsx(r.encabezados, r.filas, soloGrabados ? "Grabados" : "Histórico")], {
          type: TIPO_XLSX,
        }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = r.nombre;
      a.click();
      URL.revokeObjectURL(url);

      if (r.truncado) {
        setAviso(`El archivo trae las ${r.filas.length} más recientes. Hay más histórico del que entra en una descarga.`);
      }
    });
  }

  // 🩸 Busca en el registro ENTERO y no en `visibles`, y no es un detalle: desde la revisión se
  // puede abrir un guion que el filtro de arriba está escondiendo (revisás un link, el chip está en
  // «Grabados» y ese guion todavía no lo está). Contra `visibles`, el botón «Ver el guion» no haría
  // nada — un botón que a veces funciona es peor que uno que no está.
  const abierto =
    registro.find((f) =>
      f.tipo === "guion" ? f.guion.id === abiertoId : f.marca.clave === abiertoId,
    ) ?? null;

  return (
    <div className="space-y-4">
      <RevisarYMarcar
        registro={registro}
        onAbrirGuion={setAbiertoId}
        onMarcado={(nuevas) =>
          setMarcas((m) => {
            const copia = new Map(m);
            for (const marca of nuevas) copia.set(marca.clave, marca);
            return copia;
          })
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {FILTROS_REGISTRO.map((f) => (
            <Button
              key={f}
              size="sm"
              variant={filtro === f ? "default" : "outline"}
              onClick={() => setFiltro(f)}
            >
              {ETIQUETA_FILTRO[f]} ({cuentas[f]})
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <BotonSeleccionar seleccion={seleccion} />
          <Button variant="outline" size="sm" onClick={() => bajar(false)} disabled={bajando}>
            {bajando ? "Preparando…" : "Descargar todo (Excel)"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => bajar(true)}
            disabled={bajando || cuentas.grabados === 0}
          >
            Descargar solo grabados (Excel)
          </Button>
        </div>
      </div>

      {truncado && (
        <p className="text-sm text-muted-foreground">
          Mostrando las más recientes: hay más histórico del que entra en una pantalla.
        </p>
      )}

      <div className="space-y-6">
        {grupos.map((g) => (
          <GrupoPlegable
            key={g.proyecto}
            titulo={g.proyecto}
            conteo={g.candidatos.length}
            plegado={plegados.has(g.proyecto)}
            onAlternar={() =>
              setPlegados((p) => {
                const copia = new Set(p);
                if (!copia.delete(g.proyecto)) copia.add(g.proyecto);
                return copia;
              })
            }
          >
            <GrillaVideos>
              {g.candidatos.map(({ id, fila }) => (
                <TarjetaHistorico
                  key={id}
                  fila={fila}
                  video={videos.get(fila.tipo === "huerfana" ? fila.marca.clave : (fila.clave ?? ""))}
                  onAbrir={() => setAbiertoId(id)}
                  onAlternar={() => fila.tipo === "guion" && alternar(fila)}
                  seleccion={
                    seleccion.activo
                      ? { marcado: seleccion.marcado(id), onAlternar: () => seleccion.alternar(id) }
                      : undefined
                  }
                />
              ))}
            </GrillaVideos>
          </GrupoPlegable>
        ))}
      </div>

      <BarraSeleccion seleccion={seleccion}>
        <AgregarAColeccion
          seleccion={seleccion}
          urlPorClave={(id) => urlPorId.get(id) ?? null}
          onListo={setAviso}
        />
      </BarraSeleccion>

      {visibles.length === 0 && (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          {filtro === "grabados"
            ? "Todavía nadie marcó ningún guion como grabado."
            : "No quedó ninguno sin grabar."}
        </p>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
      {aviso && <p className="text-sm text-muted-foreground">{aviso}</p>}

      <Detalle fila={abierto} video={abierto && videos.get(claveDeFila(abierto))} onCerrar={() => setAbiertoId(null)} />
    </div>
  );
}

/** La clave, la URL y el enlace de una fila con guion. `null` si su URL no se puede interpretar. */
function enlaceDe(fila: Extract<FilaRegistro<Historico>, { tipo: "guion" }>) {
  const url = fila.guion.urlReferente;
  if (!url) return null;
  const { validos } = parsearEnlaces(url);
  if (validos.length !== 1) return null;
  return { clave: fila.clave as string, url: validos[0].url, enlace: validos[0] };
}

/** La clave de video de una fila, que es con lo que se busca su metadata. */
function claveDeFila(fila: FilaRegistro<Historico>): string {
  return fila.tipo === "huerfana" ? fila.marca.clave : (fila.clave ?? "");
}

/**
 * Una fila del registro como tarjeta estándar (ADR-072).
 *
 * 🔑 **Las huérfanas entran por la misma puerta, y eso es lo que 2c cambió.** Hasta acá se dibujaban
 * distinto a propósito, con el argumento de que pintarlas como una tarjeta vacía diría que hay un
 * texto que no existe. El argumento sigue siendo válido y la tarjeta estándar lo respeta sola: sin
 * título dice *"sin título"*, sin miniatura dibuja la inicial. **Lo que falta se dibuja como falta**,
 * así que ya no hace falta una segunda forma de tarjeta para decir lo mismo.
 */
function TarjetaHistorico({
  fila,
  video,
  onAbrir,
  onAlternar,
  seleccion,
}: {
  fila: FilaRegistro<Historico>;
  /** Lo que se sabe del video. `undefined` si su url no se pudo interpretar. */
  video: Video | undefined;
  onAbrir: () => void;
  onAlternar: () => void;
  seleccion?: { marcado: boolean; onAlternar: () => void };
}) {
  const h = fila.tipo === "guion" ? fila.guion : null;
  const grabado = fila.tipo === "huerfana" || fila.grabadoEn !== null;
  const url = h ? h.urlReferente : fila.tipo === "huerfana" ? fila.marca.url : null;

  return (
    <TarjetaVideo
      video={{
        titulo: video?.titulo ?? null,
        referente: video?.referente ?? null,
        thumbnail: video?.thumbnail ?? null,
      }}
      badge={h?.calificacion ?? undefined}
      subtitulo={
        h ? (
          <>
            {video?.referente ?? "sin referente"}
            {` · ${fechaDe(h.calificadoEn)}`}
          </>
        ) : (
          `marcado el ${fechaDe(fila.tipo === "huerfana" ? fila.marca.grabadoEn : null)}`
        )
      }
      onAbrir={onAbrir}
      seleccion={seleccion}
      pie={
        <div className="flex w-full flex-wrap items-center gap-1.5">
          {/* 🎨 El badge va en `default` (color de acento) y NO en `secondary`: es la lección del
              18/08 en Transcribir, donde la marca quedó como una segunda pastilla gris idéntica a la
              de al lado — presente en el DOM e invisible para el ojo. **El estado se muestra fuerte,
              la acción se ofrece callada.** */}
          {grabado && <Badge>✓ Grabado</Badge>}
          <Badge variant="outline">{h ? ETIQUETA_ORIGEN[h.origen] : "Cargado a mano"}</Badge>
          {h &&
            (fila.tipo === "guion" && fila.clave === null ? (
              <span className="text-xs text-muted-foreground">Sin link: no se puede marcar.</span>
            ) : (
              <Button variant={grabado ? "ghost" : "outline"} size="sm" onClick={onAlternar}>
                {grabado ? "Sacar la marca" : "Marcar como grabado"}
              </Button>
            ))}
          {!h && url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground underline underline-offset-4"
            >
              ver el video ↗
            </a>
          )}
        </div>
      }
    />
  );
}

/**
 * Revisar una lista de links, y marcarlos si corresponde.
 *
 * 🩸 **Dos arreglos de un reporte de Mani (2026-08-20), y los dos son de forma, no de lógica:**
 *
 * 1. **El resultado se dibuja ACÁ ADENTRO, pegado al botón.** Antes se escribía en un `<p>` que vive
 *    después de la grilla, o sea **183 tarjetas más abajo** del botón que lo disparó: el equipo
 *    apretaba y no pasaba nada visible. Un acto sin acuse de recibo se lee igual que uno roto.
 * 2. **Se desglosa caso por caso** en vez de una línea. "3 marcados" no dice si tenían guion o
 *    quedaron cargados a mano, que son dos resultados distintos y llevan a acciones distintas.
 *
 * 🔑 **Y revisar dejó de exigir Transcribir.** Preguntar *"¿este link ya está?"* obligaba a usar el
 * cuadro de Transcribir, que está **a un clic de pagarle a Supadata**. Preguntar y comprar no pueden
 * ser el mismo gesto. Por eso *Revisar* es la acción principal acá y no escribe nada: el cruce sale
 * de los guiones y las marcas que la pantalla YA tiene en memoria, así que es instantáneo y gratis.
 */
function RevisarYMarcar({
  registro,
  onAbrirGuion,
  onMarcado,
}: {
  registro: FilaRegistro<Historico>[];
  onAbrirGuion: (id: string) => void;
  onMarcado: (nuevas: MarcaGrabado[]) => void;
}) {
  const cockpit = usarCockpit();
  const [texto, setTexto] = useState("");
  const [revisados, setRevisados] = useState<LinkRevisado<Historico>[] | null>(null);
  const [resultado, setResultado] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revisando, startRevisar] = useTransition();
  const [marcando, startMarcar] = useTransition();

  // Se cuenta mientras escriben, antes de tocar el servidor: el equipo ve cuántos entendió la
  // herramienta ANTES de apretar nada.
  const lote = useMemo(() => parsearEnlaces(texto), [texto]);
  const cuentas = revisados ? contarRevision(revisados) : null;
  const faltan = revisados ? loQueFaltaMarcar(revisados) : [];

  // Editar el campo invalida la revisión: mostrar un resultado viejo sobre un texto nuevo es peor
  // que no mostrar nada. Mismo criterio que `pegar-enlaces.tsx` en Transcribir.
  function escribir(v: string) {
    setTexto(v);
    setRevisados(null);
    setResultado(null);
    setError(null);
  }

  function revisar() {
    setError(null);
    setResultado(null);
    startRevisar(async () => {
      // Lo único que va al servidor: la memoria del motor. Lo demás ya está acá.
      const vistos = await vistosPorElMotor(cockpit, lote.validos.map((e) => e.external_id));
      setRevisados(revisarContraRegistro(lote.validos, registro, new Set(vistos)));
    });
  }

  function marcar() {
    setError(null);
    startMarcar(async () => {
      const texto = faltan.map((r) => r.enlace.url).join("\n");
      const r = await marcarMuchosComoGrabados(cockpit, texto);
      if (!r.ok) {
        setError(r.mensaje);
        return;
      }
      const ahora = new Date().toISOString();
      onMarcado(faltan.map((f) => ({ clave: f.clave, url: f.enlace.url, grabadoEn: ahora })));

      // El desglose que faltaba: cuántos cayeron sobre un guion y cuántos quedaron cargados a mano.
      const conGuion = faltan.filter((f) => f.guion !== null).length;
      const sinGuion = faltan.length - conGuion;
      const lineas = [`✅ ${faltan.length} marcados como grabados.`];
      if (conGuion > 0) lineas.push(`   · ${conGuion} ya tenían su guion en la herramienta.`);
      if (sinGuion > 0)
        lineas.push(`   · ${sinGuion} quedaron como «cargado a mano» (no tienen guion acá).`);
      if (cuentas && cuentas.grabado > 0)
        lineas.push(`↩︎ ${cuentas.grabado} ya estaban marcados de antes — no se tocaron.`);
      setResultado(lineas);
      setRevisados(null);
      setTexto("");
    });
  }

  return (
    <details className="rounded-lg border">
      <summary className="cursor-pointer p-4 text-sm font-medium">
        Revisar o marcar una lista de links
      </summary>
      <div className="space-y-3 border-t p-4">
        <p className="text-sm text-muted-foreground">
          Pegá links y la herramienta te dice cuáles ya conoce. Copiá la columna de tu Excel y
          pegala tal cual: uno por línea, separados por comas, o cualquier texto que los tenga
          adentro. <strong>Revisar no cambia nada y no cuesta nada</strong>; marcar tampoco cobra —
          solo deja la marca de que ya los grabaron.
        </p>
        <Textarea
          value={texto}
          onChange={(e) => escribir(e.target.value)}
          rows={5}
          disabled={revisando || marcando}
          placeholder="Pegá acá los links que querés revisar o marcar"
        />

        {texto.trim() !== "" && !revisados && (
          <p className="text-sm text-muted-foreground">
            {lote.validos.length} videos detectados
            {lote.invalidos.length > 0 && ` · ${lote.invalidos.length} links que no sirven`}
          </p>
        )}

        {lote.invalidos.length > 0 && (
          <ul className="space-y-1 text-xs text-muted-foreground">
            {lote.invalidos.slice(0, 5).map((i) => (
              <li key={i.texto}>
                ⚠️ <span className="break-all">{i.texto}</span> — {i.razon}
              </li>
            ))}
          </ul>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        {resultado && (
          <div className="rounded-md border border-primary/40 bg-primary/5 p-3">
            {resultado.map((l) => (
              <p key={l} className="whitespace-pre-wrap text-sm">
                {l}
              </p>
            ))}
          </div>
        )}

        {revisados && cuentas && (
          <div className="space-y-3 rounded-md bg-muted/50 p-3">
            <p className="text-sm font-medium">
              Revisé {revisados.length} {revisados.length === 1 ? "link" : "links"}:
            </p>
            <ul className="space-y-2">
              {revisados.map((r) => (
                <li key={r.clave} className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge variant={r.estado === "grabado" ? "default" : "outline"}>
                    {ETIQUETA_REVISION[r.estado]}
                  </Badge>
                  <span className="break-all text-xs text-muted-foreground">
                    {r.guion?.titulo ?? r.enlace.url}
                  </span>
                  {r.grabadoEn && (
                    <span className="text-xs text-muted-foreground">· {fechaDe(r.grabadoEn)}</span>
                  )}
                  {/* El botón que pidió el equipo: llevame a ese video adentro de la herramienta.
                      Solo existe si hay guion — prometer solo lo que existe. */}
                  {r.guion && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onAbrirGuion(r.guion!.id)}
                    >
                      Ver el guion
                    </Button>
                  )}
                  <a
                    href={r.enlace.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-muted-foreground underline underline-offset-4"
                  >
                    ver el video ↗
                  </a>
                </li>
              ))}
            </ul>
            {cuentas.grabado > 0 && (
              <p className="text-xs text-muted-foreground">
                {cuentas.grabado} ya {cuentas.grabado === 1 ? "está" : "están"} marcado
                {cuentas.grabado === 1 ? "" : "s"} como grabado
                {cuentas.grabado === 1 ? "" : "s"}: no se vuelven a marcar.
              </p>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={revisar}
            disabled={revisando || marcando || lote.validos.length === 0}
          >
            {revisando ? "Revisando…" : `Revisar ${lote.validos.length}`}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={marcar}
            disabled={revisando || marcando || faltan.length === 0}
          >
            {marcando
              ? "Guardando…"
              : revisados
                ? `Marcar ${faltan.length} como grabados`
                : "Marcar como grabados"}
          </Button>
        </div>
        {!revisados && texto.trim() !== "" && (
          <p className="text-xs text-muted-foreground">
            Revisá primero para ver qué va a pasar con cada link.
          </p>
        )}
      </div>
    </details>
  );
}

function Detalle({
  fila,
  video,
  onCerrar,
}: {
  fila: FilaRegistro<Historico> | null;
  video: Video | undefined | null;
  onCerrar: () => void;
}) {
  const h = fila?.tipo === "guion" ? fila.guion : null;
  const huerfana = fila?.tipo === "huerfana" ? fila.marca : null;

  return (
    <Modal
      abierto={fila !== null}
      onCerrar={onCerrar}
      titulo={h?.titulo ?? video?.titulo ?? huerfana?.url ?? ""}
      subtitulo={
        h ? (
          <>
            {h.proyecto ?? SIN_PROYECTO}
            {h.voz && ` · ${h.voz}`}
            {` · aprobado el ${fechaDe(h.calificadoEn)}`}
            {fila?.tipo === "guion" && fila.grabadoEn && ` · grabado el ${fechaDe(fila.grabadoEn)}`}
          </>
        ) : (
          huerfana && `Cargado a mano · marcado el ${fechaDe(huerfana.grabadoEn)}`
        )
      }
    >
      {/* `key` para que el contenido se remonte por fila: así el efecto que trae el guion corre una
          vez por apertura y no hay que resetear nada a mano. Mismo patrón que el detalle del feed. */}
      {fila?.tipo === "guion" && h && <Contenido key={h.id} fila={fila} />}

      {/* Una huérfana NUNCA tuvo guion: se grabó por fuera de la herramienta. No hay nada que
          reintentar, así que se dice y no se ofrece un botón que pierde siempre. */}
      {huerfana && (
        <div className="space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge>✓ Grabado</Badge>
            <Badge variant="outline">Cargado a mano</Badge>
            <a
              href={huerfana.url}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4"
            >
              ver el video ↗
            </a>
          </div>
          <p className="text-muted-foreground">
            Sin guion en la herramienta. Si lo querés, pegalo en Transcribir.
          </p>
        </div>
      )}
    </Modal>
  );
}

function Contenido({ fila }: { fila: Extract<FilaRegistro<Historico>, { tipo: "guion" }> }) {
  const h = fila.guion;
  const cockpit = usarCockpit();
  const [script, setScript] = useState<string | null>(null);
  const [errorScript, setErrorScript] = useState<string | null>(null);
  const [trayendo, setTrayendo] = useState(true);

  // El guion baja al abrir, no con la lista (ADR-070): es el otro lado de haber sacado el campo
  // gordo de la query. `vivo` cubre el cierre rápido — sin él, una respuesta que llega tarde
  // escribiría estado de un modal ya desmontado.
  useEffect(() => {
    let vivo = true;
    verGuion(cockpit, h.id).then((r) => {
      if (!vivo) return;
      if (r.ok) setScript(r.script);
      else setErrorScript(r.mensaje);
      setTrayendo(false);
    });
    return () => {
      vivo = false;
    };
  }, [cockpit, h.id]);

  return (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {fila.grabadoEn && <Badge>✓ Grabado</Badge>}
            <Badge variant="outline">{ETIQUETA_ORIGEN[h.origen]}</Badge>
            {h.calificacion && <Badge variant="secondary">{h.calificacion}</Badge>}
            {h.heat !== null && <Badge variant="outline">heat {h.heat.toFixed(2)}</Badge>}
            {h.relevanciaScore !== null && (
              <Badge variant="outline">relevancia {h.relevanciaScore.toFixed(2)}</Badge>
            )}
            {h.views !== null && <span className="text-muted-foreground">{miles(h.views)} vistas</span>}
            {h.likes !== null && <span className="text-muted-foreground">{miles(h.likes)} likes</span>}
            {h.urlReferente && (
              <a
                href={h.urlReferente}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-4"
              >
                ver el video ↗
              </a>
            )}
          </div>

          {h.notas && (
            <div className="rounded-md bg-muted/50 p-3">
              <p className="mb-1 text-xs font-medium text-muted-foreground">Notas del equipo</p>
              {/* `whitespace-pre-wrap` respeta los saltos que escribió el equipo; `break-words`
                  evita que una URL larga desborde la caja. Igual que el guion, más abajo. */}
              <p className="whitespace-pre-wrap break-words text-sm">{h.notas}</p>
            </div>
          )}

          {h.relevanciaRazon && (
            <div className="rounded-md bg-muted/50 p-3">
              <p className="mb-1 text-xs font-medium text-muted-foreground">Por qué pasó el filtro</p>
              <p className="text-sm">{h.relevanciaRazon}</p>
            </div>
          )}

          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-muted-foreground">
                Lo que se dice en el video (transcripción literal)
              </p>
              {script && <Copiar texto={script} etiqueta="Copiar guion" />}
            </div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed">
              {trayendo
                ? "Trayendo el guion…"
                : (errorScript ?? script ?? "Sin transcripción.")}
            </p>
          </div>
        </>
  );
}
