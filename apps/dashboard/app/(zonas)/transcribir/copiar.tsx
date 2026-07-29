"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function Copiar({ texto }: { texto: string }) {
  const [copiado, setCopiado] = useState(false);

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        await navigator.clipboard.writeText(texto);
        setCopiado(true);
        setTimeout(() => setCopiado(false), 2_000);
      }}
    >
      {copiado ? "Copiado ✓" : "Copiar script"}
    </Button>
  );
}
