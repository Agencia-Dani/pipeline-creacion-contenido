"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Copiar } from "@/components/ui/copiar";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { AgregarAColeccion } from "@/components/video/agregar-a-coleccion";
import { MarcarGrabados } from "@/components/video/marcar-grabados";
import { GrillaVideos } from "@/components/video/grupos";
import { BarraSeleccion, BotonSeleccionar, usarSeleccion } from "@/components/video/seleccion";
import { claveDe } from "@/domain/enlace";
import { LARGO_MAX_TITULO, resumenDeTanda, tituloDeTanda } from "@/domain/tanda";
import type { CabeceraTanda } from "@/lib/tandas";
import type { Transcripcion } from "@/lib/transcripciones";
import { cargarTanda, ponerTituloATanda } from "./actions";
import { ESTADO_LEGIBLE } from "./fila";
import { TarjetaCola } from "./tarjeta-cola";
import { usarCockpit } from "../usar-cockpit";

// Una tanda: el pegote como cosa que se abre, se cierra y se puede nombrar (ADR-064).
//
// 🔑 **Las filas bajan al expandir, y ahí está el arreglo.** La página carga cabeceras —título y
// contadores, una fila por tanda— así que se ven **todas** las tandas, no las últimas 50 filas de
// una lista que ocultaba más de la mitad sin decirlo. El `script` es el campo gordo y una tanda
// colapsada no lo necesita: es la misma forma que llevó el feed de 405 KB a 16 KB (cierre 98).
//
// `<details>` nativo y no un componente de acordeón: da el colapsable, el estado abierto/cerrado y
// el teclado gratis, y `onToggle` es el gancho que dispara la carga. No hay primitiva de
// collapsible en `components/ui` y esto no la pide.
//
// 🔒 **Se carga UNA vez por apertura**, no en cada toggle: sin el `if (filas) return`, cerrar y
// abrir una tanda de 52 enlaces vuelve a pedir sus 52 scripts.
export function Tanda({
  cabecera,
  autor,
  cuando,
  ahora,
}: {
  cabecera: CabeceraTanda;
  autor: string | null;
  /** El momento ya formateado: la zona horaria vive en `lib/fechas.ts` y el server la resuelve. */
  cuando: string;
  ahora: Date;
}) {
  const cockpit = usarCockpit();
  const [filas, setFilas] = useState<Transcripcion[] | null>(null);
  // Las claves de los videos ya grabados, que bajan JUNTO con las filas (ADR-070). No pueden llegar
  // por otro lado: la marca ya no es una columna de la fila y esta lista se dibuja en el cliente.
  const [grabadas, setGrabadas] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  // 🔑 **La selección es POR TANDA y no de la pantalla entera, y no es una simplificación.** Las
  // filas de cada tanda bajan al expandirla (`cargarTanda`), así que una selección global podría
  // tener marcadas claves cuyas filas ni siquiera están en memoria. La tanda ya es la unidad de
  // trabajo acá; la selección la respeta.
  const seleccion = usarSeleccion();
  const [avisoSeleccion, setAvisoSeleccion] = useState<string | null>(null);
  const [cargando, startCarga] = useTransition();
  // Cuál guion está abierto. Se guarda el **id** y no la fila: `filas` se vuelve a bajar cuando
  // cambian los contadores, y una fila guardada por valor quedaría mostrando el estado viejo.
  const [abiertoId, setAbiertoId] = useState<string | null>(null);

  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(cabecera.titulo ?? "");
  // Optimista sobre el prop: el `revalidatePath` de la acción refresca el server component, pero
  // hasta que llegue la cabecera seguiría mostrando el nombre viejo debajo del input recién cerrado.
  const [titulo, setTitulo] = useState(cabecera.titulo);
  const [guardando, startGuardado] = useTransition();

  const traerFilas = () =>
    startCarga(async () => {
      const r = await cargarTanda(cockpit, cabecera.id);
      if (r.ok) {
        setFilas(r.filas);
        setGrabadas(new Set(r.grabadas));
        setError(null);
      } else {
        setError(r.mensaje);
      }
    });

  // Se recuerda si está desplegada porque `filas` no alcanza para saberlo: cerrar un `<details>` no
  // las borra. Sin esto, una tanda que se abrió y se cerró seguiría recargando sus scripts en cada
  // cambio de contadores sin que nadie los mire — el mismo gasto que la carga-una-sola-vez de
  // `abrir()` viene evitando desde ADR-064.
  const [abierta, setAbierta] = useState(false);

  // 🩸 **Las filas cargadas se vuelven mentira cuando alguien cambia un `estado`, y hasta acá nada
  // las volvía a bajar** (encontrado el 2026-08-18 revisando el bug que el cierre 110 dejó señalado).
  // `Reintentar` y `Abandonar` hacen `router.refresh()`, que re-renderiza **server components**: la
  // tarjeta de fallidas de `page.tsx` sí se repinta, pero estas filas viven en el `useState` de acá y
  // `abrir()` tiene un `if (filas) return`. La fila seguía diciendo "Falló" con sus dos botones, y el
  // segundo clic devolvía **"Ese enlace ya no se puede reintentar"** — un error sobre una operación
  // que había salido bien (`reencolar` filtra por `estado`, y la fila ya estaba en `pendiente`).
  //
  // 🔑 **El disparador es la cabecera, no un callback desde el botón, y esa es la decisión.** La
  // cabecera baja del server con los contadores por estado en cada refresh: si cambiaron, estas filas
  // están viejas — sin importar **quién** las cambió. Un callback solo cubriría los botones de acá
  // adentro y dejaría vivo el caso que se ve peor: la misma fila fallada se dibuja **dos veces** (en
  // la tarjeta de arriba y acá), así que reintentar arriba la hacía desaparecer de arriba y la dejaba
  // intacta abajo — la pantalla contradiciéndose a sí misma.
  //
  // ⚠️ **Y por eso no alcanzaba el estado optimista de `Grabado`.** `grabado_en` solo cambia si
  // alguien aprieta ese botón; `estado` lo cambia el `Procesador` por atrás (`pendiente` → `listo` |
  // `fallo`). Un optimista "En cola" se quedaría congelado ahí para siempre: otra mentira, no un
  // arreglo. Esto pide el dato real.
  //
  // Solo recarga una tanda **desplegada y con filas ya traídas**: una cerrada no tiene nada que
  // repintar, y al volver a abrirla `abrir()` decide con su propia regla.
  //
  // ponytail: sin guardia de concurrencia. Dos cambios de contadores muy seguidos disparan dos
  // cargas y gana la que llegue última, que puede ser la vieja. Se corrige sola en el refresh
  // siguiente y el `Procesador` refresca seguido mientras hay cola. Si alguna vez se ve una fila
  // atrasada, el upgrade es descartar por firma: guardar la pedida en el ref y aplicar el resultado
  // solo si sigue siendo la vigente.
  const contadores = `${cabecera.total}·${cabecera.pendientes}·${cabecera.listos}·${cabecera.fallidas}·${cabecera.abandonadas}`;
  const contadoresAplicados = useRef(contadores);

  // La firma se marca **antes** de pedir y solo cuando se pide de verdad. Si se marcara igual sin
  // traer, una tanda cerrada mientras cambian los contadores se daría por al día y al abrirla
  // mostraría las filas viejas: la deuda quedaría pagada sin haber cobrado.
  const traerAlDia = () => {
    if (cargando) return;
    contadoresAplicados.current = contadores;
    traerFilas();
  };

  const abrir = (abierto: boolean) => {
    setAbierta(abierto);
    if (!abierto) return;
    // Nunca trajo, o quedó vieja mientras estaba cerrada.
    if (!filas || contadoresAplicados.current !== contadores) traerAlDia();
  };

  useEffect(() => {
    if (contadoresAplicados.current === contadores) return;
    // Cerrada o sin filas: la firma queda SIN aplicar a propósito, y la cobra `abrir`.
    if (!abierta || !filas) return;
    traerAlDia();
    // `traerAlDia` se recrea en cada render y meterla acá volvería el efecto un bucle; lo que
    // gobierna es la firma.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contadores, abierta, filas]);

  const guardar = () =>
    startGuardado(async () => {
      const r = await ponerTituloATanda(cockpit, cabecera.id, texto);
      if (!r.ok) {
        setError(r.mensaje);
        return;
      }
      setTitulo(texto.trim() || null);
      setEditando(false);
      setError(null);
    });

  // Se deriva de `filas` en cada render: si la tanda las recarga, el modal abierto muestra el dato
  // nuevo en vez de una copia congelada. Si la fila desapareció, el modal se cierra solo.
  const abierto = filas?.find((f) => f.id === abiertoId) ?? null;

  return (
    <li className="rounded-lg border">
      <details onToggle={(e) => abrir(e.currentTarget.open)}>
        <summary className="cursor-pointer list-none p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <span className="font-medium">
              {tituloDeTanda(titulo, cabecera.total, cuando)}
            </span>
            <span className="text-sm text-muted-foreground">
              {resumenDeTanda(cabecera)}
              {/* Quién pegó. Se muestra sea dueño, sponsor u operador (decisión de Mani, ADR-064
                  §5): dice a quién preguntarle por estos links. Las 9 del backfill no lo tienen —
                  son anteriores a la columna— y ahí no se dibuja nada en vez de inventar. */}
              {autor && ` · pegada por ${autor}`}
            </span>
          </div>
        </summary>

        <div className="space-y-4 border-t p-4">
          <div className="flex flex-wrap items-center gap-2">
            {editando ? (
              <>
                <Input
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  maxLength={LARGO_MAX_TITULO}
                  disabled={guardando}
                  placeholder="Cómo la vas a reconocer (dejalo vacío para volver al nombre automático)"
                  className="max-w-md"
                />
                <Button size="sm" onClick={guardar} disabled={guardando}>
                  {guardando ? "Guardando…" : "Guardar"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setTexto(titulo ?? "");
                    setEditando(false);
                  }}
                  disabled={guardando}
                >
                  Cancelar
                </Button>
              </>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setEditando(true)}>
                {titulo ? "Cambiar el nombre" : "Ponerle nombre"}
              </Button>
            )}
            {filas && filas.length > 0 && (
              <span className="ml-auto">
                <BotonSeleccionar seleccion={seleccion} />
              </span>
            )}
          </div>

          {avisoSeleccion && (
            <p className="rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-sm">
              {avisoSeleccion}
            </p>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          {cargando && !filas ? (
            <p className="text-sm text-muted-foreground">Trayendo los enlaces…</p>
          ) : filas && filas.length > 0 ? (
            <GrillaVideos>
              {filas.map((t) => (
                <TarjetaCola
                  key={t.id}
                  t={t}
                  ahora={ahora}
                  grabadaInicial={grabadas.has(claveDe(t))}
                  onAbrir={() => setAbiertoId(t.id)}
                  seleccion={
                    seleccion.activo
                      ? { marcado: seleccion.marcado(t.id), onAlternar: () => seleccion.alternar(t.id) }
                      : undefined
                  }
                />
              ))}
            </GrillaVideos>
          ) : filas ? (
            <p className="text-sm text-muted-foreground">Esta tanda se quedó sin enlaces.</p>
          ) : null}

          <BarraSeleccion seleccion={seleccion}>
            <AgregarAColeccion
              seleccion={seleccion}
              urlPorClave={(id) => filas?.find((f) => f.id === id)?.url ?? null}
              onListo={setAvisoSeleccion}
            />
            <MarcarGrabados
              seleccion={seleccion}
              urlPorClave={(id) => filas?.find((f) => f.id === id)?.url ?? null}
              // 🩸 Misma trampa que el botón por tarjeta, y el mismo arreglo: `grabadas` vive en el
              // `useState` de acá y ningún `router.refresh()` la repinta, porque `abrir()` tiene un
              // `if (filas) return` que impide recargar las filas de una tanda ya abierta. Si esto
              // no se pintara a mano, la marca entraría a la base y la pantalla no cambiaría —
              // exactamente el bug que Mani encontró el 18/08 apretando el botón en prod.
              onListo={(mensaje, marcadas) => {
                setAvisoSeleccion(mensaje);
                setGrabadas((g) => {
                  const copia = new Set(g);
                  for (const id of marcadas) {
                    const fila = filas?.find((f) => f.id === id);
                    if (fila) copia.add(claveDe(fila));
                  }
                  return copia;
                });
              }}
            />
          </BarraSeleccion>
        </div>
      </details>

      {/* UN modal por lista y no uno por tarjeta, que es la regla de uso de `components/ui/modal`.
          El guion ya está en memoria —bajó con las filas— así que acá no se pide nada. */}
      <Modal
        abierto={abierto !== null}
        onCerrar={() => setAbiertoId(null)}
        ancho="52rem"
        titulo={abierto?.url ?? ""}
        subtitulo={
          abierto && (
            <>
              {ESTADO_LEGIBLE[abierto.estado]}
              {abierto.idioma && abierto.idioma !== "es" && ` · original en ${abierto.idioma}`}
              {abierto.script && ` · ${abierto.script.length} caracteres`}
            </>
          )
        }
        pie={
          <div className="flex flex-wrap items-center gap-3">
            <Copiar texto={abierto?.script ?? null} etiqueta="Copiar el guion" />
            {abierto && (
              <a
                href={abierto.url}
                target="_blank"
                rel="noreferrer noopener"
                className="text-sm text-muted-foreground underline underline-offset-4"
              >
                Ver el video
              </a>
            )}
          </div>
        }
      >
        {abierto?.script ? (
          <p className="whitespace-pre-wrap text-sm">{abierto.script}</p>
        ) : (
          // Sin guion no se ofrece nada acá: las salidas (reintentar, abandonar) están en la
          // tarjeta, que es donde también se ve el estado que las explica.
          <p className="text-sm text-muted-foreground">
            Este enlace todavía no tiene guion.
            {abierto?.error && ` ${abierto.error}`}
          </p>
        )}
      </Modal>
    </li>
  );
}
