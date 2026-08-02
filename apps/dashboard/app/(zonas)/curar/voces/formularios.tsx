"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { BotonBorrar } from "@/components/borrar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { pideMasQueElTecho, techoDeCrudos } from "@/domain/corrida";
import {
  borrarProyecto,
  borrarVoz,
  crearProyectoNuevo,
  crearVozNueva,
  guardarProyecto,
  guardarVoz,
  type FormProyecto,
  type FormVoz,
  type Resultado,
} from "./actions";

// Los cuatro formularios de esta pantalla. Viven adentro del modal del record (o del de alta):
// la lista de afuera muestra un resumen y nada más. Con seis proyectos desplegados, cada uno con
// 400-650 caracteres de criterios, la pantalla dejaba de ser una lista.
//
// Cada uno es un componente COMPLETO (cuerpo + pie), no un par de nodos que el padre acomoda:
// tienen hooks adentro, y un padre que los montara condicionalmente en dos slots distintos
// rompería el orden de los hooks. Por eso el pie va pegado abajo con `sticky` en vez de ir al
// `pie` del <Modal>.
//
// La validación de verdad está en el servidor (domain/proyectos.ts). Acá solo se decide qué se ve.

export type VozFila = {
  id: string;
  nombre: string;
  descripcion: string | null;
  criterios_relevancia: string | null;
  activo: boolean;
};

export type ProyectoFila = {
  id: string;
  nombre: string;
  descripcion: string | null;
  criterios_relevancia: string;
  criterios_aprendidos: string | null;
  advertencia_criterios: string | null;
  voz_id: string;
  activo: boolean;
  n: number | null;
};

export type OpcionVoz = { id: string; nombre: string };

export const formDeVoz = (v: VozFila): FormVoz => ({
  nombre: v.nombre,
  descripcion: v.descripcion ?? "",
  criterios_relevancia: v.criterios_relevancia ?? "",
  activo: v.activo,
});

export const formDeProyecto = (p: ProyectoFila): FormProyecto => ({
  nombre: p.nombre,
  descripcion: p.descripcion ?? "",
  criterios_relevancia: p.criterios_relevancia,
  vozId: p.voz_id,
  activo: p.activo,
  n: p.n === null ? "" : String(p.n),
});

/**
 * El pie del formulario: guarda solo si algo cambió, y no se va con el scroll.
 *
 * `borrar` va a la izquierda del todo, lejos de Guardar y con el peso visual más bajo de la barra:
 * es la acción rara (una vez por trimestre) y la única que no se puede deshacer. Su resultado entra
 * por el mismo `resultado` que el de guardar, así que el motivo de un borrado rechazado se lee
 * donde el equipo ya está mirando.
 */
function Pie({
  cambiado,
  enviando,
  resultado,
  onGuardar,
  etiqueta = "Guardar",
  borrar,
}: {
  cambiado: boolean;
  enviando: boolean;
  resultado: Resultado | null;
  onGuardar: () => void;
  etiqueta?: string;
  borrar?: React.ReactNode;
}) {
  return (
    <div className="sticky bottom-0 -mx-4 -mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t bg-card px-4 py-3">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
        {borrar}
        <p className={`text-xs ${resultado?.ok === false ? "text-destructive" : "text-muted-foreground"}`}>
          {resultado?.mensaje ?? (cambiado ? "Hay cambios sin guardar." : "")}
        </p>
      </div>
      <Button onClick={onGuardar} disabled={!cambiado || enviando}>
        {enviando ? "Guardando…" : etiqueta}
      </Button>
    </div>
  );
}

/**
 * El número de videos por corrida. Desde ADR-042 es la ÚNICA perilla de cantidad que existe: el
 * default global que competía con él (`Candidatos por corrida`) se borró, y los otros dos knobs
 * de supply son dev-only. Por eso vacío ya no significa "usá el global": es un error del servidor.
 *
 * Y desde ADR-043 el campo dice, mientras se escribe, si el número es alcanzable. No pronostica la
 * entrega —eso se descartó a propósito, ver `domain/corrida.ts`— sino que muestra el **techo de
 * crudos**, que es una multiplicación: `cuentas × resultados por cuenta`. Si el proyecto pide más
 * de lo que la corrida llega a mirar, no hay filtro que lo arregle y la palanca son las cuentas.
 */
