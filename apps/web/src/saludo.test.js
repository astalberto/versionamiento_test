import { test } from "node:test";
import assert from "node:assert/strict";
import { saludar } from "./saludo.js";

test("saluda por nombre", () => {
  assert.equal(saludar("Alberto"), "Hola, Alberto");
});

test("sin nombre saluda genérico", () => {
  assert.equal(saludar("  "), "Hola");
  assert.equal(saludar(), "Hola");
});
