"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

// Copiar el guion al portapapeles. Existe porque el guion es lo único de un candidato que sale
// del cockpit: se pega en el doc de guionado. Sin esto había que seleccionar 1000+ caracteres a
// mano desde un <dialog>, que es donde la selección se rompe más fácil.
//
// La confirmación es el propio botón cambiando de texto, no un toast: el foco ya está acá y no
// hace falta una capa más para decir algo que dura dos segundos.

export function Copiar({
  texto,
  etiqueta = "Copiar",
}: {
  texto: string | null;
  etiqueta?: string;
}) {
  const [copiado, setCopiado] = useState(false);
  const [fallo, setFallo] = useState(false);

  useEffect(() => {
    if (!copiado && !fallo) return;
    const t = setTimeout(() => {
      setCopiado(false);
      setFallo(false);
    }, 2000);
    return () => clearTimeout(t);
  }, [copiado, fallo]);

  const copiar = async () => {
    if (!texto) return;
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
    } catch {
      // clipboard falla sin https o sin permiso. Se dice, no se traga: si no, el equipo pega
      // el guion anterior y no se entera.
      setFallo(true);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={copiar}
      disabled={!texto}
      title={texto ? "Copiar el guion completo al portapapeles" : "Este video no tiene guion"}
    >
      {fallo ? "No se pudo copiar" : copiado ? "Copiado ✓" : etiqueta}
    </Button>
  );
}
