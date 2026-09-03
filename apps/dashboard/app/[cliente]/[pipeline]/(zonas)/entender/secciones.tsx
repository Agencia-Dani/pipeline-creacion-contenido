import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import type { Corrida } from "@/domain/corrida";
import { calidadGlobal, diagnosticoCriterio, type NorteProyecto } from "@/domain/entender";
import { fecha, fechaHora } from "@/lib/fechas";
import type {
  FilaAuditoria,
  FilaCalidad,
  FilaCosto,
  FilaDescubrimiento,
  FilaEmbudo,
  FilaEvento,
} from "@/lib/entender";

// Las secciones de la zona Entender, separadas de la página para poder renderizarlas solas
// (fixtures, previews). Presentación pura: cero IO.

const usd = (n: number) => `$${n.toFixed(2)}`;
const pct = (n: number | null) => (n == null ? "—" : `${Math.round(n * 100)}%`);
const num = (n: number | null) => (n == null ? "—" : String(n));
// `iso` acá es un `date` puro de Postgres (`2026-08-01`), sin hora. Se le pega el mediodía para que
// ningún corrimiento de zona lo empuje al día anterior.
const semanaDel = (iso: string) => `semana del ${fecha(`${iso}T12:00:00`)}`;

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

// ── El norte: aprobados contra lo pedido (ADR-089, cierre 140) ──────────────────

function EstadoNorte({ n }: { n: NorteProyecto }) {
  if (n.estado === "sin_entrega") {
    return <span className="text-muted-foreground">no se le entregó nada esta corrida</span>;
  }
  if (n.estado === "sin_dato") {
    return (
      <span className="text-muted-foreground">
        sin datos vivos para calcularlo — probablemente ya se archivó
      </span>
    );
  }
  return (
    <span>
      <span className="font-medium">{pct(n.norte)}</span>{" "}
      <span className="text-muted-foreground">
        ({n.aprobados}/{n.nPedido} pedidos)
      </span>
      {n.estado === "piso" && (
        <span className="text-muted-foreground">
          {" "}
          — piso: solo {n.calificados}/{n.entregados} calificados, puede subir
        </span>
      )}
    </span>
  );
}