function CampoN({
  valor,
  onChange,
  enviando,
  cuentas,
  resultadosPorCuenta,
  sugeridosPendientes,
}: {
  valor: string;
  onChange: (v: string) => void;
  enviando: boolean;
  cuentas: number;
  resultadosPorCuenta: number;
  sugeridosPendientes: number;
}) {
  const techo = techoDeCrudos(cuentas, resultadosPorCuenta);
  const pide = Number(valor.trim());
  const noAlcanza = Number.isFinite(pide) && pide > 0 && pideMasQueElTecho(pide, techo);

  return (
    <div className="space-y-1">
      <Label htmlFor="proy-n">Videos por corrida</Label>
      <p className="text-xs text-muted-foreground">
        Es un techo, no una promesa: si las cuentas no dan para tanto, llegan menos. Subir el número
        no crea videos — los crea sumar referentes.
      </p>
      <Input
        id="proy-n"
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        disabled={enviando}
        inputMode="numeric"
        className="w-24 tabular-nums"
      />
      {cuentas === 0 ? (
        <p className="text-xs text-amber-700 dark:text-amber-500">
          ⚠️ Este proyecto no tiene ninguna cuenta asignada: pida lo que pida, no va a traer nada.{" "}
          <Link href="/curar/referentes" className="underline">
            Asignale referentes
          </Link>
          .
        </p>
      ) : noAlcanza ? (
        <p className="text-xs text-amber-700 dark:text-amber-500">
          ⚠️ Con {cuentas === 1 ? "1 cuenta" : `${cuentas} cuentas`} la corrida mira{" "}
          <strong>{techo}</strong> videos crudos, y de ahí sale todo lo que pasa el filtro. Pedir{" "}
          {pide} es pedir que pase más de la mitad: no suele pasar.{" "}
          {sugeridosPendientes > 0 ? (
            <>
              Hay{" "}
              <Link href="/curar/sugeridos" className="underline">
                {sugeridosPendientes} cuenta{sugeridosPendientes === 1 ? "" : "s"} esperando
                aprobación
              </Link>
              , que es la palanca más barata.
            </>
          ) : (
            <>
              Sumá cuentas en{" "}
              <Link href="/curar/referentes" className="underline">
                Referentes
              </Link>
              .
            </>
          )}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Con {cuentas === 1 ? "1 cuenta" : `${cuentas} cuentas`} la corrida mira {techo} videos
          crudos antes de filtrar.
        </p>
      )}
    </div>
  );
}

// ── El record de una voz ─────────────────────────────────────────────────────

export function FormularioVoz({ voz, onListo }: { voz: VozFila; onListo: () => void }) {
  const original = formDeVoz(voz);
  const [form, setForm] = useState(original);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [enviando, startTransition] = useTransition();

  const cambiado =
    form.nombre.trim() !== original.nombre ||
    form.descripcion.trim() !== original.descripcion.trim() ||
    form.criterios_relevancia.trim() !== original.criterios_relevancia.trim();

  const enviar = () =>
    startTransition(async () => {
      const r = await guardarVoz(voz.id, form);
      setResultado(r);
      if (r.ok) onListo();
    });

  return (
    <>
      <div className="space-y-1">
        <Label htmlFor="voz-nombre">Nombre</Label>
        <Input
          id="voz-nombre"
          value={form.nombre}
          onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
          disabled={enviando}
          className="w-72"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="voz-desc">Descripción</Label>
        <p className="text-xs text-muted-foreground">
          Para ustedes, no para la máquina: el filtro no lee esto, lee los criterios de abajo.
        </p>
        <Input
          id="voz-desc"
          value={form.descripcion}
          onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
          disabled={enviando}
          placeholder="Quién es y de qué habla"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="voz-crit">Criterios de la voz</Label>
        <p className="text-xs text-muted-foreground">
          Lo que vale para TODOS sus proyectos. El filtro los suma a los criterios de cada
          proyecto, no los reemplaza.
        </p>
        <Textarea
          id="voz-crit"
          value={form.criterios_relevancia}
          onChange={(e) => setForm((f) => ({ ...f, criterios_relevancia: e.target.value }))}
          disabled={enviando}
          rows={6}
        />
      </div>
      <Pie
        cambiado={cambiado}
        enviando={enviando}
        resultado={resultado}
        onGuardar={enviar}
        borrar={
          <BotonBorrar
            etiqueta="Borrar la voz"
            advertencia="No se puede deshacer."
            deshabilitado={enviando}
            onBorrar={() => borrarVoz(voz.id)}
            onResultado={(r) => {
              setResultado(r);
              if (r.ok) onListo();
            }}
          />
        }
      />
    </>
  );
}

