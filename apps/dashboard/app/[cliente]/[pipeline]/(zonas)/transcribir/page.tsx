import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { exigirTenant } from "@/lib/auth";
import { fechaHora } from "@/lib/fechas";
import { leerAutores, leerCabeceras } from "@/lib/tandas";
import { leerFallidas, leerSueltas } from "@/lib/transcripciones";
import { Fila } from "./fila";
import { PegarEnlaces } from "./pegar-enlaces";
import { Procesador } from "./procesador";
import { Tanda } from "./tanda";

export const dynamic = "force-dynamic";
// Aplica a las Server Actions de esta página (docs de Next, route-segment-config). Alcanza de
// sobra: cada pasada se corta sola a los 45s y lo que quede lo agarra la siguiente.
export const maxDuration = 60;

export default async function TranscribirPage({
  params,
}: {
  params: Promise<{ cliente: string; pipeline: string }>;
}) {
  const { cliente, pipeline } = await params;
  const { ctx } = await exigirTenant("transcribir", cliente, pipeline);

  // 🔑 **La página carga CABECERAS, no filas** (ADR-064 §3), y eso es lo que mató el techo de 50:
  // hasta el 2026-08-07 pedía las últimas 50 transcripciones **con sus `script`** sobre 110 en la
  // base, o sea que ocultaba más de la mitad sin que nada en la pantalla lo dijera. Ahora se ven
  // **todas** las tandas —una cabecera es título + contadores— y los guiones bajan al expandir.
  const tandas = await leerCabeceras(ctx).catch((e) => {
    console.error("[transcribir] no se pudieron leer las tandas:", e);
    return null;
  });

  // 🩸 Las fallidas se traen aparte y **cruzando tandas a propósito**: son "lo que necesita tu
  // atención". Agruparlas por pegote las volvería a esconder, que es el bug del que salieron
  // (medido el 2026-08-07: la única fallada del día cayó en la posición 49 de 50, indistinguible
  // entre 49 `Listo`, y el pegote siguiente la habría empujado fuera de la ventana dejando su botón
  // `Reintentar` inalcanzable).
  const fallidas = await leerFallidas(ctx).catch((e) => {
    console.error("[transcribir] no se pudieron leer las fallidas:", e);
    return [];
  });

  // El canario: tiene que dar cero siempre. Ver `leerSueltas`.
  const sueltas = await leerSueltas(ctx).catch((e) => {
    console.error("[transcribir] no se pudieron leer las sueltas:", e);
    return [];
  });

  const autores = await leerAutores();

  // Las sueltas se suman: si `asignarTanda` falló, sus pendientes no están en ninguna cabecera y el
  // `Procesador` —que arranca solo cuando este número es > 0— nunca los levantaría.
  const pendientes =
    (tandas?.reduce((n, t) => n + t.pendientes, 0) ?? 0) +
    sueltas.filter((t) => t.estado === "pendiente").length;
  const ahora = new Date();

  return (
    <div className="space-y-6">
      <Procesador pendientes={pendientes} />
      <div>
        <h1 className="text-2xl font-semibold">Transcribir</h1>
        <p className="text-muted-foreground">
          Pegá links de videos y recibí el script en español. Lo que pases acá deja de
          aparecer en las búsquedas del motor.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pegá los links</CardTitle>
          <CardDescription>
            Instagram (reels y posts de video) y TikTok. El script es literal: es lo que
            dice el video, traducido, sin adaptar a ninguna voz — esa parte la hacen ustedes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PegarEnlaces />
        </CardContent>
      </Card>

      {fallidas.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              {fallidas.length === 1 ? "1 no salió" : `${fallidas.length} no salieron`}
            </CardTitle>
            <CardDescription>
              Estas se quedan acá hasta que hagas algo: el guion no existe todavía y volver a
              pegar el link no las destraba. Reintentar no cuesta nada si vuelve a fallar; si el
              video no tiene voz, reintentar no va a servir nunca y lo que corresponde es abandonarlo.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-4">
              {fallidas.map((t) => (
                <Fila key={t.id} t={t} ahora={ahora} />
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Tus tandas</CardTitle>
          <CardDescription>
            {pendientes > 0
              ? `Trabajando en ${pendientes} — esto se actualiza solo, podés quedarte mirando.`
              : "Cada vez que pegás links se arma una tanda. Abrí una para ver sus guiones, y ponele nombre si querés reconocerla después."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!tandas ? (
            <Alert variant="destructive">
              <AlertTitle>No se pudieron leer las tandas</AlertTitle>
              <AlertDescription>
                Supabase no respondió. Recargá en un rato; si persiste, avisale a un dev.
              </AlertDescription>
            </Alert>
          ) : tandas.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Todavía no pediste ninguna transcripción.
            </p>
          ) : (
            <ul className="space-y-2">
              {tandas.map((t) => (
                <Tanda
                  key={t.id}
                  cabecera={t}
                  autor={t.creadaPor ? autores.get(t.creadaPor) ?? null : null}
                  cuando={fechaHora(t.creadoEn)}
                  ahora={ahora}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* No debería dibujarse nunca. Si aparece, `asignarTanda` falló y estas filas no están en
          ninguna cabecera: son guiones ya pagados que la pantalla no mostraría. */}
      {sueltas.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{sueltas.length} sin tanda</CardTitle>
            <CardDescription>
              Estas quedaron fuera de todo pegote. No es normal: avisale a un dev. Los guiones están
              y se pueden copiar igual.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-4">
              {sueltas.map((t) => (
                <Fila key={t.id} t={t} ahora={ahora} />
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
