import { redirect } from "next/navigation";
import { usuarioActual } from "@/lib/auth";
import { cockpitsDe } from "@/lib/tenant";
import { comoRuta, rutaZona } from "@/domain/rutas";
import { zonasDe } from "@/domain/roles";
import { zonaInicialEn } from "@/domain/pipelines";
import { rolEn } from "@/domain/tenant";

// La raíz no es una pantalla: cada uno cae en SU cockpit, en la zona de su rol.
//
// Es también la salida de emergencia del sistema: cualquier `redirect("/")` de una guardia termina
// acá y rebota a un lugar válido, en vez de dejar a alguien mirando una ruta que no existe. Por eso
// es el único lugar donde la elección **no puede** salir bien por casualidad.
//
// Desde ADR-056 son tres preguntas, no dos: a qué cockpit entra, con qué rol **ahí** (ADR-051), y
// qué zona existe en **ese pipeline**. Hasta que hubo un segundo pipeline las tres se contestaban
// con una sola —`zonaInicial(rol)`— porque todas las zonas existían en el único cockpit que había.
export default async function Home() {
  const usuario = await usuarioActual();
  const cockpits = await cockpitsDe(usuario);

  // El primero que tenga a dónde entrar, no el primero a secas. La diferencia importa cuando
  // alguien alcanza varios cockpits y el primero de la lista es de un pipeline sin zonas para su
  // rol: mandarlo a `/sin-rol` teniendo otro cockpit abierto sería mentirle. `cockpitsDe` viene
  // ordenado, así que la elección es estable entre requests — un default que cambia de request en
  // request es un bug de caché esperando.
  for (const cockpit of cockpits) {
    const rol = rolEn(usuario, cockpit.clientId);
    // No debería pasar (la lista ya viene filtrada por membresía), pero si pasara, saltear es lo
    // correcto: sin rol no hay zona que calcular.
    if (!rol) continue;

    const zona = zonaInicialEn(zonasDe(rol), cockpit.workflowId);
    if (zona) redirect(rutaZona(comoRuta(cockpit), zona));
  }

  // Ni un solo cockpit con una zona que pueda abrir. Es la misma clase de alta a medias que un
  // usuario sin membresías, así que sale por el mismo lado.
  redirect("/sin-rol");
}
