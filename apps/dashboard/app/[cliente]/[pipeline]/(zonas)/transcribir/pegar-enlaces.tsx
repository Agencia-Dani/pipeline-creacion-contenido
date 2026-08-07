"use client";

import { useMemo, useState, useTransition } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { parsearEnlaces } from "@/domain/enlace";
import { pegarEnlaces, revisarPegote, type Revision, type ResultadoPegar } from "./actions";
import { usarCockpit } from "../usar-cockpit";

// El preview corre el MISMO parseo que el servidor (dominio puro, sirve en los dos lados): el
// equipo ve qué se entendió antes de gastar un peso. Transcribir cuesta (~USD 0.014 por link entre
// Supadata y Haiku), así que se confirma explícito, igual que ▶ Correr ahora (plan-cockpit §3.3).
//
// 🔑 **Desde el 2026-08-07 hay un paso más, y solo aparece cuando hace falta.** El parseo del
// cliente sabe qué es un link válido, pero no sabe cuáles ya tenemos: eso vive en la base. Así que
// al apretar Transcribir se consulta primero (`revisarPegote`, que no escribe ni cobra):
//
//  · si no hay nada que sacar → encola derecho, un solo click, igual que siempre;
//  · si hay → se ofrece quitarlos. Aceptar **reescribe el campo** con los que sí se van a
//    transcribir y los manda en el mismo acto.
//
// Se ofrece en vez de quitarlos solo porque "el motor ya lo vio" NO implica que exista el guion:
// `processed_items` guarda todo lo que el motor consideró, aunque el gate lo haya matado antes de
// transcribirlo. Quitarlo por default escondería la única forma de conseguir ese script.
export function PegarEnlaces() {
  const cockpit = usarCockpit();
  const [texto, setTexto] = useState("");
  const [resultado, setResultado] = useState<ResultadoPegar | null>(null);
  const [revision, setRevision] = useState<Revision | null>(null);
  const [enviando, startTransition] = useTransition();

  const { validos, invalidos } = useMemo(() => parsearEnlaces(texto), [texto]);

  // Editar el textarea invalida la revisión: si no, se podría aceptar "quitar 3" sobre un pegote
  // que ya no es el que se revisó.
  const escribir = (v: string) => {
    setTexto(v);
    setRevision(null);
    setResultado(null);
  };

  const encolar = (conTexto: string) =>
    startTransition(async () => {
      const r = await pegarEnlaces(cockpit, conTexto);
      setResultado(r);
      setRevision(null);
      if (r.ok) setTexto("");
    });

  const revisarYEncolar = () =>
    startTransition(async () => {
      const r = await revisarPegote(cockpit, texto);
      if (!r.ok) {
        setResultado({ ok: false, mensaje: r.mensaje });
        return;
      }
      const sobra = r.revision.yaEnCola + r.revision.fallados + r.revision.yaVistosPorElMotor;
      if (sobra === 0) {
        const enviado = await pegarEnlaces(cockpit, texto);
        setResultado(enviado);
        if (enviado.ok) setTexto("");
        return;
      }
      setRevision(r.revision);
    });

  const aceptarQuitar = () => {
    if (!revision) return;
    const limpio = revision.nuevos.join("\n");
    setTexto(limpio); // el campo queda con lo que de verdad se va a transcribir
    if (revision.nuevos.length === 0) {
      setRevision(null);
      setResultado({ ok: true, mensaje: "No quedó ninguno para transcribir: ya los teníamos todos." });
      return;
    }
    encolar(limpio);
  };

  return (
    <div className="space-y-3">
      <Textarea
        value={texto}
        onChange={(e) => escribir(e.target.value)}
        disabled={enviando}
        rows={6}
        placeholder={
          "Pegá los links acá. Uno por línea, separados por comas, o el chat entero de WhatsApp: da igual.\n\nhttps://www.instagram.com/reel/…\nhttps://www.tiktok.com/@alguien/video/…"
        }
        className="font-mono text-xs"
      />

      {texto.trim().length > 0 && (
        <p className="text-sm text-muted-foreground">
          {validos.length === 0
            ? "No reconozco ningún link de video todavía."
            : `${validos.length} video${validos.length === 1 ? "" : "s"} detectado${validos.length === 1 ? "" : "s"}`}
          {invalidos.length > 0 && ` · ${invalidos.length} link${invalidos.length === 1 ? "" : "s"} que no sirve${invalidos.length === 1 ? "" : "n"}`}
        </p>
      )}

      {invalidos.length > 0 && (
        <ul className="space-y-1 text-xs text-muted-foreground">
          {invalidos.slice(0, 5).map((i) => (
            <li key={i.texto}>
              <span className="break-all font-mono">{i.texto}</span> — {i.razon}
            </li>
          ))}
        </ul>
      )}

      {revision ? (
        <div className="space-y-3 rounded-lg border border-primary/40 bg-primary/5 p-4">
          <div>
            <p className="font-medium">
              {revision.yaEnCola + revision.fallados + revision.yaVistosPorElMotor} de estos{" "}
              {validos.length} no hace falta transcribirlos.
            </p>
            <ul className="mt-1 space-y-0.5 text-sm text-muted-foreground">
              {revision.yaEnCola > 0 && (
                <li>
                  <strong>{revision.yaEnCola}</strong> ya los pediste antes — el guion está o viene
                  en camino, abajo en la lista.
                </li>
              )}
              {/* Separado de `yaEnCola` a propósito: decirle "viene en camino" a un link que falló
                  manda a esperar algo que no va a pasar. Volver a pegarlo tampoco lo arregla (el
                  upsert lo descarta), así que el único camino es el botón. */}
              {revision.fallados > 0 && (
                <li>
                  <strong>{revision.fallados}</strong> los pediste y <strong>fallaron</strong>. El
                  guion no viene: reintentalos con su botón <em>Reintentar</em>, en la lista de
                  abajo. Volver a pegarlos acá no los destraba.
                </li>
              )}
              {revision.yaVistosPorElMotor > 0 && (
                <li>
                  <strong>{revision.yaVistosPorElMotor}</strong> ya los vio el motor. Ojo: eso no
                  garantiza que exista el guion (el filtro pudo haberlos matado antes de
                  transcribirlos), así que si lo necesitás, transcribilos igual.
                </li>
              )}
            </ul>
            <p className="mt-2 text-sm">
              Quedan <strong>{revision.nuevos.length}</strong> para transcribir
              {revision.nuevos.length > 0 && ` (~USD ${(revision.nuevos.length * 0.014).toFixed(2)})`}.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={aceptarQuitar} disabled={enviando}>
              {enviando
                ? "Mandando…"
                : `Quitarlos y transcribir ${revision.nuevos.length}`}
            </Button>
            <Button variant="outline" onClick={() => encolar(texto)} disabled={enviando}>
              Transcribir los {validos.length} igual
            </Button>
          </div>
        </div>
      ) : (
        <Button onClick={revisarYEncolar} disabled={enviando || validos.length === 0}>
          {enviando
            ? "Mandando…"
            : `Transcribir ${validos.length || ""} video${validos.length === 1 ? "" : "s"}`.trim()}
        </Button>
      )}

      {resultado && (
        <Alert variant={resultado.ok ? "default" : "destructive"}>
          <AlertDescription>{resultado.mensaje}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
