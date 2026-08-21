"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { GrillaVideos } from "@/components/video/grupos";
import { TarjetaVideo } from "@/components/video/tarjeta";
import { necesitaEnriquecer } from "@/domain/colecciones";
import type { Video } from "@/domain/video";
import { usarCockpit } from "../../../usar-cockpit";
import { agregarPegados, identificarFaltantes, quitar } from "../actions";
import { Identificador } from "./identificador";

// El contenido de una colección.
//
// **Meter videos es pegar links**, que es el idioma que esta app ya usa para *"hacer algo con
// muchos ítems"* (el pegote de Transcribir, la carga masiva de Históricos). Es además lo que Majo
// ya tiene a mano: sus documentos de scripts son listas de links.

export function Detalle({ coleccionId, videos }: { coleccionId: string; videos: Video[] }) {
  const cockpit = usarCockpit();
  const [texto, setTexto] = useState("");
  const [aviso, setAviso] = useState<{ ok: boolean; mensaje: string } | null>(null);
  const [trabajando, startTransition] = useTransition();
  const [quitando, setQuitando] = useState<string | null>(null);

  const sinIdentificar = videos.filter(necesitaEnriquecer).length;

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

  function sacar(v: Video) {
    if (trabajando) return;
    setQuitando(v.clave);
    startTransition(async () => {
      const r = await quitar(cockpit, coleccionId, v.plataforma, v.external_id);
      setQuitando(null);
      if (!r.ok) setAviso(r);
    });
  }

  return (
    <div className="space-y-6">
      {/* Invisible: dispara las pasadas de identificación solo. El botón de abajo se queda como
          salida manual para cuando el bucle cortó porque una pasada trajo cero. */}
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
          {/* Solo aparece si hay algo que identificar. Un botón que no tiene nada que hacer es una
              invitación a apretarlo y gastar plata en nada. */}
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
                onAbrir={() => window.open(v.url, "_blank", "noreferrer,noopener")}
                pie={
                  <>
                    <span className="truncate text-xs text-muted-foreground">
                      {v.likes != null ? `${v.likes.toLocaleString("es-AR")} likes` : "—"}
                    </span>
                    {/* Sin confirmación: sacar un video de una bolsa se deshace volviéndolo a
                        pegar, y la regla de la casa es que lo que se deshace no se pregunta. */}
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
    </div>
  );
}
