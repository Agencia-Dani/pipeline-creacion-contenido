import { test } from "node:test";
import assert from "node:assert/strict";
import { puedeAdministrarEquipo, rolesQuePuedeOtorgar, rolesQuePuedeTocar } from "./permisos.ts";
import { ROLES, type Rol } from "./roles.ts";

test("administran el equipo el dev y el sponsor — el operador no", () => {
  assert.equal(puedeAdministrarEquipo("dev"), true);
  assert.equal(puedeAdministrarEquipo("sponsor"), true);
  // El que califica el feed no da accesos. Y desde el 06/08 "operador" incluye gente de Retia.
  assert.equal(puedeAdministrarEquipo("operador"), false);
});

test("la agencia otorga los tres roles", () => {
  assert.deepEqual(rolesQuePuedeOtorgar("dev", true), ["operador", "sponsor", "dev"]);
});

test("🔒 un sponsor de empresa cliente NUNCA otorga dev", () => {
  // El caso que motiva todo el techo: `dev` ve el costo del proveedor, o sea el margen de la
  // agencia. Sin esto, el sponsor de Retia se lo otorga a sí mismo y el gate de `veCostos` queda
  // desarmable desde la UI.
  assert.deepEqual(rolesQuePuedeOtorgar("sponsor", false), ["operador", "sponsor"]);
});

test("🔒 un dev que NO es de la agencia tampoco acuña devs — el techo no se hereda", () => {
  // Hoy no existe (los 2 devs son los 2 dueños), y por eso mismo se testea: el día que exista, la
  // regla ya está puesta. Otorgar `dev` es de la agencia, no del que tiene `dev`.
  assert.deepEqual(rolesQuePuedeOtorgar("dev", false), ["operador", "sponsor"]);
});

test("el operador no otorga nada, ni siendo dueño", () => {
  assert.deepEqual(rolesQuePuedeOtorgar("operador", false), []);
  assert.deepEqual(rolesQuePuedeOtorgar("operador", true), []);
});

test("🔒 la propiedad: solo la agencia puede poner a alguien en dev", () => {
  // No los casos uno por uno: la propiedad sobre todos los roles que existen. Si mañana aparece un
  // cuarto rol y alguien lo suma a ROLES, este test lo obliga a decidir si otorga `dev`.
  for (const rol of ROLES) {
    assert.equal(
      rolesQuePuedeOtorgar(rol, false).includes("dev"),
      false,
      `${rol} sin ser dueño no puede otorgar dev`,
    );
  }
});

test("nadie otorga un rol que no existe", () => {
  for (const rol of ROLES) {
    for (const esDueno of [true, false]) {
      for (const otorgable of rolesQuePuedeOtorgar(rol, esDueno)) {
        assert.ok((ROLES as readonly Rol[]).includes(otorgable), `${otorgable} no es un rol`);
      }
    }
  }
});

test("quien no administra no otorga: las dos funciones no pueden discrepar", () => {
  // Son dos preguntas que la pantalla hace por separado (una esconde la zona, la otra arma el
  // select), y separadas pueden divergir en silencio: un rol que no administra pero con roles
  // otorgables sería un formulario que se dibuja y que el servidor rechaza.
  for (const rol of ROLES) {
    for (const esDueno of [true, false]) {
      const otorga = rolesQuePuedeOtorgar(rol, esDueno).length > 0;
      assert.equal(otorga, puedeAdministrarEquipo(rol), `${rol} (dueño: ${esDueno})`);
    }
  }
});

test("🔒 un sponsor solo toca operadores: no degrada ni echa a otro sponsor (ADR-063 §3)", () => {
  // El eje que no existía: `rolesQuePuedeOtorgar` dice QUÉ rol doy, este dice A QUIÉN se lo aplico.
  // Sin él, dos sponsors de la misma empresa podían sacarse el acceso entre ellos.
  assert.deepEqual(rolesQuePuedeTocar("sponsor"), ["operador"]);
  assert.equal(rolesQuePuedeTocar("sponsor").includes("sponsor"), false);
  assert.equal(rolesQuePuedeTocar("sponsor").includes("dev"), false);
});

test("el dev toca a cualquiera, y el operador a nadie", () => {
  assert.deepEqual(rolesQuePuedeTocar("dev"), ["operador", "sponsor", "dev"]);
  assert.deepEqual(rolesQuePuedeTocar("operador"), []);
});

test("🔓 y de paso: un sponsor ya no puede quitarse el acceso a sí mismo", () => {
  // Era el agujero que este módulo documentaba como aceptado a sabiendas ("el último sponsor deja
  // la empresa sin quién administre"). Un sponsor no está entre los roles que un sponsor alcanza.
  assert.equal(rolesQuePuedeTocar("sponsor").includes("sponsor"), false);
});
