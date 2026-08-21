"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Copiar } from "@/components/ui/copiar";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { aXlsx, TIPO_XLSX } from "@/domain/xlsx";
import { parsearEnlaces } from "@/domain/enlace";
import {
  armarRegistro,
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
// Sin miniatura: el thumbnail era un attachment de Airtable que muere con el record y nunca se
// archivó. El histórico es texto.

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
  truncado,
}: {
  guiones: Historico[];
  marcasIniciales: MarcaGrabado[];
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
  const [abiertoId, setAbiertoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [bajando, startBajar] = useTransition();

  const registro = useMemo(() => armarRegistro(guiones, marcas), [guiones, marcas]);
  const cuentas = useMemo(() => contarRegistro(registro), [registro]);
  const visibles = useMemo(() => filtrarRegistro(registro, filtro), [registro, filtro]);

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
  const abierto = registro.find((f) => f.tipo === "guion" && f.guion.id === abiertoId) ?? null;

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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visibles.map((f) =>
          f.tipo === "huerfana" ? (
            <Huerfana key={f.marca.clave} marca={f.marca} />
          ) : (
            <Tarjeta
              key={f.guion.id}
              fila={f}
              onAbrir={() => setAbiertoId(f.guion.id)}
              onAlternar={() => alternar(f)}
            />
          ),
        )}
      </div>

      {visibles.length === 0 && (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          {filtro === "grabados"
            ? "Todavía nadie marcó ningún guion como grabado."
            : "No quedó ninguno sin grabar."}
        </p>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
      {aviso && <p className="text-sm text-muted-foreground">{aviso}</p>}

      <Detalle
        fila={abierto?.tipo === "guion" ? abierto : null}
        onCerrar={() => setAbiertoId(null)}
      />
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

function Tarjeta({
  fila,
  onAbrir,
  onAlternar,
}: {
  fila: Extract<FilaRegistro<Historico>, { tipo: "guion" }>;
  onAbrir: () => void;
  onAlternar: () => void;
}) {
  const h = fila.guion;
  const grabado = fila.grabadoEn !== null;

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border bg-card p-3">
      <button type="button" onClick={onAbrir} className="space-y-1.5 text-left">
        <div className="flex items-start justify-between gap-2">
          <p className="line-clamp-2 text-sm font-medium leading-snug">{h.titulo}</p>
          {h.calificacion && <span className="shrink-0 text-lg">{h.calificacion}</span>}
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {h.proyecto ?? "(sin proyecto)"}
          {h.referente && ` · ${h.referente}`}
        </p>
        <p className="text-xs text-muted-foreground">
          {fechaDe(h.calificadoEn)}
          {h.views !== null && ` · ${miles(h.views)} vistas`}
        </p>
      </button>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        {/* 🎨 El badge va en `default` (color de acento) y NO en `secondary`: es la lección del
            18/08 en Transcribir, donde la marca quedó como una segunda pastilla gris idéntica a la
            de al lado — presente en el DOM e invisible para el ojo. **El estado se muestra fuerte,
            la acción se ofrece callada.** */}
        {grabado && <Badge>✓ Grabado</Badge>}
        {/* La procedencia, que es el "dónde está" del pedido. Para lo que vino de Transcribir el
            link lleva a esa zona, donde la tanda todavía existe. Para lo del Feed no se dibuja
            link: el candidato SE BORRA al archivarse (migración `013`), así que apuntaría a una
            fila que no está. Prometer solo lo que existe. */}
        <Badge variant="outline">{ETIQUETA_ORIGEN[h.origen]}</Badge>
        {h.urlReferente && (
          <a
            href={h.urlReferente}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground underline underline-offset-4"
          >
            ver el video ↗
          </a>
        )}
      </div>

      {fila.clave === null ? (
        <p className="text-xs text-muted-foreground">
          Sin link reconocible: este no se puede marcar.
        </p>
      ) : (
        <Button
          variant={grabado ? "ghost" : "outline"}
          size="sm"
          className="self-start"
          onClick={onAlternar}
        >
          {grabado ? "Sacar la marca de grabado" : "Marcar como grabado"}
        </Button>
      )}
    </div>
  );
}

/**
 * Un link que el equipo grabó por fuera de la herramienta.
 *
 * 🔑 **Se dibuja distinto a propósito.** No tiene guion, ni proyecto, ni calificación: pintarlo como
 * una tarjeta normal con los campos vacíos diría que hay un texto que no existe. Lo único que
 * afirma es *"esto lo grabamos"*, y eso es todo lo que muestra.
 */
function Huerfana({ marca }: { marca: MarcaGrabado }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-dashed bg-muted/30 p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="line-clamp-2 break-all text-sm font-medium leading-snug">{marca.url}</p>
      </div>
      <p className="text-xs text-muted-foreground">Marcado el {fechaDe(marca.grabadoEn)}</p>
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Badge>✓ Grabado</Badge>
        <Badge variant="outline">Cargado a mano</Badge>
        <a
          href={marca.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-muted-foreground underline underline-offset-4"
        >
          ver el video ↗
        </a>
      </div>
      <p className="text-xs text-muted-foreground">
        Sin guion en la herramienta. Si lo querés, pegalo en Transcribir.
      </p>
    </div>
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
  onCerrar,
}: {
  fila: Extract<FilaRegistro<Historico>, { tipo: "guion" }> | null;
  onCerrar: () => void;
}) {
  const h = fila?.guion ?? null;

  return (
    <Modal
      abierto={h !== null}
      onCerrar={onCerrar}
      titulo={h?.titulo ?? ""}
      subtitulo={
        h && (
          <>
            {h.proyecto ?? "(sin proyecto)"}
            {h.voz && ` · ${h.voz}`}
            {` · aprobado el ${fechaDe(h.calificadoEn)}`}
            {fila?.grabadoEn && ` · grabado el ${fechaDe(fila.grabadoEn)}`}
          </>
        )
      }
    >
      {/* `key` para que el contenido se remonte por fila: así el efecto que trae el guion corre una
          vez por apertura y no hay que resetear nada a mano. Mismo patrón que el detalle del feed. */}
      {fila && h && <Contenido key={h.id} fila={fila} />}
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
