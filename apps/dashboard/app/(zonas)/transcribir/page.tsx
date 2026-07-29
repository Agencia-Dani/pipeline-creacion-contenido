import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { haceCuanto } from "@/domain/corrida";
import { exigirZona } from "@/lib/auth";
import { leerTranscripciones, type Transcripcion } from "@/lib/transcripciones";
import { Copiar } from "./copiar";
import { PegarEnlaces } from "./pegar-enlaces";
import { Procesador } from "./procesador";

export const dynamic = "force-dynamic";
// Aplica a las Server Actions de esta página (docs de Next, route-segment-config). Alcanza de
// sobra: cada pasada se corta sola a los 45s y lo que quede lo agarra la siguiente.
export const maxDuration = 60;

const ESTADO_LEGIBLE: Record<Transcripcion["estado"], string> = {
  pendiente: "En cola",
  listo: "Listo",
  sin_transcript: "Sin voz",
  fallo: "Falló",
};

const BADGE_POR_ESTADO: Record<
  Transcripcion["estado"],
  "default" | "secondary" | "destructive" | "outline"
> = {
  pendiente: "default",
  listo: "secondary",
  sin_transcript: "outline",
  fallo: "destructive",
};

export default async function TranscribirPage() {
  await exigirZona("transcribir");

  const lista = await leerTranscripciones().catch((e) => {
    console.error("[transcribir] no se pudo leer la lista:", e);
    return null;
  });

  const pendientes = lista?.filter((t) => t.estado === "pendiente").length ?? 0;
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

      <Card>
        <CardHeader>
          <CardTitle>Transcripciones</CardTitle>
          <CardDescription>
            {pendientes > 0
              ? `Trabajando en ${pendientes} — esto se actualiza solo, podés quedarte mirando.`
              : "Las últimas 50, de la más nueva a la más vieja."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!lista ? (
            <Alert variant="destructive">
              <AlertTitle>No se pudo leer la lista</AlertTitle>
              <AlertDescription>
                Supabase no respondió. Recargá en un rato; si persiste, avisale a un dev.
              </AlertDescription>
            </Alert>
          ) : lista.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Todavía no pediste ninguna transcripción.
            </p>
          ) : (
            <ul className="space-y-4">
              {lista.map((t) => (
                <li key={t.id} className="space-y-2 border-b pb-4 last:border-0 last:pb-0">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                    <Badge variant={BADGE_POR_ESTADO[t.estado]}>
                      {ESTADO_LEGIBLE[t.estado]}
                    </Badge>
                    <a
                      href={t.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="break-all underline underline-offset-4"
                    >
                      {t.url}
                    </a>
                    <span className="text-muted-foreground">
                      {haceCuanto(t.creado_en, ahora)}
                      {t.idioma && t.idioma !== "es" && ` · original en ${t.idioma}`}
                    </span>
                  </div>

                  {t.script && (
                    <details className="space-y-2">
                      <summary className="cursor-pointer text-sm text-muted-foreground">
                        Ver el script ({t.script.length} caracteres)
                      </summary>
                      <p className="mt-2 whitespace-pre-wrap text-sm">{t.script}</p>
                      <div className="mt-2">
                        <Copiar texto={t.script} />
                      </div>
                    </details>
                  )}

                  {t.error && <p className="text-xs text-muted-foreground">{t.error}</p>}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
