"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  AYUDA_FUENTE,
  ETIQUETA_FUENTE,
  FUENTES,
  carrilDeFuente,
  esValido,
  mostrarConsulta,
  validarReferente,
  type Fuente,
  type FormReferenteLinkedin,
  type ReferenteLinkedin,
} from "@/domain/linkedin";
import {
  borrarLinkedin,
  crearLinkedin,
  guardarLinkedin,
  prenderLinkedin,
  type Resultado,
} from "./actions-linkedin";

// El banco del carril copiable de LinkedIn (ADR-055). Es la primera pantalla del pipeline N+1.
//
// 🩸 **Nace vacía y eso NO es un error de carga.** ADR-055 cita a Fernando textual — *"no tengo el
// listado de referentes"* — así que acá no hay nada que migrar: el banco se construye escribiendo.
// El vacío tiene su propio texto por eso: un "no hay datos" genérico se leería como una falla.
//
// Frente a su hermana de reels hay una diferencia que se ve en la primera línea: **un referente
// apunta a UN proyecto, no a varios.** Reels necesitó una tabla puente (ADR-032, migración `012`)
// porque una cuenta de Instagram alimenta a varios proyectos a la vez; acá una consulta de
// Pinterest es de un proyecto o de ninguno. No se copió el N:M "por las dudas".

type Proyecto = { id: string; nombre: string };

const VACIO: FormReferenteLinkedin = {
  fuente: "pinterest",
  consulta: "",
  idioma: "",
  proyectoId: "",
  notas: "",
};

export function PantallaLinkedin({
  banco,
  proyectos,
}: {
  banco: ReferenteLinkedin[];
  proyectos: Proyecto[];
}) {
  const [altaAbierta, setAltaAbierta] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);

  const nombreDeProyecto = (id: string | null) =>
    proyectos.find((p) => p.id === id)?.nombre ?? null;

  const prendidos = banco.filter((r) => r.activo).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Referentes de LinkedIn</h1>
        <p className="text-muted-foreground">
          De dónde sale el material: filtros de Pinterest, cuentas de LinkedIn, páginas sueltas y
          el archivo propio de cada voz. Solo los <strong>prendidos</strong> entran en la próxima
          corrida.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {banco.length === 0
            ? "El banco está vacío."
            : `${prendidos} prendido${prendidos === 1 ? "" : "s"} de ${banco.length}.`}
        </p>
        <Button size="sm" onClick={() => setAltaAbierta((a) => !a)}>
          {altaAbierta ? "Cancelar" : "Agregar"}
        </Button>
      </div>

      {altaAbierta && (
        <Formulario
          titulo="Nuevo referente"
          original={VACIO}
          proyectos={proyectos}
          onEnviar={crearLinkedin}
          onListo={() => setAltaAbierta(false)}
        />
      )}

      {banco.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm font-medium">Todavía no hay referentes, y eso es lo esperado.</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Este banco no se migró de ningún lado porque no existía en ninguna marca: se construye
            acá. Empezá por dos o tres filtros de Pinterest en inglés — un formato agotado en
            inglés suele estar fresco en español.
          </p>
        </div>
      ) : (
        <div className="divide-y rounded-lg border">
          {banco.map((r) =>
            editandoId === r.id ? (
              <div key={r.id} className="p-3">
                <Formulario
                  titulo={`Editar ${mostrarConsulta(r.fuente, r.consulta)}`}
                  original={{
                    fuente: r.fuente,
                    consulta: r.consulta,
                    idioma: r.idioma ?? "",
                    proyectoId: r.proyectoId ?? "",
                    notas: r.notas ?? "",
                  }}
                  proyectos={proyectos}
                  onEnviar={(form) => guardarLinkedin(r.id, form)}
                  onListo={() => setEditandoId(null)}
                  onBorrar={() => borrarLinkedin(r.id)}
                />
              </div>
            ) : (
              <Fila
                key={r.id}
                referente={r}
                proyecto={nombreDeProyecto(r.proyectoId)}
                onEditar={() => setEditandoId(r.id)}
              />
            ),
          )}
        </div>
      )}
    </div>
  );
}

function Fila({
  referente,
  proyecto,
  onEditar,
}: {
  referente: ReferenteLinkedin;
  proyecto: string | null;
  onEditar: () => void;
}) {
  return (
    <div className={cn("flex items-center gap-3 p-3", !referente.activo && "bg-muted/30")}>
      <Interruptor referente={referente} />

      <button type="button" onClick={onEditar} className="min-w-0 flex-1 text-left">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="truncate font-medium">
            {mostrarConsulta(referente.fuente, referente.consulta)}
          </span>
          <span className="text-xs text-muted-foreground">
            {ETIQUETA_FUENTE[referente.fuente]}
            {referente.idioma && ` · ${referente.idioma}`}
            {` · ${carrilDeFuente(referente.fuente)}`}
          </span>
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {proyecto ?? "sin proyecto"}
          {referente.notas && ` · ${referente.notas}`}
        </p>
      </button>
    </div>
  );
}

