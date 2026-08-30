"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { BotonBorrar } from "@/components/borrar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { GrillaVideos } from "@/components/video/grupos";
import { BarraOrden, usarOrden } from "@/components/video/orden";
import { BarraSeleccion, BotonSeleccionar, usarSeleccion } from "@/components/video/seleccion";
import { TarjetaVideo } from "@/components/video/tarjeta";
import {
  advertenciaDeBorrado,
  COLUMNAS_COLECCION,
  necesitaEnriquecer,
  tablaDeColeccion,
} from "@/domain/colecciones";
import { BASE } from "@/domain/limpieza";
import { aDocx, documentoDeGuiones, TIPO_DOCX } from "@/domain/docx";
import {
  contarPorGrabado,
  FILTROS_REGISTRO,
  filtrarPorGrabado,
  type FiltroRegistro,
} from "@/domain/grabados";
import type { CriterioOrden, Faceta } from "@/domain/orden";
import { nombreDeArchivo, type Video } from "@/domain/video";
import { aXlsx, TIPO_XLSX } from "@/domain/xlsx";
import { rutaDe } from "@/domain/rutas";
import { cn } from "@/lib/utils";
import { usarCockpit } from "../../../usar-cockpit";
import {
  agregarPegados,
  borrar,
  descargar,
  identificarFaltantes,
  limpiarFaltantes,
  linksDeVideo,
  marcarGrabadoEnColeccion,
  marcarGrabadosEnColeccion,
  quitar,
  quitarSeleccionados,
  relimpiarViejos,
  vocesParaLimpiar,
} from "../actions";
import { Guiones } from "./guiones";
import { Identificador } from "./identificador";

// El contenido de una colección.
//
// **Meter videos es pegar links**, que es el idioma que esta app ya usa para *"hacer algo con
// muchos ítems"* (el pegote de Transcribir, la carga masiva de Históricos). Es además lo que Majo
// ya tiene a mano: sus documentos de scripts son listas de links.

// Los ejes de orden y filtro de esta pantalla (ADR-076).
//
// 🔑 **A nivel de módulo y NO dentro del componente**: `usarOrden` memoiza contra estas
// referencias, y armarlas inline daría un array nuevo por render. Es la misma trampa que ya costó
// un bucle de fetch en este mismo archivo (las deps del `useEffect` de `vocesParaLimpiar`).
//
// ⚠️ **No hay `engagement` ni `relevancia`**: `domain/video.ts` no los transporta. El dato existe
// en las fuentes —medido el 26/08, 57 de 57 en la colección de prueba— pero `fusionar()` no lo
// trae, y agregarlo sería una columna en `app.videos_meta`, o sea `core/`, o sea otro ADR
// (ADR-076 §5).
const CRITERIOS: readonly CriterioOrden<Video>[] = [
  { clave: "likes", etiqueta: "Likes", valor: (v) => v.likes },
  { clave: "views", etiqueta: "Vistas", valor: (v) => v.views },
  { clave: "seguidores", etiqueta: "Seguidores", valor: (v) => v.seguidores },
  { clave: "heat", etiqueta: "Heat", valor: (v) => v.heat },
  { clave: "titulo", etiqueta: "Título A-Z", valor: (v) => v.titulo },
];

// `plataforma` sale del tipo y no de un parseo nuevo: `Video` ya la trae resuelta por `claveDe`.
const FACETAS: readonly Faceta<Video>[] = [
  { clave: "idioma", etiqueta: "Idioma", valor: (v) => v.idioma },
  { clave: "plataforma", etiqueta: "Plataforma", valor: (v) => v.plataforma },
];

// Las mismas palabras que en Históricos: el acto es el mismo (ADR-070, la marca es por video) y
// dos vocabularios para un solo hecho es cómo el equipo termina creyendo que son dos cosas.
const ETIQUETA_FILTRO: Record<FiltroRegistro, string> = {
  "sin-grabar": "Falta grabar",
  grabados: "Grabados",
  todos: "Todos",
};

type Voz = { id: string; nombre: string; tienePerfil: boolean };