export function Norte({
  historico,
}: {
  historico: { corrida: Corrida; filas: NorteProyecto[] }[];
}) {
  if (historico.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Todavía no hay corridas del motor con desglose por proyecto.
      </p>
    );
  }
  const [ultima, ...anteriores] = historico;

  return (
    <div className="space-y-4">
      <p className="text-sm font-medium">{fechaHora(ultima.corrida.inicio)}</p>
      <div className="space-y-1.5">
        {ultima.filas.map((n) => (
          <div key={n.nombre} className="flex flex-wrap items-baseline gap-x-3 text-sm">
            <span className="font-medium">{n.nombre}</span>
            <EstadoNorte n={n} />
          </div>
        ))}
      </div>
      {anteriores.length > 0 && (
        <>
          <Separator />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-1 pr-4 font-normal">Corrida</th>
                  <th className="py-1 pr-4 font-normal">Proyecto</th>
                  <th className="py-1 pr-4 text-right font-normal">Pedido</th>
                  <th className="py-1 pr-4 text-right font-normal">Aprobados</th>
                  <th className="py-1 text-right font-normal">Norte</th>
                </tr>
              </thead>
              <tbody>
                {anteriores.flatMap((h) =>
                  h.filas.map((n) => (
                    <tr key={`${h.corrida.id}-${n.nombre}`} className="border-t border-border/50">
                      <td className="py-1 pr-4 whitespace-nowrap">{fechaHora(h.corrida.inicio)}</td>
                      <td className="py-1 pr-4">{n.nombre}</td>
                      <td className="py-1 pr-4 text-right">{n.nPedido}</td>
                      <td className="py-1 pr-4 text-right">{n.aprobados}</td>
                      <td className="py-1 text-right">
                        {n.estado === "sin_entrega" || n.estado === "sin_dato"
                          ? "—"
                          : `${pct(n.norte)}${n.estado === "piso" ? " (piso)" : ""}`}
                      </td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ── Calidad por proyecto (reemplaza la página Calidad de Airtable) ──────────────

// `activos` son TODOS los proyectos prendidos, no solo los que tienen fila esa semana.
// La vista `v_metricas_calidad` solo devuelve proyectos con calificaciones, así que un proyecto
// sin calificar simplemente no aparecía — y un proyecto ausente se lee como "no existe", no como
// "nadie lo calificó". Es la misma familia de silencio que la card de auditoría ya advierte:
// un número que falta no es un cero, y un cero sin muestra no es una buena noticia.
/**
 * El total de la semana, que Airtable tenía como fila `GLOBAL` y el corte se había llevado. Va
 * arriba de los proyectos porque es la respuesta a "¿cómo venimos?", que es lo primero que se
 * pregunta; el desglose contesta "¿y quién la está bajando?".
 */
function Global({ filas }: { filas: FilaCalidad[] }) {
  const g = calidadGlobal(filas);
  return (
    <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
      <span className="font-medium">Total de la semana</span>{" "}
      <span className="text-muted-foreground">
        {g.calificados} calificados · {g.aprobados} aprobados · {g.descartados} descartados ·
        precisión {pct(g.precision)}
      </span>
    </div>
  );
}

export function Calidad({ filas, activos }: { filas: FilaCalidad[]; activos: string[] }) {
  if (filas.length === 0 && activos.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Todavía no hay semanas con calificaciones. Aparecen cuando el equipo califica
        y el archivado cierra la semana.
      </p>
    );
  }
  const ultimaSemana = filas[0]?.semana ?? null;
  const actuales = ultimaSemana ? filas.filter((f) => f.semana === ultimaSemana) : [];
  const historia = ultimaSemana ? filas.filter((f) => f.semana !== ultimaSemana) : [];
  const conDatos = new Set(actuales.map((f) => f.proyecto));
  const sinCalificar = activos.filter((p) => !conDatos.has(p));

  return (
    <div className="space-y-4">
      <p className="text-sm font-medium">
        {ultimaSemana ? semanaDel(ultimaSemana) : "Todavía sin calificaciones"}
      </p>
      {actuales.length > 0 && <Global filas={actuales} />}
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
      {sinCalificar.map((proyecto) => (
        <div key={`sin-${proyecto}`} className="flex flex-wrap items-baseline gap-x-3 text-sm">
          <span className="font-medium text-muted-foreground">{proyecto}</span>
          <span className="text-muted-foreground">
            sin calificaciones esta semana — no hay con qué medirlo
          </span>
        </div>
      ))}
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

// ⚠️ Esto NO es un embudo de seis pasos, y tratarlo como tal era un bug visible: con una sola
// base (`colectados`) la barra de `asignados` pedía 226% de ancho y se salía del riel.
//
// La razón es del dominio, no del CSS: `Asignar proyecto+voz` hace fan-out — un video que encaja
// en tres proyectos genera TRES filas y se evalúa tres veces. De ahí en adelante, hasta el gate,
// lo que se cuenta son evaluaciones `(video × proyecto)`, no videos. Recién `entregados` vuelve a
// contar videos únicos, porque el dedup de `Armar candidato` deja una sola copia (ADR-018).
//
// Por eso son dos embudos con su propia base, y no seis barras comparando peras con manzanas.
const EMBUDOS: {
  titulo: string;
  aclaracion?: string;
  base: keyof FilaEmbudo;
  etapas: { clave: keyof FilaEmbudo; nombre: string }[];
}[] = [
  {
    titulo: "Videos únicos",
    base: "colectados",
    etapas: [
      { clave: "colectados", nombre: "Colectados" },
      { clave: "entregados", nombre: "Entregados al feed" },
    ],
  },
  {
    titulo: "Evaluaciones",
    aclaracion: "un video que encaja en varios proyectos se evalúa una vez por cada uno",
    base: "asignados",
    etapas: [
      { clave: "asignados", nombre: "Asignadas a proyecto" },
      { clave: "pretrim", nombre: "Pasaron el pre-trim" },
      { clave: "filtrados", nombre: "Con heat-score" },
      { clave: "gate_pass", nombre: "Pasaron el gate" },
    ],
  },
];

function Barra({ nombre, valor, base }: { nombre: string; valor: number; base: number }) {
  // El clamp es cinturón además de tirantes: las dos bases de arriba ya hacen imposible pasarse,
  // pero `metricas` es jsonb libre y una corrida rara no puede romper el layout.
  const ancho = base > 0 ? Math.min((valor / base) * 100, 100) : 0;
  return (
    <div className="grid grid-cols-[11rem_1fr_3.5rem] items-center gap-2 text-sm">
      <span className="text-muted-foreground">{nombre}</span>
      <div className="h-2 overflow-hidden rounded-[4px] bg-muted">
        <div
          className="h-2 rounded-[4px] bg-primary"
          style={{ width: `${Math.max(ancho, valor > 0 ? 1 : 0)}%` }}
        />
      </div>
      <span className="text-right tabular-nums">{valor}</span>
    </div>
  );
}

export function Embudo({ filas }: { filas: FilaEmbudo[] }) {
  if (filas.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Todavía no hay corridas del motor registradas.
      </p>
    );
  }
  const s = filas[0];

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
      {EMBUDOS.map((embudo) => {
        const base = (s[embudo.base] as number | null) ?? 0;
        if (base <= 0) return null;
        return (
          <div key={embudo.titulo} className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {embudo.titulo}
              {embudo.aclaracion && (
                <span className="ml-2 normal-case tracking-normal opacity-80">
                  ({embudo.aclaracion})
                </span>
              )}
            </p>
            {embudo.etapas.map(({ clave, nombre }) => (
              <Barra key={clave} nombre={nombre} valor={(s[clave] as number | null) ?? 0} base={base} />
            ))}
          </div>
        );
      })}
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


// ── Auditoría de descartes: el recall del gate (ADR-021 + ADR-036) ────────────
//
// Este bloque es la razón por la que `app.descartes` dejó de barrerse. Es la única medida de
// cuánto contenido bueno mata el filtro, y hasta D7 llegaba por una proyección semanal que se
// escribía en Airtable. `auditados` va al lado de `falsos_negativos` a propósito: sin él, un 0
// se lee como "el gate está perfecto" cuando en realidad puede significar "nadie miró".

export function Auditoria({ filas }: { filas: FilaAuditoria[] }) {
  if (filas.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Todavía no hay descartes expuestos. El motor deja los rechazos más cerca de pasar en cada
        corrida.
      </p>
    );
  }
  const s = filas[0];
  const sinAuditar = s.expuestos - s.auditados;

  return (
    <div className="space-y-4">
      <p className="text-sm font-medium">{semanaDel(s.semana)}</p>
      <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
        <div>
          <p className="text-2xl font-semibold">{s.falsos_negativos}</p>
          <p className="text-muted-foreground">falsos negativos (&laquo;era bueno&raquo;)</p>
        </div>
        <div>
          <p className="text-2xl font-semibold">
            {s.auditados}/{s.expuestos}
          </p>
          <p className="text-muted-foreground">auditados</p>
        </div>
      </div>
      {s.auditados === 0 ? (
        <Alert>
          <AlertTitle>Sin auditar, este número no dice nada</AlertTitle>
          <AlertDescription>
            Cero falsos negativos con cero auditorías no significa que el filtro ande bien:
            significa que nadie miró. Se marcan en Curar → Descartes.
          </AlertDescription>
        </Alert>
      ) : (
        sinAuditar > 0 && (
          <p className="text-sm text-muted-foreground">
            Quedan {sinAuditar} sin marcar. Ya no caducan: siguen ahí la semana que viene.
          </p>
        )
      )}
      {filas.length > 1 && (
        <p className="text-sm text-muted-foreground">
          Semanas anteriores:{" "}
          {filas
            .slice(1)
            .map((f) => `${f.semana}: ${f.falsos_negativos} de ${f.auditados} auditados`)
            .join(" · ")}
        </p>
      )}
    </div>
  );
}

// ── Embudo del descubrimiento (reemplaza la fila DESCUBRIMIENTO de Métricas Global) ──

export function Descubrimiento({ filas }: { filas: FilaDescubrimiento[] }) {
  if (filas.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Todavía no hay corridas del buscador de cuentas registradas.
      </p>
    );
  }
  const s = filas[0];

  return (
    <div className="space-y-4">
      <p className="text-sm font-medium">{semanaDel(s.semana)}</p>
      <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
        <div>
          <p className="text-2xl font-semibold">{num(s.semillas)}</p>
          <p className="text-muted-foreground">semillas usadas</p>
        </div>
        <div>
          <p className="text-2xl font-semibold">{num(s.sugeridos_unicos)}</p>
          <p className="text-muted-foreground">cuentas encontradas</p>
        </div>
        <div>
          <p className="text-2xl font-semibold">{num(s.propuestos)}</p>
          <p className="text-muted-foreground">propuestas al equipo</p>
        </div>
      </div>
      {s.runs_fallo > 0 && (
        <p className="text-sm text-muted-foreground">
          {s.runs_ok} corridas ok · {s.runs_fallo} con fallo.
        </p>
      )}
    </div>
  );
}

// ── Actividad: quién tocó qué (app.eventos, dev-only) ────────────────────────

const ACCION: Record<string, string> = {
  "ajustes.editar": "cambió una perilla",
  "referentes.editar": "editó un referente",
  "referentes.crear": "sumó un referente",
  "voces.editar": "editó una voz",
  "voces.crear": "creó una voz",
  "proyectos.editar": "editó un proyecto",
  "proyectos.crear": "creó un proyecto",
  "sugeridos.aprobar": "aprobó un sugerido",
  "sugeridos.descartar": "descartó un sugerido",
  "sugeridos.buscar": "disparó el buscador de cuentas",
  "feed.calificar": "calificó un candidato",
  "descartes.veredicto": "auditó un descarte",
  "operar.correr": "disparó una corrida",
};

export function Actividad({ filas }: { filas: FilaEvento[] }) {
  if (filas.length === 0) {
    return <p className="text-sm text-muted-foreground">Todavía no hay actividad registrada.</p>;
  }

  return (
    <ul className="divide-y text-sm">
      {filas.map((e, i) => (
        <li key={i} className="flex flex-wrap items-baseline gap-x-2 py-1.5">
          {/* Esta sección se renderiza en el SERVIDOR, así que sin `timeZone` explícita salía en
              UTC — la hora que mostraba no era la hora a la que el equipo hizo las cosas. */}
          <span className="tabular-nums text-muted-foreground">{fechaHora(e.creado_en)}</span>
          <span className="font-medium">{e.usuarios?.nombre ?? "alguien"}</span>
          <span>{ACCION[e.tipo] ?? e.tipo}</span>
        </li>
      ))}
    </ul>
  );
}
