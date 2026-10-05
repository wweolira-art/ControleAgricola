import assert from "node:assert/strict";
import { test } from "node:test";
import { COD_MATERIAL_OLEO_HIDRAULICO, oleoLtTon } from "../src/lib/consumo-oleo-hidraulico.js";

test("indice l/t do oleo hidraulico usa litros / toneladas", () => {
  assert.equal(oleoLtTon(2221.3, 182814.73), 0.012);
  assert.equal(oleoLtTon(100, 0), null);
});

test("tela de oleo hidraulico usa apenas o material 2394", () => {
  assert.equal(COD_MATERIAL_OLEO_HIDRAULICO, 2394);
});
