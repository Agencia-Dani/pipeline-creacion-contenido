"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { GrillaVideos } from "@/components/video/grupos";
import { TarjetaVideo } from "@/components/video/tarjeta";
import { necesitaEnriquecer } from "@/domain/colecciones";
import type { Video } from "@/domain/video";
import { usarCockpit } from "../../../usar-cockpit";
import { agregarPegados, identificarFaltantes, limpiarFaltantes, quitar, vocesParaLimpiar } from "../actions";
import { Guiones } from "./guiones";
import { Identificador } from "./identificador";

// El contenido de una colección.
//
// **Meter videos es pegar links**, que es el idioma que esta app ya usa para *"hacer algo con
// muchos ítems"* (el pegote de Transcribir, la carga masiva de Históricos). Es además lo que Majo
// ya tiene a mano: sus documentos de scripts son listas de links.

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
  const [texto, setTexto] = useState("");
  const [aviso, setAviso] = useState<{ ok: boolean; mensaje: string } | null>(null);
  const [trabajando, startTransition] = useTransition();
  const [quitando, setQuitando] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<Video | null>(null);
  const [voces, setVoces] = useState<Voz[]>([]);
  const [vozId, setVozId] = useState("");

  const limpios = new Set(conLimpio);
  const sinIdentificar = videos.filter(necesitaEnriquecer).length;
  const sinLimpiar = videos.filter((v) => !limpios.has(v.clave)).length;

  useEffect(() => {
    vocesParaLimpiar(cockpit).then(setVoces);
  }, [cockpit]);

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

  function sacar(v: Video) {
    if (trabajando) return;
    setQuitando(v.clave);
    startTransition(async () => {
      const r = await quitar(cockpit, coleccionId, v.plataforma, v.external_id);
      setQuitando(null);
      if (!r.ok) setAviso(r);
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
          <GrillaVideos>
            {videos.map((v) => (
              <TarjetaVideo
                key={v.clave}
                video={v}
                atenuada={quitando === v.clave}
                badge={limpios.has(v.clave) ? "✨" : undefined}
                onAbrir={() => setAbierto(v)}
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
          <p className="text-center text-sm text-muted-foreground">
            {videos.length} {videos.length === 1 ? "video" : "videos"}.
          </p>
        </>
      )}

      <Guiones
        coleccionId={coleccionId}
        video={abierto}
        tieneLimpio={abierto !== null && limpios.has(abierto.clave)}
        onCerrar={() => setAbierto(null)}
      />
    </div>
  );
}
