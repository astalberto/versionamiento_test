// Funcionalidad nueva de la demo: presentación con nombre y rol.
export function presentar(nombre, rol) {
  const n = String(nombre ?? "").trim();
  const r = String(rol ?? "").trim();
  if (!n) return "Hola, soy anónimo";
  return r ? `Hola, soy ${n} (${r})` : `Hola, soy ${n}`;
}
