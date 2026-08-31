import { comoRuta, rutaDe } from "@/domain/rutas";
import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FILTRO_INICIAL } from "@/domain/feed";
import { exigirPantallaDeCurar } from "@/lib/auth";
import { contarFeed, leerFeed } from "@/lib/candidatos";
import { contarDescartesPendientes } from "@/lib/descartes";
import { leerFeedLinkedin, TECHO } from "@/lib/candidatos-linkedin";
import { Mazo } from "./mazo";
import { MazoLinkedin } from "./mazo-linkedin";

// El feed de calificación (D6). Desde D7 los candidatos viven en Postgres — acá
// cambia la superficie, no el dueño (ver lib/candidatos.ts).
//
// `force-dynamic` no es una precaución genérica: las URLs de miniatura son attachments de
// Instagram/TikTok, firmadas y con expiry, así que una página cacheada serviría tarjetas rotas.

export const dynamic = "force-dynamic";

export default async function FeedPage({
  params,
}: {
  params: Promise<{ cliente: string; pipeline: string }>;
}) {
  const { cliente, pipeline } = await params;
  const { ctx, cockpit } = await exigirPantallaDeCurar("feed", cliente, pipeline);
  const base = comoRuta(cockpit);

  const volver = (
    <Link href={rutaDe(base, "curar")} className="text-sm text-muted-foreground hover:underline">
      ← Curar
    </Link>
  );

  // **Una ruta, dos mazos.** Mismo ramificado que `curar/voces` y `curar/referentes`: decide el
  // `workflowId` del cockpit, que es lo único que ya sabe de qué pipeline es esta pantalla.
  //
  // El de LinkedIn es más simple a propósito y no por estar a medias: no tiene filtros ni chips
  // porque **no hay contra qué filtrar todavía** (la tabla está vacía y su motor no existe), y
  // agregar cuatro `head` counts sobre una tabla en cero es cuatro queries para decir 0 cuatro veces.
  if (cockpit.workflowId === "linkedin") {
    const { filas, total } = await leerFeedLinkedin(ctx);
    return (
      <div className="space-y-6">
        {volver}
        <MazoLinkedin candidatos={filas} total={total} techo={TECHO} />
      </div>
    );
  }

  // Los conteos van aparte de las filas a propósito: son cuatro `head` counts sobre la tabla
  // entera, y es lo que deja que los chips digan el avance de CADA filtro y no solo del abierto.
  const [candidatos, cuentas, descartesPendientes] = await Promise.all([
    leerFeed(ctx, FILTRO_INICIAL),
    contarFeed(ctx),
    contarDescartesPendientes(ctx),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <Link href={rutaDe(base, "curar")} className="text-sm text-muted-foreground hover:underline">
          ← Curar
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">Feed</h1>
        <p className="text-muted-foreground">
          Los videos que el motor trajo, agrupados por proyecto y ordenados de más caliente a más
          frío (o por corrida, con el toggle de arriba). 🔥 y 👍 lo aprueban (el 🔥 además se usa como ejemplo para afinar los criterios);
          👎 lo descarta. Con un click alcanza — abrí la tarjeta solo si el título no te alcanza
          para decidir.
        </p>
      </div>

      {/* 🔑 El vacío se pregunta por `todos`, no por las filas que vinieron. Desde que el filtro
          se aplica en la query, la primera página puede venir vacía porque **ya está todo
          calificado** — que no es lo mismo que no tener candidatos, y merece otro texto. Ese
          segundo caso lo dice el Mazo, que sabe qué filtro está activo. */}
      {cuentas.todos === 0 ? (
        <Alert>
          <AlertDescription>
            No hay candidatos. El motor corre los lunes y deja acá lo que encuentra; también podés
            dispararlo desde <Link href={rutaDe(base, "operar")} className="underline underline-offset-4">Operar</Link>.
          </AlertDescription>
        </Alert>
      ) : (
        <Mazo
          inicial={candidatos}
          cuentas={cuentas}
          descartesPendientes={descartesPendientes}
        />
      )}
    </div>
  );
}