export function Detalle({
  coleccionId,
  videos,
  conLimpio,
  viejos,
  degradarian,
  grabados,
}: {
  coleccionId: string;
  videos: Video[];
  /** Las claves que ya tienen guion limpio. Viaja como array: un Set no cruza el límite server/client. */
  conLimpio: string[];
  /** Las que se limpiaron con criterios que ya no son los de hoy y **conviene** rehacer (ADR-080). */
  viejos: string[];
  /** Las que también quedaron viejas pero rehacerlas las dejaría neutras: su video perdió la voz. */
  degradarian: string[];
  /** Las claves ya marcadas como grabadas, del cockpit entero (ADR-070). Array por lo mismo. */
  grabados: string[];
}) {
  const cockpit = usarCockpit();
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const [aviso, setAviso] = useState<{ ok: boolean; mensaje: string } | null>(null);
  const [trabajando, startTransition] = useTransition();
  const [quitando, setQuitando] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<Video | null>(null);
  const [voces, setVoces] = useState<Voz[]>([]);
  // 🩸 **El detalle tampoco tenía selección múltiple.** El plan de colecciones prometía una barra con
  // `Quitar seleccionados` y lo que se construyó fue un `Sacar` por tarjeta — el mismo hueco entre
  // lo prometido y lo hecho que dejó afuera el modo selección entero, encontrado el 2026-08-21
  // releyendo el plan en vez de mirar la pantalla.
  const seleccion = usarSeleccion();
  const [filtroGrabado, setFiltroGrabado] = useState<FiltroRegistro>("todos");
  // Confirma EN EL LUGAR, como `BotonBorrar`: el botón se reemplaza por la pregunta. Un
  // `window.confirm` se ve como un error del browser y no se puede escribir en el idioma del equipo.
  const [confirmandoRelimpiar, setConfirmandoRelimpiar] = useState(false);
  // 🔽 **Abre en Vistas ↓**, y es lo único de esta pantalla que no es un default de diseño sino un
  // pedido textual: *"Poner de mayor a menor vistas en el documento que se descarga de colecciones"*
  // (Majo, 28/08). Vive acá y no en la descarga porque así hay **una sola** regla de orden: el
  // documento es lo que se ve. Un default propio del archivo daría dos listas distintas y la barra
  // dejaría de explicar lo que baja. Enmienda ADR-076 §5 para esta pantalla, no para las otras tres.
  const marcados = useMemo(() => new Set(grabados), [grabados]);
  // 🔑 **El filtro de grabado va ANTES del orden, no adentro.** Son los dos sistemas conviviendo de
  // ADR-076 §4, igual que en Históricos: éste filtra por un atributo **que la pantalla edita**, así
  // que vive aparte de las facetas (idioma, plataforma) que son inmutables.
  //
  // ⚠️ La consecuencia conocida: con "Falta grabar" prendido, marcar hace desaparecer la tarjeta de
  // abajo del cursor. Por eso el default es "Todos", igual que allá.
  const sinFiltrar = useMemo(
    () => filtrarPorGrabado(videos, marcados, filtroGrabado),
    [videos, marcados, filtroGrabado],
  );
  const cuentasGrabado = useMemo(() => contarPorGrabado(videos, marcados), [videos, marcados]);
  const orden = usarOrden(sinFiltrar, CRITERIOS, FACETAS, "views");

  const limpios = new Set(conLimpio);
  // 🔑 **Las dos listas llegan calculadas del servidor, con la misma función que usa la acción de
  // re-limpiar** (`clasificarLimpios`). Acá no se recalcula nada: si la pantalla tuviera su propia
  // cuenta, el badge y el botón podrían señalar cosas distintas.
  const desactualizados = new Set(viejos);
  const perdieronLaVoz = new Set(degradarian);
  const sinIdentificar = videos.filter(necesitaEnriquecer).length;
  const sinLimpiar = videos.filter((v) => !limpios.has(v.clave)).length;

  // 🩸 **Las dependencias son los dos strings, NO el objeto** (encontrado el 2026-08-21 mirando el
  // log del dev server: esta pantalla pedía las voces ~una vez por segundo, para siempre).
  // `usarCockpit()` arma `{cliente, pipeline}` en cada render, así que con `[cockpit]` el efecto veía
  // una dependencia nueva cada vez: pedir → `setVoces` → render → objeto nuevo → pedir. Un bucle que
  // no se nota en pantalla y le pega al servidor sin parar.
  const { cliente, pipeline } = cockpit;
  useEffect(() => {
    vocesParaLimpiar({ cliente, pipeline }).then(setVoces);
  }, [cliente, pipeline]);

  function pegar() {
    if (trabajando || texto.trim() === "") return;
    startTransition(async () => {
      const r = await agregarPegados(cockpit, coleccionId, texto);
      setAviso(r);
      if (r.ok) setTexto("");
    });
  }

  function identificar() {
    if (trabajando) return;
    startTransition(async () => setAviso(await identificarFaltantes(cockpit, coleccionId)));
  }

  /**
   * Limpia en pasadas hasta que no queden. Lo dispara un botón y no un efecto: limpiar **cuesta
   * plata** y su resultado alguien lo tiene que mirar.
   *
   * Desde ADR-080 ya no lleva una decisión adentro: **cada video se limpia con la voz que le
   * corresponde**, no con una elegida para toda la tanda.
   */
  function limpiarTodos() {
    if (trabajando) return;
    startTransition(async () => {
      let quedan = sinLimpiar;
      let total = 0;
      while (quedan > 0) {
        const pasada = await limpiarFaltantes(cockpit, coleccionId);
        total += pasada.limpiados;
        // Una pasada que no movió la aguja corta: mejor eso que girar pagándole a Haiku por nada.
        if (pasada.limpiados === 0) {
          setAviso(total > 0 ? { ok: true, mensaje: `${total} limpiados.` } : pasada);
          return;
        }
        quedan = pasada.quedan;
      }
      setAviso({ ok: true, mensaje: `${total} limpiados.` });
    });
  }

  /** «1 rehecho», no «1 rehechos»: el aviso lo lee una persona y el plural roto se nota. */
  const rehechos = (n: number) => `${n} ${n === 1 ? "rehecho" : "rehechos"}.`;

  /**
   * Rehace los guiones que quedaron viejos, en pasadas, igual que `limpiarTodos`.
   *
   * 🔴 **Botón propio y confirmación aparte, nunca adentro de *Limpiar*** (ADR-080): meterlo ahí
   * gastaría de nuevo en cada click sobre una colección que ya está entera. Los que perdieron la
   * voz no entran: la pasada los dejaría neutros.
   */
  function relimpiar() {
    if (trabajando) return;
    startTransition(async () => {
      let quedan = desactualizados.size;
      let total = 0;
      while (quedan > 0) {
        const pasada = await relimpiarViejos(cockpit, coleccionId);
        total += pasada.limpiados;
        // Misma guardia que la limpieza: una pasada que no movió la aguja corta en vez de girar
        // pagándole a Haiku por nada.
        if (pasada.limpiados === 0) {
          setAviso(total > 0 ? { ok: true, mensaje: rehechos(total) } : pasada);
          return;
        }
        quedan = pasada.quedan;
      }
      setAviso({ ok: true, mensaje: rehechos(total) });
    });
  }

  /**
   * Baja la colección: `word` para leer los guiones, `excel` para operar con la lista.
   *
   * 📦 **El archivo se arma ACÁ**, con los datos que devuelve la acción — mismo patrón que los dos
   * export de Históricos (ADR-071). Nunca un blob cruzando la red ni una route nueva: así la
   * descarga pasa por la misma guardia de tenant que el resto.
   *
   * 📄 **El archivo es la vista: se baja lo que se ve, en el orden en que se ve.** Por eso viajan
   * las claves de `orden.visibles` y no un `coleccionId` pelado — el criterio de la barra Y sus
   * chips de filtro llegan al documento. La consecuencia hay que saberla: con un chip prendido, el
   * archivo trae menos videos que la colección, y el aviso del final dice cuántos son.
   *
   * 🔑 **Los dos formatos comparten la MISMA acción y el mismo viaje.** `descargar` ya trae todo lo
   * que la planilla necesita (título, referente, link, texto y si está limpio), y es la parte cara:
   * hace un `leerCrudo` por video. Una segunda acción para el Excel pagaría dos veces lo mismo y
   * abriría la puerta a que los dos archivos digan cosas distintas de la misma colección.
   */
  function bajar(formato: "word" | "excel") {
    if (trabajando) return;
    const claves = orden.visibles.map((v) => v.clave);
    startTransition(async () => {
      const r = await descargar(cockpit, coleccionId, claves);
      if (!r.ok) {
        setAviso(r);
        return;
      }
      const [bytes, tipo, extension] =
        formato === "word"
          ? ([aDocx(documentoDeGuiones(r.nombre, r.guiones)), TIPO_DOCX, "docx"] as const)
          : ([
              aXlsx(COLUMNAS_COLECCION, tablaDeColeccion(r.guiones), r.nombre),
              TIPO_XLSX,
              "xlsx",
            ] as const);

      const url = URL.createObjectURL(new Blob([bytes], { type: tipo }));
      const a = document.createElement("a");
      a.href = url;
      // Sin caracteres que un sistema de archivos pueda rechazar. El nombre de la colección es libre.
      a.download = `${r.nombre.replace(/[/\\:*?"<>|]/g, " ").trim() || "guiones"}.${extension}`;
      a.click();
      URL.revokeObjectURL(url);

      const cuantos = `${r.guiones.length} ${r.guiones.length === 1 ? "video" : "videos"}`;
      setAviso({
        ok: true,
        mensaje: r.truncado
          ? `El archivo trae ${cuantos}: la colección es grande y quedó cortada. Bajala en dos colecciones más chicas.`
          : `${cuantos} en el archivo.`,
      });
    });
  }

  /**
   * Baja los mp4 de los videos elegidos (pedido de Majo / JP Vieira, 28/08).
   *
   * 🔑 **Uno por uno y sin ZIP.** Son ~33 MB por video (medido): una colección de 57 son ~1,9 GB,
   * que no entra ni en la memoria ni en los 60 s de una función de Vercel. El browser encola las
   * descargas solo; la primera vez puede pedir permiso para "descargas múltiples".
   *
   * ⏱️ **El respiro entre clicks no es cosmético**: disparar N clicks en el mismo tick hace que
   * Chrome descarte todos menos el primero.
   *
   * 🔴 **Esto NO deja el video guardado en el cockpit.** El archivo queda en el disco de quien lo
   * baja, igual que hoy con savefrom.net. Un video que nadie bajó antes de que lo desmonten se
   * pierde igual — cambiarlo es copiarlos a Storage, que es otro producto y otra decisión de costo.
   */
  function bajarVideos() {
    if (trabajando || seleccion.cuantos === 0) return;
    const elegidos = orden.visibles.filter((v) => seleccion.marcado(v.clave));
    startTransition(async () => {
      const r = await linksDeVideo(cockpit, coleccionId, elegidos.map((v) => v.clave));
      if (!r.ok) {
        setAviso(r);
        return;
      }

      let bajados = 0;
      let fallados = 0;
      for (const v of elegidos) {
        const origen = r.porClave[v.clave];
        if (!origen) continue;
        const nombre = nombreDeArchivo(v);
        // 🩸 **Se baja con `fetch` y no con un `<a>` apuntando al proxy** (encontrado el 29/08
        // probándolo en vivo): un `<a>` sin `download` NAVEGA, así que un 500 o una firma vencida
        // reemplazaban la pantalla entera con el texto del error y se perdía la selección de 57
        // tarjetas. Es el mismo patrón que `bajar()` acá arriba, y sale gratis porque `/api/video`
        // es del mismo origen — contra el CDN no se podría: no manda `Access-Control-Allow-Origin`.
        try {
          const res = await fetch(
            `/api/video?u=${encodeURIComponent(origen)}&nombre=${encodeURIComponent(nombre)}`,
          );
          if (!res.ok) throw new Error(String(res.status));
          const url = URL.createObjectURL(await res.blob());
          const a = document.createElement("a");
          a.href = url;
          a.download = `${nombre}.mp4`;
          a.click();
          URL.revokeObjectURL(url);
          bajados += 1;
        } catch {
          fallados += 1;
        }
        // Un respiro entre descargas: N clicks en el mismo tick los descarta el browser.
        await new Promise((listo) => setTimeout(listo, 400));
      }
      fallados += r.sinVideo;
      setAviso({
        ok: bajados > 0,
        mensaje:
          bajados === 0
            ? "Ninguno de esos videos se pudo bajar. ¿Son de TikTok, o el creador ya los bajó?"
            : `${bajados} ${bajados === 1 ? "video bajado" : "videos bajados"}.` +
              (fallados > 0
                ? ` ${fallados} no se pudieron (¿TikTok, o el post ya no está?).`
                : "") +
              (r.recortado ? " La selección era muy grande: se tomaron los primeros 50." : ""),
      });
      seleccion.cancelar();
    });
  }

  /** Prende o apaga la marca de un video. Sin confirmación: se deshace apagándola (ADR-069 §5). */
  function alternarGrabado(v: Video) {
    if (trabajando) return;
    startTransition(async () => {
      const r = await marcarGrabadoEnColeccion(
        cockpit,
        coleccionId,
        { plataforma: v.plataforma, external_id: v.external_id, url: v.url },
        !marcados.has(v.clave),
      );
      if (!r.ok) setAviso(r);
    });
  }

  /** Lo mismo en lote. Solo prende: apagar en masa restaría trabajo hecho y no lo pidió nadie. */
  function marcarSeleccionados() {
    if (trabajando || seleccion.cuantos === 0) return;
    const claves = seleccion.claves;
    startTransition(async () => {
      const r = await marcarGrabadosEnColeccion(cockpit, coleccionId, claves);
      setAviso(r);
      if (r.ok) seleccion.cancelar();
    });
  }

  function sacar(v: Video) {
    if (trabajando) return;
    setQuitando(v.clave);
    startTransition(async () => {
      const r = await quitar(cockpit, coleccionId, v.plataforma, v.external_id);
      setQuitando(null);
      if (!r.ok) setAviso(r);
    });
  }

  /** Lo mismo en lote. Sin confirmación, por lo mismo: la bolsa es descartable (ADR-073). */
  function sacarSeleccionados() {
    if (trabajando || seleccion.cuantos === 0) return;
    const claves = seleccion.claves;
    startTransition(async () => {
      const r = await quitarSeleccionados(cockpit, coleccionId, claves);
      setAviso(r);
      if (r.ok) seleccion.cancelar();
    });
  }

  // Ya no se elige la voz, pero sí importa cuántas no tienen cargado cómo hablan: sus videos se
  // limpian igual y salen correctos, pero neutros. Medido el 29/08: **1 de 3** voces tiene perfil.
  const sinPerfil = voces.filter((v) => !v.tienePerfil);

  return (
    <div className="space-y-6">
      <Identificador coleccionId={coleccionId} faltan={sinIdentificar} />

      <div className="space-y-2 rounded-lg border p-4">
        <p className="text-sm font-medium">Agregar videos</p>
        <p className="text-sm text-muted-foreground">
          Pegá los links de Instagram o TikTok, uno por línea o todos seguidos. Los que ya estén en
          la colección se ignoran, así que podés pegar la lista entera sin fijarte.
        </p>
        <Textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={4}
          placeholder="https://www.instagram.com/p/..."
          aria-label="Links para agregar a la colección"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={pegar} disabled={trabajando || texto.trim() === ""}>
            {trabajando ? "Trabajando…" : "Agregar a la colección"}
          </Button>
          {sinIdentificar > 0 && (
            <Button variant="outline" onClick={identificar} disabled={trabajando}>
              {trabajando ? "Buscando…" : `Reintentar los ${sinIdentificar} que faltan`}
            </Button>
          )}
          {videos.length > 0 && (
            <span className="ml-auto">
              <BotonSeleccionar seleccion={seleccion} />
            </span>
          )}
        </div>
        {aviso && (
          <p className={`text-sm ${aviso.ok ? "text-muted-foreground" : "text-destructive"}`}>
            {aviso.mensaje}
          </p>
        )}
      </div>

      {/* La limpieza (ADR-074). El botón dice para quién limpia, porque limpiar sin voz da un
          resultado distinto y peor, y quien aprieta tiene que saberlo ANTES. */}
      {videos.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border p-4">
          <div className="space-y-1">
            <p className="text-sm font-medium">Limpiar los guiones</p>
            <p className="text-sm text-muted-foreground">
              Cada video se limpia con <strong>los criterios de la casa</strong> más{" "}
              <strong>la forma de hablar de su propia voz</strong>: no hay que elegirla. El guion
              original nunca se pisa — el limpio queda al lado y cada video muestra los dos.
            </p>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button onClick={limpiarTodos} disabled={trabajando || sinLimpiar === 0}>
              {trabajando
                ? "Limpiando…"
                : sinLimpiar === 0
                  ? "Todos limpios"
                  : `Limpiar ${sinLimpiar}`}
            </Button>
            {/* Los dos, porque son dos usos y no dos formatos del mismo archivo: el Word es para
                LEER un guion (prosa de 1000+ caracteres, que en una celda se lee mal) y el Excel
                para OPERAR con la lista (filtrar, ordenar, repartir quién graba qué). */}
            <Button variant="outline" onClick={() => bajar("word")} disabled={trabajando}>
              {trabajando ? "Preparando…" : "Descargar (Word)"}
            </Button>
            <Button variant="outline" onClick={() => bajar("excel")} disabled={trabajando}>
              {trabajando ? "Preparando…" : "Descargar (Excel)"}
            </Button>
          </div>
          {/* Se avisa ANTES de gastar, igual que cuando la voz se elegía a mano: una voz sin perfil
              limpia solo con los criterios de la casa — correcto, pero no suena a nadie. */}
          {sinPerfil.length > 0 && (
            <p className="w-full text-sm text-muted-foreground">
              {sinPerfil.length === voces.length ? "Ninguna voz tiene" : `${sinPerfil.length} de ${voces.length} voces no tienen`}{" "}
              cargado cómo habla ({sinPerfil.map((v) => v.nombre).join(", ")}), así que sus guiones
              van a salir correctos pero neutros. Se carga en{" "}
              <em>Curar → Voces y proyectos → Ver detalle</em>.
            </p>
          )}

          {/* 🔴 **Los guiones viejos, con su propio botón** (ADR-080). Va acá abajo y no al lado de
              *Limpiar* porque son dos actos distintos: uno hace lo que falta, el otro **rehace lo
              que ya se pagó**. Juntarlos volvería a gastar en cada click. */}
          {(desactualizados.size > 0 || perdieronLaVoz.size > 0) && (
            <div className="w-full space-y-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
              {desactualizados.size > 0 && (
                <>
                  <p className="text-sm">
                    <strong>
                      {desactualizados.size}{" "}
                      {desactualizados.size === 1 ? "guion quedó viejo" : "guiones quedaron viejos"}
                    </strong>
                    :{" "}
                    {desactualizados.size === 1
                      ? "se limpió con criterios que ya no son los que hoy le tocan a su video. Lo más probable es que haya salido neutro pudiendo sonar a la voz que lo va a grabar."
                      : "se limpiaron con criterios que ya no son los que hoy le tocan a su video. Casi siempre salieron neutros pudiendo sonar a la voz que los va a grabar."}
                  </p>
                  {confirmandoRelimpiar ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs text-muted-foreground">
                        Se paga una limpieza por guion y el limpio actual se pisa. El guion original
                        no se toca.
                      </p>
                      <Button
                        size="sm"
                        disabled={trabajando}
                        onClick={() => {
                          setConfirmandoRelimpiar(false);
                          relimpiar();
                        }}
                      >
                        {trabajando ? "Rehaciendo…" : `Sí, rehacer ${desactualizados.size}`}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={trabajando}
                        onClick={() => setConfirmandoRelimpiar(false)}
                      >
                        Cancelar
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={trabajando}
                      onClick={() => setConfirmandoRelimpiar(true)}
                    >
                      {trabajando
                        ? "Rehaciendo…"
                        : `Rehacer ${desactualizados.size} ${desactualizados.size === 1 ? "guion" : "guiones"}`}
                    </Button>
                  )}
                </>
              )}
              {/* No entran al botón y hay que decir por qué, o el número de arriba parece mal
                  contado. Rehacerlos los dejaría neutros: peor de lo que están, y pagando. */}
              {perdieronLaVoz.size > 0 && (
                <p className="text-xs text-muted-foreground">
                  Otros {perdieronLaVoz.size} se limpiaron con una voz que su video ya no tiene
                  (se archivó, o la voz se renombró). <strong>No se rehacen</strong>: saldrían
                  neutros, que es peor de lo que están hoy.
                </p>
              )}
            </div>
          )}

          <CriteriosDeLaCasa />
        </div>
      )}

      {sinIdentificar > 0 && (
        <p className="text-sm text-muted-foreground">
          Buscándole la foto y el título a {sinIdentificar}{" "}
          {sinIdentificar === 1 ? "video" : "videos"}. Puede tardar un minuto y la página se
          actualiza sola. Están en la colección igual y funcionan sin eso.
        </p>
      )}

      {videos.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          La colección está vacía. Pegá links arriba para llenarla.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {/* 🎨 Los chips del grabado van en su PROPIA línea, arriba de la barra de orden. Son
                los dos sistemas de ADR-076 §4 y se leen como dos preguntas distintas: *qué me falta*
                primero, *cómo lo ordeno* después. */}
            <span className="text-sm text-muted-foreground">Grabación</span>
            {FILTROS_REGISTRO.map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={filtroGrabado === f}
                onClick={() => setFiltroGrabado(f)}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                  filtroGrabado === f
                    ? "border-primary bg-primary/10 font-medium"
                    : "hover:bg-accent",
                )}
              >
                {ETIQUETA_FILTRO[f]} <span className="text-muted-foreground">{cuentasGrabado[f]}</span>
              </button>
            ))}
          </div>
          <BarraOrden orden={orden} />
          <GrillaVideos>
            {orden.visibles.map((v) => (
              <TarjetaVideo
                key={v.clave}
                video={v}
                atenuada={quitando === v.clave}
                badge={limpios.has(v.clave) ? "✨" : undefined}
                onAbrir={() => setAbierto(v)}
                seleccion={
                  seleccion.activo
                    ? {
                        marcado: seleccion.marcado(v.clave),
                        onAlternar: () => seleccion.alternar(v.clave),
                      }
                    : undefined
                }
                pie={
                  <div className="flex w-full flex-wrap items-center gap-1.5">
                    {/* 🎨 El badge en `default` y no en `secondary`: es la lección del 18/08 en
                        Transcribir, donde la marca quedó como una pastilla gris al lado de otra
                        gris, presente en el DOM e invisible al ojo. **El estado se muestra fuerte,
                        la acción se ofrece callada.** Mismo criterio que Históricos. */}
                    {marcados.has(v.clave) && <Badge>✓ Grabado</Badge>}
                    {/* 🎨 `destructive` y no `default`: al lado de «✓ Grabado», que es sólido,
                        dos badges fuertes competirían. Éste tiene que leerse como *algo está mal
                        acá*, no como un estado más — es lo que vuelve visible el modo de falla #1
                        de ADR-080, que estuvo 26 veces en pantalla sin que nadie pudiera notarlo. */}
                    {desactualizados.has(v.clave) && <Badge variant="destructive">limpio viejo</Badge>}
                    <span className="truncate text-xs text-muted-foreground">
                      {desactualizados.has(v.clave)
                        ? ""
                        : perdieronLaVoz.has(v.clave)
                          ? "limpio · su voz ya no está"
                          : limpios.has(v.clave)
                            ? "limpio"
                            : v.likes != null
                              ? `${v.likes.toLocaleString("es-AR")} likes`
                              : "—"}
                    </span>
                    <Button
                      variant={marcados.has(v.clave) ? "ghost" : "outline"}
                      size="sm"
                      onClick={() => alternarGrabado(v)}
                      disabled={trabajando}
                    >
                      {marcados.has(v.clave) ? "Sacar la marca" : "Marcar grabado"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => sacar(v)}
                      disabled={trabajando}
                      className="ml-auto text-muted-foreground"
                    >
                      Sacar
                    </Button>
                  </div>
                }
              />
            ))}
          </GrillaVideos>
          <BarraSeleccion seleccion={seleccion}>
            {/* Primero el que NO destruye nada: bajar es la acción que el editor viene a hacer,
                sacar es la de limpieza. */}
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={seleccion.cuantos === 0 || trabajando}
              onClick={bajarVideos}
            >
              {trabajando ? "Pidiendo…" : "Descargar videos"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={seleccion.cuantos === 0 || trabajando}
              onClick={marcarSeleccionados}
            >
              Marcar como grabados
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={seleccion.cuantos === 0 || trabajando}
              onClick={sacarSeleccionados}
            >
              Sacar de la colección
            </Button>
          </BarraSeleccion>

          <p className="text-center text-sm text-muted-foreground">
            {videos.length} {videos.length === 1 ? "video" : "videos"}.
          </p>
        </>
      )}

      {/* 🔑 Va al FINAL, y no arriba junto al nombre. Es la única acción de esta pantalla que no se
          deshace, y al lado del título quedaría a un pixel del gesto de volver. Acá hay que bajar a
          buscarla, que es la fricción correcta para un acto así. */}
      <div className="rounded-lg border p-4">
        <p className="font-medium">Borrar esta colección</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Se va la lista, no los videos: podés volver a armarla pegando los mismos links, y lo que
          ya se pagó no se paga de nuevo.
        </p>
        <div className="mt-3">
          <BotonBorrar
            etiqueta="Borrar la colección"
            advertencia={advertenciaDeBorrado(videos.length)}
            deshabilitado={trabajando}
            onBorrar={() => borrar(cockpit, coleccionId)}
            onResultado={(r) => {
              // 🔴 Al salir bien hay que IRSE. Distinto del índice, donde la tarjeta desaparece y
              // eso alcanza: acá la pantalla que estás mirando dejó de existir, y quedarse muestra
              // una colección borrada hasta que alguien recargue (y ahí `notFound`). La action
              // revalida el índice, así que al llegar la lista ya viene sin ésta.
              if (r.ok) router.push(rutaDe(cockpit, "curar/colecciones"));
              else setAviso(r);
            }}
          />
        </div>
      </div>

      <Guiones
        coleccionId={coleccionId}
        video={abierto}
        tieneLimpio={abierto !== null && limpios.has(abierto.clave)}
        onCerrar={() => setAbierto(null)}
      />
    </div>
  );
}

