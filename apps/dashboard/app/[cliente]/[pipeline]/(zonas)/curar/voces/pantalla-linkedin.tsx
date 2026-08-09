"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { esValido } from "@/domain/linkedin";
import {
  DIAS,
  ESPACIADO_MAX,
  ESPACIADO_MIN,
  ETIQUETA_DIA,
  repartirVoces,
  validarPerfil,
  type FormPerfilVoz,
  type VozConPerfil,
} from "@/domain/linkedin-voz";
import {
  crearVozLinkedin,
  guardarPerfilVozLinkedin,
  quitarDeLinkedin,
  type Resultado,
} from "./actions-linkedin";
import { usarCockpit } from "../../usar-cockpit";

// El perfil por voz del pipeline de LinkedIn (ADR-055 §4, ADR-067).
//
// 🔑 **Esta pantalla es LA configuración de la máquina**, no un accesorio: ADR 002 del repo de
// diseño decidió que la unidad de config es la voz y no la empresa, porque dentro de una misma marca
// dos cuentas ya escriben distinto. Todo lo demás (el banco de referentes, los knobs) es de la
// instancia; esto es de la persona.
//
// 🩸 **Nace vacía en dos de las tres empresas, y no es un error de carga.** Medido el 2026-08-08:
// `30x` y `estadox` tienen CERO filas en `app.voces` — y son justo las dos cuyo cockpit de LinkedIn
// está activo. Por eso el vacío tiene texto propio y por eso desde acá se puede **crear** la voz: no
// tienen cockpit de reels, así que esta pantalla es el único lugar del sistema desde donde puede
// nacer una voz suya.
//
// La diferencia grande con su hermana de reels: **acá no hay interruptor.** Lo que activa una voz en
// LinkedIn es que exista su perfil, nunca `voces.activo` — que significa "corre en reels" y que esta
// pantalla no escribe jamás.

const VACIO: FormPerfilVoz = {
  nombre: "",
  perfil: "",
  firma: "",
  espaciado: "2",
  separacionH: "4",
  // Las tres franjas observadas que trae la `020` como default. Empezar con ellas es más útil que
  // empezar vacío: son un punto de partida real, no un placeholder.
  franjas: ["08:00", "13:00", "17:30"],
  dias: [],
  lineasRojas: "",
};

/** Las franjas se editan como texto separado por comas — es lo más simple que funciona. */
const franjasATexto = (franjas: string[]) => franjas.join(", ");
const textoAFranjas = (texto: string) =>
  texto.split(",").map((f) => f.trim()).filter((f) => f !== "");

export function PantallaVocesLinkedin({ voces }: { voces: VozConPerfil[] }) {
  const cockpit = usarCockpit();
  const [altaAbierta, setAltaAbierta] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);

  const { configuradas, sinConfigurar } = repartirVoces(voces);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Voces de LinkedIn</h1>
        <p className="text-muted-foreground">
          Cómo habla cada cuenta y cuándo publica. Es la unidad de configuración de la máquina: dos
          personas de la misma empresa escriben distinto. Una voz entra a LinkedIn cuando tiene
          perfil acá — <strong>no</strong> cuando está activa en reels.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {voces.length === 0
            ? "Todavía no hay voces en esta empresa."
            : `${configuradas.length} configurada${configuradas.length === 1 ? "" : "s"} de ${voces.length}.`}
        </p>
        <Button size="sm" onClick={() => setAltaAbierta((a) => !a)}>
          {altaAbierta ? "Cancelar" : "Nueva voz"}
        </Button>
      </div>

      {altaAbierta && (
        <Formulario
          titulo="Nueva voz"
          original={VACIO}
          pideNombre
          onEnviar={(form) => crearVozLinkedin(cockpit, form)}
          onListo={() => setAltaAbierta(false)}
        />
      )}

      {voces.length === 0 && !altaAbierta && (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm font-medium">Todavía no hay ninguna voz, y eso es lo esperado.</p>
          <p className="mx-auto mt-1 max-w-lg text-sm text-muted-foreground">
            Esta empresa no tiene voces cargadas todavía. Empezá por una: su nombre, su{" "}
            <strong>firma</strong> (nombre · cargo · frase de propósito, va al cierre de todo post) y
            cómo habla. El perfil de voz no sale de leerle el LinkedIn — sale de su archivo:
            podcasts, blogs, transcripciones.
          </p>
        </div>
      )}

      {configuradas.length > 0 && (
        <Bloque titulo="Configuradas para LinkedIn">
          {configuradas.map((v) =>
            editandoId === v.id ? (
              <div key={v.id} className="p-3">
                <Formulario
                  titulo={`Editar ${v.nombre}`}
                  original={aFormulario(v)}
                  onEnviar={(form) => guardarPerfilVozLinkedin(cockpit, v.id, form)}
                  onListo={() => setEditandoId(null)}
                  onQuitar={() => quitarDeLinkedin(cockpit, v.id)}
                />
              </div>
            ) : (
              <Fila key={v.id} voz={v} onEditar={() => setEditandoId(v.id)} />
            ),
          )}
        </Bloque>
      )}

      {sinConfigurar.length > 0 && (
        <Bloque
          titulo="Otras voces de la empresa"
          ayuda="Existen en la empresa (las comparte con reels) pero todavía no tienen perfil de LinkedIn, así que la máquina no las va a usar."
        >
          {sinConfigurar.map((v) =>
            editandoId === v.id ? (
              <div key={v.id} className="p-3">
                <Formulario
                  titulo={`Configurar ${v.nombre} para LinkedIn`}
                  original={aFormulario(v)}
                  onEnviar={(form) => guardarPerfilVozLinkedin(cockpit, v.id, form)}
                  onListo={() => setEditandoId(null)}
                />
              </div>
            ) : (
              <Fila key={v.id} voz={v} onEditar={() => setEditandoId(v.id)} />
            ),
          )}
        </Bloque>
      )}
    </div>
  );
}

