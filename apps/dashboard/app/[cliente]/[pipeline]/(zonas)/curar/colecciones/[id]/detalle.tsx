"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { BotonBorrar } from "@/components/borrar";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
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
import { aDocx, documentoDeGuiones, TIPO_DOCX } from "@/domain/docx";
import type { CriterioOrden, Faceta } from "@/domain/orden";
import { nombreDeArchivo, type Video } from "@/domain/video";
import { aXlsx, TIPO_XLSX } from "@/domain/xlsx";
import { rutaDe } from "@/domain/rutas";
import { usarCockpit } from "../../../usar-cockpit";
import {
  agregarPegados,
  borrar,
  descargar,
  identificarFaltantes,
  limpiarFaltantes,
  linksDeVideo,
  quitar,
  quitarSeleccionados,
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

type Voz = { id: string; nombre: string; tienePerfil: boolean };

export function Detalle({
  coleccionId,
  videos,
  conLimpio,
}: {
  coleccionId: string;
  videos: Video[];
  /** Las claves que ya tienen guion limpio. Viaja como array: un Set no cruza el límite server/client. */
  conLimpio: string[];
}) {
  const cockpit = usarCockpit();
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const [aviso, setAviso] = useState<{ ok: boolean; mensaje: string } | null>(null);
  const [trabajando, startTransition] = useTransition();
  const [quitando, setQuitando] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<Video | null>(null);
  const [voces, setVoces] = useState<Voz[]>([]);
  const [vozId, setVozId] = useState("");
  // 🩸 **El detalle tampoco tenía selección múltiple.** El plan de colecciones prometía una barra con
  // `Quitar seleccionados` y lo que se construyó fue un `Sacar` por tarjeta — el mismo hueco entre
  // lo prometido y lo hecho que dejó afuera el modo selección entero, encontrado el 2026-08-21
  // releyendo el plan en vez de mirar la pantalla.
  const seleccion = usarSeleccion();
  // 🔽 **Abre en Vistas ↓**, y es lo único de esta pantalla que no es un default de diseño sino un
  // pedido textual: *"Poner de mayor a menor vistas en el documento que se descarga de colecciones"*
  // (Majo, 28/08). Vive acá y no en la descarga porque así hay **una sola** regla de orden: el
  // documento es lo que se ve. Un default propio del archivo daría dos listas distintas y la barra
  // dejaría de explicar lo que baja. Enmienda ADR-076 §5 para esta pantalla, no para las otras tres.
  const orden = usarOrden(videos, CRITERIOS, FACETAS, "views");

  const limpios = new Set(conLimpio);
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
   * Limpia en pasadas hasta que no queden. Lo dispara un botón y no un efecto: limpiar es un acto
   * con una decisión adentro (para qué voz) y un resultado que alguien tiene que mirar.
   */
  function limpiarTodos() {
    if (trabajando) return;
    startTransition(async () => {
      let quedan = sinLimpiar;
      let total = 0;
      while (quedan > 0) {
        const pasada = await limpiarFaltantes(cockpit, coleccionId, vozId || null);
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

      for (const v of elegidos) {
        const origen = r.porClave[v.clave];
        if (!origen) continue;
        const a = document.createElement("a");
        a.href = `/api/video?u=${encodeURIComponent(origen)}&nombre=${encodeURIComponent(nombreDeArchivo(v))}`;
        // Sin `download`: el nombre lo pone el `Content-Disposition` de la route, que es quien
        // sabe sanitizarlo. El atributo acá sería una segunda fuente para el mismo hecho.
        a.click();
        await new Promise((listo) => setTimeout(listo, 400));
      }

      const bajados = elegidos.length - r.sinVideo;
      setAviso({
        ok: bajados > 0,
        mensaje:
          bajados === 0
            ? "Ninguno de esos videos se pudo traer. Solo funciona con Instagram por ahora."
            : `Bajando ${bajados} ${bajados === 1 ? "video" : "videos"}.` +
              (r.sinVideo > 0 ? ` ${r.sinVideo} no se pudieron traer (¿TikTok, o el post ya no está?).` : "") +
              (r.recortado ? " La selección era muy grande: se tomaron los primeros 50." : ""),
      });
      seleccion.cancelar();
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

  const voz = voces.find((v) => v.id === vozId);

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
              El guion original nunca se pisa: el limpio queda al lado, y cada video muestra los dos.
            </p>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Select
              value={vozId}
              onChange={(e) => setVozId(e.target.value)}
              disabled={trabajando}
              aria-label="Voz con la que limpiar"
              className="w-56"
            >
              <option value="">Sin voz (solo criterios de la casa)</option>
              {voces.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nombre}
                  {v.tienePerfil ? "" : " — sin perfil cargado"}
                </option>
              ))}
            </Select>
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
          {/* Se avisa acá y no después de gastar: una voz sin perfil limpia solo con los criterios
              de la casa, que es un resultado útil pero no suena a nadie en particular. */}
          {voz && !voz.tienePerfil && (
            <p className="w-full text-sm text-muted-foreground">
              <strong>{voz.nombre}</strong> no tiene cargado cómo habla, así que la limpieza va a
              salir correcta pero neutra. Se carga en <em>Curar → Voces y proyectos → Ver detalle</em>.
            </p>
          )}
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
                  <>
                    <span className="truncate text-xs text-muted-foreground">
                      {limpios.has(v.clave)
                        ? "limpio"
                        : v.likes != null
                          ? `${v.likes.toLocaleString("es-AR")} likes`
                          : "—"}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => sacar(v)}
                      disabled={trabajando}
                      className="text-muted-foreground"
                    >
                      Sacar
                    </Button>
                  </>
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
