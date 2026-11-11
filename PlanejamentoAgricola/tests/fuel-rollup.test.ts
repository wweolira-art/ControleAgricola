import assert from "node:assert/strict";
import { test } from "node:test";
import { ownMonthsForRollup } from "../server/fuel-rollup.js";

test("cabeçalho de combustível não duplica o diesel com valores antigos próprios", () => {
  const stored = [0, 6087, 6086, 6087];
  const diesel = [5891, 6087, 5891, 6087];
  const own = ownMonthsForRollup(stored, [{ ref_kind: "material", material_id: 1 }], true);
  assert.deepEqual(own.map((value, month) => value + diesel[month]), diesel);
  assert.deepEqual(stored, [0, 6087, 6086, 6087]);
});

test("preserva valores próprios de outras categorias e cabeçalhos sem materiais", () => {
  const stored = [100, 200];
  assert.deepEqual(ownMonthsForRollup(stored, [{ ref_kind: "material" }], false), stored);
  assert.deepEqual(ownMonthsForRollup(stored, [], true), stored);
  assert.deepEqual(ownMonthsForRollup(stored, [{ ref_kind: "cost_object" }], true), stored);
  assert.deepEqual(ownMonthsForRollup(stored, [{ material_id: 1 }], true), [0, 0]);
});
