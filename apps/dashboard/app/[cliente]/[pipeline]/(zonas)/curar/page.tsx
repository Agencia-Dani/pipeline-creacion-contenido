import { comoRuta, rutaDe } from "@/domain/rutas";
import Link from "next/link";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { exigirTenant } from "@/lib/auth";

// El índice de la zona Curar. **Las tarjetas son por pipeline**, no fijas.
//
// Hasta la Fase 5 esta página tenía las 7 de reels escritas a mano, y con un solo pipeline eso era
// correcto. Con dos deja de serlo: un cockpit de LinkedIn mostraba *Feed*, *Descartes*, *Históricos*,
// *Voces y proyectos*, *Sugeridos* y *Ajustes* — seis links a pantallas que leen las tablas de
// reels y devuelven vacío para su `instance_id`. No fallaban: mostraban "no hay nada", que en un
// pipeline recién nacido se lee como *"todavía no cargamos datos"* y no como *"esta pantalla no
// existe para este pipeline"*. Es la familia de la `015` otra vez.
//
// 🔑 **La lista dice lo que EXISTE, no lo que va a existir.** LinkedIn tiene una sola tarjeta hoy
// porque tiene una sola pantalla construida. Es el mismo default seguro de ADR-056 aplicado un
// nivel más abajo: un pipeline no declarado no tiene ninguna zona; una pantalla no construida no
// tiene tarjeta. Sumar la de candidatos es agregar una línea acá el día que la pantalla exista.

type Tarjeta = { ruta: string; titulo: string; descripcion: string };

const REELS: Tarjeta[] = [
  {
    ruta: "curar/feed",
    titulo: "Feed",
    descripcion:
      "Los videos que el motor trajo, para calificar. 🔥 y 👍 lo aprueban, 👎 lo descarta: con un click alcanza.",
  },
  {
    ruta: "curar/descartes",
    titulo: "Descartes",
    descripcion:
      "Los que el filtro mató por poco. Marcar cuáles eran buenos es lo que corrige los criterios. Lo que no marques sigue esperando: la lista ya no se borra.",
  },
  {
    ruta: "curar/historicos",
    titulo: "Históricos",
    descripcion:
      "Todo lo aprobado, de todas las semanas, con su transcripción. El feed se vacía; esto no.",
  },
  {
    ruta: "curar/voces",
    titulo: "Voces y proyectos",
    descripcion:
      "Los clientes y sus temas: qué busca cada uno, con qué criterios y cuántos videos pide por corrida — ese número es el único que manda. Apagar una voz apaga sus proyectos.",
  },
  {
    ruta: "curar/referentes",
    titulo: "Referentes",
    descripcion:
      "El banco de cuentas de las que el motor trae videos: agregar, apagar las que rinden poco y elegir a qué proyectos alimenta cada una.",
  },
  {
    ruta: "curar/sugeridos",
    titulo: "Sugeridos",
    descripcion:
      "Las cuentas nuevas que el buscador propone cada lunes. Aprobar una la suma al banco sola.",
  },
  {
    ruta: "curar/ajustes",
    titulo: "Ajustes",
    descripcion:
      "Las perillas del sistema: qué tan exigente es el filtro y en qué plataformas busca. Cuántos videos trae cada proyecto se decide en Voces y proyectos.",
  },
];

const LINKEDIN: Tarjeta[] = [
  {
    ruta: "curar/referentes",
    titulo: "Referentes",
    descripcion:
      "De dónde sale el material: filtros de Pinterest, cuentas de LinkedIn, páginas sueltas y el archivo propio de cada voz. Solo los prendidos entran en la próxima corrida.",
  },
];

const POR_PIPELINE: Record<string, Tarjeta[]> = {
  "short-form-content": REELS,
  linkedin: LINKEDIN,
};

export default async function CurarPage({
  params,
}: {
  params: Promise<{ cliente: string; pipeline: string }>;
}) {
  const { cliente, pipeline } = await params;
  const { cockpit } = await exigirTenant("curar", cliente, pipeline);
  const base = comoRuta(cockpit);

  // Un pipeline no declarado no tiene tarjetas, igual que no tiene zonas (ADR-056). Falla visible.
  const tarjetas = POR_PIPELINE[cockpit.workflowId] ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Curar</h1>
        <p className="text-muted-foreground">
          {cockpit.workflowId === "linkedin"
            ? "Acá se mantiene de dónde sale el material del pipeline de LinkedIn."
            : "Acá vas a calificar candidatos y mantener referentes, voces y proyectos."}
        </p>
      </div>

      {tarjetas.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Este pipeline todavía no tiene pantallas de curación.
        </p>
      ) : (
        tarjetas.map((t) => (
          <Link key={t.ruta} href={rutaDe(base, t.ruta)} className="block">
            <Card className="transition-colors hover:bg-accent/40">
              <CardHeader>
                <CardTitle>{t.titulo}</CardTitle>
                <CardDescription>{t.descripcion}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))
      )}
    </div>
  );
}
