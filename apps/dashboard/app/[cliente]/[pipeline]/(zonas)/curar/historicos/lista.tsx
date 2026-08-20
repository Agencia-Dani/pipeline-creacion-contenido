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
  filtrarRegistro,
  FILTROS_REGISTRO,
  type FilaRegistro,
  type FiltroRegistro,
  type MarcaGrabado,
} from "@/domain/grabados";
import { fecha } from "@/lib/fechas";
import type { Historico } from "@/lib/historicos";
import { miles } from "@/lib/utils";
import { usarCockpit } from "../../usar-cockpit";
import { exportar, marcarGrabado, marcarMuchosComoGrabados, verGuion } from "./actions";

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

  const abierto = visibles.find((f) => f.tipo === "guion" && f.guion.id === abiertoId) ?? null;

  return (
    <div className="space-y-4">
      <CargarGrabados
        onCargado={(mensaje, nuevas) => {
          setAviso(mensaje);
          setMarcas((m) => {
            const copia = new Map(m);
            for (const marca of nuevas) copia.set(marca.clave, marca);
            return copia;
          });
        }}
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
 * La carga masiva del Excel (ADR-070 §6).
 *
 * Mismo cuadro que el pegote de Transcribir y a propósito: es la interacción que el equipo ya
 * aprendió. Copian la columna de links de su planilla, la pegan, y `parsearEnlaces` saca los links
 * de cualquier texto. La diferencia con aquel: **acá no se transcribe ni se paga nada**, solo entra
 * la marca.
 */
function CargarGrabados({
  onCargado,
}: {
  onCargado: (mensaje: string, nuevas: MarcaGrabado[]) => void;
}) {
  const cockpit = usarCockpit();
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, startEnviar] = useTransition();

  // Se cuenta mientras escriben, antes de tocar el servidor: el equipo ve cuántos entendió la
  // herramienta ANTES de apretar nada.
  const lote = useMemo(() => parsearEnlaces(texto), [texto]);

  function enviar() {
    setError(null);
    startEnviar(async () => {
      const r = await marcarMuchosComoGrabados(cockpit, texto);
      if (!r.ok) {
        setError(r.mensaje);
        return;
      }
      const ahora = new Date().toISOString();
      onCargado(
        r.mensaje,
        lote.validos.map((e) => ({
          clave: `${e.plataforma}:${e.external_id}`,
          url: e.url,
          grabadoEn: ahora,
        })),
      );
      setTexto("");
    });
  }

  return (
    <details className="rounded-lg border">
      <summary className="cursor-pointer p-4 text-sm font-medium">
        Cargar una lista de videos ya grabados
      </summary>
      <div className="space-y-3 border-t p-4">
        <p className="text-sm text-muted-foreground">
          Si grabaron videos que no salieron de acá, pegá sus links y quedan marcados. Copiá la
          columna de links de tu Excel y pegala tal cual: uno por línea, separados por comas o
          cualquier texto que los tenga adentro. <strong>No se transcribe nada y no cuesta nada</strong> —
          solo queda la marca, para que la herramienta no te los vuelva a proponer.
        </p>
        <Textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={5}
          disabled={enviando}
          placeholder="Pegá acá los links de los videos que ya grabaron"
        />
        {texto.trim() !== "" && (
          <p className="text-sm text-muted-foreground">
            {lote.validos.length} videos detectados
            {lote.invalidos.length > 0 && ` · ${lote.invalidos.length} links que no sirven`}
          </p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button size="sm" onClick={enviar} disabled={enviando || lote.validos.length === 0}>
          {enviando ? "Guardando…" : `Marcar ${lote.validos.length} como grabados`}
        </Button>
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
