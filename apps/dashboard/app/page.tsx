import { redirect } from "next/navigation";
import { usuarioActual } from "@/lib/auth";
import { zonaInicial } from "@/domain/roles";

// La raíz no es una pantalla: cada rol cae en su zona.
export default async function Home() {
  const usuario = await usuarioActual();
  redirect(`/${zonaInicial(usuario.rol)}`);
}
