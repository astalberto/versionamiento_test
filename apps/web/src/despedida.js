// Funcionalidad nueva de la demo (prueba de un PR feat → minor).
export function despedir(nombre) {
  const limpio = String(nombre ?? "").trim();
  return limpio ? `Adiós, ${limpio}` : "Adiós";
}
