// Demo del CI: cualquier cambio en apps/web dispara el job `node` de ci.yml.
export function saludar(nombre) {
  const limpio = String(nombre ?? "").trim();
  return limpio ? `Hola, ${limpio}` : "Hola";
}
