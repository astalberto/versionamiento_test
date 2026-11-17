import { test } from "node:test";
import assert from "node:assert/strict";
import { despedir } from "./despedida.js";

test("se despide por nombre", () => {
  assert.equal(despedir("Ana"), "Adiós, Ana");
});

test("sin nombre se despide genérico", () => {
  assert.equal(despedir(""), "Adiós");
});
