"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PLATAFORMAS, type Salud } from "@/domain/referentes";
import { crear, guardar, type FormReferente, type Resultado } from "./actions";

// Una cuenta = una fila editable. Mismo patrón que los knobs de Ajustes: el botón Guardar
// aparece SOLO cuando algo cambió, así se ve de un vistazo qué se tocó y no se guarda sin
// querer. La validación de verdad vive en el servidor (domain/referentes.ts).

export type ProyectoOpcion = { id: string; nombre: string; activo: boolean };

const porcentaje = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);

function Salud({ salud }: { salud: Salud }) {
  return (
    <div className="flex shrink-0 gap-4 text-xs tabular-nums text-muted-foreground">
      <span title="Qué proporción de sus videos pasa el filtro.">
        pasa el filtro <strong className="text-foreground">{porcentaje(salud.tasa_gate)}</strong>
      </span>
      <span title="Qué proporción de sus videos terminan aprobando ustedes.">
        aprueban <strong className="text-foreground">{porcentaje(salud.tasa_aprobacion)}</strong>
      </span>
      <span title="Sobre cuántos videos se calculan esas tasas. Con pocos, no saquen conclusiones.">
        sobre <strong className="text-foreground">{salud.videos_evaluados ?? 0}</strong> videos
      </span>
    </div>
  );
}

export function FilaReferente({
  referente,
  proyectos,
  avisoCruzaVoces,
}: {
  referente: {
    id: string;
    handle: string;
    plataforma: string;
    activo: boolean;
    notas: string | null;
    proyectoIds: string[];
    salud: Salud;
  };
  proyectos: ProyectoOpcion[];
  avisoCruzaVoces: boolean;
}) {
  const original: FormReferente = {
    handle: referente.handle,
    plataforma: referente.plataforma,
    proyectoIds: referente.proyectoIds,
    activo: referente.activo,
    notas: referente.notas ?? "",
  };
  const [form, setForm] = useState(original);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [enviando, startTransition] = useTransition();

  const mismosProyectos =
    form.proyectoIds.length === original.proyectoIds.length &&
    form.proyectoIds.every((p) => original.proyectoIds.includes(p));
  const cambiado =
    form.handle.trim() !== original.handle ||
    form.plataforma !== original.plataforma ||
    form.activo !== original.activo ||
    form.notas.trim() !== original.notas.trim() ||
    !mismosProyectos;

  const alternarProyecto = (id: string) =>
    setForm((f) => ({
      ...f,
      proyectoIds: f.proyectoIds.includes(id) ? f.proyectoIds.filter((p) => p !== id) : [...f.proyectoIds, id],
    }));

  const enviar = () => startTransition(async () => setResultado(await guardar(referente.id, form)));

  return (
    <div className={`space-y-3 border-b py-4 last:border-b-0 ${form.activo ? "" : "opacity-60"}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Input
            value={form.handle}
            onChange={(e) => setForm((f) => ({ ...f, handle: e.target.value }))}
            disabled={enviando}
            className="w-56 font-medium"
            aria-label="Cuenta"
          />
          <select
            value={form.plataforma}
            onChange={(e) => setForm((f) => ({ ...f, plataforma: e.target.value }))}
            disabled={enviando}
            aria-label="Plataforma"
            className="h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
          >
            {PLATAFORMAS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          {avisoCruzaVoces && (
            <Badge variant="outline" title="Alimenta proyectos de más de una voz. El motor lo permite: cada video llega una sola vez, al proyecto que mejor pega.">
              cruza voces
            </Badge>
          )}
        </div>
        <Salud salud={referente.salud} />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {proyectos.map((p) => (
          <label key={p.id} className="flex items-center gap-1.5 text-sm">
            <input
              type="checkbox"
              checked={form.proyectoIds.includes(p.id)}
              onChange={() => alternarProyecto(p.id)}
              disabled={enviando}
              className="size-4 accent-primary"
            />
            <span className={p.activo ? "" : "text-muted-foreground"}>
              {p.nombre}
              {p.activo ? "" : " (pausado)"}
            </span>
          </label>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-1 items-center gap-3">
          <label className="flex shrink-0 items-center gap-1.5 text-sm">
            <input
              type="checkbox"
              checked={form.activo}
              onChange={(e) => setForm((f) => ({ ...f, activo: e.target.checked }))}
              disabled={enviando}
              className="size-4 accent-primary"
            />
            Rastrear
          </label>
          <Input
            value={form.notas}
            onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))}
            disabled={enviando}
            placeholder="Por qué la agregaron"
            aria-label="Notas"
            className="min-w-40 flex-1"
          />
        </div>
        <Button size="sm" onClick={enviar} disabled={!cambiado || enviando} className={cambiado ? "" : "invisible"}>
          {enviando ? "Guardando…" : "Guardar"}
        </Button>
      </div>

      {resultado && (
        <p className={`text-xs ${resultado.ok ? "text-muted-foreground" : "text-destructive"}`}>
          {resultado.mensaje}
        </p>
      )}
    </div>
  );
}

export function AltaReferente({ proyectos }: { proyectos: ProyectoOpcion[] }) {
  const vacio: FormReferente = { handle: "", plataforma: "instagram", proyectoIds: [], activo: true, notas: "" };
  const [form, setForm] = useState(vacio);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [enviando, startTransition] = useTransition();

  const enviar = () =>
    startTransition(async () => {
      const r = await crear(form);
      setResultado(r);
      if (r.ok) setForm(vacio);
    });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="alta-handle">Cuenta</Label>
          <Input
            id="alta-handle"
            value={form.handle}
            onChange={(e) => setForm((f) => ({ ...f, handle: e.target.value }))}
            disabled={enviando}
            placeholder="@simonsinek"
            className="w-56"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="alta-plataforma">Plataforma</Label>
          <select
            id="alta-plataforma"
            value={form.plataforma}
            onChange={(e) => setForm((f) => ({ ...f, plataforma: e.target.value }))}
            disabled={enviando}
            className="h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
          >
            {PLATAFORMAS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <Button size="sm" onClick={enviar} disabled={enviando}>
          {enviando ? "Agregando…" : "Agregar"}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {proyectos.map((p) => (
          <label key={p.id} className="flex items-center gap-1.5 text-sm">
            <input
              type="checkbox"
              checked={form.proyectoIds.includes(p.id)}
              onChange={() =>
                setForm((f) => ({
                  ...f,
                  proyectoIds: f.proyectoIds.includes(p.id)
                    ? f.proyectoIds.filter((x) => x !== p.id)
                    : [...f.proyectoIds, p.id],
                }))
              }
              disabled={enviando}
              className="size-4 accent-primary"
            />
            <span className={p.activo ? "" : "text-muted-foreground"}>{p.nombre}</span>
          </label>
        ))}
      </div>

      {resultado && (
        <p className={`text-xs ${resultado.ok ? "text-muted-foreground" : "text-destructive"}`}>
          {resultado.mensaje}
        </p>
      )}
    </div>
  );
}