/**
 * Los criterios de la casa, a la vista.
 *
 * 🩸 **Por qué existe:** los 7 criterios gobiernan **toda** limpieza —con voz y sin voz— y hasta el
 * 2026-08-29 no había forma de leerlos sin abrir el código. El equipo apretaba un botón que le
 * aplicaba a su guion reglas que no podía ver. *Un criterio que no se puede leer no se puede
 * discutir, y el que no se discute se sufre.*
 *
 * 🔒 **Solo lectura, y es deliberado** (la decisión está escrita en `domain/limpieza.ts`): son de la
 * agencia, valen para toda voz, y el punto 4 tiene una trampa que costó descubrir —el prompt está
 * escrito en voseo y hay un párrafo entero explicándole al modelo que NO lo copie al guion—. Un
 * textarea invita a reescribir ese párrafo sin saber para qué estaba. Lo editable es **cómo habla
 * cada voz** (`Curar → Voces`), que es lo que se suma a esto.
 *
 * `<details>` nativo y no un modal: es texto de referencia que se abre una vez, no una decisión.
 */
function CriteriosDeLaCasa() {
  return (
    <details className="w-full">
      <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
        Ver los criterios de la casa (se aplican siempre, con voz y sin voz)
      </summary>
      <div className="mt-2 space-y-2 rounded-md border bg-muted/30 p-3">
        <p className="text-xs text-muted-foreground">
          Esto es lo que la máquina corrige en <strong>todos</strong> los guiones. Cuando el video
          tiene voz, se le suma cómo habla esa voz — nunca la reemplaza.
        </p>
        <pre className="max-h-96 overflow-auto whitespace-pre-wrap font-sans text-xs leading-relaxed">
          {BASE}
        </pre>
        <p className="text-xs text-muted-foreground">
          Se cambian en el repo (<code>docs/prompts/limpieza-guion.md</code>), no desde acá: valen
          para toda voz y son de la agencia.
        </p>
      </div>
    </details>
  );
}
