import Link from "next/link";
import { exigirZona } from "@/lib/auth";
import { leerVocesConProyectos } from "@/lib/proyectos";
import { Pantalla } from "./pantalla";

// Voces y proyectos: el tercer dominio que se cortó de Airtable (D5, corte 3/4). Postgres es el
// dueño.
//
// Una sola pantalla y no dos, por la misma razón que *A revisar* vive dentro de Referentes: la
// voz es la espina dorsal (PLAN §2.5) y apagarla apaga sus proyectos sin tocarlos. Con dos
// páginas, la consecuencia de un click quedaba en la otra.
//
// Toda la interacción vive en `pantalla.tsx` (cliente): acá solo se lee. Ya no hace falta leer
// los ajustes — el N de cada proyecto es obligatorio y no cae contra ningún global.

export const dynamic = "force-dynamic";

export default async function VocesPage() {
  await exigirZona("curar");

  const voces = await leerVocesConProyectos();

  return (
    <div className="space-y-6">
      <Link href="/curar" className="text-sm text-muted-foreground hover:underline">
        ← Curar
      </Link>
      <Pantalla voces={voces} />
    </div>
  );
}
