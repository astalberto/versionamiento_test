import { test } from "node:test";
import assert from "node:assert/strict";
import { presentar } from "./presentar.js";

test("se presenta con nombre y rol", () => {
  assert.equal(presentar("Ana", "DevSecOps"), "Hola, soy Ana (DevSecOps)");
});

test("sin rol o sin nombre", () => {
  assert.equal(presentar("Ana"), "Hola, soy Ana");
  assert.equal(presentar("  "), "Hola, soy anónimo");
});
