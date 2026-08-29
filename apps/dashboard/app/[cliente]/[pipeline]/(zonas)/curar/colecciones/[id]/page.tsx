import Link from "next/link";
import { notFound } from "next/navigation";
import { comoRuta, rutaDe } from "@/domain/rutas";
import type { Video } from "@/domain/video";
import { exigirPantallaDeCurar } from "@/lib/auth";
import { leerColeccion, leerMiembros } from "@/lib/colecciones";
import { leerMarcas } from "@/lib/grabados";
import { clavesConLimpio } from "@/lib/guiones-limpios";
import { leerLoQueSeSabe } from "@/lib/videos";
import { Detalle } from "./detalle";

// El detalle de una colección: sus videos, con todo lo que el sistema sabe de cada uno.
//
// 🔑 **Acá la tarjeta de ADR-072 se ve LLENA, y es el único lugar donde eso pasa hoy.** Es la
// consecuencia directa de ADR-073 §4: agrupar es el momento en que se compra la metadata. En
// Transcribir los mismos videos se siguen viendo pelados (0 de 130 tienen título), y no es un bug.

export const dynamic = "force-dynamic";
// El enriquecimiento corre dentro de una acción, no acá, pero esta página cruza tres fuentes y en
// frío puede tardar. Mismo techo que Transcribir.
export const maxDuration = 60;

export default async function ColeccionPage({
  params,
}: {
  params: Promise<{ cliente: string; pipeline: string; id: string }>;
}) {
  const { cliente, pipeline, id } = await params;
  const { ctx, cockpit } = await exigirPantallaDeCurar("colecciones", cliente, pipeline);
  const base = comoRuta(cockpit);

  const coleccion = await leerColeccion(ctx, id);
  // `notFound` y no un redirect: si alguien llegó con un id que no es suyo, la respuesta honesta es
  // que acá no hay nada, no mandarlo a otra pantalla como si se hubiera equivocado de camino.
  if (!coleccion) notFound();

  const [miembros, seSabe, limpios, marcas] = await Promise.all([
    leerMiembros(ctx, id),
    leerLoQueSeSabe(ctx),
    clavesConLimpio(ctx),
    // Las marcas de "ya se grabó" son del cockpit entero (ADR-070: la marca es por video, no por
    // colección), así que la mayoría no está en esta lista. La pantalla cruza por clave.
    leerMarcas(ctx),
  ]);

  // El miembro manda la identidad y la url (es la fila que existe seguro); lo que se sabe llena el
  // resto. Un video del que no se sabe nada sale entero en `null` y la tarjeta lo dibuja igual.
  const videos: Video[] = miembros.map(
    (m) =>
      seSabe.get(m.clave) ?? {
        clave: m.clave,
        plataforma: m.plataforma,
        external_id: m.external_id,
        url: m.url,
        titulo: null, referente: null, thumbnail: null,
        views: null, likes: null, seguidores: null, idioma: null, heat: null,
      },
  );

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={rutaDe(base, "curar/colecciones")}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Colecciones
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">{coleccion.nombre}</h1>
      </div>

      {/* `conLimpio` viaja como array: un Set no es serializable a través del límite
          server/client. Misma razón por la que `cargarTanda` manda sus marcas así. */}
      <Detalle
        coleccionId={id}
        videos={videos}
        conLimpio={[...limpios]}
        grabados={[...marcas.keys()]}
      />
    </div>
  );
}
