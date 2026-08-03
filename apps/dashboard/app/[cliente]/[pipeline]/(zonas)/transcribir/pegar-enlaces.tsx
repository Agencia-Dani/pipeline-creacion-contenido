"use client";

import { useMemo, useState, useTransition } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { parsearEnlaces } from "@/domain/enlace";
import { pegarEnlaces, type ResultadoPegar } from "./actions";

// El preview corre el MISMO parseo que el servidor (dominio puro, sirve en los dos lados): el
// equipo ve qué se entendió antes de gastar un peso. Transcribir cuesta (~USD 0.014 por link entre
// Supadata y Haiku), así que se confirma explícito, igual que ▶ Correr ahora (plan-cockpit §3.3).
export function PegarEnlaces() {
  const [texto, setTexto] = useState("");
  const [resultado, setResultado] = useState<ResultadoPegar | null>(null);
  const [enviando, startTransition] = useTransition();

  const { validos, invalidos } = useMemo(() => parsearEnlaces(texto), [texto]);

  const enviar = () => {
    startTransition(async () => {
      const r = await pegarEnlaces(texto);
      setResultado(r);
      if (r.ok) setTexto("");
    });
  };

  return (
    <div className="space-y-3">
      <Textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
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

      <Button onClick={enviar} disabled={enviando || validos.length === 0}>
        {enviando
          ? "Mandando…"
          : `Transcribir ${validos.length || ""} video${validos.length === 1 ? "" : "s"}`.trim()}
      </Button>

      {resultado && (
        <Alert variant={resultado.ok ? "default" : "destructive"}>
          <AlertDescription>{resultado.mensaje}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
