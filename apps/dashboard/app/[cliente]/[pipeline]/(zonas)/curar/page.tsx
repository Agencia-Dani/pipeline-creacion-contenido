import { comoRuta, rutaDe } from "@/domain/rutas";
import Link from "next/link";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { pantallasDeCurar, type PantallaCurar } from "@/domain/pipelines";
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

// 🔑 **Acá va solo el TEXTO. Cuáles existen lo decide `domain/pipelines.ts`.**
//
// El primer intento tenía la lista de tarjetas escrita acá por pipeline, y eso dejaba dos
// expresiones de la misma verdad —lo que se dibuja y lo que de verdad existe— libres de divergir.
// Ahora el índice **deriva** de `pantallasDeCurar()`, que es la misma fuente que consulta la guardia
// del servidor (`exigirPantallaDeCurar`). Si las dos no coincidieran, el síntoma sería el peor de
// todos: una tarjeta que lleva a un redirect.
//
// El `Record<PantallaCurar, …>` es exhaustivo: agregar una pantalla al dominio **no compila** hasta
// escribirle su copy.
type Copy = { titulo: string; descripcion: string };

const COPY: Record<PantallaCurar, Copy> = {
  feed: {
    titulo: "Feed",
    descripcion:
      "Los videos que el motor trajo, para calificar. 🔥 y 👍 lo aprueban, 👎 lo descarta: con un click alcanza.",
  },
  descartes: {
    titulo: "Descartes",
    descripcion:
      "Los que el filtro mató por poco. Marcar cuáles eran buenos es lo que corrige los criterios. Lo que no marques sigue esperando: la lista ya no se borra.",
  },
  historicos: {
    titulo: "Históricos",
    descripcion:
      "Todo lo aprobado, de todas las semanas, con su transcripción. El feed se vacía; esto no.",
  },
  colecciones: {
    titulo: "Colecciones",
    descripcion:
      "Apartá los videos que vas a trabajar juntos, vengan del feed, de transcribir o pegados a mano. Sobre una colección se limpian los guiones y se baja el documento.",
  },
  voces: {
    titulo: "Voces y proyectos",
    descripcion:
      "Los clientes y sus temas: qué busca cada uno, con qué criterios y cuántos videos pide por corrida — ese número es el único que manda. Apagar una voz apaga sus proyectos.",
  },
  referentes: {
    titulo: "Referentes",
    descripcion:
      "El banco de donde sale el material: agregar, apagar lo que rinde poco y elegir a qué proyecto alimenta cada uno.",
  },
  sugeridos: {
    titulo: "Sugeridos",
    descripcion:
      "Las cuentas nuevas que el buscador propone cada lunes. Aprobar una la suma al banco sola.",
  },
};

// 🔑 **Las pantallas compartidas no significan lo mismo en los dos pipelines, así que el copy tampoco.**
// Es un overlay `Partial` y no un segundo Record completo: solo se escribe lo que de verdad cambia,
// y lo que no está acá cae al de arriba. Así una pantalla nueva sigue sin compilar hasta tener copy
// (el Record base es exhaustivo) sin obligar a escribir dos veces la que dice lo mismo.
//
// `voces` es el caso que lo justifica: en reels es *la voz con sus proyectos, su N y sus criterios*;
// en LinkedIn es *cómo habla y cuándo publica*. La misma ruta, dos cosas distintas.
const COPY_LINKEDIN: Partial<Record<PantallaCurar, Copy>> = {
  voces: {
    titulo: "Voces",
    descripcion:
      "Cómo habla cada cuenta y cuándo publica: su firma, su espaciado, sus franjas y sus días. Es la unidad de configuración de la máquina — se empieza por acá.",
  },
  referentes: {
    titulo: "Referentes",
    descripcion:
      "De dónde sale el material: filtros de Pinterest, cuentas de LinkedIn, páginas sueltas y el archivo propio de cada voz. Solo los prendidos entran en la próxima corrida.",
  },
  // Las dos de curación dicen que están vacías **desde la tarjeta**, antes de que alguien entre. Es
  // más honesto que dejar que lo descubra adentro: el motor no existe todavía, y sin decirlo acá el
  // cockpit promete un trabajo diario que no hay.
  feed: {
    titulo: "Feed",
    descripcion:
      "Lo que la máquina traiga, para calificar. Todavía vacío: el motor de LinkedIn no existe. Calificar acá no genera el post — marca la pieza y nada más.",
  },
  descartes: {
    titulo: "Descartes",
    descripcion:
      "Lo que el filtro mate, para decir si acertó. Todavía vacío, por lo mismo que el feed.",
  },
};

export default async function CurarPage({
  params,
}: {
  params: Promise<{ cliente: string; pipeline: string }>;
}) {
  const { cliente, pipeline } = await params;
  const { cockpit } = await exigirTenant("curar", cliente, pipeline);
  const base = comoRuta(cockpit);

  // Un pipeline no declarado no tiene pantallas, igual que no tiene zonas (ADR-056). Falla visible.
  const tarjetas = pantallasDeCurar(cockpit.workflowId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Curar</h1>
        <p className="text-muted-foreground">
          {cockpit.workflowId === "linkedin"
            ? "Acá se configura la máquina de LinkedIn: las voces que van a hablar y de dónde sale el material."
            : "Acá vas a calificar candidatos y mantener referentes, voces y proyectos."}
        </p>
      </div>

      {tarjetas.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Este pipeline todavía no tiene pantallas de curación.
        </p>
      ) : (
        tarjetas.map((pantalla) => {
          const copy =
            (cockpit.workflowId === "linkedin" ? COPY_LINKEDIN[pantalla] : undefined) ??
            COPY[pantalla];
          return (
            <Link key={pantalla} href={rutaDe(base, `curar/${pantalla}`)} className="block">
              <Card className="transition-colors hover:bg-accent/40">
                <CardHeader>
                  <CardTitle>{copy.titulo}</CardTitle>
                  <CardDescription>{copy.descripcion}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          );
        })
      )}
    </div>
  );
}