function aFormulario(voz: VozConPerfil): FormPerfilVoz {
  const p = voz.perfil;
  return {
    nombre: voz.nombre,
    perfil: p?.perfil ?? "",
    firma: p?.firma ?? "",
    espaciado: String(p?.espaciado ?? VACIO.espaciado),
    separacionH: String(p?.separacionH ?? VACIO.separacionH),
    franjas: p?.franjas ?? VACIO.franjas,
    dias: p?.dias ?? [],
    lineasRojas: p?.lineasRojas ?? "",
  };
}

function Bloque({
  titulo,
  ayuda,
  children,
}: {
  titulo: string;
  ayuda?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div>
        <h2 className="text-sm font-semibold">{titulo}</h2>
        {ayuda && <p className="text-xs text-muted-foreground">{ayuda}</p>}
      </div>
      <div className="divide-y rounded-lg border">{children}</div>
    </div>
  );
}

function Fila({ voz, onEditar }: { voz: VozConPerfil; onEditar: () => void }) {
  const p = voz.perfil;
  return (
    <div className="flex flex-wrap items-center gap-3 p-3">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{voz.nombre}</p>
        {p ? (
          <p className="truncate text-xs text-muted-foreground">
            {p.franjas.join(" · ")}
            {p.dias && p.dias.length > 0 && ` — ${p.dias.map((d) => ETIQUETA_DIA[d]).join(", ")}`}
            {` · cada ${p.separacionH} h como mínimo`}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">Sin perfil de LinkedIn.</p>
        )}
      </div>
      <Button size="sm" variant={p ? "ghost" : "default"} onClick={onEditar}>
        {p ? "Editar" : "Configurar"}
      </Button>
    </div>
  );
}

