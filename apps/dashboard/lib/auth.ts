import { redirect } from "next/navigation";
import type { Alcance, TenantContext } from "@/domain/tenant";
import { createClient } from "@/lib/supabase/server";
import { puedeVerZona, type Rol, type Zona } from "@/domain/roles";
import {
  implementaAjuste,
  implementaPantalla,
  zonasDePipeline,
  type PantallaAjustes,
  type PantallaCurar,
} from "@/domain/pipelines";
import { puedeAdministrarEquipo } from "@/domain/permisos";
import { baseDe, comoRuta, rutaDe } from "@/domain/rutas";
import { leerMembresias, resolverContexto, type Instancia } from "@/lib/tenant";

/**
 * Quién es, y qué alcanza.
 *
 * **Ya no trae `rol`**, y es el cambio de forma de ADR-051: el rol depende de la empresa, así que
 * preguntarlo sin decir en cuál no tiene respuesta. Lo devuelve `exigirTenant`, que sí sabe qué
 * cockpit está abierto.
 */
export type Usuario = Alcance & {
  id: string;
  email: string;
  nombre: string;
};

// Sesión + fila en app.usuarios + sus membresías, o redirect. Toda página protegida pasa por acá:
// el permiso se decide en el servidor, nunca en un if de React.
export async function usuarioActual(): Promise<Usuario> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: fila } = await supabase
    .schema("app")
    .from("usuarios")
    .select("nombre, es_dueno")
    .eq("id", user.id)
    .single();

  if (!fila) redirect("/sin-rol");

  const membresias = await leerMembresias(user.id);

  // Ni membresías ni flag = la cuenta existe en `auth.users` pero su alta en el cockpit quedó a
  // medias. El alta es manual y en tres pasos (ADR-051), así que este es un estado alcanzable de
  // verdad — y es el que hay que hacer visible en vez de dejar a alguien mirando una pantalla vacía.
  if (!fila.es_dueno && membresias.length === 0) redirect("/sin-rol");

  return {
    id: user.id,
    email: user.email ?? "",
    nombre: fila.nombre,
    esDueno: fila.es_dueno,
    membresias,
  };
}

/**
 * La guardia: rol **y** tenant, en un solo acto.
 *
 * Desde ADR-051 no hay una `exigirZona` suelta, y no es una simplificación: **sin cockpit no hay
 * rol**, así que una guardia que solo mirara la zona no tendría con qué decidir. Las dos preguntas
 * siguen siendo ortogonales —el rol dice QUÉ zona ve, el tenant DE QUIÉN son los datos— pero ahora
 * se contestan juntas porque la primera depende de la segunda.
 *
 * `cliente` y `pipeline` son los segmentos de la URL, y son **obligatorios**.
 *
 * 🩸 Fueron opcionales hasta el 2026-08-06, y esa opcionalidad era un bug latente que se activó
 * solo cuando el sistema dejó de tener un solo cockpit. Sin segmentos, `resolverContexto` cae a
 * *"el primero que alcance"* — un default sensato para la raíz (`/`), donde de verdad no hay URL
 * que mirar, y **una adivinanza en cualquier otro lado**. Las ~30 server actions no reciben
 * `params` (Next no se los pasa), así que todas llamaban sin segmentos y todas se comían el
 * default.
 *
 * Mientras `retia/reels` fue la única instancia activa, adivinar acertaba siempre. El 2026-08-03
 * entraron las 3 de LinkedIn y `leerInstancias()` ordena por `client_id, slug`, así que el primero
 * pasó a ser `30x/linkedin` — y desde ese día, para todo `es_dueno`, **cada acción del cockpit de
 * Retia leyó y escribió en el tenant de 30X**. Sin error: la tabla existe, la query es válida,
 * devuelve cero filas. Nadie pudo calificar un candidato en 3 días y la pantalla no dijo nada.
 *
 * Por eso ahora son obligatorios y no un default fail-closed: **un parámetro que falta tiene que
 * ser un error de compilación**, no una excepción en runtime que aparece cuando alguien hace
 * click. Es la misma regla que `scoped()` ya aplica a las queries (ADR-047 Capa 1), un escalón más
 * arriba: si no se puede nombrar el cockpit, no se puede construir la guardia.
 *
 * El caller siempre lo tiene: las páginas por `params`, las acciones por `usarCockpit()` — que lo
 * lee de la URL, o sea de la misma fuente. Y no es un permiso: `resolverContexto` lo valida contra
 * `instanciasVisibles`, así que un cockpit ajeno cae en el `redirect("/")` de abajo.
 */
