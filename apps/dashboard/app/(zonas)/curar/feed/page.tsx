import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { exigirTenant } from "@/lib/auth";
import { leerFeed } from "@/lib/candidatos";
import { leerDescartes } from "@/lib/descartes";
import { Mazo } from "./mazo";

// El feed de calificación (D6). Desde D7 los candidatos viven en Postgres — acá
// cambia la superficie, no el dueño (ver lib/candidatos.ts).
//
// `force-dynamic` no es una precaución genérica: las URLs de miniatura son attachments de
// Instagram/TikTok, firmadas y con expiry, así que una página cacheada serviría tarjetas rotas.

export const dynamic = "force-dynamic";

export default async function FeedPage() {
  const { ctx } = await exigirTenant("curar");

  const [candidatos, descartes] = await Promise.all([leerFeed(ctx), leerDescartes(ctx)]);
  const descartesPendientes = descartes.filter((d) => d.veredicto === null).length;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/curar" className="text-sm text-muted-foreground hover:underline">
          ← Curar
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">Feed</h1>
        <p className="text-muted-foreground">
          Los videos que el motor trajo, agrupados por proyecto y ordenados de más caliente a más
          frío. 🔥 y 👍 lo aprueban (el 🔥 además se usa como ejemplo para afinar los criterios);
          👎 lo descarta. Con un click alcanza — abrí la tarjeta solo si el título no te alcanza
          para decidir.
        </p>
      </div>

      {candidatos.length === 0 ? (
        <Alert>
          <AlertDescription>
            No hay candidatos. El motor corre los lunes y deja acá lo que encuentra; también podés
            dispararlo desde <Link href="/operar" className="underline underline-offset-4">Operar</Link>.
          </AlertDescription>
        </Alert>
      ) : (
        <Mazo candidatos={candidatos} descartesPendientes={descartesPendientes} />
      )}
    </div>
  );
}