function Formulario({
  titulo,
  original,
  pideNombre = false,
  onEnviar,
  onListo,
  onQuitar,
}: {
  titulo: string;
  original: FormPerfilVoz;
  pideNombre?: boolean;
  onEnviar: (form: FormPerfilVoz) => Promise<Resultado>;
  onListo: () => void;
  onQuitar?: () => Promise<Resultado>;
}) {
  const [form, setForm] = useState(original);
  const [franjasTexto, setFranjasTexto] = useState(franjasATexto(original.franjas));
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [enviando, startTransition] = useTransition();

  // La MISMA función que corre el server action. Acá es para no hacer viajar un formulario que ya
  // sabemos malo; allá es la que manda. Una sola definición, dos evaluaciones.
  const errores = validarPerfil(form, { exigirNombre: pideNombre });
  const puedeEnviar = esValido(errores);

  const set = <K extends keyof FormPerfilVoz>(k: K, v: FormPerfilVoz[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const alternarDia = (dia: string) =>
    setForm((f) => ({
      ...f,
      dias: f.dias.includes(dia) ? f.dias.filter((d) => d !== dia) : [...f.dias, dia],
    }));

  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <p className="font-medium">{titulo}</p>

      {pideNombre && (
        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted-foreground">De quién es la voz</span>
          <Input
            value={form.nombre}
            onChange={(e) => set("nombre", e.target.value)}
            placeholder="Nombre y apellido"
          />
        </label>
      )}

      {/* La firma va primero y sola: es la única obligatoria (R-2) y la que más se olvida. */}
      <label className="block space-y-1">
        <span className="text-xs font-medium text-muted-foreground">Firma (obligatoria)</span>
        <Input
          value={form.firma}
          onChange={(e) => set("firma", e.target.value)}
          placeholder="Nombre · Cargo · Frase de propósito"
        />
        <span className="text-xs text-muted-foreground">
          Va al cierre de todo post y al pie de las imágenes rebrandeadas. La única excepción es una
          imagen ajena sin modificar: no se firma lo que no se tocó.
        </span>
      </label>

      <label className="block space-y-1">
        <span className="text-xs font-medium text-muted-foreground">Cómo habla</span>
        <Textarea
          value={form.perfil}
          onChange={(e) => set("perfil", e.target.value)}
          rows={4}
          placeholder="Léxico, registro, cómo trata al lector, clichés a evitar."
        />
        <span className="text-xs text-muted-foreground">
          No sale de leerle el perfil de LinkedIn: sale de su archivo — podcasts, blogs,
          transcripciones. De ahí salen dos cosas, cómo habla (esto) y qué le ha pasado.
        </span>
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Líneas por bloque</span>
          <select
            value={form.espaciado}
            onChange={(e) => set("espaciado", e.target.value)}
            className="h-9 w-full rounded-md border bg-background px-2 text-sm"
          >
            {Array.from({ length: ESPACIADO_MAX - ESPACIADO_MIN + 1 }, (_, i) => ESPACIADO_MIN + i).map(
              (n) => (
                <option key={n} value={String(n)}>
                  {n === 1 ? "1 — de a una línea" : `${n} líneas`}
                </option>
              ),
            )}
          </select>
          <span className="text-xs text-muted-foreground">
            Preferencia personal, no norma de la plataforma.
          </span>
        </label>

        <label className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">
            Horas mínimas entre dos posts
          </span>
          <Input
            value={form.separacionH}
            onChange={(e) => set("separacionH", e.target.value)}
            inputMode="numeric"
            placeholder="4"
          />
          <span className="text-xs text-muted-foreground">
            Dos posts pegados se canibalizan: el primero no vuela.
          </span>
        </label>
      </div>

      <label className="block space-y-1">
        <span className="text-xs font-medium text-muted-foreground">Franjas horarias</span>
        <Input
          value={franjasTexto}
          onChange={(e) => {
            setFranjasTexto(e.target.value);
            set("franjas", textoAFranjas(e.target.value));
          }}
          placeholder="08:00, 13:00, 17:30"
        />
        <span className="text-xs text-muted-foreground">
          Separadas por comas, en 24 h. Las 19:00 solo si el post es megaviral.
        </span>
      </label>

      <div className="space-y-1">
        <span className="text-xs font-medium text-muted-foreground">Días buenos</span>
        <div className="flex flex-wrap gap-2">
          {DIAS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => alternarDia(d)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs transition-colors",
                form.dias.includes(d)
                  ? "border-primary bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              {ETIQUETA_DIA[d]}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">
          Empíricos y por cuenta: no hay fórmula. Dejalos vacíos si todavía no se sabe.
        </span>
      </div>

      <label className="block space-y-1">
        <span className="text-xs font-medium text-muted-foreground">Líneas rojas propias</span>
        <Textarea
          value={form.lineasRojas}
          onChange={(e) => set("lineasRojas", e.target.value)}
          rows={2}
          placeholder="Opcional. Se suman a las de la casa: política y religión."
        />
      </label>

      {!puedeEnviar && <p className="text-xs text-destructive">{Object.values(errores)[0]}</p>}
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
        {onQuitar && (
          <Button
            size="sm"
            variant="ghost"
            disabled={enviando}
            className="ml-auto text-destructive hover:text-destructive"
            onClick={() =>
              startTransition(async () => {
                const r = await onQuitar();
                setResultado(r);
                if (r.ok) onListo();
              })
            }
          >
            Sacar de LinkedIn
          </Button>
        )}
      </div>
    </div>
  );
}