export async function exigirTenant(
  zona: Zona,
  cliente: string,
  pipeline: string,
): Promise<{ usuario: Usuario; ctx: TenantContext; cockpit: Instancia; rol: Rol }> {
  const usuario = await usuarioActual();
  const sesion = await resolverContexto(usuario, cliente, pipeline);
  // Un cockpit que no existe o que no es suyo sale por el mismo lado: a la raíz, que lo rebota al
  // que sí le toca. Sin decir cuál de las dos cosas fue.
  if (!sesion) redirect("/");

  // La zona se autoriza contra DOS cosas, y ninguna alcanza sola (ADR-056):
  //
  //   1. **El rol en ESTE cockpit.** La misma persona puede ser operadora en una empresa y sponsor
  //      en otra, así que el permiso es por cockpit, no por cuenta.
  //   2. **Lo que este pipeline implementa.** `transcribir` no existe en LinkedIn: su etapa
  //      `enriquecer` es `n/a` (ADR-055), o sea que la pantalla no tendría contra qué tabla correr.
  //
  // El layout esconde las zonas que no van; esto impide entrar a mano. La UI esconde, el servidor
  // impide — y acá está el servidor.
  const permitida =
    puedeVerZona(sesion.rol, zona) &&
    zonasDePipeline(sesion.cockpit.workflowId).includes(zona);

  // A la base del cockpit RESUELTO, no a los segmentos que vinieron: si la URL traía basura, ya
  // fue rechazada arriba, y si traía otro cockpit válido el redirect tiene que apuntar al que
  // efectivamente se abrió. La base rebota sola a la zona inicial.
  if (!permitida) redirect(baseDe(comoRuta(sesion.cockpit)));

  return { usuario, ...sesion };
}

/**
 * La guardia de una pantalla concreta de `curar`. Es `exigirTenant("curar")` **más la pregunta que
 * la zona no puede contestar**: ¿este pipeline implementa ESTA pantalla?
 *
 * 🩸 Por qué hace falta una función aparte y no alcanzaba con ADR-056: la zona `curar` la tienen
 * los dos pipelines, así que `exigirTenant` la autoriza entera. Adentro, `/curar/feed` lee
 * `app.candidatos` — la tabla de reels — filtrada por el `instance_id` del cockpit abierto. Desde un
 * cockpit de LinkedIn eso **no falla**: devuelve cero filas y dibuja "no hay candidatos", que en un
 * pipeline nuevo se lee como *"todavía no cargamos datos"*. El fallo mudo, otra vez.
 *
 * Esconder los links del índice no alcanza, y por eso esto existe: **la UI esconde, el servidor
 * impide**, y hasta acá solo estaba la primera mitad.
 *
 * El redirect va al índice de `curar` del cockpit resuelto —no a la raíz— porque el problema no es
 * de permisos: la persona puede estar acá, lo que no existe es esa pantalla. Mandarla al índice le
 * muestra las que sí.
 */
export async function exigirPantallaDeCurar(
  pantalla: PantallaCurar,
  cliente: string,
  pipeline: string,
): Promise<{ usuario: Usuario; ctx: TenantContext; cockpit: Instancia; rol: Rol }> {
  const sesion = await exigirTenant("curar", cliente, pipeline);

  if (!implementaPantalla(sesion.cockpit.workflowId, pantalla)) {
    redirect(rutaDe(comoRuta(sesion.cockpit), "curar"));
  }

  return sesion;
}

/**
 * La guardia de una pantalla de `ajustes`. Hermana de la de `curar`, con **una pregunta más**.
 *
 * Las tres condiciones, y ninguna alcanza sola (ADR-060 §1):
 *   1. La zona: la tienen los tres roles, así que `exigirTenant` deja pasar a todos.
 *   2. **El pipeline la implementa.** LinkedIn no tiene `motor`: sus knobs no existen, y sin esto
 *      la pantalla mostraría cero perillas en vez de decir que no es de acá.
 *   3. **El rol la alcanza.** `equipo` es `dev | sponsor` — el que califica el feed no da accesos.
 *
 * 🔑 **El gate de rol vive acá y no adentro de la página**, aunque solo lo use `equipo` hoy: es la
 * única costura por la que pasan todas las pantallas de la zona, y una guardia que hay que
 * acordarse de escribir en cada `page.tsx` es la que un día no se escribe.
 */
export async function exigirPantallaDeAjustes(
  pantalla: PantallaAjustes,
  cliente: string,
  pipeline: string,
): Promise<{ usuario: Usuario; ctx: TenantContext; cockpit: Instancia; rol: Rol }> {
  const sesion = await exigirTenant("ajustes", cliente, pipeline);
  const aIndice = rutaDe(comoRuta(sesion.cockpit), "ajustes");

  if (!implementaAjuste(sesion.cockpit.workflowId, pantalla)) redirect(aIndice);

  // Al índice y no a la raíz: la persona puede estar en la zona, lo que no puede es esta pantalla.
  // Mandarla al índice le muestra las que sí — y el índice ya no le dibuja esta tarjeta.
  if (pantalla === "equipo" && !puedeAdministrarEquipo(sesion.rol)) redirect(aIndice);

  return sesion;
}