/**
 * El interruptor, optimista. Es la acción que la lista existe para provocar, así que va sin
 * confirmación y sin recargar: si falla, se revierte y muestra el error en su lugar.
 */
function Interruptor({ referente }: { referente: ReferenteLinkedin }) {
  const [optimista, setOptimista] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enviando, startTransition] = useTransition();

  const activo = optimista ?? referente.activo;

  return (
    <div className="shrink-0">
      <button
        type="button"
        role="switch"
        aria-checked={activo}
        aria-label={activo ? "Apagar" : "Prender"}
        disabled={enviando}
        onClick={() => {
          const nuevo = !activo;
          setOptimista(nuevo);
          setError(null);
          startTransition(async () => {
            const r = await prenderLinkedin(referente.id, nuevo);
            if (!r.ok) {
              setOptimista(null);
              setError(r.mensaje);
            }
          });
        }}
        className={cn(
          "relative h-5 w-9 rounded-full transition-colors disabled:opacity-50",
          activo ? "bg-primary" : "bg-muted-foreground/30",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-4 rounded-full bg-background transition-transform",
            activo ? "translate-x-4" : "translate-x-0.5",
          )}
        />
      </button>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}

function Formulario({
  titulo,
  original,
  proyectos,
  onEnviar,
  onListo,
  onBorrar,
}: {
  titulo: string;
  original: FormReferenteLinkedin;
  proyectos: Proyecto[];
  onEnviar: (form: FormReferenteLinkedin) => Promise<Resultado>;
  onListo: () => void;
  onBorrar?: () => Promise<Resultado>;
}) {
  const [form, setForm] = useState(original);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [enviando, startTransition] = useTransition();

  // La MISMA función que corre el server action. Acá es para no hacer viajar un formulario que ya
  // sabemos malo; allá es la que manda. Una sola definición, dos evaluaciones.
  const errores = validarReferente(form);
  const puedeEnviar = esValido(errores);

  const set = <K extends keyof FormReferenteLinkedin>(k: K, v: FormReferenteLinkedin[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <p className="font-medium">{titulo}</p>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">De dónde sale</span>
          <select
            value={form.fuente}
            onChange={(e) => set("fuente", e.target.value)}
            className="h-9 w-full rounded-md border bg-background px-2 text-sm"
          >
            {FUENTES.map((f) => (
              <option key={f} value={f}>
                {ETIQUETA_FUENTE[f]}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">
            {form.fuente === "linkedin" ? "La cuenta" : "El filtro de búsqueda"}
          </span>
          <Input
            value={form.consulta}
            onChange={(e) => set("consulta", e.target.value)}
            placeholder={form.fuente === "linkedin" ? "@alguien" : "mindset"}
          />
        </label>
      </div>

      <p className="text-xs text-muted-foreground">
        {AYUDA_FUENTE[form.fuente as Fuente] ?? ""}
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">
            Idioma en el que se busca
          </span>
          <Input
            value={form.idioma}
            onChange={(e) => set("idioma", e.target.value)}
            placeholder="es · en"
          />
        </label>

        <label className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Proyecto</span>
          <select
            value={form.proyectoId}
            onChange={(e) => set("proyectoId", e.target.value)}
            className="h-9 w-full rounded-md border bg-background px-2 text-sm"
          >
            <option value="">— sin proyecto —</option>
            {proyectos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block space-y-1">
        <span className="text-xs font-medium text-muted-foreground">Notas</span>
        <Textarea
          value={form.notas}
          onChange={(e) => set("notas", e.target.value)}
          rows={2}
          placeholder="Opcional."
        />
      </label>

      {!puedeEnviar && (
        <p className="text-xs text-destructive">{Object.values(errores)[0]}</p>
      )}
      {resultado && (
        <p className={cn("text-xs", resultado.ok ? "text-muted-foreground" : "text-destructive")}>
          {resultado.mensaje}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={!puedeEnviar || enviando}
          onClick={() =>
            startTransition(async () => {
              const r = await onEnviar(form);
              setResultado(r);
              if (r.ok) onListo();
            })
          }
        >
          {enviando ? "Guardando…" : "Guardar"}
        </Button>
        <Button size="sm" variant="ghost" disabled={enviando} onClick={onListo}>
          Cancelar
        </Button>
        {onBorrar && (
          <Button
            size="sm"
            variant="ghost"
            disabled={enviando}
            className="ml-auto text-destructive hover:text-destructive"
            onClick={() =>
              startTransition(async () => {
                const r = await onBorrar();
                setResultado(r);
                if (r.ok) onListo();
              })
            }
          >
            Sacar del banco
          </Button>
        )}
      </div>
    </div>
  );
}