// ── El record de un proyecto ─────────────────────────────────────────────────

export function FormularioProyecto({
  proyecto,
  voces,
  onListo,
  cuentas,
  resultadosPorCuenta,
  sugeridosPendientes,
}: {
  proyecto: ProyectoFila;
  voces: OpcionVoz[];
  onListo: () => void;
  cuentas: number;
  resultadosPorCuenta: number;
  sugeridosPendientes: number;
}) {
  const original = formDeProyecto(proyecto);
  const [form, setForm] = useState(original);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [enviando, startTransition] = useTransition();

  const cambiado =
    form.nombre.trim() !== original.nombre ||
    form.descripcion.trim() !== original.descripcion.trim() ||
    form.criterios_relevancia.trim() !== original.criterios_relevancia.trim() ||
    form.vozId !== original.vozId ||
    form.n.trim() !== original.n;

  const enviar = () =>
    startTransition(async () => {
      const r = await guardarProyecto(proyecto.id, form);
      setResultado(r);
      if (r.ok) onListo();
    });

  return (
    <>
      {proyecto.advertencia_criterios && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <p className="font-medium">Revisión de los criterios</p>
          <p className="text-muted-foreground">{proyecto.advertencia_criterios}</p>
        </div>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="proy-nombre">Nombre</Label>
          <Input
            id="proy-nombre"
            value={form.nombre}
            onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
            disabled={enviando}
            className="w-56"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="proy-voz">Voz</Label>
          <p className="max-w-xs text-xs text-muted-foreground">
            Hereda sus criterios: se suman a los de acá, no los reemplazan. Y si la voz está
            apagada, este proyecto no corre aunque esté prendido.
          </p>
          <Select
            id="proy-voz"
            value={form.vozId}
            onChange={(e) => setForm((f) => ({ ...f, vozId: e.target.value }))}
            disabled={enviando}
          >
            {voces.map((v) => (
              <option key={v.id} value={v.id}>
                {v.nombre}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <CampoN
        valor={form.n}
        onChange={(n) => setForm((f) => ({ ...f, n }))}
        enviando={enviando}
        cuentas={cuentas}
        resultadosPorCuenta={resultadosPorCuenta}
        sugeridosPendientes={sugeridosPendientes}
      />
      <div className="space-y-1">
        <Label htmlFor="proy-desc">Descripción</Label>
        <Input
          id="proy-desc"
          value={form.descripcion}
          onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
          disabled={enviando}
          placeholder="De qué va este proyecto"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="proy-crit">Criterios de relevancia</Label>
        <p className="text-xs text-muted-foreground">
          Qué SÍ y qué NO cuenta como relevante. Es lo que lee el filtro para decidir cada video:
          si acá no dice qué rechazar, casi todo pasa.
        </p>
        <Textarea
          id="proy-crit"
          value={form.criterios_relevancia}
          onChange={(e) => setForm((f) => ({ ...f, criterios_relevancia: e.target.value }))}
          disabled={enviando}
          rows={7}
        />
      </div>
      {proyecto.criterios_aprendidos && (
        <div className="space-y-1">
          <Label>Lo que el sistema aprendió</Label>
          <p className="text-xs text-muted-foreground">
            Escrito solo cada domingo a partir de lo que ustedes calificaron. El filtro lo usa
            junto con los criterios de arriba. No se edita.
          </p>
          <p className="whitespace-pre-wrap rounded-md border bg-background p-2 text-sm text-muted-foreground">
            {proyecto.criterios_aprendidos}
          </p>
        </div>
      )}
      <Pie
        cambiado={cambiado}
        enviando={enviando}
        resultado={resultado}
        onGuardar={enviar}
        borrar={
          <BotonBorrar
            etiqueta="Borrar el proyecto"
            advertencia="No se puede deshacer."
            deshabilitado={enviando}
            onBorrar={() => borrarProyecto(proyecto.id)}
            onResultado={(r) => {
              setResultado(r);
              if (r.ok) onListo();
            }}
          />
        }
      />
    </>
  );
}

// ── Las altas ────────────────────────────────────────────────────────────────

export function AltaVoz({ onListo }: { onListo: () => void }) {
  const vacio: FormVoz = { nombre: "", descripcion: "", criterios_relevancia: "", activo: false };
  const [form, setForm] = useState(vacio);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [enviando, startTransition] = useTransition();

  const enviar = () =>
    startTransition(async () => {
      const r = await crearVozNueva(form);
      setResultado(r);
      if (r.ok) onListo();
    });

  return (
    <>
      <div className="space-y-1">
        <Label htmlFor="alta-voz-nombre">Nombre</Label>
        <Input
          id="alta-voz-nombre"
          value={form.nombre}
          onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
          disabled={enviando}
          placeholder="Nombre del cliente o del personaje"
          className="w-72"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="alta-voz-crit">Criterios de la voz</Label>
        <p className="text-xs text-muted-foreground">
          Obligatorios (ADR-040): son la espina dorsal. El filtro los suma a los criterios de cada
          proyecto de esta voz, así que sin ellos juzga con la mitad del contexto y aprueba de más.
        </p>
        <Textarea
          id="alta-voz-crit"
          value={form.criterios_relevancia}
          onChange={(e) => setForm((f) => ({ ...f, criterios_relevancia: e.target.value }))}
          disabled={enviando}
          rows={4}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Nace apagada: prendela cuando tenga proyectos y referentes cargados.
      </p>
      <Pie
        cambiado={form.nombre.trim() !== "" && form.criterios_relevancia.trim() !== ""}
        enviando={enviando}
        resultado={resultado}
        onGuardar={enviar}
        etiqueta="Crear voz"
      />
    </>
  );
}

export function AltaProyecto({
  voces,
  onListo,
  resultadosPorCuenta,
  sugeridosPendientes,
}: {
  voces: OpcionVoz[];
  onListo: () => void;
  resultadosPorCuenta: number;
  sugeridosPendientes: number;
}) {
  // Arranca con un número puesto, no vacío: el N es obligatorio y un campo en blanco haría
  // rebotar el alta por lo único que nadie espera tener que completar.
  const vacio: FormProyecto = {
    nombre: "",
    descripcion: "",
    criterios_relevancia: "",
    vozId: voces[0]?.id ?? "",
    activo: false,
    n: "15",
  };
  const [form, setForm] = useState(vacio);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [enviando, startTransition] = useTransition();

  const enviar = () =>
    startTransition(async () => {
      const r = await crearProyectoNuevo(form);
      setResultado(r);
      if (r.ok) onListo();
    });

  return (
    <>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="alta-proy-nombre">Nombre</Label>
          <Input
            id="alta-proy-nombre"
            value={form.nombre}
            onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
            disabled={enviando}
            placeholder="El tema del que va a traer videos"
            className="w-56"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="alta-proy-voz">Voz</Label>
          <Select
            id="alta-proy-voz"
            value={form.vozId}
            onChange={(e) => setForm((f) => ({ ...f, vozId: e.target.value }))}
            disabled={enviando}
          >
            {voces.map((v) => (
              <option key={v.id} value={v.id}>
                {v.nombre}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <CampoN
        valor={form.n}
        onChange={(n) => setForm((f) => ({ ...f, n }))}
        enviando={enviando}
        cuentas={0} // un proyecto que todavía no existe no tiene cuentas asignadas
        resultadosPorCuenta={resultadosPorCuenta}
        sugeridosPendientes={sugeridosPendientes}
      />
      <div className="space-y-1">
        <Label htmlFor="alta-proy-crit">Criterios de relevancia</Label>
        <p className="text-xs text-muted-foreground">
          Obligatorios: sin esto el filtro no sabe qué es relevante y aprueba cualquier cosa.
          Escribí también qué NO cuenta.
        </p>
        <Textarea
          id="alta-proy-crit"
          value={form.criterios_relevancia}
          onChange={(e) => setForm((f) => ({ ...f, criterios_relevancia: e.target.value }))}
          disabled={enviando}
          rows={6}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Nace apagado: prendelo cuando tenga referentes asignados.
      </p>
      <Pie
        cambiado={form.nombre.trim() !== ""}
        enviando={enviando}
        resultado={resultado}
        onGuardar={enviar}
        etiqueta="Crear proyecto"
      />
    </>
  );
}
