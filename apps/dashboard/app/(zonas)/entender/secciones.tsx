import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { diagnosticoCriterio } from "@/domain/entender";
import type { FilaCalidad, FilaCosto, FilaEmbudo } from "@/lib/entender";

// Las 3 secciones de la zona Entender, separadas de la página para poder
// renderizarlas solas (fixtures, previews). Presentación pura: cero IO.

const usd = (n: number) => `$${n.toFixed(2)}`;
const pct = (n: number | null) => (n == null ? "—" : `${Math.round(n * 100)}%`);
const num = (n: number | null) => (n == null ? "—" : String(n));
const semanaDel = (iso: string) =>
  `semana del ${new Date(`${iso}T00:00:00`).toLocaleDateString("es", {
    day: "numeric",
    month: "short",
  })}`;

export function ErrorLectura({ que }: { que: string }) {
  return (
    <Alert variant="destructive">
      <AlertTitle>No se pudo leer {que}</AlertTitle>
      <AlertDescription>
        Supabase no respondió. Recargá en un rato; si persiste, avisale a un dev.
      </AlertDescription>
    </Alert>
  );
}

// ── Calidad por proyecto (reemplaza la página Calidad de Airtable) ──────────────

export function Calidad({ filas }: { filas: FilaCalidad[] }) {
  if (filas.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Todavía no hay semanas con calificaciones. Aparecen cuando el equipo califica
        y el archivado cierra la semana.
      </p>
    );
  }
  const ultimaSemana = filas[0].semana;
  const actuales = filas.filter((f) => f.semana === ultimaSemana);
  const historia = filas.filter((f) => f.semana !== ultimaSemana);

  return (
    <div className="space-y-4">
      <p className="text-sm font-medium">{semanaDel(ultimaSemana)}</p>
      {actuales.map((f) => {
        const d = diagnosticoCriterio(f.separacion_gate, f.precision);
        return (
          <div key={`${f.semana}-${f.proyecto}`} className="space-y-1">
            <div className="flex flex-wrap items-baseline gap-x-3 text-sm">
              <span className="font-medium">{f.proyecto ?? "(sin proyecto)"}</span>
              <span className="text-muted-foreground">
                {f.calificados} calificados · {f.aprobados} aprobados · precisión{" "}
                {pct(f.precision)} · separación del gate {num(f.separacion_gate)}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">{d.texto}</p>
          </div>
        );
      })}
      {historia.length > 0 && (
        <>
          <Separator />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-1 pr-4 font-normal">Semana</th>
                  <th className="py-1 pr-4 font-normal">Proyecto</th>
                  <th className="py-1 pr-4 text-right font-normal">Calificados</th>
                  <th className="py-1 pr-4 text-right font-normal">Aprobados</th>
                  <th className="py-1 text-right font-normal">Precisión</th>
                </tr>
              </thead>
              <tbody>
                {historia.map((f) => (
                  <tr key={`${f.semana}-${f.proyecto}`} className="border-t border-border/50">
                    <td className="py-1 pr-4 whitespace-nowrap">{f.semana}</td>
                    <td className="py-1 pr-4">{f.proyecto}</td>
                    <td className="py-1 pr-4 text-right">{f.calificados}</td>
                    <td className="py-1 pr-4 text-right">{f.aprobados}</td>
                    <td className="py-1 text-right">{pct(f.precision)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ── Embudo y salud del motor (reemplaza Salud del Sistema) ─────────────────────

const ETAPAS: { clave: keyof FilaEmbudo; nombre: string }[] = [
  { clave: "colectados", nombre: "Colectados" },
  { clave: "asignados", nombre: "Asignados a proyecto" },
  { clave: "pretrim", nombre: "Pasaron el pre-trim" },
  { clave: "filtrados", nombre: "Con heat-score" },
  { clave: "gate_pass", nombre: "Pasaron el gate" },
  { clave: "entregados", nombre: "Entregados al feed" },
];

export function Embudo({ filas }: { filas: FilaEmbudo[] }) {
  if (filas.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Todavía no hay corridas del motor registradas.
      </p>
    );
  }
  const s = filas[0];
  const base = s.colectados ?? 0;

  return (
    <div className="space-y-4">
      <p className="text-sm font-medium">{semanaDel(s.semana)}</p>
      <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
        <div>
          <p className="text-2xl font-semibold">{num(s.entregados)}</p>
          <p className="text-muted-foreground">candidatos entregados</p>
        </div>
        <div>
          <p className="text-2xl font-semibold">{num(s.sin_guion)}</p>
          <p className="text-muted-foreground">sin guion (fallo de transcripción)</p>
        </div>
        <div>
          <p className="text-2xl font-semibold">
            {s.runs_ok} <span className="text-base font-normal">ok</span>
            {s.runs_fallo > 0 && (
              <>
                {" "}
                · {s.runs_fallo} <span className="text-base font-normal">con fallo</span>
              </>
            )}
          </p>
          <p className="text-muted-foreground">corridas de la semana</p>
        </div>
        <div>
          <p className="text-2xl font-semibold">{num(s.duracion_min)} min</p>
          <p className="text-muted-foreground">de corrida en total</p>
        </div>
      </div>
      {base > 0 && (
        <div className="space-y-2">
          {ETAPAS.map(({ clave, nombre }) => {
            const valor = (s[clave] as number | null) ?? 0;
            return (
              <div key={clave} className="grid grid-cols-[11rem_1fr_3.5rem] items-center gap-2 text-sm">
                <span className="text-muted-foreground">{nombre}</span>
                <div className="h-2 rounded-[4px] bg-muted">
                  <div
                    className="h-2 rounded-[4px] bg-primary"
                    style={{ width: `${Math.max((valor / base) * 100, valor > 0 ? 1 : 0)}%` }}
                  />
                </div>
                <span className="text-right tabular-nums">{valor}</span>
              </div>
            );
          })}
        </div>
      )}
      {filas.length > 1 && (
        <p className="text-sm text-muted-foreground">
          Semanas anteriores:{" "}
          {filas
            .slice(1)
            .map((f) => `${f.semana}: ${f.entregados ?? 0} entregados`)
            .join(" · ")}
        </p>
      )}
    </div>
  );
}

// ── Costos de la semana (reemplaza Costos) ─────────────────────────────────────

export function Costos({ filas }: { filas: FilaCosto[] }) {
  if (filas.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Todavía no hay contadores de consumo. Se llenan con cada corrida del motor y
        del descubrimiento.
      </p>
    );
  }
  const ultimaSemana = filas[0].semana;
  const actuales = filas.filter((f) => f.semana === ultimaSemana);
  const total = actuales.reduce((suma, f) => suma + f.costo_usd, 0);

  const totalesAnteriores = new Map<string, number>();
  for (const f of filas) {
    if (f.semana === ultimaSemana) continue;
    totalesAnteriores.set(f.semana, (totalesAnteriores.get(f.semana) ?? 0) + f.costo_usd);
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-3xl font-semibold">{usd(total)}</p>
        <p className="text-sm text-muted-foreground">{semanaDel(ultimaSemana)}, todos los servicios</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-1 pr-4 font-normal">Servicio</th>
              <th className="py-1 pr-4 font-normal">Qué mide</th>
              <th className="py-1 pr-4 text-right font-normal">Unidades</th>
              <th className="py-1 text-right font-normal">Costo</th>
            </tr>
          </thead>
          <tbody>
            {actuales.map((f) => (
              <tr key={f.servicio} className="border-t border-border/50">
                <td className="py-1 pr-4 whitespace-nowrap">{f.servicio}</td>
                <td className="py-1 pr-4 text-muted-foreground">{f.unidad}</td>
                <td className="py-1 pr-4 text-right tabular-nums">{f.unidades}</td>
                <td className="py-1 text-right tabular-nums">{usd(f.costo_usd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalesAnteriores.size > 0 && (
        <p className="text-sm text-muted-foreground">
          Semanas anteriores:{" "}
          {[...totalesAnteriores.entries()]
            .map(([semana, t]) => `${semana}: ${usd(t)}`)
            .join(" · ")}
        </p>
      )}
    </div>
  );
}

