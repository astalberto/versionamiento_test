// Demo del CI: cualquier cambio en apps/web dispara el job `node` de ci.yml.
export function saludar(nombre) {
  // Colapsa los espacios internos: "Ana   López" → "Ana López".
  const limpio = String(nombre ?? "").trim().replace(/\s+/g, " ");
  return limpio ? `Hola, ${limpio}` : "Hola";
}
