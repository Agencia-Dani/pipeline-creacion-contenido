import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LARGO_MINIMO,
  estadoDeError,
  parseContrasenaNueva,
  parseLogin,
} from "./credenciales.ts";

test("el mail se normaliza ANTES de validarse — el caso de copiarlo de un chat", () => {
  // El orden es el bug que ya nos mordió en el alta de equipo: `z.email()` primero rechaza esto
  // por inválido, y quien lo pega de WhatsApp no ve nunca el espacio que sobra.
  const r = parseLogin({ email: "  Majo@Agencia.com  ", password: "loquesea" });
  assert.equal(r.ok, true);
  assert.equal(r.ok && r.datos.email, "majo@agencia.com");
});

test("un mail sin forma de mail se rechaza", () => {
  const r = parseLogin({ email: "majo", password: "loquesea" });
  assert.equal(r.ok, false);
});

test("la contraseña vacía se rechaza", () => {
  const r = parseLogin({ email: "majo@agencia.com", password: "" });
  assert.equal(r.ok, false);
});

test("🔑 al ENTRAR no se valida el largo: una contraseña vieja y corta sigue entrando", () => {
  // La propiedad que evita un bug con fecha de activación. Si algún día `LARGO_MINIMO` sube, esto
  // tiene que seguir en verde: el largo es regla de cuando se ELIGE, no de cuando se CHEQUEA. Sin
  // este test, subir la constante deja afuera a gente que no tocó su cuenta, con un mensaje que
  // además le miente ("mail o contraseña incorrectos").
  const r = parseLogin({ email: "majo@agencia.com", password: "abc" });
  assert.equal(r.ok, true);
});

test("una contraseña nueva corta se rechaza, y el mensaje dice el número", () => {
  const r = parseContrasenaNueva({ password: "a".repeat(LARGO_MINIMO - 1), repetida: "a".repeat(LARGO_MINIMO - 1) });
  assert.equal(r.ok, false);
  assert.match(r.ok ? "" : r.mensaje, new RegExp(String(LARGO_MINIMO)));
});

test("una contraseña nueva que no coincide con su repetición se rechaza", () => {
  const r = parseContrasenaNueva({ password: "unaquesirve1", repetida: "unaquesirve2" });
  assert.equal(r.ok, false);
});

test("una contraseña nueva válida vuelve tal cual — sin trim", () => {
  // A propósito: los espacios de los extremos son parte de la contraseña. Limpiarlos acá la
  // guardaría distinta de como la tipeó, y al entrar (donde no se limpia nada) no coincidiría.
  const r = parseContrasenaNueva({ password: " con espacios ", repetida: " con espacios " });
  assert.equal(r.ok, true);
  assert.equal(r.ok && r.datos, " con espacios ");
});

test("🔒 la puerta no filtra quién existe: los tres fallos de identidad dan el MISMO estado", () => {
  // El test que sostiene la política entera. Si alguien mañana le da un estado propio a
  // `email_not_confirmed` —que es tentador, porque es accionable— convierte el login en un oráculo
  // de enumeración: con una lista de mails te dice cuáles son del equipo sin acertar una sola
  // contraseña. Y como el estado viaja en la URL, la diferencia quedaría publicada ahí.
  assert.equal(estadoDeError("invalid_credentials", 400), "credenciales");
  assert.equal(estadoDeError("email_not_confirmed", 400), "credenciales");
  assert.equal(estadoDeError(undefined, 400), "credenciales");
});

test("el rate limit sí tiene su propio estado — no revela nada y callarlo sería peor", () => {
  assert.equal(estadoDeError("over_request_rate_limit", 429), "espera");
  // Por status también: los códigos de Supabase cambian de nombre entre versiones, y el 429 no.
  assert.equal(estadoDeError("un_codigo_que_no_conocemos", 429), "espera");
});

test("una cuenta suspendida se distingue — es un estado que solo un admin puede desarmar", () => {
  assert.equal(estadoDeError("user_banned", 403), "suspendida");
});
