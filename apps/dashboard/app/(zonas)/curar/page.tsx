import Link from "next/link";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { exigirZona } from "@/lib/auth";

export default async function CurarPage() {
  await exigirZona("curar");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Curar</h1>
        <p className="text-muted-foreground">
          Acá vas a calificar candidatos y mantener referentes, voces y proyectos.
        </p>
      </div>

      <Link href="/curar/referentes" className="block">
        <Card className="transition-colors hover:bg-accent/40">
          <CardHeader>
            <CardTitle>Referentes</CardTitle>
            <CardDescription>
              El banco de cuentas de las que el motor trae videos: agregar, apagar las que
              rinden poco y elegir a qué proyectos alimenta cada una. Ya no se tocan en Airtable.
            </CardDescription>
          </CardHeader>
        </Card>
      </Link>

      <Link href="/curar/sugeridos" className="block">
        <Card className="transition-colors hover:bg-accent/40">
          <CardHeader>
            <CardTitle>Sugeridos</CardTitle>
            <CardDescription>
              Las cuentas nuevas que el buscador propone cada lunes. Aprobar una la suma al
              banco sola.
            </CardDescription>
          </CardHeader>
        </Card>
      </Link>

      <Link href="/curar/ajustes" className="block">
        <Card className="transition-colors hover:bg-accent/40">
          <CardHeader>
            <CardTitle>Ajustes</CardTitle>
            <CardDescription>
              Las perillas del sistema: cuántos candidatos trae cada corrida, qué tan
              exigente es el filtro, en qué plataformas busca. Ya no se tocan en Airtable.
            </CardDescription>
          </CardHeader>
        </Card>
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>Lo demás sigue en Airtable, por ahora</CardTitle>
          <CardDescription>
            El feed de calificación, las voces y los proyectos se curan como hasta ahora.
            Van llegando acá uno por uno (D5–D6).
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
